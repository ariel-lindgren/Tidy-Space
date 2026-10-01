use std::collections::HashSet;
use std::fs::{self, Metadata};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use rayon::prelude::*;

use crate::error::{ScanError, ScanIssue};
use crate::exclude::Excludes;
use crate::progress::ScanProgress;
use crate::snapshot::{EntryKind, Snapshot, NO_PARENT};
use crate::usage::{hard_link_key, usage_of, Usage, FLAG_CLOUD, FLAG_HARDLINK};

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub root: PathBuf,
    /// 0 = número de CPUs.
    pub threads: usize,
    pub follow_symlinks: bool,
    /// Não atravessa para outros sistemas de arquivos (como `du -x`). Só tem efeito em Unix.
    pub one_filesystem: bool,
    pub include_hidden: bool,
    pub excludes: Vec<String>,
    /// Quantos problemas individuais guardar com caminho (todos são contados).
    pub max_issues: usize,
    /// Onde identificar hard links (para contar o conteúdo uma vez só).
    pub hard_links: HardLinks,
}

/// Onde procurar hard links. No Unix o número de links vem de graça no `stat`; no Windows é
/// preciso consultar arquivo por arquivo (~6× mais lento), então o padrão se limita aos lugares
/// onde eles aparecem na prática: `node_modules/.pnpm`, o store do pnpm e a pasta do Windows
/// (WinSxS, cujos arquivos também aparecem em System32).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HardLinks {
    Off,
    LikelyPlaces,
    Everywhere,
}

impl Default for HardLinks {
    fn default() -> Self {
        if cfg!(windows) {
            Self::LikelyPlaces
        } else {
            Self::Everywhere
        }
    }
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            root: PathBuf::new(),
            threads: 0,
            follow_symlinks: false,
            one_filesystem: true,
            include_hidden: true,
            excludes: Vec::new(),
            max_issues: 200,
            hard_links: HardLinks::default(),
        }
    }
}

/// Resultado intermediário de uma pasta, montado em paralelo e achatado no final.
struct DirNode {
    name: String,
    mtime: f64,
    files: Vec<Leaf>,
    dirs: Vec<DirNode>,
}

struct Leaf {
    name: String,
    usage: Usage,
    mtime: f64,
    kind: EntryKind,
}

struct Ctx<'a> {
    opts: &'a ScanOptions,
    excludes: Excludes,
    progress: &'a ScanProgress,
    issues: Mutex<Vec<ScanIssue>>,
    /// (volume, arquivo) de arquivos com mais de um hard link — contados uma única vez.
    seen_inodes: Mutex<HashSet<(u64, u64)>>,
    /// Pasta do Windows (minúsculas), onde há hard links do WinSxS.
    win_dir: Option<String>,
    /// Pastas já visitadas via link simbólico (evita ciclos quando `follow_symlinks`).
    visited_links: Mutex<HashSet<PathBuf>>,
    #[cfg_attr(not(unix), allow(dead_code))]
    root_dev: u64,
}

impl Ctx<'_> {
    fn issue(&self, path: &Path, err: &io::Error) {
        self.progress.error();
        if let Ok(mut issues) = self.issues.lock() {
            if issues.len() < self.opts.max_issues {
                issues.push(ScanIssue {
                    path: path.to_string_lossy().into_owned(),
                    message: err.to_string(),
                });
            }
        }
    }

    fn first_link_visit(&self, target: &Path) -> bool {
        let key = fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
        self.visited_links.lock().map(|mut v| v.insert(key)).unwrap_or(false)
    }

    /// Uso do arquivo. Hard links são marcados com [`FLAG_HARDLINK`]; os nomes extras de um
    /// conteúdo já visto contam zero (o espaço aparece uma vez só no total).
    fn file_usage(&self, path: &Path, md: &Metadata, links: bool) -> Usage {
        let mut usage = usage_of(path, md);
        if usage.flags & FLAG_CLOUD != 0 || !links {
            return usage;
        }
        if let Some(key) = hard_link_key(path, md) {
            usage.flags |= FLAG_HARDLINK;
            let first = self.seen_inodes.lock().map(|mut s| s.insert(key)).unwrap_or(true);
            if !first {
                usage.logical = 0;
                usage.allocated = 0;
            }
        }
        usage
    }

    /// A raiz já está num lugar onde hard links são comuns?
    fn root_links(&self, root: &Path) -> bool {
        match self.opts.hard_links {
            HardLinks::Off => false,
            HardLinks::Everywhere => true,
            HardLinks::LikelyPlaces => {
                let mut prev: Option<&std::ffi::OsStr> = None;
                let mut acc = PathBuf::new();
                root.components().any(|c| {
                    acc.push(c);
                    let name = c.as_os_str();
                    let hit = self.enters_link_zone(&acc, name, prev);
                    prev = Some(name);
                    hit
                })
            }
        }
    }

    /// Entrar nesta pasta leva a um lugar onde hard links são comuns?
    fn enters_link_zone(&self, path: &Path, name: &std::ffi::OsStr, parent: Option<&std::ffi::OsStr>) -> bool {
        let is = |n: &std::ffi::OsStr, s: &str| n.eq_ignore_ascii_case(s);
        is(name, ".pnpm")
            || is(name, ".pnpm-store")
            || (is(name, "store") && parent.is_some_and(|p| is(p, "pnpm")))
            || self
                .win_dir
                .as_deref()
                .is_some_and(|w| path.to_string_lossy().to_lowercase() == w)
    }

    #[cfg(unix)]
    fn crosses_filesystem(&self, md: &Metadata) -> bool {
        use std::os::unix::fs::MetadataExt;
        self.opts.one_filesystem && md.dev() != self.root_dev
    }

    #[cfg(not(unix))]
    fn crosses_filesystem(&self, _md: &Metadata) -> bool {
        false
    }
}

/// Varre `opts.root` e devolve o snapshot em pré-ordem.
///
/// Erros em itens individuais (permissão, arquivo sumiu no meio) não interrompem a varredura:
/// viram [`ScanIssue`]. Cancelar via [`ScanProgress::cancel`] devolve o que já foi lido,
/// com `cancelled = true`.
pub fn scan(opts: &ScanOptions, progress: &ScanProgress) -> Result<Snapshot, ScanError> {
    let root = absolute(&opts.root);
    let root_display = root.to_string_lossy().into_owned();
    let md = fs::metadata(&root).map_err(|e| ScanError::from_io(root_display.clone(), e))?;
    if !md.is_dir() {
        return Err(ScanError::NotADirectory(root_display));
    }

    let ctx = Ctx {
        opts,
        excludes: Excludes::parse(&opts.excludes),
        progress,
        issues: Mutex::new(Vec::new()),
        seen_inodes: Mutex::new(HashSet::new()),
        visited_links: Mutex::new(HashSet::new()),
        win_dir: std::env::var_os("WINDIR")
            .filter(|_| cfg!(windows))
            .map(|w| w.to_string_lossy().trim_end_matches('\\').to_lowercase()),
        root_dev: device_of(&md),
    };

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(opts.threads)
        .stack_size(8 * 1024 * 1024)
        .thread_name(|i| format!("tidyspace-scan-{i}"))
        .build()
        .map_err(|e| ScanError::ThreadPool(e.to_string()))?;

    let tree = pool.install(|| walk_dir(&root, root_display.clone(), mtime_of(&md), ctx.root_links(&root), &ctx));

    let mut snapshot = flatten(tree);
    snapshot.root_path = root_display;
    snapshot.issues = ctx.issues.into_inner().unwrap_or_default();
    snapshot.error_count = progress.snapshot().errors;
    snapshot.cancelled = progress.is_cancelled();
    Ok(snapshot)
}

/// `links`: identificar hard links nesta pasta (ver [`HardLinks`]).
fn walk_dir(path: &Path, name: String, mtime: f64, links: bool, ctx: &Ctx) -> DirNode {
    let mut node = DirNode {
        name,
        mtime,
        files: Vec::new(),
        dirs: Vec::new(),
    };
    if ctx.progress.is_cancelled() {
        return node;
    }
    ctx.progress.dir_entered(path);

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(err) => {
            ctx.issue(path, &err);
            return node;
        }
    };

    let mut subdirs: Vec<(PathBuf, String, f64, bool)> = Vec::new();
    let child_links = |child: &Path, name: &str| {
        links
            || (ctx.opts.hard_links == HardLinks::LikelyPlaces
                && ctx.enters_link_zone(child, name.as_ref(), path.file_name()))
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                ctx.issue(path, &err);
                continue;
            }
        };
        let child = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        // `DirEntry::metadata` não segue links (no Windows vem de graça do FindNextFile).
        let md = match entry.metadata() {
            Ok(md) => md,
            Err(err) => {
                ctx.issue(&child, &err);
                continue;
            }
        };
        if (!ctx.opts.include_hidden && is_hidden(&name, &md)) || ctx.excludes.matches(&child, &name) {
            continue;
        }

        let ft = md.file_type();
        if ft.is_symlink() {
            if ctx.opts.follow_symlinks {
                if let Ok(target) = fs::metadata(&child) {
                    if target.is_dir() {
                        if ctx.first_link_visit(&child) {
                            let l = child_links(&child, &name);
                            subdirs.push((child, name, mtime_of(&target), l));
                        }
                        continue;
                    }
                    let usage = ctx.file_usage(&child, &target, links);
                    ctx.progress.file_done(usage.allocated);
                    node.files.push(Leaf {
                        name,
                        usage,
                        mtime: mtime_of(&target),
                        kind: EntryKind::File,
                    });
                    continue;
                }
            }
            // Link não seguido: conta só o próprio link (junctions do Windows também caem aqui).
            let usage = Usage {
                logical: md.len(),
                allocated: md.len(),
                flags: 0,
            };
            ctx.progress.file_done(usage.allocated);
            node.files.push(Leaf {
                name,
                usage,
                mtime: mtime_of(&md),
                kind: EntryKind::Symlink,
            });
        } else if ft.is_dir() {
            if !ctx.crosses_filesystem(&md) {
                let l = child_links(&child, &name);
                subdirs.push((child, name, mtime_of(&md), l));
            }
        } else {
            let usage = ctx.file_usage(&child, &md, links);
            ctx.progress.file_done(usage.allocated);
            let kind = if ft.is_file() {
                EntryKind::File
            } else {
                EntryKind::Other
            };
            node.files.push(Leaf {
                name,
                usage,
                mtime: mtime_of(&md),
                kind,
            });
        }
    }

    node.dirs = subdirs
        .into_par_iter()
        .map(|(p, n, m, l)| walk_dir(&p, n, m, l, ctx))
        .collect();
    node
}

/// Achata a árvore em pré-ordem, sem recursão (árvores profundas não estouram a pilha).
fn flatten(root: DirNode) -> Snapshot {
    let mut out = Snapshot::default();
    let mut stack: Vec<(DirNode, u32)> = vec![(root, NO_PARENT)];
    while let Some((dir, parent)) = stack.pop() {
        let idx = out.push(dir.name, parent, EntryKind::Dir, Usage::default(), dir.mtime);
        for f in dir.files {
            out.push(f.name, idx, f.kind, f.usage, f.mtime);
        }
        // Empilha ao contrário para visitar as subpastas na ordem original.
        stack.extend(dir.dirs.into_iter().rev().map(|d| (d, idx)));
    }
    out
}

fn absolute(p: &Path) -> PathBuf {
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(p))
            .unwrap_or_else(|_| p.to_path_buf())
    }
}

fn mtime_of(md: &Metadata) -> f64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[cfg(unix)]
fn device_of(md: &Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    md.dev()
}

#[cfg(not(unix))]
fn device_of(_md: &Metadata) -> u64 {
    0
}

#[cfg(windows)]
fn is_hidden(_name: &str, md: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    md.file_attributes() & (HIDDEN | SYSTEM) != 0
}

#[cfg(not(windows))]
fn is_hidden(name: &str, _md: &Metadata) -> bool {
    name.starts_with('.')
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        File::create(path).unwrap().write_all(&vec![7u8; bytes]).unwrap();
    }

    fn opts(root: &Path) -> ScanOptions {
        ScanOptions {
            root: root.to_path_buf(),
            threads: 2,
            ..Default::default()
        }
    }

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        write(&r.join("a.bin"), 100);
        write(&r.join("sub/b.bin"), 250);
        write(&r.join("sub/deep/c.txt"), 30);
        write(&r.join("other/d.tmp"), 5);
        fs::create_dir_all(r.join("empty")).unwrap();
        dir
    }

    fn index_of(s: &Snapshot, name: &str) -> usize {
        s.names
            .iter()
            .position(|n| n == name)
            .unwrap_or_else(|| panic!("{name} ausente"))
    }

    #[test]
    fn counts_every_entry_and_byte() {
        let dir = fixture();
        let progress = ScanProgress::new();
        let s = scan(&opts(dir.path()), &progress).unwrap();
        assert_eq!(s.total_size(), 385);
        // raiz + 4 pastas + 4 arquivos
        assert_eq!(s.len(), 9);
        let p = progress.snapshot();
        assert_eq!((p.files, p.dirs), (4, 5));
        // Progresso conta bytes alocados; cada arquivo ocupa ao menos o próprio conteúdo.
        assert_eq!(p.bytes, s.total_allocated());
        assert!(s.total_allocated() >= 385);
        assert!(s.flags.iter().all(|f| f & crate::usage::FLAG_CLOUD == 0));
        assert!(!s.cancelled);
    }

    #[test]
    fn snapshot_is_preorder_with_contiguous_subtrees() {
        let dir = fixture();
        let s = scan(&opts(dir.path()), &ScanProgress::new()).unwrap();
        assert_eq!(s.parents[0], NO_PARENT);
        for i in 1..s.len() {
            assert!((s.parents[i] as usize) < i, "pai depois do filho em {i}");
        }
        // Todos os descendentes de "sub" vêm logo após ele.
        let sub = index_of(&s, "sub");
        let is_desc = |mut i: usize| loop {
            if i == sub {
                return true;
            }
            if s.parents[i] == NO_PARENT {
                return false;
            }
            i = s.parents[i] as usize;
        };
        let range: Vec<usize> = (0..s.len()).filter(|&i| i != sub && is_desc(i)).collect();
        assert_eq!(range, ((sub + 1)..(sub + 1 + range.len())).collect::<Vec<_>>());
    }

    #[test]
    fn applies_exclusions() {
        let dir = fixture();
        let mut o = opts(dir.path());
        o.excludes = vec!["deep".into(), "*.tmp".into()];
        let s = scan(&o, &ScanProgress::new()).unwrap();
        assert_eq!(s.total_size(), 350);
        assert!(!s.names.iter().any(|n| n == "deep" || n == "d.tmp"));
    }

    #[test]
    fn cancelled_scan_returns_partial_result() {
        let dir = fixture();
        let progress = ScanProgress::new();
        progress.cancel();
        let s = scan(&opts(dir.path()), &progress).unwrap();
        assert!(s.cancelled);
        assert_eq!(s.len(), 1);
    }

    #[test]
    fn rejects_missing_root_and_files() {
        let dir = fixture();
        let missing = scan(&opts(&dir.path().join("nope")), &ScanProgress::new());
        assert!(matches!(missing, Err(ScanError::NotFound(_))));
        let file = scan(&opts(&dir.path().join("a.bin")), &ScanProgress::new());
        assert!(matches!(file, Err(ScanError::NotADirectory(_))));
    }

    #[cfg(unix)]
    #[test]
    fn hidden_entries_can_be_skipped() {
        let dir = fixture();
        write(&dir.path().join(".cache/x"), 1000);
        let mut o = opts(dir.path());
        o.include_hidden = false;
        assert_eq!(scan(&o, &ScanProgress::new()).unwrap().total_size(), 385);
        o.include_hidden = true;
        assert_eq!(scan(&o, &ScanProgress::new()).unwrap().total_size(), 1385);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed_by_default_and_hardlinks_count_once() {
        let dir = fixture();
        let r = dir.path();
        std::os::unix::fs::symlink(r.join("sub"), r.join("link-to-sub")).unwrap();
        fs::hard_link(r.join("a.bin"), r.join("a-hard.bin")).unwrap();
        let s = scan(&opts(r), &ScanProgress::new()).unwrap();
        assert_eq!(s.kinds[index_of(&s, "link-to-sub")], EntryKind::Symlink as u8);
        let link_size = s.sizes[index_of(&s, "link-to-sub")];
        assert_eq!(s.total_size(), 385 + link_size);
    }

    /// Hard links (como os do pnpm): o conteúdo conta uma vez e todos os nomes ficam marcados.
    #[test]
    fn hardlinks_count_once_and_are_flagged() {
        let dir = fixture();
        let r = dir.path();
        fs::hard_link(r.join("sub/b.bin"), r.join("other/b-link.bin")).unwrap();
        let mut o = opts(r);
        o.hard_links = HardLinks::Everywhere;
        let s = scan(&o, &ScanProgress::new()).unwrap();
        assert_eq!(s.total_size(), 385);
        for name in ["b.bin", "b-link.bin"] {
            assert_ne!(s.flags[index_of(&s, name)] & FLAG_HARDLINK, 0, "{name} sem marca");
        }
        assert_eq!(s.flags[index_of(&s, "a.bin")] & FLAG_HARDLINK, 0);
        let counted = ["b.bin", "b-link.bin"].map(|n| s.sizes[index_of(&s, n)]);
        assert_eq!(counted.iter().sum::<u64>(), 250);
    }

    /// Padrão no Windows: só procura hard links onde eles costumam existir (ex.: pnpm).
    #[test]
    fn default_detects_hardlinks_in_node_modules() {
        let dir = fixture();
        let r = dir.path();
        write(&r.join(".pnpm-store/v10/files/ab/cdef"), 700);
        let nm = r.join("app/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg");
        fs::create_dir_all(&nm).unwrap();
        fs::hard_link(r.join(".pnpm-store/v10/files/ab/cdef"), nm.join("index.js")).unwrap();
        // Mesmo conteúdo com dois nomes fora dos lugares típicos: no Windows não é consultado.
        write(&r.join("docs/a.txt"), 40);
        fs::hard_link(r.join("docs/a.txt"), r.join("docs/b.txt")).unwrap();
        let s = scan(&opts(r), &ScanProgress::new()).unwrap();
        assert_ne!(s.flags[index_of(&s, "cdef")] & FLAG_HARDLINK, 0);
        assert_ne!(s.flags[index_of(&s, "index.js")] & FLAG_HARDLINK, 0);
        let docs = if cfg!(windows) { 80 } else { 40 };
        assert_eq!(s.total_size(), 385 + 700 + docs);
    }

    #[test]
    fn root_inside_node_modules_detects_hardlinks() {
        let dir = fixture();
        let r = dir.path();
        let nm = r.join("node_modules/.pnpm");
        write(&nm.join("a.js"), 50);
        fs::hard_link(nm.join("a.js"), nm.join("b.js")).unwrap();
        let s = scan(&opts(&nm), &ScanProgress::new()).unwrap();
        assert_eq!(s.total_size(), 50);
    }

    /// Junctions do Windows não são seguidos: contam só o próprio link.
    #[cfg(windows)]
    #[test]
    fn junctions_are_not_followed() {
        let dir = fixture();
        let r = dir.path();
        let ok = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(r.join("junction"))
            .arg(r.join("sub"))
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "mklink /J falhou");
        let s = scan(&opts(r), &ScanProgress::new()).unwrap();
        assert_eq!(s.kinds[index_of(&s, "junction")], EntryKind::Symlink as u8);
        assert_eq!(s.total_size(), 385 + s.sizes[index_of(&s, "junction")]);
    }

    /// Caminhos acima de 260 caracteres (comuns no pnpm) são lidos normalmente.
    #[test]
    fn long_paths_are_scanned() {
        let dir = fixture();
        let mut deep = dir.path().to_path_buf();
        while deep.as_os_str().len() < 300 {
            deep.push("pasta-com-nome-comprido-para-passar-do-limite");
        }
        write(&deep.join("fundo.bin"), 10);
        let s = scan(&opts(dir.path()), &ScanProgress::new()).unwrap();
        assert_eq!(s.total_size(), 395);
        assert_eq!(s.error_count, 0);
    }

    #[cfg(unix)]
    #[test]
    fn following_symlinks_does_not_loop() {
        let dir = fixture();
        let r = dir.path();
        std::os::unix::fs::symlink(r, r.join("sub/loop")).unwrap();
        let mut o = opts(r);
        o.follow_symlinks = true;
        let s = scan(&o, &ScanProgress::new()).unwrap();
        assert!(s.len() < 40, "ciclo não detectado: {} entradas", s.len());
    }
}

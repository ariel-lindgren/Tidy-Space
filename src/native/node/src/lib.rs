//! Binding N-API do scanner. Mantido fino de propósito: converte tipos e delega ao `scanner-core`.
//!
//! Uso a partir do JS:
//! ```js
//! const job = new ScanJob({ root: 'C:\\' })
//! const timer = setInterval(() => report(job.progress()), 100)   // polling, sem callbacks entre threads
//! const snapshot = await job.run()                                // roda fora do event loop
//! job.cancel()                                                    // a qualquer momento
//! ```
#![deny(clippy::all)]

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use scanner_core::{HardLinks, ScanOptions, ScanProgress, Snapshot, VolumeKind};

#[napi(object)]
pub struct NativeScanOptions {
    pub root: String,
    pub threads: Option<u32>,
    pub follow_symlinks: Option<bool>,
    pub one_filesystem: Option<bool>,
    pub include_hidden: Option<bool>,
    pub excludes: Option<Vec<String>>,
    /// Identificar hard links (pnpm, WinSxS) para contar o conteúdo uma vez. Padrão: sim.
    pub hard_links: Option<bool>,
}

#[napi(object)]
pub struct NativeProgress {
    pub files: f64,
    pub dirs: f64,
    pub bytes: f64,
    pub errors: f64,
    pub current_path: String,
    pub elapsed_ms: f64,
}

#[napi(object)]
pub struct NativeIssue {
    pub path: String,
    pub message: String,
}

/// Snapshot colunar. `names` vem num único texto separado por `\0` (bem mais barato do que
/// milhões de strings JS atravessando a fronteira).
#[napi(object, object_from_js = false)]
pub struct NativeSnapshot {
    pub root_path: String,
    pub names: String,
    pub parents: Uint32Array,
    pub kinds: Uint8Array,
    /// Tamanho lógico de cada entrada.
    pub sizes: Float64Array,
    /// Bytes alocados no disco (0 para arquivos só na nuvem).
    pub allocated: Float64Array,
    /// Bits FLAG_CLOUD (1), FLAG_SPARSE (2) e FLAG_HARDLINK (4).
    pub flags: Uint8Array,
    pub mtimes: Float64Array,
    pub issues: Vec<NativeIssue>,
    pub error_count: f64,
    pub cancelled: bool,
    pub elapsed_ms: f64,
}

#[napi(object)]
pub struct NativeVolume {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total: f64,
    pub available: f64,
    pub removable: bool,
    /// "ssd" | "hdd" | "unknown"
    pub kind: String,
}

#[napi]
pub struct ScanJob {
    options: ScanOptions,
    progress: Arc<ScanProgress>,
    started: Instant,
}

#[napi]
impl ScanJob {
    #[napi(constructor)]
    pub fn new(options: NativeScanOptions) -> Self {
        let defaults = ScanOptions::default();
        Self {
            options: ScanOptions {
                root: PathBuf::from(options.root),
                threads: options.threads.unwrap_or(0) as usize,
                follow_symlinks: options.follow_symlinks.unwrap_or(defaults.follow_symlinks),
                one_filesystem: options.one_filesystem.unwrap_or(defaults.one_filesystem),
                include_hidden: options.include_hidden.unwrap_or(defaults.include_hidden),
                excludes: options.excludes.unwrap_or_default(),
                max_issues: defaults.max_issues,
                hard_links: match options.hard_links {
                    Some(false) => HardLinks::Off,
                    _ => defaults.hard_links,
                },
            },
            progress: Arc::new(ScanProgress::new()),
            started: Instant::now(),
        }
    }

    #[napi]
    pub fn progress(&self) -> NativeProgress {
        let p = self.progress.snapshot();
        NativeProgress {
            files: p.files as f64,
            dirs: p.dirs as f64,
            bytes: p.bytes as f64,
            errors: p.errors as f64,
            current_path: p.current_path,
            elapsed_ms: self.started.elapsed().as_secs_f64() * 1000.0,
        }
    }

    #[napi]
    pub fn cancel(&self) {
        self.progress.cancel();
    }

    /// Executa a varredura numa thread do libuv; resolve com o snapshot.
    #[napi(ts_return_type = "Promise<NativeSnapshot>")]
    pub fn run(&mut self) -> AsyncTask<ScanTask> {
        self.started = Instant::now();
        AsyncTask::new(ScanTask {
            options: self.options.clone(),
            progress: Arc::clone(&self.progress),
        })
    }
}

pub struct ScanTask {
    options: ScanOptions,
    progress: Arc<ScanProgress>,
}

impl Task for ScanTask {
    type Output = (Snapshot, f64);
    type JsValue = NativeSnapshot;

    fn compute(&mut self) -> Result<Self::Output> {
        let started = Instant::now();
        scanner_core::scan(&self.options, &self.progress)
            .map(|s| (s, started.elapsed().as_secs_f64() * 1000.0))
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, (s, elapsed_ms): Self::Output) -> Result<Self::JsValue> {
        Ok(NativeSnapshot {
            root_path: s.root_path,
            names: s.names.join("\0"),
            parents: Uint32Array::new(s.parents),
            kinds: Uint8Array::new(s.kinds),
            sizes: Float64Array::new(s.sizes.into_iter().map(|v| v as f64).collect()),
            allocated: Float64Array::new(s.allocated.into_iter().map(|v| v as f64).collect()),
            flags: Uint8Array::new(s.flags),
            mtimes: Float64Array::new(s.mtimes),
            issues: s
                .issues
                .into_iter()
                .map(|i| NativeIssue {
                    path: i.path,
                    message: i.message,
                })
                .collect(),
            error_count: s.error_count as f64,
            cancelled: s.cancelled,
            elapsed_ms,
        })
    }
}

#[napi]
pub fn list_volumes() -> Vec<NativeVolume> {
    scanner_core::list_volumes()
        .into_iter()
        .map(|v| NativeVolume {
            name: v.name,
            mount_point: v.mount_point,
            file_system: v.file_system,
            total: v.total as f64,
            available: v.available as f64,
            removable: v.removable,
            kind: match v.kind {
                VolumeKind::Ssd => "ssd",
                VolumeKind::Hdd => "hdd",
                VolumeKind::Unknown => "unknown",
            }
            .to_string(),
        })
        .collect()
}

#[napi(object)]
pub struct NativeDeleteCheck {
    pub ok: bool,
    pub blocked_path: Option<String>,
    /// "permission" | "in-use" | "missing" | "other"
    pub blocker: Option<String>,
    pub message: Option<String>,
    pub checked: u32,
    pub truncated: bool,
}

/// Verifica, sem pedir elevação, se o item (e o que houver dentro) pode ser removido.
#[napi]
pub fn check_deletable(path: String, max_entries: u32) -> NativeDeleteCheck {
    let r = scanner_core::check_deletable(std::path::Path::new(&path), max_entries as usize);
    NativeDeleteCheck {
        ok: r.ok,
        blocked_path: r.blocked_path,
        blocker: r.blocker.map(|b| {
            match b {
                scanner_core::Blocker::Permission => "permission",
                scanner_core::Blocker::InUse => "in-use",
                scanner_core::Blocker::Missing => "missing",
                scanner_core::Blocker::Other => "other",
            }
            .to_string()
        }),
        message: r.message,
        checked: r.checked.min(u32::MAX as usize) as u32,
        truncated: r.truncated,
    }
}

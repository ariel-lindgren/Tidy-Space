//! Verifica, **sem pedir elevação**, se um item pode ser removido pelo usuário atual.
//!
//! Motivo: no Windows, mover para a Lixeira usa `IFileOperation` com o pedido de elevação
//! habilitado — num item protegido o sistema abre um diálogo de permissão (às vezes atrás da
//! janela) e a operação fica esperando. Checando antes, itens protegidos são pulados com uma
//! explicação e nenhum diálogo aparece.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Blocker {
    /// Exige permissão de administrador (ou de outro usuário).
    Permission,
    /// Aberto por outro programa.
    InUse,
    /// Não existe mais.
    Missing,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteCheck {
    pub ok: bool,
    pub blocked_path: Option<String>,
    pub blocker: Option<Blocker>,
    pub message: Option<String>,
    /// Entradas verificadas.
    pub checked: usize,
    /// A verificação parou em `max_entries` (itens enormes): o resultado é parcial.
    pub truncated: bool,
}

/// Verifica o item e, se for pasta, tudo dentro dela (até `max_entries` entradas).
/// Links simbólicos/junctions são verificados, mas não seguidos.
pub fn check_deletable(path: &Path, max_entries: usize) -> DeleteCheck {
    let mut stack: Vec<PathBuf> = vec![path.to_path_buf()];
    let mut checked = 0usize;
    while let Some(current) = stack.pop() {
        if checked >= max_entries {
            return DeleteCheck {
                ok: true,
                blocked_path: None,
                blocker: None,
                message: None,
                checked,
                truncated: true,
            };
        }
        checked += 1;
        if let Err((blocker, message)) = probe(&current) {
            return DeleteCheck {
                ok: false,
                blocked_path: Some(current.to_string_lossy().into_owned()),
                blocker: Some(blocker),
                message: Some(message),
                checked,
                truncated: false,
            };
        }
        let Ok(md) = std::fs::symlink_metadata(&current) else {
            continue;
        };
        if md.is_dir() {
            match std::fs::read_dir(&current) {
                Ok(entries) => stack.extend(entries.flatten().map(|e| e.path())),
                Err(err) => {
                    let blocker = match err.kind() {
                        std::io::ErrorKind::PermissionDenied => Blocker::Permission,
                        _ => Blocker::Other,
                    };
                    return DeleteCheck {
                        ok: false,
                        blocked_path: Some(current.to_string_lossy().into_owned()),
                        blocker: Some(blocker),
                        message: Some(err.to_string()),
                        checked,
                        truncated: false,
                    };
                }
            }
        }
    }
    DeleteCheck {
        ok: true,
        blocked_path: None,
        blocker: None,
        message: None,
        checked,
        truncated: false,
    }
}

/// Windows: abre o item pedindo só o direito DELETE (o mesmo que a Lixeira precisa).
#[cfg(windows)]
fn probe(path: &Path) -> Result<(), (Blocker, String)> {
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND,
        ERROR_SHARING_VIOLATION, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, DELETE, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_DELETE,
        FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };

    let wide = crate::winpath::wide(path);
    // SAFETY: `wide` é UTF-16 terminado em zero e vive até o fim da chamada; os demais
    // argumentos são constantes ou nulos permitidos pela API. O handle é fechado logo abaixo.
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            DELETE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        // SAFETY: leitura do último erro da thread, sem pré-condições.
        let code = unsafe { GetLastError() };
        let blocker = match code {
            ERROR_ACCESS_DENIED => Blocker::Permission,
            ERROR_SHARING_VIOLATION => Blocker::InUse,
            ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => Blocker::Missing,
            _ => Blocker::Other,
        };
        return Err((blocker, std::io::Error::from_raw_os_error(code as i32).to_string()));
    }
    // SAFETY: `handle` é válido (não é INVALID_HANDLE_VALUE) e só é fechado aqui.
    unsafe { CloseHandle(handle) };
    Ok(())
}

/// Unix: remover exige escrita e acesso na pasta que contém o item.
#[cfg(not(windows))]
fn probe(path: &Path) -> Result<(), (Blocker, String)> {
    if std::fs::symlink_metadata(path).is_err() {
        return Err((Blocker::Missing, "não encontrado".into()));
    }
    let parent = path.parent().unwrap_or(path);
    match std::fs::metadata(parent) {
        Ok(md) if md.permissions().readonly() => Err((Blocker::Permission, "pasta somente leitura".into())),
        Ok(_) => Ok(()),
        Err(err) => Err((Blocker::Other, err.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regular_tree_is_deletable() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("a/b")).unwrap();
        std::fs::write(dir.path().join("a/b/x.txt"), b"x").unwrap();
        let r = check_deletable(&dir.path().join("a"), 1000);
        assert!(r.ok, "{r:?}");
        assert_eq!(r.checked, 3);
        assert!(!r.truncated);
    }

    #[test]
    fn missing_item_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let r = check_deletable(&dir.path().join("nope"), 10);
        assert!(!r.ok);
        assert_eq!(r.blocker, Some(Blocker::Missing));
    }

    #[test]
    fn stops_at_limit() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5 {
            std::fs::write(dir.path().join(format!("{i}.txt")), b"x").unwrap();
        }
        let r = check_deletable(dir.path(), 3);
        assert!(r.ok && r.truncated);
        assert_eq!(r.checked, 3);
    }

    /// Caminhos acima de 260 caracteres (comuns no pnpm) não podem virar "não existe".
    #[test]
    fn long_paths_are_deletable() {
        let dir = tempfile::tempdir().unwrap();
        let mut deep = dir.path().join("raiz");
        while deep.as_os_str().len() < 300 {
            deep.push("pasta-com-nome-comprido-para-passar-do-limite");
        }
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::write(deep.join("arquivo.js.map"), b"x").unwrap();
        let r = check_deletable(&dir.path().join("raiz"), 1000);
        assert!(r.ok, "{r:?}");
        assert!(check_deletable(&deep.join("arquivo.js.map"), 10).ok);
    }

    /// Arquivo aberto sem compartilhamento de exclusão → "em uso".
    #[cfg(windows)]
    #[test]
    fn file_open_without_delete_share_is_in_use() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("lock.txt");
        std::fs::write(&file, b"x").unwrap();
        let _lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&file)
            .unwrap();
        let r = check_deletable(&file, 10);
        assert!(!r.ok);
        assert_eq!(r.blocker, Some(Blocker::InUse));
    }

    /// Pasta do sistema: sem elevação não há direito de exclusão.
    #[cfg(windows)]
    #[test]
    fn system_folder_requires_permission() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let r = check_deletable(&Path::new(&windir).join("System32").join("kernel32.dll"), 10);
        assert!(!r.ok);
        assert_eq!(r.blocker, Some(Blocker::Permission));
    }
}

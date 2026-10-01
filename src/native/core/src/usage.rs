//! Quanto um arquivo ocupa **de fato** no disco — que pode ser bem diferente do tamanho lógico:
//! arquivos só na nuvem (OneDrive/iCloud/Dropbox "sob demanda") ocupam ~0 e arquivos esparsos
//! ou comprimidos (discos virtuais, NTFS comprimido) ocupam menos.

use std::fs::Metadata;
use std::path::Path;

/// Conteúdo só na nuvem: o arquivo existe na listagem, mas não ocupa espaço local.
pub const FLAG_CLOUD: u8 = 1;
/// Esparso ou comprimido: ocupa menos que o tamanho lógico.
pub const FLAG_SPARSE: u8 = 2;
/// O conteúdo tem mais de um nome (hard link, ex.: `node_modules` do pnpm ligado ao store).
/// Apagar este nome não libera espaço enquanto existir outro.
pub const FLAG_HARDLINK: u8 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Usage {
    pub logical: u64,
    pub allocated: u64,
    pub flags: u8,
}

/// Tamanho de cluster assumido quando o sistema não informa a alocação (padrão do NTFS).
const CLUSTER: u64 = 4096;

pub(crate) fn round_up(bytes: u64, unit: u64) -> u64 {
    bytes.div_ceil(unit).saturating_mul(unit)
}

#[cfg(unix)]
pub fn usage_of(_path: &Path, md: &Metadata) -> Usage {
    use std::os::unix::fs::MetadataExt;
    let logical = md.len();
    #[cfg(target_os = "macos")]
    {
        // SF_DATALESS: arquivo do iCloud Drive com "otimizar armazenamento" (conteúdo não baixado).
        const SF_DATALESS: u32 = 0x4000_0000;
        if std::os::macos::fs::MetadataExt::st_flags(md) & SF_DATALESS != 0 {
            return Usage {
                logical,
                allocated: 0,
                flags: FLAG_CLOUD,
            };
        }
    }
    let allocated = md.blocks().saturating_mul(512);
    let flags = if allocated < logical { FLAG_SPARSE } else { 0 };
    Usage {
        logical,
        allocated,
        flags,
    }
}

#[cfg(windows)]
pub fn usage_of(path: &Path, md: &Metadata) -> Usage {
    use std::os::windows::fs::MetadataExt;
    const OFFLINE: u32 = 0x1000;
    const RECALL_ON_OPEN: u32 = 0x4_0000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x40_0000;
    const SPARSE: u32 = 0x200;
    const COMPRESSED: u32 = 0x800;

    let logical = md.len();
    let attrs = md.file_attributes();
    // Placeholders do OneDrive/Arquivos sob demanda: o conteúdo só é baixado ao abrir.
    if attrs & (OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0 {
        return Usage {
            logical,
            allocated: 0,
            flags: FLAG_CLOUD,
        };
    }
    if attrs & (SPARSE | COMPRESSED) != 0 {
        if let Some(on_disk) = compressed_size(path) {
            return Usage {
                logical,
                allocated: round_up(on_disk, CLUSTER),
                flags: FLAG_SPARSE,
            };
        }
    }
    Usage {
        logical,
        allocated: round_up(logical, CLUSTER),
        flags: 0,
    }
}

/// `GetCompressedFileSizeW`: bytes realmente alocados de um arquivo esparso/comprimido.
#[cfg(windows)]
fn compressed_size(path: &Path) -> Option<u64> {
    use windows_sys::Win32::Foundation::{GetLastError, NO_ERROR};
    use windows_sys::Win32::Storage::FileSystem::{GetCompressedFileSizeW, INVALID_FILE_SIZE};

    let wide = crate::winpath::wide(path);
    let mut high: u32 = 0;
    // SAFETY: `wide` é uma string UTF-16 terminada em zero que vive até o fim da chamada, e
    // `high` é um u32 válido e exclusivo; a função não guarda nenhum dos ponteiros.
    let low = unsafe { GetCompressedFileSizeW(wide.as_ptr(), &mut high) };
    // INVALID_FILE_SIZE também pode ser um valor legítimo; só é erro se GetLastError ≠ 0.
    if low == INVALID_FILE_SIZE && unsafe { GetLastError() } != NO_ERROR {
        return None;
    }
    Some((u64::from(high) << 32) | u64::from(low))
}

/// Identidade (volume, arquivo) de um arquivo com mais de um hard link; `None` se tiver um só.
#[cfg(unix)]
pub(crate) fn hard_link_key(_path: &Path, md: &Metadata) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    (md.nlink() > 1).then(|| (md.dev(), md.ino()))
}

/// Windows: a listagem de diretório não informa o número de links. Consulta por nome
/// (`NtQueryInformationByName`, Windows 10 1709+), sem abrir o arquivo; em sistemas mais antigos,
/// abre só com direito de ler atributos. Nenhum dos dois baixa conteúdo da nuvem nem bloqueia o
/// arquivo. A chave usa só o id do arquivo: a varredura não atravessa pontos de montagem, então
/// tudo está no mesmo volume.
#[cfg(windows)]
pub(crate) fn hard_link_key(path: &Path, md: &Metadata) -> Option<(u64, u64)> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static BY_NAME_UNSUPPORTED: AtomicBool = AtomicBool::new(false);

    // Arquivo vazio não ocupa nada: não vale a consulta.
    if md.len() == 0 {
        return None;
    }
    if !BY_NAME_UNSUPPORTED.load(Ordering::Relaxed) {
        match links_by_name(path) {
            Ok(found) => return found,
            Err(ByNameError::Unsupported) => BY_NAME_UNSUPPORTED.store(true, Ordering::Relaxed),
            Err(ByNameError::Failed) => {}
        }
    }
    links_by_handle(path)
}

#[cfg(windows)]
enum ByNameError {
    Unsupported,
    Failed,
}

#[cfg(windows)]
fn links_by_name(path: &Path) -> Result<Option<(u64, u64)>, ByNameError> {
    use windows_sys::Wdk::Foundation::OBJECT_ATTRIBUTES;
    use windows_sys::Wdk::Storage::FileSystem::{FileStatInformation, NtQueryInformationByName, FILE_STAT_INFORMATION};
    use windows_sys::Win32::Foundation::{
        OBJ_CASE_INSENSITIVE, STATUS_INVALID_INFO_CLASS, STATUS_NOT_IMPLEMENTED, STATUS_NOT_SUPPORTED, UNICODE_STRING,
    };
    use windows_sys::Win32::System::IO::IO_STATUS_BLOCK;

    let mut name = crate::winpath::nt(path).ok_or(ByNameError::Failed)?;
    let bytes = u16::try_from(name.len() * 2).map_err(|_| ByNameError::Failed)?;
    let us = UNICODE_STRING {
        Length: bytes,
        MaximumLength: bytes,
        Buffer: name.as_mut_ptr(),
    };
    let attrs = OBJECT_ATTRIBUTES {
        Length: std::mem::size_of::<OBJECT_ATTRIBUTES>() as u32,
        RootDirectory: std::ptr::null_mut(),
        ObjectName: &us,
        Attributes: OBJ_CASE_INSENSITIVE,
        SecurityDescriptor: std::ptr::null(),
        SecurityQualityOfService: std::ptr::null(),
    };
    let mut info = FILE_STAT_INFORMATION::default();
    // SAFETY: estrutura POD; zero é válido.
    let mut io: IO_STATUS_BLOCK = unsafe { std::mem::zeroed() };
    // SAFETY: `attrs` aponta para `us`, que aponta para `name`; todos vivem até o fim da chamada.
    // `info` tem exatamente o tamanho informado. Nenhum ponteiro é guardado pela função.
    let status = unsafe {
        NtQueryInformationByName(
            &attrs,
            &mut io,
            (&raw mut info).cast(),
            std::mem::size_of::<FILE_STAT_INFORMATION>() as u32,
            FileStatInformation,
        )
    };
    match status {
        s if s >= 0 => Ok((info.NumberOfLinks > 1).then_some((0, info.FileId as u64))),
        STATUS_INVALID_INFO_CLASS | STATUS_NOT_IMPLEMENTED | STATUS_NOT_SUPPORTED => Err(ByNameError::Unsupported),
        _ => Err(ByNameError::Failed),
    }
}

#[cfg(windows)]
fn links_by_handle(path: &Path) -> Option<(u64, u64)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS,
        FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };
    let wide = crate::winpath::wide(path);
    // SAFETY: `wide` é UTF-16 terminado em zero e vive até o fim da chamada; demais argumentos
    // são constantes ou nulos permitidos. O handle é fechado abaixo.
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return None;
    }
    // SAFETY: estrutura POD; zero é um valor válido para todos os campos.
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    // SAFETY: `handle` é válido e `info` é exclusivo; o handle é fechado uma única vez.
    let ok = unsafe { GetFileInformationByHandle(handle, &mut info) } != 0;
    // SAFETY: `handle` é válido e não é usado depois daqui.
    unsafe { CloseHandle(handle) };
    (ok && info.nNumberOfLinks > 1).then(|| {
        (
            0,
            (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
        )
    })
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn hard_link_key(_path: &Path, _md: &Metadata) -> Option<(u64, u64)> {
    None
}

#[cfg(not(any(unix, windows)))]
pub fn usage_of(_path: &Path, md: &Metadata) -> Usage {
    Usage {
        logical: md.len(),
        allocated: md.len(),
        flags: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_up_to_cluster() {
        assert_eq!(round_up(0, CLUSTER), 0);
        assert_eq!(round_up(1, CLUSTER), 4096);
        assert_eq!(round_up(4096, CLUSTER), 4096);
        assert_eq!(round_up(4097, CLUSTER), 8192);
    }

    #[test]
    fn regular_file_occupies_at_least_its_content() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.bin");
        std::fs::write(&file, vec![1u8; 10_000]).unwrap();
        let u = usage_of(&file, &std::fs::metadata(&file).unwrap());
        assert_eq!(u.logical, 10_000);
        assert!(u.allocated >= 10_000, "alocado {} < lógico", u.allocated);
        assert_eq!(u.flags & FLAG_CLOUD, 0);
    }
}

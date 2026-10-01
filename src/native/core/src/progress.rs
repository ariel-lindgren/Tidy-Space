use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

/// Contadores compartilhados entre as threads da varredura. O consumidor lê por polling
/// ([`ScanProgress::snapshot`]) — assim não há callback cruzando threads para o JS.
#[derive(Debug, Default)]
pub struct ScanProgress {
    files: AtomicU64,
    dirs: AtomicU64,
    bytes: AtomicU64,
    errors: AtomicU64,
    cancelled: AtomicBool,
    current: Mutex<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ProgressSnapshot {
    pub files: u64,
    pub dirs: u64,
    pub bytes: u64,
    pub errors: u64,
    pub current_path: String,
}

/// A cada quantas pastas o "caminho atual" é atualizado (evita disputa no mutex).
const CURRENT_PATH_EVERY: u64 = 16;

impl ScanProgress {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    pub fn snapshot(&self) -> ProgressSnapshot {
        ProgressSnapshot {
            files: self.files.load(Ordering::Relaxed),
            dirs: self.dirs.load(Ordering::Relaxed),
            bytes: self.bytes.load(Ordering::Relaxed),
            errors: self.errors.load(Ordering::Relaxed),
            current_path: self.current.lock().map(|g| g.clone()).unwrap_or_default(),
        }
    }

    pub(crate) fn file_done(&self, size: u64) {
        self.files.fetch_add(1, Ordering::Relaxed);
        self.bytes.fetch_add(size, Ordering::Relaxed);
    }

    pub(crate) fn dir_entered(&self, path: &Path) {
        let n = self.dirs.fetch_add(1, Ordering::Relaxed);
        if n.is_multiple_of(CURRENT_PATH_EVERY) {
            if let Ok(mut current) = self.current.try_lock() {
                *current = path.to_string_lossy().into_owned();
            }
        }
    }

    pub(crate) fn error(&self) {
        self.errors.fetch_add(1, Ordering::Relaxed);
    }
}

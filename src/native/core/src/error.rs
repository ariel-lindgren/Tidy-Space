use std::io;

/// Falha que impede a varredura de começar (problemas em itens individuais viram [`ScanIssue`]).
#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("caminho não encontrado: {0}")]
    NotFound(String),
    #[error("o caminho não é uma pasta: {0}")]
    NotADirectory(String),
    #[error("sem permissão para ler {0}")]
    PermissionDenied(String),
    #[error("erro de E/S em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("não foi possível criar o pool de threads: {0}")]
    ThreadPool(String),
}

impl ScanError {
    pub(crate) fn from_io(path: String, err: io::Error) -> Self {
        match err.kind() {
            io::ErrorKind::NotFound => ScanError::NotFound(path),
            io::ErrorKind::PermissionDenied => ScanError::PermissionDenied(path),
            _ => ScanError::Io { path, source: err },
        }
    }
}

/// Item que não pôde ser lido durante a varredura (a varredura continua).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanIssue {
    pub path: String,
    pub message: String,
}

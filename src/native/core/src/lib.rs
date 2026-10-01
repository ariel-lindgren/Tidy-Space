//! Núcleo do scanner do TidySpace.
//!
//! Percorre uma árvore de diretórios em paralelo (rayon, com work-stealing) e produz um
//! [`Snapshot`] colunar em **pré-ordem**: o pai sempre vem antes dos filhos e a subárvore de
//! qualquer pasta ocupa um intervalo contíguo de índices. O consumidor (processo "engine" em
//! TypeScript) agrega tamanhos e responde consultas a partir dessas colunas.
//!
//! Este crate não depende de Node, então é testado com `cargo test` puro.

mod deletable;
mod error;
mod exclude;
mod progress;
mod snapshot;
mod usage;
mod volumes;
mod walk;
#[cfg(windows)]
mod winpath;

pub use deletable::{check_deletable, Blocker, DeleteCheck};
pub use error::{ScanError, ScanIssue};
pub use exclude::Excludes;
pub use progress::{ProgressSnapshot, ScanProgress};
pub use snapshot::{EntryKind, Snapshot, NO_PARENT};
pub use usage::{Usage, FLAG_CLOUD, FLAG_HARDLINK, FLAG_SPARSE};
pub use volumes::{list_volumes, VolumeInfo, VolumeKind};
pub use walk::{scan, HardLinks, ScanOptions};

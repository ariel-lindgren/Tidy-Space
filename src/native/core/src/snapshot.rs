use crate::error::ScanIssue;
use crate::usage::Usage;

/// Índice de pai da raiz.
pub const NO_PARENT: u32 = u32::MAX;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum EntryKind {
    File = 0,
    Dir = 1,
    Symlink = 2,
    Other = 3,
}

/// Resultado colunar em pré-ordem. `sizes` guarda o tamanho **próprio** de cada entrada
/// (pastas = 0); a agregação por pasta é feita pelo consumidor.
#[derive(Debug, Default)]
pub struct Snapshot {
    pub root_path: String,
    pub names: Vec<String>,
    pub parents: Vec<u32>,
    pub kinds: Vec<u8>,
    pub sizes: Vec<u64>,
    /// Bytes realmente alocados no disco (0 para arquivos só na nuvem).
    pub allocated: Vec<u64>,
    /// Bits de `usage::FLAG_*`.
    pub flags: Vec<u8>,
    /// Milissegundos desde a época Unix (0 quando indisponível).
    pub mtimes: Vec<f64>,
    pub issues: Vec<ScanIssue>,
    pub error_count: u64,
    pub cancelled: bool,
}

impl Snapshot {
    pub fn len(&self) -> usize {
        self.names.len()
    }

    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    pub fn total_size(&self) -> u64 {
        self.sizes.iter().sum()
    }

    pub fn total_allocated(&self) -> u64 {
        self.allocated.iter().sum()
    }

    pub(crate) fn push(&mut self, name: String, parent: u32, kind: EntryKind, usage: Usage, mtime: f64) -> u32 {
        let idx = u32::try_from(self.names.len()).expect("mais de 4 bilhões de entradas");
        self.names.push(name);
        self.parents.push(parent);
        self.kinds.push(kind as u8);
        self.sizes.push(usage.logical);
        self.allocated.push(usage.allocated);
        self.flags.push(usage.flags);
        self.mtimes.push(mtime);
        idx
    }
}

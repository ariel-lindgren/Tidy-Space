use sysinfo::{DiskKind, Disks};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VolumeKind {
    Ssd,
    Hdd,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
    pub kind: VolumeKind,
}

/// Volumes montados, como o sistema operacional os reporta. O filtro de "volumes úteis"
/// (ignorar snaps, tmpfs etc.) fica no engine, onde é testável por plataforma.
pub fn list_volumes() -> Vec<VolumeInfo> {
    Disks::new_with_refreshed_list()
        .list()
        .iter()
        .map(|d| VolumeInfo {
            name: d.name().to_string_lossy().into_owned(),
            mount_point: d.mount_point().to_string_lossy().into_owned(),
            file_system: d.file_system().to_string_lossy().into_owned(),
            total: d.total_space(),
            available: d.available_space(),
            removable: d.is_removable(),
            kind: match d.kind() {
                DiskKind::SSD => VolumeKind::Ssd,
                DiskKind::HDD => VolumeKind::Hdd,
                _ => VolumeKind::Unknown,
            },
        })
        .collect()
}

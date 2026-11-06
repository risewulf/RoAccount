//! Liste des processus clients Roblox en cours, pour le Monitor.
//!
//! Lecture directe de la table des processus (crate `sysinfo`) : aucun
//! sous-processus n'est lancé (avant : `tasklist`, qui faisait clignoter une
//! fenêtre cmd toutes les quelques secondes).

use crate::models::ProcInfo;

pub fn roblox_processes() -> Vec<ProcInfo> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new().with_memory(),
    );

    let mut out: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .filter(|(_, p)| p.name().to_string_lossy().eq_ignore_ascii_case("RobloxPlayerBeta.exe"))
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().to_string(),
            memory_mb: p.memory() / 1024 / 1024,
        })
        .collect();
    out.sort_by_key(|p| p.pid);
    out
}

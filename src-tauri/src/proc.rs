//! Liste des processus clients Roblox en cours, pour le Monitor.
//! Sous Windows, via `tasklist` (fiable, sans dépendance supplémentaire).

use crate::models::ProcInfo;

#[cfg(target_os = "windows")]
pub fn roblox_processes() -> Vec<ProcInfo> {
    use std::process::Command;

    let mut out = Vec::new();
    for image in ["RobloxPlayerBeta.exe"] {
        let res = Command::new("tasklist")
            .args([
                "/FI",
                &format!("IMAGENAME eq {image}"),
                "/FO",
                "CSV",
                "/NH",
            ])
            .output();

        if let Ok(o) = res {
            let text = String::from_utf8_lossy(&o.stdout);
            for line in text.lines() {
                // Format CSV : "Image","PID","Session","Session#","Mém. utilisée"
                let cols: Vec<String> = line
                    .trim()
                    .trim_matches('"')
                    .split("\",\"")
                    .map(|s| s.to_string())
                    .collect();
                if cols.len() < 5 {
                    continue;
                }
                let pid = digits(&cols[1]).parse::<u32>().unwrap_or(0);
                let mem_kb = digits(&cols[4]).parse::<u64>().unwrap_or(0);
                out.push(ProcInfo {
                    pid,
                    name: cols[0].clone(),
                    memory_mb: mem_kb / 1024,
                });
            }
        }
    }
    out
}

/// Ne garde que les chiffres d'une chaîne (ex. « 1 234 560 K » → « 1234560 »).
#[cfg(target_os = "windows")]
fn digits(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).collect()
}

#[cfg(not(target_os = "windows"))]
pub fn roblox_processes() -> Vec<ProcInfo> {
    Vec::new()
}

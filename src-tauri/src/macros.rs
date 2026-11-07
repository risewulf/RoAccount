//! Macros AutoHotkey v2 : scripts `.ahk` stockés dans le dossier de données,
//! lancés une fois par client Roblox avec son PID en premier argument
//! (`A_Args[1]` dans le script).

use crate::error::{AppError, Result};
use crate::models::{MacroInfo, RunningMacro};
use crate::state::{AppState, MacroProc};
use std::path::PathBuf;

const SAMPLE: &str = r#"#Requires AutoHotkey v2.0
; Macro d'exemple : anti-AFK. Reçoit le PID du client Roblox (A_Args[1]).
pid := A_Args.Length ? A_Args[1] : 0
if !pid || !WinExist("ahk_pid " pid) {
    MsgBox "Roblox client not found."
    ExitApp
}
Loop {
    ; touche envoyée à la fenêtre du client, sans lui voler le focus
    ControlSend "{Space}", , "ahk_pid " pid
    Sleep 60000
    if !WinExist("ahk_pid " pid)
        ExitApp
}
"#;

fn base_dir() -> Result<PathBuf> {
    let mut d = dirs::data_local_dir()
        .ok_or_else(|| AppError::Io("local data folder not found".into()))?;
    d.push("RoAccount");
    d.push("macros");
    std::fs::create_dir_all(&d)?;
    Ok(d)
}

/// Nom de macro sûr (pas de chemin, pas d'extension).
pub fn valid_name(n: &str) -> bool {
    !n.is_empty()
        && n.len() <= 48
        && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == ' ')
        && !n.starts_with(' ')
}

fn script_path(name: &str) -> Result<PathBuf> {
    if !valid_name(name) {
        return Err(AppError::Other("Invalid macro name (letters, digits, space, - and _).".into()));
    }
    Ok(base_dir()?.join(format!("{name}.ahk")))
}

pub fn list() -> Result<Vec<MacroInfo>> {
    let dir = base_dir()?;
    let mut out = Vec::new();
    for e in std::fs::read_dir(&dir)?.flatten() {
        let p = e.path();
        if p.extension().map(|x| x == "ahk").unwrap_or(false) {
            let name = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            if valid_name(&name) {
                out.push(MacroInfo { name, code: std::fs::read_to_string(&p).unwrap_or_default() });
            }
        }
    }
    if out.is_empty() {
        std::fs::write(dir.join("anti-afk.ahk"), SAMPLE)?;
        out.push(MacroInfo { name: "anti-afk".into(), code: SAMPLE.into() });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn save(name: &str, code: &str) -> Result<()> {
    std::fs::write(script_path(name)?, code)?;
    Ok(())
}

pub fn delete(name: &str) -> Result<()> {
    let p = script_path(name)?;
    if p.exists() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

/// Cherche AutoHotkey v2 : chemin choisi par l'utilisateur, puis emplacements usuels.
pub fn find_ahk(custom: &str) -> Option<PathBuf> {
    let c = custom.trim().trim_matches('"');
    if !c.is_empty() {
        let p = PathBuf::from(c);
        return if p.is_file() { Some(p) } else { None };
    }
    let mut roots: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(v) = std::env::var(var) {
            roots.push(PathBuf::from(v));
        }
    }
    for r in roots {
        for rel in [
            "AutoHotkey/v2/AutoHotkey64.exe",
            "AutoHotkey/v2/AutoHotkey32.exe",
            "AutoHotkey/v2/AutoHotkey.exe",
            "Programs/AutoHotkey/v2/AutoHotkey64.exe",
            "AutoHotkey/AutoHotkey64.exe",
        ] {
            let p = r.join(rel);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// Lance la macro `name` une fois par PID. Renvoie le nombre d'instances démarrées.
pub fn run(state: &AppState, name: &str, pids: &[u32], ahk_custom: &str) -> Result<usize> {
    let ahk = find_ahk(ahk_custom).ok_or_else(|| {
        AppError::Other("AutoHotkey v2 not found. Install it (autohotkey.com) or set its path.".into())
    })?;
    let code = std::fs::read_to_string(script_path(name)?)
        .map_err(|_| AppError::Other("Macro not found.".into()))?;
    if pids.is_empty() {
        return Err(AppError::Other("No Roblox client running.".into()));
    }

    // AutoHotkey v2 remplace par défaut l'instance précédente d'un même script :
    // on lance donc une copie par client, avec #SingleInstance Off en tête.
    let run_dir = base_dir()?.join(".run");
    std::fs::create_dir_all(&run_dir)?;
    let mut started = 0;
    for pid in pids {
        let copy = run_dir.join(format!("{name}-{pid}.ahk"));
        std::fs::write(&copy, format!("#SingleInstance Off\n{code}"))?;
        match std::process::Command::new(&ahk).arg(&copy).arg(pid.to_string()).spawn() {
            Ok(child) => {
                state.macros.lock().unwrap().push(MacroProc { name: name.to_string(), pid: *pid, child });
                started += 1;
            }
            Err(e) => return Err(AppError::Other(format!("couldn't start AutoHotkey: {e}"))),
        }
    }
    Ok(started)
}

/// Macros encore en cours (les terminées sont retirées).
pub fn running(state: &AppState) -> Vec<RunningMacro> {
    let mut v = state.macros.lock().unwrap();
    v.retain_mut(|m| matches!(m.child.try_wait(), Ok(None)));
    v.iter().map(|m| RunningMacro { name: m.name.clone(), pid: m.pid }).collect()
}

/// Arrête every macros (ou seulement celle nommée).
pub fn stop(state: &AppState, name: Option<&str>) -> usize {
    let mut v = state.macros.lock().unwrap();
    let mut n = 0;
    v.retain_mut(|m| {
        if name.map(|x| x == m.name).unwrap_or(true) {
            let _ = m.child.kill();
            let _ = m.child.wait();
            n += 1;
            false
        } else {
            true
        }
    });
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert!(valid_name("anti-afk"));
        assert!(valid_name("Macro 2"));
        assert!(!valid_name(""));
        assert!(!valid_name("../evil"));
        assert!(!valid_name("a/b"));
        assert!(!valid_name("x.ahk"));
    }
}

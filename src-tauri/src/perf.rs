//! Mesures (Monitor / Accueil) et réglages graphiques des clients Roblox.
//!
//! - `metrics` : CPU / mémoire de la machine + une ligne par client (CPU, mémoire,
//!   mémoire validée, débit disque, durée). Un `System` persistant est gardé entre
//!   deux appels pour que les pourcentages de CPU soient justes.
//! - `apply_graphics` : écrit (ou retire) les réglages « FFlags » de Roblox dans
//!   `ClientSettings/ClientAppSettings.json` de la dernière version installée.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize)]
pub struct ClientMetric {
    pub pid: u32,
    /// Compte qui a lancé ce client (si on l'a repéré au lancement).
    pub account_id: Option<String>,
    pub cpu: f32,
    pub memory_mb: u64,
    pub commit_mb: u64,
    pub read_kbps: u64,
    pub write_kbps: u64,
    pub uptime_s: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Metrics {
    pub cpu: f32,
    pub mem_pct: f32,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    /// Pas disponible sans compteur GPU Windows : toujours `None` pour l'instant.
    pub gpu_pct: Option<f32>,
    pub clients: Vec<ClientMetric>,
}

struct Sampler {
    sys: System,
    last: Instant,
}

static SAMPLER: OnceLock<Mutex<Sampler>> = OnceLock::new();

fn is_roblox(name: &str) -> bool {
    name.eq_ignore_ascii_case("RobloxPlayerBeta.exe")
}

pub fn metrics(pid_map: &HashMap<String, u32>) -> Metrics {
    let cell = SAMPLER.get_or_init(|| {
        Mutex::new(Sampler { sys: System::new(), last: Instant::now() })
    });
    let mut s = cell.lock().unwrap();
    let dt = s.last.elapsed().as_secs_f32().max(0.5);
    s.last = Instant::now();

    s.sys.refresh_cpu_usage();
    s.sys.refresh_memory();
    s.sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new().with_cpu().with_memory().with_disk_usage(),
    );

    let ncpu = s.sys.cpus().len().max(1) as f32;
    let by_pid: HashMap<u32, String> = pid_map.iter().map(|(id, p)| (*p, id.clone())).collect();

    let mut clients: Vec<ClientMetric> = s
        .sys
        .processes()
        .iter()
        .filter(|(_, p)| is_roblox(&p.name().to_string_lossy()))
        .map(|(pid, p)| {
            let d = p.disk_usage();
            let pid = pid.as_u32();
            ClientMetric {
                pid,
                account_id: by_pid.get(&pid).cloned(),
                cpu: (p.cpu_usage() / ncpu).min(100.0),
                memory_mb: p.memory() / 1024 / 1024,
                commit_mb: p.virtual_memory() / 1024 / 1024,
                read_kbps: (d.read_bytes as f32 / dt / 1024.0) as u64,
                write_kbps: (d.written_bytes as f32 / dt / 1024.0) as u64,
                uptime_s: p.run_time(),
            }
        })
        .collect();
    clients.sort_by_key(|c| c.pid);

    let total = s.sys.total_memory();
    let used = s.sys.used_memory();
    Metrics {
        cpu: s.sys.global_cpu_usage(),
        mem_pct: if total > 0 { used as f32 / total as f32 * 100.0 } else { 0.0 },
        mem_used_mb: used / 1024 / 1024,
        mem_total_mb: total / 1024 / 1024,
        gpu_pct: None,
        clients,
    }
}

/* ------------------------------------------------------------------ */
/* Réglages graphiques                                                 */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GraphicsOpts {
    /// 0 = pas de limite.
    pub fps_cap: u32,
    pub lowest_graphics: bool,
    /// 0 = ne pas toucher ; sinon 1, 2, 4, 8.
    pub msaa: u32,
    /// "default" | "min" | "low" | "med"
    pub textures: String,
    /// "default" | "d3d11" | "vulkan" | "opengl"
    pub render: String,
    pub gray_sky: bool,
    pub no_grass: bool,
    /// Force the Voxel lighting engine (lighter than Future).
    pub voxel: bool,
    pub no_shadows: bool,
    /// Turn off post-processing effects (bloom, blur, colour grading…).
    pub no_post_fx: bool,
}

impl Default for GraphicsOpts {
    fn default() -> Self {
        GraphicsOpts {
            fps_cap: 0,
            lowest_graphics: false,
            msaa: 0,
            textures: "default".into(),
            render: "default".into(),
            gray_sky: false,
            no_grass: false,
            voxel: false,
            no_shadows: false,
            no_post_fx: false,
        }
    }
}

/// Tous les réglages que RoAccount peut écrire : on ne retire que ceux-là, jamais
/// ceux ajoutés par l'utilisateur.
const OWNED_FLAGS: &[&str] = &[
    "DFIntTaskSchedulerTargetFps",
    "FIntRomarkStartWithGraphicQualityLevel",
    "DFIntDebugFRMQualityLevelOverride",
    "FIntDebugForceMSAASamples",
    "DFFlagTextureQualityOverrideEnabled",
    "DFIntTextureQualityOverride",
    "FFlagDebugGraphicsPreferD3D11",
    "FFlagDebugGraphicsPreferVulkan",
    "FFlagDebugGraphicsPreferOpenGL",
    "FFlagDebugSkyGray",
    "FIntFRMMinGrassDistance",
    "FIntFRMMaxGrassDistance",
    "DFFlagDebugRenderForceTechnologyVoxel",
    "FIntRenderShadowIntensity",
    "FFlagDisablePostFx",
];

/// Dossier `Versions\\version-xxxx` le plus récent contenant RobloxPlayerBeta.exe.
pub fn latest_version_dir() -> Option<std::path::PathBuf> {
    let mut root = dirs::data_local_dir()?;
    root.push("Roblox");
    root.push("Versions");
    let mut best: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for e in std::fs::read_dir(&root).ok()?.flatten() {
        let p = e.path();
        if !p.join("RobloxPlayerBeta.exe").exists() {
            continue;
        }
        let m = e.metadata().ok()?.modified().ok()?;
        if best.as_ref().map(|(t, _)| m > *t).unwrap_or(true) {
            best = Some((m, p));
        }
    }
    best.map(|(_, p)| p)
}

/// Applique (ou retire, si `enabled` est faux) les réglages graphiques sur Roblox officiel ET sur la version
/// installée par RoAccount. Renvoie le dernier fichier écrit.
pub fn apply_graphics(enabled: bool, o: &GraphicsOpts) -> Result<String, String> {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(name) = crate::bootstrap::current_name() {
        dirs.push(crate::bootstrap::version_dir(&name));
    }
    if let Some(d) = latest_version_dir() {
        dirs.push(d);
    }
    if dirs.is_empty() {
        return Err("Roblox is not installed (no version found).".into());
    }
    let mut last = String::new();
    for d in dirs {
        last = apply_graphics_in(&d, enabled, o)?;
    }
    Ok(last)
}

fn apply_graphics_in(dir: &std::path::Path, enabled: bool, o: &GraphicsOpts) -> Result<String, String> {
    use serde_json::{json, Map, Value};

    let cs = dir.join("ClientSettings");
    let file = cs.join("ClientAppSettings.json");

    // repart du fichier existant pour garder les réglages de l'utilisateur
    let mut map: Map<String, Value> = std::fs::read(&file)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    for k in OWNED_FLAGS {
        map.remove(*k);
    }

    if enabled {
        if o.fps_cap > 0 {
            map.insert("DFIntTaskSchedulerTargetFps".into(), json!(o.fps_cap));
        }
        if o.lowest_graphics {
            map.insert("FIntRomarkStartWithGraphicQualityLevel".into(), json!(1));
            map.insert("DFIntDebugFRMQualityLevelOverride".into(), json!(1));
        }
        if matches!(o.msaa, 1 | 2 | 4 | 8) {
            map.insert("FIntDebugForceMSAASamples".into(), json!(o.msaa));
        }
        let tex = match o.textures.as_str() {
            "min" => Some(0),
            "low" => Some(1),
            "med" => Some(2),
            _ => None,
        };
        if let Some(t) = tex {
            map.insert("DFFlagTextureQualityOverrideEnabled".into(), json!(true));
            map.insert("DFIntTextureQualityOverride".into(), json!(t));
        }
        match o.render.as_str() {
            "d3d11" => { map.insert("FFlagDebugGraphicsPreferD3D11".into(), json!(true)); }
            "vulkan" => { map.insert("FFlagDebugGraphicsPreferVulkan".into(), json!(true)); }
            "opengl" => { map.insert("FFlagDebugGraphicsPreferOpenGL".into(), json!(true)); }
            _ => {}
        }
        if o.gray_sky {
            map.insert("FFlagDebugSkyGray".into(), json!(true));
        }
        if o.voxel {
            map.insert("DFFlagDebugRenderForceTechnologyVoxel".into(), json!(true));
        }
        if o.no_shadows {
            map.insert("FIntRenderShadowIntensity".into(), json!(0));
        }
        if o.no_post_fx {
            map.insert("FFlagDisablePostFx".into(), json!(true));
        }
        if o.no_grass {
            map.insert("FIntFRMMinGrassDistance".into(), json!(0));
            map.insert("FIntFRMMaxGrassDistance".into(), json!(0));
        }
    }

    if map.is_empty() {
        // plus rien à écrire : on supprime le fichier
        let _ = std::fs::remove_file(&file);
        return Ok("Graphics settings removed.".into());
    }
    std::fs::create_dir_all(&cs).map_err(|e| e.to_string())?;
    let body = serde_json::to_vec_pretty(&Value::Object(map)).map_err(|e| e.to_string())?;
    std::fs::write(&file, body).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().to_string())
}

/// Version de Roblox installée (nom du dossier) et dernière version publiée.
#[derive(Debug, Clone, Serialize)]
pub struct RobloxVersion {
    pub installed: Option<String>,
    pub latest: Option<String>,
}

pub async fn roblox_version() -> RobloxVersion {
    let installed = if crate::bootstrap::enabled() {
        crate::bootstrap::current_name()
    } else {
        latest_version_dir().and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
    };
    let latest = async {
        let r = reqwest::Client::new()
            .get("https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer")
            .timeout(std::time::Duration::from_secs(8))
            .send()
            .await
            .ok()?;
        let v: serde_json::Value = r.json().await.ok()?;
        v.get("clientVersionUpload").and_then(|x| x.as_str()).map(|s| s.to_string())
    }
    .await;
    RobloxVersion { installed, latest }
}

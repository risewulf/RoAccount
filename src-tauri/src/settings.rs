//! Réglages de l'application, persistés en JSON dans le dossier de données.
//! Lus par la boucle d'arrière-plan (auto-rejoin, alertes) et par l'UI.
//! Noms de champs en camelCase pour coller au front sans conversion.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub target: String,
    pub same_server: bool,
    pub cooldown_ms: u64,
    pub auto_rejoin: bool,
    pub discord_webhook: String,
    pub alert_crash: bool,
    pub alert_disconnect: bool,
    pub alert_batch: bool,
    /// Alerte « client figé ».
    pub alert_freeze: bool,
    /// ID Discord à @mentionner dans les alertes crash / déconnexion / freeze (vide = pas de ping).
    pub discord_user_id: String,
    /// Coupe le son des clients lancés en lot.
    pub mute_on_launch: bool,
    /// Disposition des fenêtres : "fit" (grille plein écran) ou "tiny" (petites vignettes).
    pub window_layout: String,
    /// Mode serveur d'un lot : "same" | "random" | "closest" | "private".
    pub server_mode: String,
    /// Lien de serveur privé (mode "private").
    pub private_link: String,
    /// Chemin de AutoHotkey v2 (vide = détection automatique).
    pub ahk_path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            target: "roblox.com/games/920587237/Adopt-Me".into(),
            same_server: true,
            cooldown_ms: 6000,
            auto_rejoin: true,
            discord_webhook: String::new(),
            alert_crash: true,
            alert_disconnect: true,
            alert_batch: true,
            alert_freeze: true,
            discord_user_id: String::new(),
            mute_on_launch: false,
            window_layout: "fit".into(),
            server_mode: "same".into(),
            private_link: String::new(),
            ahk_path: String::new(),
        }
    }
}

fn path() -> Option<PathBuf> {
    let mut dir = dirs::data_local_dir()?;
    dir.push("RoAccount");
    let _ = std::fs::create_dir_all(&dir);
    dir.push("settings.json");
    Some(dir)
}

pub fn load() -> Settings {
    if let Some(p) = path() {
        if let Ok(raw) = std::fs::read(&p) {
            if let Ok(s) = serde_json::from_slice::<Settings>(&raw) {
                return s;
            }
        }
    }
    Settings::default()
}

pub fn save(s: &Settings) {
    if let Some(p) = path() {
        if let Ok(json) = serde_json::to_vec_pretty(s) {
            let _ = std::fs::write(p, json);
        }
    }
}

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

    // --- récupération -------------------------------------------------------
    /// Relance un client qui a crashé ou qui est figé.
    pub auto_restart: bool,
    /// Abandon d'un compte après N tries in M minutes.
    pub give_up_tries: u32,
    pub give_up_minutes: u32,
    /// Temps laissé à un client pour se fermer seul avant d'être arrêté de force (s).
    pub close_delay_secs: u64,
    /// Fermer la fenêtre la réduit dans la zone de notification (sinon : quitte).
    pub close_to_tray: bool,
    /// Multi-instance Roblox (verrou ROBLOX_singletonEvent tenu par RoAccount). Pris en compte au démarrage.
    pub multi_instance: bool,

    // --- alertes Discord supplémentaires ------------------------------------
    pub alert_launch: bool,
    pub alert_restart: bool,
    pub alert_mem_restart: bool,
    pub alert_give_up: bool,
    pub alert_summary: bool,
    pub summary_every_min: u32,

    // --- performances (moteur côté Rust) ------------------------------------
    /// Lowers the priority of clients that are not in the foreground.
    pub adaptive_limits: bool,
    /// Répartit les clients sur les cœurs du processeur.
    pub spread_cores: bool,
    /// Regularly pages clients' memory out to disk.
    pub trim_memory: bool,
    pub trim_every_min: u32,
    /// Bride (priorité basse) un client au-delà de cette mémoire (Mo).
    pub throttle_mem: bool,
    pub throttle_mem_mb: u64,
    /// Relance un client au-delà de cette mémoire (Mo).
    pub restart_mem: bool,
    pub restart_mem_mb: u64,

    /// Discord alerts for a crash/disconnect are only sent if the account is still not back in game after N minutes (0 = immediately).
    pub alert_after_min: u32,
    /// Native Windows notifications for crashes, freezes, expired cookies…
    pub notify_windows: bool,
    /// Copy the encrypted vault to backups/ every time RoAccount exits, keeping the last N copies.
    pub auto_backup: bool,
    pub auto_backup_keep: u32,
    /// Batch launches wait until this much RAM (MB) is free before starting the next client (0 = off).
    pub queue_min_free_mb: u64,

    /// Tous les réglages purement visuels du front (thème, accent, disposition…)
    /// sont conservés tels quels ici, sans que Rust ait besoin de les connaître.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            target: "roblox.com/games/920587237/Adopt-Me".into(),
            same_server: true,
            cooldown_ms: 6000,
            auto_rejoin: false,
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
            auto_restart: false,
            give_up_tries: 3,
            give_up_minutes: 10,
            close_delay_secs: 5,
            close_to_tray: true,
            multi_instance: true,
            alert_launch: false,
            alert_restart: true,
            alert_mem_restart: true,
            alert_give_up: true,
            alert_summary: false,
            summary_every_min: 30,
            adaptive_limits: false,
            spread_cores: false,
            trim_memory: false,
            trim_every_min: 10,
            throttle_mem: false,
            throttle_mem_mb: 2500,
            restart_mem: false,
            restart_mem_mb: 3500,
            alert_after_min: 0,
            notify_windows: false,
            auto_backup: true,
            auto_backup_keep: 5,
            queue_min_free_mb: 0,
            extra: serde_json::Map::new(),
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

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

/// Entrée stockée *dans* le coffre (contient le cookie en clair une fois déchiffré).
/// N'est jamais renvoyée telle quelle à l'UI — voir `AccountMeta`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAccount {
    pub id: String,
    pub roblox_id: u64,
    pub username: String,
    pub display_name: String,
    pub cookie: String,
    pub group: String,
    pub alias: String,
    pub note: String,
    pub favorite: bool,
    #[serde(default)]
    pub color: String,
    /// Compte « MAIN » : exclu des actions en masse (lancement en lot, amis, auto-rejoin…).
    #[serde(default)]
    pub main: bool,
}

impl Drop for StoredAccount {
    fn drop(&mut self) {
        self.cookie.zeroize();
    }
}

/// Vue sûre envoyée au front : jamais le cookie.
#[derive(Debug, Clone, Serialize)]
pub struct AccountMeta {
    pub id: String,
    pub roblox_id: u64,
    pub username: String,
    pub display_name: String,
    pub group: String,
    pub alias: String,
    pub note: String,
    pub favorite: bool,
    pub color: String,
    pub main: bool,
    // enrichissements live (optionnels, remplis par un refresh)
    pub robux: Option<i64>,
    pub premium: Option<bool>,
    pub friends: Option<u64>,
    pub presence: Option<String>, // "InGame" | "Online" | "Offline" | "Studio"
    pub game: Option<String>,     // nom du jeu en cours (lastLocation)
    pub place_id: Option<u64>,
    pub game_icon: Option<String>, // URL vignette du jeu (rbxcdn)
    pub avatar_url: Option<String>, // URL avatar du compte (rbxcdn)
    pub health: String,           // "ok" | "cookie_expired" | "unknown"
    pub running: bool,
}

impl From<&StoredAccount> for AccountMeta {
    fn from(a: &StoredAccount) -> Self {
        AccountMeta {
            id: a.id.clone(),
            roblox_id: a.roblox_id,
            username: a.username.clone(),
            display_name: a.display_name.clone(),
            group: a.group.clone(),
            alias: a.alias.clone(),
            note: a.note.clone(),
            favorite: a.favorite,
            color: a.color.clone(),
            main: a.main,
            robux: None,
            premium: None,
            friends: None,
            presence: None,
            game: None,
            place_id: None,
            game_icon: None,
            avatar_url: None,
            health: "unknown".into(),
            running: false,
        }
    }
}

/// Infos de base récupérées via l'API Roblox au moment d'ajouter un compte.
#[derive(Debug, Clone)]
pub struct RobloxProfile {
    pub id: u64,
    pub name: String,
    pub display_name: String,
}

/// État du coffre renvoyé à l'UI.
#[derive(Debug, Clone, Serialize)]
pub struct VaultStatus {
    pub exists: bool,
    pub unlocked: bool,
    pub count: usize,
}

/// Un serveur public renvoyé par le navigateur de serveurs.
#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    pub id: String,
    pub playing: u32,
    pub max_players: u32,
    pub ping: Option<u32>,
    pub fps: Option<f64>,
}

/// Un processus client Roblox en cours (pour le Monitor).
#[derive(Debug, Clone, Serialize)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub memory_mb: u64,
}

/// Une sauvegarde chiffrée du coffre.
#[derive(Debug, Clone, Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
}

/// Une entrée du journal d'activité.
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub time: u64, // unix secondes
    pub kind: String, // "launch" | "follow" | "stop" | "rejoin" | "crash"
    pub message: String,
}

/// Un script de macro AutoHotkey v2.
#[derive(Debug, Clone, Serialize)]
pub struct MacroInfo {
    pub name: String,
    pub code: String,
}

/// Une macro en cours d'exécution.
#[derive(Debug, Clone, Serialize)]
pub struct RunningMacro {
    pub name: String,
    pub pid: u32,
}

/// Mesures de la machine (page « Ce PC »).
#[derive(Debug, Clone, Serialize)]
pub struct PcInfo {
    pub cpu_name: String,
    pub cpu_threads: usize,
    pub ram_total_mb: u64,
    pub ram_free_mb: u64,
    pub os: String,
}

/// Une actualité (news.json du site).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsItem {
    pub date: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub url: Option<String>,
}

/// Bilan de « Rendre amis ».
#[derive(Debug, Clone, Serialize, Default)]
pub struct FriendReport {
    pub pairs: u32,
    pub sent: u32,
    pub accepted: u32,
    pub already: u32,
    pub failed: Vec<String>,
}

/// Bilan d'un import de comptes.
#[derive(Debug, Clone, Serialize, Default)]
pub struct ImportReport {
    pub found: u32,
    pub added: u32,
    pub failed: Vec<String>,
}

/// Un serveur privé du compte.
#[derive(Debug, Clone, Serialize, Default)]
pub struct PrivateServer {
    pub id: u64,
    pub name: String,
    pub game: String,
    pub place_id: Option<u64>,
    pub link: Option<String>,
    pub active: Option<bool>,
}

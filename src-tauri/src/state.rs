use crate::models::LogEntry;
use crate::settings::{self, Settings};
use crate::vault::Vault;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

/// Un process AutoHotkey lancé pour une macro.
pub struct MacroProc {
    pub name: String,
    pub pid: u32,
    pub child: std::process::Child,
}
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Suivi d'un compte pour l'auto-rejoin.
#[derive(Default)]
pub struct RejoinInfo {
    pub offline_strikes: u32,
    /// Instants des relances récentes (fenêtre glissante pour « abandonner après N tries in M min »).
    pub attempt_times: Vec<Instant>,
    pub last_attempt: Option<Instant>,
}

/// État global de l'application, géré par Tauri (`.manage`).
pub struct AppState {
    pub vault: Mutex<Vault>,
    /// IDs des comptes dont un client est (supposé) en cours d'exécution.
    pub running: Mutex<HashSet<String>>,
    /// Réglages persistés.
    pub settings: Mutex<Settings>,
    /// Suivi auto-rejoin par compte.
    pub rejoin: Mutex<HashMap<String, RejoinInfo>>,
    /// Journal d'activité (plus récent en tête).
    pub log: Mutex<VecDeque<LogEntry>>,
    /// Compteur de détections « fenêtre figée » par PID Roblox.
    pub hung: Mutex<HashMap<u32, u32>>,
    /// Macros AutoHotkey en cours.
    pub macros: Mutex<Vec<MacroProc>>,
    /// Compte -> PID du client Roblox qu'il a lancé (pour le Monitor par compte).
    pub pids: Mutex<HashMap<String, u32>>,
    /// PID dont les cœurs CPU ont déjà été répartis.
    pub spread_done: Mutex<HashSet<u32>>,
    /// Dernières exécutions des tâches périodiques (trim mémoire, résumé Discord).
    pub last_trim: Mutex<Option<Instant>>,
    pub last_summary: Mutex<Option<Instant>>,
    /// Demande d'annulation du lot en cours.
    pub cancel_batch: AtomicBool,
    /// Dernier lancement de chaque compte : un client qui vient de démarrer a un délai de grâce
    /// (fenêtre « ne répond pas » pendant le chargement, présence Roblox pas encore up to date).
    pub launched_at: Mutex<HashMap<String, Instant>>,
    /// Deferred Discord alerts (account -> when the incident happened, message): sent only if the account is still not back after `alert_after_min`.
    /// Discord Rich Presence connection (None until Discord is reachable).
    pub rpc: Mutex<Option<discord_rich_presence::DiscordIpcClient>>,
    pub pending_alerts: Mutex<HashMap<String, (Instant, String)>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            vault: Mutex::new(Vault::new().expect("vault init")),
            running: Mutex::new(HashSet::new()),
            settings: Mutex::new(settings::load()),
            rejoin: Mutex::new(HashMap::new()),
            log: Mutex::new(VecDeque::new()),
            hung: Mutex::new(HashMap::new()),
            macros: Mutex::new(Vec::new()),
            pids: Mutex::new(HashMap::new()),
            spread_done: Mutex::new(HashSet::new()),
            last_trim: Mutex::new(None),
            last_summary: Mutex::new(None),
            cancel_batch: AtomicBool::new(false),
            launched_at: Mutex::new(HashMap::new()),
            rpc: Mutex::new(None),
            pending_alerts: Mutex::new(HashMap::new()),
        }
    }

    /// Marque un compte comme lancé à l'instant : démarre son délai de grâce et remet ses compteurs à zéro.
    pub fn mark_running(&self, id: String) {
        self.launched_at.lock().unwrap().insert(id.clone(), Instant::now());
        if let Some(e) = self.rejoin.lock().unwrap().get_mut(&id) {
            e.offline_strikes = 0;
        }
        self.running.lock().unwrap().insert(id);
    }

    /// Vrai si ce compte a été lancé il y a moins de `secs` secondes.
    pub fn recently_launched(&self, id: &str, secs: u64) -> bool {
        self.launched_at
            .lock()
            .unwrap()
            .get(id)
            .map(|t| t.elapsed() < Duration::from_secs(secs))
            .unwrap_or(false)
    }

    /// Ajoute une entrée au journal (borné à 200 lignes).
    pub fn push_log(&self, kind: &str, message: String) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut log = self.log.lock().unwrap();
        log.push_front(LogEntry {
            time: ts,
            kind: kind.into(),
            message,
        });
        while log.len() > 200 {
            log.pop_back();
        }
    }
}

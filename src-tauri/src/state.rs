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
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Suivi d'un compte pour l'auto-rejoin.
#[derive(Default)]
pub struct RejoinInfo {
    pub offline_strikes: u32,
    /// Instants des relances récentes (fenêtre glissante pour « abandonner après N essais en M min »).
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
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            vault: Mutex::new(Vault::new().expect("init du coffre")),
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
        }
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

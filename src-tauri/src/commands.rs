//! Commandes exposées à l'UI via `invoke`.
//!
//! Règle importante : on ne garde jamais le verrou du coffre pendant un appel
//! réseau. On extrait ce qu'il faut (cookie) sous verrou court, on relâche, puis
//! on fait l'IO asynchrone.

use crate::error::{AppError, Result};
use crate::launch;
use crate::models::{
    AccountMeta, BackupInfo, FriendReport, ImportReport, LogEntry, MacroInfo, NewsItem, PcInfo,
    PrivateServer, ProcInfo, RunningMacro, ServerInfo, StoredAccount, VaultStatus,
};
use crate::proc;
use crate::roblox;
use crate::settings::Settings;
use crate::state::AppState;
use rand::seq::SliceRandom;
use std::collections::HashSet;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

#[tauri::command]
pub fn vault_status(state: State<'_, AppState>) -> VaultStatus {
    state.vault.lock().unwrap().status()
}

#[tauri::command]
pub fn create_vault(state: State<'_, AppState>, password: String) -> Result<VaultStatus> {
    let mut v = state.vault.lock().unwrap();
    v.create(&password)?;
    Ok(v.status())
}

#[tauri::command]
pub fn unlock_vault(state: State<'_, AppState>, password: String) -> Result<VaultStatus> {
    let mut v = state.vault.lock().unwrap();
    v.unlock(&password)?;
    Ok(v.status())
}

#[tauri::command]
pub fn lock_vault(state: State<'_, AppState>) -> VaultStatus {
    let mut v = state.vault.lock().unwrap();
    v.lock();
    v.status()
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> Result<Vec<AccountMeta>> {
    let v = state.vault.lock().unwrap();
    if !v.is_unlocked() {
        return Err(AppError::VaultLocked);
    }
    let running = state.running.lock().unwrap();
    let mut metas = v.metas();
    for m in metas.iter_mut() {
        m.running = running.contains(&m.id);
    }
    Ok(metas)
}

/// Ajoute un compte à partir d'un cookie. Valide d'abord via l'API Roblox.
#[tauri::command]
pub async fn add_account(
    state: State<'_, AppState>,
    cookie: String,
    group: Option<String>,
) -> Result<AccountMeta> {
    // 1. valider le cookie (réseau, sans verrou)
    let profile = roblox::validate(&cookie).await?;

    // 2. insérer sous verrou court
    let account = StoredAccount {
        id: Uuid::new_v4().to_string(),
        roblox_id: profile.id,
        username: profile.name,
        display_name: profile.display_name,
        cookie,
        group: group.unwrap_or_else(|| "No group".into()),
        alias: String::new(),
        note: String::new(),
        favorite: false,
        color: String::new(),
        main: false,
        tags: Vec::new(),
        deleted_at: None,
    };
    let mut v = state.vault.lock().unwrap();
    v.add(account)
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, id: String) -> Result<()> {
    let mut v = state.vault.lock().unwrap();
    v.remove(&id)
}

/// Roblox login intégrée : ouvre une fenêtre de login Roblox, attend que
/// l'utilisateur se connecte, récupère le cookie `.ROBLOSECURITY` directement
/// depuis le magasin de cookies de cette fenêtre (sans copier-coller), le valide
/// puis ajoute le compte au coffre.
#[tauri::command]
pub async fn login_roblox(
    app: AppHandle,
    state: State<'_, AppState>,
    group: Option<String>,
) -> Result<AccountMeta> {
    // ferme une éventuelle fenêtre de login déjà ouverte
    if let Some(w) = app.get_webview_window("roblox-login") {
        let _ = w.close();
    }

    let url: tauri::Url = "https://www.roblox.com/login"
        .parse()
        .map_err(|_| AppError::Other("Invalid sign-in URL".into()))?;

    let win = WebviewWindowBuilder::new(&app, "roblox-login", WebviewUrl::External(url))
        .title("Roblox login — RoAccount")
        .inner_size(520.0, 740.0)
        .center()
        .build()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let probe: tauri::Url = "https://www.roblox.com"
        .parse()
        .map_err(|_| AppError::Other("Invalid URL".into()))?;

    // sonde le cookie jusqu'à 4 minutes, ou jusqu'à ce que l'utilisateur ferme la fenêtre
    let deadline = Instant::now() + Duration::from_secs(240);
    let mut found: Option<String> = None;
    while Instant::now() < deadline {
        if app.get_webview_window("roblox-login").is_none() {
            return Err(AppError::Other("Sign-in window closed.".into()));
        }
        if let Ok(cookies) = win.cookies_for_url(probe.clone()) {
            for c in cookies {
                if c.name() == ".ROBLOSECURITY" && !c.value().is_empty() {
                    found = Some(c.value().to_string());
                    break;
                }
            }
        }
        if found.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(1500)).await;
    }

    let _ = win.close();
    let cookie = found.ok_or_else(|| {
        AppError::Other("Sign-in not detected (timed out).".into())
    })?;

    let profile = roblox::validate(&cookie).await?;
    let account = StoredAccount {
        id: Uuid::new_v4().to_string(),
        roblox_id: profile.id,
        username: profile.name,
        display_name: profile.display_name,
        cookie,
        group: group.unwrap_or_else(|| "No group".into()),
        alias: String::new(),
        note: String::new(),
        favorite: false,
        color: String::new(),
        main: false,
        tags: Vec::new(),
        deleted_at: None,
    };
    let mut v = state.vault.lock().unwrap();
    v.add(account)
}

/// Liste les serveurs publics d'un jeu (place ID ou lien).
#[tauri::command]
pub async fn list_servers(target: String) -> Result<Vec<ServerInfo>> {
    let place_id = launch::resolve_place_id(&target)?;
    roblox::public_servers(place_id).await
}

/// Envoie un compte dans un serveur précis.
#[tauri::command]
pub async fn send_to_server(
    state: State<'_, AppState>,
    id: String,
    target: String,
    job_id: String,
) -> Result<()> {
    let place_id = launch::resolve_place_id(&target)?;
    let cookie = {
        let v = state.vault.lock().unwrap();
        v.cookie_for(&id)?
    };
    launch::launch_to_job(&cookie, place_id, &job_id).await?;
    state.mark_running(id);
    Ok(())
}

/// Processus clients Roblox en cours (Monitor).
#[tauri::command]
pub fn monitor_processes() -> Vec<ProcInfo> {
    proc::roblox_processes()
}

/// Envoie un message de test au webhook Discord fourni.
#[tauri::command]
pub async fn test_discord(webhook: String) -> Result<()> {
    let w = webhook.trim();
    if !(w.starts_with("https://discord.com/api/webhooks/")
        || w.starts_with("https://discordapp.com/api/webhooks/"))
    {
        return Err(AppError::Other("Invalid Discord webhook URL.".into()));
    }
    let resp = reqwest::Client::new()
        .post(w)
        .json(&serde_json::json!({
            "content": "✅ RoAccount — alert test. Notifications are working."
        }))
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("Discord HTTP {}", resp.status())));
    }
    Ok(())
}

#[tauri::command]
pub fn update_account(
    state: State<'_, AppState>,
    id: String,
    group: Option<String>,
    alias: Option<String>,
    note: Option<String>,
    favorite: Option<bool>,
    color: Option<String>,
    main: Option<bool>,
    tags: Option<Vec<String>>,
) -> Result<AccountMeta> {
    let mut v = state.vault.lock().unwrap();
    v.update_fields(&id, group, alias, note, favorite, color, main, tags)
}

/// Accounts removed in the last 7 days (recoverable).
#[tauri::command]
pub fn list_trash(state: State<'_, AppState>) -> Vec<crate::models::TrashItem> {
    state.vault.lock().unwrap().trash()
}

#[tauri::command]
pub fn restore_account(state: State<'_, AppState>, id: String) -> Result<AccountMeta> {
    state.vault.lock().unwrap().restore(&id)
}

/// Permanently deletes a trashed account, or the whole trash when `id` is empty.
#[tauri::command]
pub fn purge_trash(state: State<'_, AppState>, id: Option<String>) -> Result<()> {
    state.vault.lock().unwrap().purge(id.as_deref())
}

/// Native Windows notification (honours the "Windows notifications" setting).
#[tauri::command]
pub fn notify_desktop(app: AppHandle, state: State<'_, AppState>, title: String, body: String) {
    let settings = state.settings.lock().unwrap().clone();
    crate::background::desktop_notify(&app, &settings, &title, &body);
}

/// Posts a custom message to the configured Discord webhook (daily summary…).
#[tauri::command]
pub async fn discord_post(state: State<'_, AppState>, message: String) -> Result<()> {
    let settings = state.settings.lock().unwrap().clone();
    crate::discord::notify(&settings, &message, false).await;
    Ok(())
}

/// Rafraîchit les infos live d'un compte (robux, premium, présence, amis).
#[tauri::command]
pub async fn refresh_account(state: State<'_, AppState>, id: String) -> Result<AccountMeta> {
    // extraire cookie + meta de base sous verrou court
    let (cookie, mut meta) = {
        let v = state.vault.lock().unwrap();
        if !v.is_unlocked() {
            return Err(AppError::VaultLocked);
        }
        let cookie = v.cookie_for(&id)?;
        let meta = v
            .metas()
            .into_iter()
            .find(|m| m.id == id)
            .ok_or(AppError::AccountNotFound)?;
        (cookie, meta)
    };

    // banned accounts are reported by Roblox's public users endpoint
    if roblox::is_banned(meta.roblox_id).await.unwrap_or(false) {
        meta.health = "banned".into();
        return Ok(meta);
    }

    // vérifier le cookie d'abord
    match roblox::validate(&cookie).await {
        Ok(_) => meta.health = "ok".into(),
        Err(AppError::InvalidCookie) => {
            meta.health = "cookie_expired".into();
            return Ok(meta);
        }
        Err(e) => return Err(e),
    }

    // enrichissements — les erreurs individuelles ne cassent pas le refresh
    meta.robux = roblox::robux(&cookie).await.ok();
    meta.premium = roblox::premium(&cookie, meta.roblox_id).await.ok();
    meta.friends = roblox::friends_count(meta.roblox_id).await.ok();
    meta.avatar_url = roblox::avatar_headshot(meta.roblox_id).await.ok().flatten();

    if let Ok(act) = roblox::presence_detail(&cookie, meta.roblox_id).await {
        let in_game = act.kind == "InGame";
        meta.presence = Some(act.kind);
        meta.place_id = act.place_id;

        if in_game {
            // universeId : donné par la présence, sinon résolu depuis le placeId
            let mut universe = act.universe_id;
            if universe.is_none() {
                if let Some(pid) = act.place_id {
                    universe = roblox::universe_for_place(pid).await;
                }
            }
            // nom du jeu : lastLocation si présent, sinon via l'universe
            meta.game = match act.game {
                Some(g) if !g.is_empty() => Some(g),
                _ => match universe {
                    Some(u) => roblox::game_name(u).await,
                    None => None,
                },
            };
            if let Some(u) = universe {
                meta.game_icon = roblox::game_icon(u).await.ok().flatten();
            }
        }
    }

    let running = state.running.lock().unwrap();
    meta.running = running.contains(&meta.id);
    Ok(meta)
}

/// Capture la fenêtre d'un client Roblox par son PID (aperçu du Monitor).
#[tauri::command]
pub async fn capture_window(pid: u32) -> Result<String> {
    tokio::task::spawn_blocking(move || crate::capture::capture_pid(pid))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Révèle le cookie d'un compte (coffre déverrouillé requis).
#[tauri::command]
pub fn reveal_cookie(state: State<'_, AppState>, id: String) -> Result<String> {
    state.vault.lock().unwrap().cookie_for(&id)
}

/// Change le mot de passe maître du coffre.
#[tauri::command]
pub fn change_password(state: State<'_, AppState>, old: String, new: String) -> Result<()> {
    state.vault.lock().unwrap().change_password(&old, &new)
}

/// Exporte une sauvegarde chiffrée du coffre. Renvoie le chemin créé.
#[tauri::command]
pub fn export_backup(state: State<'_, AppState>) -> Result<String> {
    let src = { state.vault.lock().unwrap().file_path() };
    if !src.exists() {
        return Err(AppError::Other("No vault to back up.".into()));
    }
    let parent = src
        .parent()
        .ok_or_else(|| AppError::Io("invalid folder".into()))?;
    let dir = parent.join("backups");
    std::fs::create_dir_all(&dir)?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dst = dir.join(format!("RoAccount-{ts}.roavault"));
    std::fs::copy(&src, &dst)?;
    Ok(dst.to_string_lossy().to_string())
}

/// Liste les sauvegardes disponibles (dossier backups).
#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> Vec<BackupInfo> {
    let src = { state.vault.lock().unwrap().file_path() };
    let mut out = Vec::new();
    if let Some(parent) = src.parent() {
        let dir = parent.join("backups");
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().map(|x| x == "roavault").unwrap_or(false) {
                    out.push(BackupInfo {
                        name: e.file_name().to_string_lossy().to_string(),
                        path: p.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    out
}

/// Importe une sauvegarde : remplace le coffre puis le verrouille.
#[tauri::command]
pub fn import_backup(state: State<'_, AppState>, path: String) -> Result<()> {
    let dst = { state.vault.lock().unwrap().file_path() };
    std::fs::copy(&path, &dst)?;
    state.vault.lock().unwrap().lock();
    Ok(())
}

/// Réglages courants.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

/// Enregistre les réglages (mémoire + disque).
#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> Settings {
    crate::launch::set_extra_args(settings.extra.get("launchArgs").and_then(|v| v.as_str()).unwrap_or(""));
    *state.settings.lock().unwrap() = settings.clone();
    crate::settings::save(&settings);
    settings
}

/// Lance un compte sur une cible.
#[tauri::command]
pub async fn launch_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    target: String,
) -> Result<()> {
    let (cookie, username) = {
        let v = state.vault.lock().unwrap();
        let (c, _r, u) = v.cookie_meta(&id)?;
        (c, u)
    };
    let before = current_pids();
    launch::launch(&cookie, &target).await?;
    state.mark_running(id.clone());
    state.rejoin.lock().unwrap().remove(&id);
    state.push_log("launch", format!("{username} launched"));

    // repère le PID du nouveau client en arrière-plan (Monitor par compte)
    let track_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let st = app.state::<AppState>();
        track_pid(&st, &track_id, &before, 25).await;
    });
    Ok(())
}

/// Repère le nouveau client Roblox apparu après `before` et l'associe au compte `id`.
pub async fn track_pid(state: &AppState, id: &str, before: &HashSet<u32>, max_secs: u64) {
    let known: HashSet<u32> = state.pids.lock().unwrap().values().cloned().collect();
    for _ in 0..(max_secs * 2) {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let found = tokio::task::spawn_blocking(proc::roblox_processes)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.pid)
            .find(|p| !before.contains(p) && !known.contains(p));
        if let Some(pid) = found {
            state.pids.lock().unwrap().insert(id.to_string(), pid);
            return;
        }
    }
}

/// PID Roblox actuels (avant un lot, pour ne couper que les nouveaux clients).
fn current_pids() -> HashSet<u32> {
    proc::roblox_processes().into_iter().map(|p| p.pid).collect()
}

/// Coupe le son des clients apparus après `before`, pendant `secs` secondes
/// (l'audio d'un client n'existe que quelques secondes après son démarrage).
fn spawn_mute_watch(before: HashSet<u32>, secs: u64) {
    tauri::async_runtime::spawn(async move {
        for _ in 0..(secs / 2 + 1) {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let b = before.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let pids: Vec<u32> = proc::roblox_processes()
                    .into_iter()
                    .map(|p| p.pid)
                    .filter(|p| !b.contains(p))
                    .collect();
                crate::winmgmt::mute_pids(&pids, true);
            })
            .await;
        }
    });
}

/// Où envoyer un compte dans un lot.
enum Dest {
    Same,
    Job(String),
    Private { place: u64, access: String, link: String },
}

async fn launch_one(cookie: &str, target: &str, place_id: u64, dest: &Dest) -> Result<()> {
    match dest {
        Dest::Same => launch::launch(cookie, target).await,
        Dest::Job(j) => launch::launch_to_job(cookie, place_id, j).await,
        Dest::Private { place, access, link } => launch::launch_private(cookie, *place, access, link).await,
    }
}

/// Cœur des lancements en lot. Le compte MAIN est toujours exclu.
/// `mode` : "same" | "random" | "closest" | "private".
async fn run_batch(
    app: &AppHandle,
    state: &AppState,
    ids: Vec<String>,
    target: &str,
    mode: &str,
    private_link: &str,
    wait_ms: u64,
) -> Result<Vec<String>> {
    let targets = { state.vault.lock().unwrap().bulk_targets(&ids) };
    if targets.is_empty() {
        return Ok(Vec::new());
    }
    state.cancel_batch.store(false, Ordering::SeqCst);
    let emit = |id: &str, stage: &str, err: Option<&str>| {
        let _ = app.emit("batch", serde_json::json!({ "id": id, "stage": stage, "error": err }));
    };
    for (id, ..) in targets.iter() {
        emit(id, "queued", None);
    }
    let n = targets.len();
    let settings = { state.settings.lock().unwrap().clone() };

    // destination de chaque compte
    let (place_id, dests): (u64, Vec<Dest>) = match mode {
        "random" | "closest" => {
            let place = launch::resolve_place_id(target)?;
            let mut servers: Vec<ServerInfo> = roblox::public_servers(place)
                .await?
                .into_iter()
                .filter(|s| s.playing < s.max_players)
                .collect();
            if servers.is_empty() {
                return Err(AppError::Other("No public server available for this game.".into()));
            }
            if mode == "random" {
                servers.shuffle(&mut rand::thread_rng());
            } else {
                servers.sort_by_key(|s| s.ping.unwrap_or(u32::MAX));
            }
            // un serveur différent par compte (on boucle s'il y a moins de serveurs que de comptes)
            (place, (0..n).map(|i| Dest::Job(servers[i % servers.len()].id.clone())).collect())
        }
        "private" => {
            let (place, access, link) = roblox::resolve_private_link(&targets[0].1, private_link).await?;
            (place, (0..n).map(|_| Dest::Private { place, access: access.clone(), link: link.clone() }).collect())
        }
        _ => (0, (0..n).map(|_| Dest::Same).collect()),
    };

    // coupe le son des nouveaux clients si demandé
    if settings.mute_on_launch {
        spawn_mute_watch(current_pids(), (n as u64) * wait_ms / 1000 + 60);
    }

    let mut launched = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    for (i, (id, cookie, _rid, username)) in targets.iter().enumerate() {
        if state.cancel_batch.load(Ordering::SeqCst) {
            emit(id, "cancelled", None);
            continue;
        }
        // per-account extra delay, then (optionally) wait for enough free RAM before starting this client
        let extra = settings
            .extra
            .get("accountDelays")
            .and_then(|m| m.get(id.as_str()))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if extra > 0 && i > 0 {
            emit(id, "queued", None);
            tokio::time::sleep(Duration::from_secs(extra.min(600))).await;
        }
        if settings.queue_min_free_mb > 0 && i > 0 {
            emit(id, "queued", None);
            let mut waited = 0u64;
            loop {
                if state.cancel_batch.load(Ordering::SeqCst) || waited >= 600 {
                    break;
                }
                let free = tokio::task::spawn_blocking(crate::tools::pc_info)
                    .await
                    .map(|p| p.ram_free_mb)
                    .unwrap_or(u64::MAX);
                if free >= settings.queue_min_free_mb {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(5)).await;
                waited += 5;
            }
        }
        if state.cancel_batch.load(Ordering::SeqCst) {
            emit(id, "cancelled", None);
            continue;
        }
        let before = current_pids();
        let started = Instant::now();
        emit(id, "ticket", None);
        match launch_one(cookie, target, place_id, &dests[i]).await {
            Ok(()) => {
                emit(id, "run", None);
                state.mark_running(id.clone());
                state.rejoin.lock().unwrap().remove(id); // repart à zéro pour l'auto-rejoin
                launched.push(id.clone());
                // associe le nouveau client à ce compte (Monitor par compte)
                track_pid(state, id, &before, 25).await;
                emit(id, "join", None);
                if settings.alert_launch {
                    crate::discord::notify(&settings, &format!("🚀 **{username}** got in game."), false).await;
                }
                let spent = started.elapsed();
                let wait = Duration::from_millis(wait_ms);
                if spent < wait {
                    tokio::time::sleep(wait - spent).await;
                }
            }
            Err(e) => {
                emit(id, "failed", Some(&e.to_string()));
                errors.push(format!("{username}: {e}"));
            }
        }
    }

    if launched.is_empty() {
        if let Some(first) = errors.into_iter().next() {
            return Err(AppError::Launch(first));
        }
        return Ok(launched);
    }
    let label = match mode {
        "random" => " (random servers)",
        "closest" => " (closest servers)",
        "private" => " (private server)",
        _ => "",
    };
    state.push_log("launch", format!("Batch launched — {} account(s){label}", launched.len()));

    // alerte « lot terminé »
    if settings.alert_batch {
        crate::discord::notify(
            &settings,
            &format!("✅ Batch launched — {} account(s) got in{label}.", launched.len()),
            false,
        )
        .await;
    }
    Ok(launched)
}

/// Lance plusieurs comptes sur la même cible, l'un après l'autre.
#[tauri::command]
pub async fn launch_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
    target: String,
    cooldown_ms: Option<u64>,
) -> Result<Vec<String>> {
    run_batch(&app, &state, ids, &target, "same", "", cooldown_ms.unwrap_or(6000)).await
}

/// Lance un lot avec un mode serveur : "same", "random" (un serveur public au hasard par compte),
/// "closest" (les serveurs au ping le plus bas, un par compte) ou "private" (lien de serveur privé).
#[tauri::command]
pub async fn launch_batch_servers(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<String>,
    target: String,
    mode: String,
    private_link: Option<String>,
    cooldown_ms: Option<u64>,
) -> Result<Vec<String>> {
    run_batch(
        &app,
        &state,
        ids,
        &target,
        &mode,
        private_link.as_deref().unwrap_or(""),
        cooldown_ms.unwrap_or(6000),
    )
    .await
}

/// Lance les comptes sélectionnés en suivant un utilisateur (@pseudo, userId ou lien).
#[tauri::command]
pub async fn follow_user(
    state: State<'_, AppState>,
    ids: Vec<String>,
    target: String,
    cooldown_ms: Option<u64>,
) -> Result<Vec<String>> {
    let user_id = roblox::resolve_user(&target)
        .await
        .ok_or_else(|| AppError::Other("User not found.".into()))?;

    let targets = { state.vault.lock().unwrap().bulk_targets(&ids) };
    let wait = cooldown_ms.unwrap_or(6000);
    let mute = { state.settings.lock().unwrap().mute_on_launch };
    if mute && !targets.is_empty() {
        spawn_mute_watch(current_pids(), (targets.len() as u64) * wait / 1000 + 60);
    }

    let mut launched = Vec::new();
    for (id, cookie, _rid, _name) in targets {
        if launch::launch_follow(&cookie, user_id).await.is_ok() {
            state.mark_running(id.clone());
            state.rejoin.lock().unwrap().remove(&id);
            launched.push(id);
            tokio::time::sleep(Duration::from_millis(wait)).await;
        }
    }
    if !launched.is_empty() {
        state.push_log("follow", format!("{} account(s) joining {}", launched.len(), target));
    }
    Ok(launched)
}

/// Arrête tous les clients Roblox (fermeture douce, puis de force après le délai réglé).
#[tauri::command]
pub async fn kill_all(state: State<'_, AppState>) -> Result<()> {
    let delay = state.settings.lock().unwrap().close_delay_secs;
    tokio::task::spawn_blocking(move || launch::kill_all(delay))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    state.running.lock().unwrap().clear();
    state.rejoin.lock().unwrap().clear();
    state.pids.lock().unwrap().clear();
    state.push_log("stop", "All clients stopped".into());
    Ok(())
}

/// État du multi-compte : le verrou est-il tenu, et des clients Roblox tournent-ils hors de RoAccount ?
#[derive(serde::Serialize)]
pub struct MultiStatus {
    pub enabled: bool,
    /// 0 non demandé · 1 pris · 2 existait déjà · 3 échec
    pub state: u8,
    /// Clients Roblox en cours qui ne viennent pas de RoAccount.
    pub foreign: usize,
}

#[tauri::command]
pub fn multi_status(state: State<'_, AppState>) -> MultiStatus {
    let known: std::collections::HashSet<u32> = state.pids.lock().unwrap().values().cloned().collect();
    let foreign = proc::roblox_processes().into_iter().filter(|p| !known.contains(&p.pid)).count();
    MultiStatus { enabled: state.settings.lock().unwrap().multi_instance, state: crate::singleton::state(), foreign }
}

/// Arrête seulement les clients de certains comptes (fermeture douce, puis de force après le délai réglé).
/// Renvoie le nombre de clients arrêtés.
#[tauri::command]
pub async fn stop_accounts(state: State<'_, AppState>, ids: Vec<String>) -> Result<usize> {
    let delay = state.settings.lock().unwrap().close_delay_secs;
    let targets: Vec<(String, u32)> = {
        let p = state.pids.lock().unwrap();
        ids.iter().filter_map(|id| p.get(id).map(|pid| (id.clone(), *pid))).collect()
    };
    // le moteur de reconnexion ne doit pas les relancer
    for (id, _) in &targets {
        state.rejoin.lock().unwrap().remove(id);
        state.running.lock().unwrap().remove(id);
    }
    let pids: Vec<u32> = targets.iter().map(|(_, p)| *p).collect();
    let n = pids.len();
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            for pid in &pids {
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string()])
                    .creation_flags(0x0800_0000)
                    .output();
            }
            std::thread::sleep(std::time::Duration::from_secs(delay as u64));
            for pid in &pids {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(0x0800_0000)
                    .output();
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (&pids, delay);
        }
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    {
        let mut p = state.pids.lock().unwrap();
        for (id, _) in &targets {
            p.remove(id);
        }
    }
    state.push_log("stop", format!("{n} client(s) stopped"));
    Ok(n)
}

/// Arrange les fenêtres des clients Roblox : "fit" (grille plein écran) ou "tiny" (vignettes).
#[tauri::command]
pub async fn arrange_windows(state: State<'_, AppState>, layout: Option<String>) -> Result<()> {
    let layout = layout.unwrap_or_else(|| state.settings.lock().unwrap().window_layout.clone());
    tokio::task::spawn_blocking(move || {
        let pids: Vec<u32> = proc::roblox_processes().into_iter().map(|p| p.pid).collect();
        crate::winmgmt::arrange(pids, &layout);
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

/// Change la priorité CPU d'un process ("normal" | "below" | "idle").
#[tauri::command]
pub fn set_priority(pid: u32, level: String) -> Result<()> {
    if crate::winmgmt::set_priority(pid, &level) {
        Ok(())
    } else {
        Err(AppError::Other("Couldn't change the priority.".into()))
    }
}

/// Journal d'activité (plus récent en tête).
#[tauri::command]
pub fn get_log(state: State<'_, AppState>) -> Vec<LogEntry> {
    state.log.lock().unwrap().iter().cloned().collect()
}

/// Vide le journal.
#[tauri::command]
pub fn clear_log(state: State<'_, AppState>) {
    state.log.lock().unwrap().clear();
}

/// Exporte la liste des comptes en CSV (sans les cookies). Renvoie le chemin.
#[tauri::command]
pub fn export_csv(state: State<'_, AppState>) -> Result<String> {
    let metas = {
        let v = state.vault.lock().unwrap();
        if !v.is_unlocked() {
            return Err(AppError::VaultLocked);
        }
        v.metas()
    };

    fn q(s: &str) -> String {
        format!("\"{}\"", s.replace('"', "\"\""))
    }

    let mut csv = String::from("username,display_name,group,favorite,robux,premium,presence\n");
    for m in metas {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            q(&m.username),
            q(&m.display_name),
            q(&m.group),
            m.favorite,
            m.robux.map(|r| r.to_string()).unwrap_or_default(),
            m.premium.map(|p| p.to_string()).unwrap_or_default(),
            q(m.presence.as_deref().unwrap_or("")),
        ));
    }

    let mut dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Io("local data folder not found".into()))?;
    dir.push("RoAccount");
    dir.push("exports");
    std::fs::create_dir_all(&dir)?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    dir.push(format!("comptes-{ts}.csv"));
    std::fs::write(&dir, csv)?;
    Ok(dir.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------
// Son, PC, actualités, liens
// ---------------------------------------------------------------------------

/// Coupe ou rétablit le son d'un client (`pid`) ou de tous les clients.
#[tauri::command]
pub async fn set_mute(pid: Option<u32>, mute: bool) -> Result<usize> {
    tokio::task::spawn_blocking(move || {
        let pids: Vec<u32> = match pid {
            Some(p) => vec![p],
            None => proc::roblox_processes().into_iter().map(|p| p.pid).collect(),
        };
        crate::winmgmt::mute_pids(&pids, mute)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))
}

/// Mesures de la machine (page « Ce PC »).
#[tauri::command]
pub async fn pc_info() -> Result<PcInfo> {
    tokio::task::spawn_blocking(crate::tools::pc_info)
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Actualités du projet.
#[tauri::command]
pub async fn get_news() -> Result<Vec<NewsItem>> {
    crate::tools::fetch_news().await
}

/// Ouvre un lien autorisé (Discord, site, GitHub) dans le navigateur.
#[tauri::command]
pub fn open_url(url: String) -> Result<()> {
    crate::tools::open_url(&url)
}

// ---------------------------------------------------------------------------
// Make friends
// ---------------------------------------------------------------------------

/// Rend amis tous les comptes sélectionnés entre eux (demande + acceptation automatique).
/// Le compte MAIN est exclu. Limité à 12 comptes par passe (limites Roblox).
#[tauri::command]
pub async fn friend_accounts(state: State<'_, AppState>, ids: Vec<String>) -> Result<FriendReport> {
    use crate::roblox::FriendOutcome;

    let targets = { state.vault.lock().unwrap().bulk_targets(&ids) };
    let n = targets.len();
    if n < 2 {
        return Err(AppError::Other("Select at least 2 accounts (the MAIN account is excluded).".into()));
    }
    if n > 12 {
        return Err(AppError::Other("12 accounts maximum per pass (Roblox limits).".into()));
    }

    let mut rep = FriendReport::default();
    'outer: for i in 0..n {
        for j in (i + 1)..n {
            rep.pairs += 1;
            tokio::time::sleep(Duration::from_millis(1200)).await;
            let (a, b) = (&targets[i], &targets[j]);
            match roblox::send_friend_request(&a.1, b.2).await {
                Ok(FriendOutcome::Sent) => {
                    rep.sent += 1;
                    tokio::time::sleep(Duration::from_millis(900)).await;
                    match roblox::accept_friend_request(&b.1, a.2).await {
                        Ok(true) => rep.accepted += 1,
                        Ok(false) => rep.failed.push(format!("{} couldn't accept {}", b.3, a.3)),
                        Err(e) => rep.failed.push(format!("{} → {} : {e}", b.3, a.3)),
                    }
                }
                Ok(FriendOutcome::Already) => rep.already += 1,
                Ok(FriendOutcome::Failed(m)) => {
                    let stop = m.contains("captcha") || m.contains("too many requests");
                    rep.failed.push(format!("{} → {} : {m}", a.3, b.3));
                    if stop {
                        break 'outer; // inutile d'insister : Roblox bloque
                    }
                }
                Err(e) => rep.failed.push(format!("{} → {} : {e}", a.3, b.3)),
            }
        }
    }
    state.push_log(
        "follow",
        format!("Friends: {} request(s), {} accepted, {} already friends", rep.sent, rep.accepted, rep.already),
    );
    Ok(rep)
}

// ---------------------------------------------------------------------------
// Private servers
// ---------------------------------------------------------------------------

fn cookie_of(state: &AppState, id: &str) -> Result<String> {
    state.vault.lock().unwrap().cookie_for(id)
}

/// Liste les serveurs privés d'un compte, avec leur lien de partage quand Roblox le fournit.
#[tauri::command]
pub async fn list_private_servers(state: State<'_, AppState>, id: String) -> Result<Vec<PrivateServer>> {
    let cookie = cookie_of(&state, &id)?;
    let mut list = roblox::private_servers(&cookie).await?;
    for s in list.iter_mut().take(25) {
        if let Ok((link, active, name)) = roblox::private_server_details(&cookie, s.id).await {
            s.link = link;
            s.active = active;
            if let Some(n) = name {
                s.name = n;
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Ok(list)
}

/// Achète un serveur privé pour un jeu. `expected_price` = prix affiché par Roblox ;
/// en cas d'écart, Roblox refuse et rien n'est dépensé.
#[tauri::command]
pub async fn buy_private_server(
    state: State<'_, AppState>,
    id: String,
    target: String,
    name: String,
    expected_price: u64,
) -> Result<u64> {
    let name = name.trim().to_string();
    if name.is_empty() || name.len() > 50 {
        return Err(AppError::Other("Invalid server name (1 to 50 characters).".into()));
    }
    let cookie = cookie_of(&state, &id)?;
    let place = launch::resolve_place_id(&target)?;
    let universe = roblox::universe_for_place(place)
        .await
        .ok_or_else(|| AppError::Other("Game not found.".into()))?;
    let new_id = roblox::private_server_buy(&cookie, universe, &name, expected_price).await?;
    state.push_log("launch", format!("Private server “{name}” bought ({expected_price} R$)"));
    Ok(new_id)
}

/// Renomme / régénère le lien / active ou désactive un serveur privé.
#[tauri::command]
pub async fn update_private_server(
    state: State<'_, AppState>,
    id: String,
    server_id: u64,
    name: Option<String>,
    new_link: Option<bool>,
    active: Option<bool>,
) -> Result<()> {
    let cookie = cookie_of(&state, &id)?;
    roblox::private_server_update(&cookie, server_id, name, new_link.unwrap_or(false), active).await
}

// ---------------------------------------------------------------------------
// Macros AutoHotkey v2
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_macros() -> Result<Vec<MacroInfo>> {
    crate::macros::list()
}

#[tauri::command]
pub fn save_macro(name: String, code: String) -> Result<()> {
    crate::macros::save(&name, &code)
}

#[tauri::command]
pub fn delete_macro(name: String) -> Result<()> {
    crate::macros::delete(&name)
}

/// Chemin d'AutoHotkey v2 détecté (ou `None`).
#[tauri::command]
pub fn ahk_status(state: State<'_, AppState>) -> Option<String> {
    let custom = state.settings.lock().unwrap().ahk_path.clone();
    crate::macros::find_ahk(&custom).map(|p| p.to_string_lossy().to_string())
}

/// Lance une macro sur un client (`pid`) ou sur tous les clients Roblox en cours.
#[tauri::command]
pub async fn run_macro(state: State<'_, AppState>, name: String, pid: Option<u32>) -> Result<usize> {
    let custom = state.settings.lock().unwrap().ahk_path.clone();
    let pids: Vec<u32> = match pid {
        Some(p) => vec![p],
        None => proc::roblox_processes().into_iter().map(|p| p.pid).collect(),
    };
    let n = crate::macros::run(&state, &name, &pids, &custom)?;
    state.push_log("launch", format!("Macro “{name}” launched on {n} client(s)"));
    Ok(n)
}

#[tauri::command]
pub fn running_macros(state: State<'_, AppState>) -> Vec<RunningMacro> {
    crate::macros::running(&state)
}

#[tauri::command]
pub fn stop_macros(state: State<'_, AppState>, name: Option<String>) -> usize {
    crate::macros::stop(&state, name.as_deref())
}

// ---------------------------------------------------------------------------
// Export de cookies / import (Roblox Account Manager, texte)
// ---------------------------------------------------------------------------

fn exports_dir() -> Result<std::path::PathBuf> {
    let mut dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Io("local data folder not found".into()))?;
    dir.push("RoAccount");
    dir.push("exports");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Exporte les cookies EN CLAIR des comptes choisis (tous si `ids` est vide).
/// `format` : "json" (compatible import RoAccount / Roblox Account Manager) ou "cookies" (un par ligne).
#[tauri::command]
pub fn export_cookies(state: State<'_, AppState>, ids: Vec<String>, format: String) -> Result<String> {
    let rows: Vec<(StoredAccountView, String)> = {
        let v = state.vault.lock().unwrap();
        if !v.is_unlocked() {
            return Err(AppError::VaultLocked);
        }
        let metas = v.metas();
        metas
            .into_iter()
            .filter(|m| ids.is_empty() || ids.contains(&m.id))
            .filter_map(|m| {
                let c = v.cookie_for(&m.id).ok()?;
                Some((StoredAccountView { username: m.username, group: m.group, alias: m.alias, note: m.note }, c))
            })
            .collect()
    };
    if rows.is_empty() {
        return Err(AppError::Other("No account to export.".into()));
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut path = exports_dir()?;
    let body = if format == "cookies" {
        path.push(format!("cookies-{ts}.txt"));
        rows.iter().map(|(_, c)| c.as_str()).collect::<Vec<_>>().join("\n")
    } else {
        path.push(format!("comptes-cookies-{ts}.json"));
        let arr: Vec<serde_json::Value> = rows
            .iter()
            .map(|(m, c)| {
                serde_json::json!({
                    "Username": m.username, "SecurityToken": c, "Group": m.group,
                    "Alias": m.alias, "Description": m.note,
                })
            })
            .collect();
        serde_json::to_string_pretty(&arr).map_err(|e| AppError::Other(e.to_string()))?
    };
    std::fs::write(&path, body)?;
    state.push_log("stop", format!("{} cookie(s) exported in clear text", rows.len()));
    Ok(path.to_string_lossy().to_string())
}

struct StoredAccountView {
    username: String,
    group: String,
    alias: String,
    note: String,
}

/// Importe des comptes depuis du texte collé ou un chemin de fichier : export JSON de
/// Roblox Account Manager / RoAccount, ou cookies bruts (un par ligne, `user:pass:cookie` accepté).
#[tauri::command]
pub async fn import_accounts(
    state: State<'_, AppState>,
    input: String,
    group: Option<String>,
) -> Result<ImportReport> {
    {
        if !state.vault.lock().unwrap().is_unlocked() {
            return Err(AppError::VaultLocked);
        }
    }
    let trimmed = input.trim().trim_matches('"');
    let text = if !trimmed.contains('\n') && std::path::Path::new(trimmed).is_file() {
        let meta = std::fs::metadata(trimmed)?;
        if meta.len() > 8 * 1024 * 1024 {
            return Err(AppError::Other("File too large (8 MB max).".into()));
        }
        std::fs::read_to_string(trimmed)
            .map_err(|_| AppError::Other("Unreadable file (text or JSON expected).".into()))?
    } else {
        input.clone()
    };

    let items = crate::tools::parse_import(&text);
    let mut rep = ImportReport { found: items.len() as u32, ..Default::default() };
    if items.is_empty() {
        return Err(AppError::Other(
            "No .ROBLOSECURITY cookie found. Paste a JSON export or cookies (one per line).".into(),
        ));
    }
    let default_group = group.filter(|g| !g.trim().is_empty()).unwrap_or_else(|| "Imported".into());

    for it in items {
        let tail: String = it.cookie.chars().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect();
        match roblox::validate(&it.cookie).await {
            Ok(profile) => {
                let account = StoredAccount {
                    id: Uuid::new_v4().to_string(),
                    roblox_id: profile.id,
                    username: profile.name,
                    display_name: profile.display_name,
                    cookie: it.cookie.clone(),
                    group: it.group.clone().unwrap_or_else(|| default_group.clone()),
                    alias: it.alias.clone().unwrap_or_default(),
                    note: it.note.clone().unwrap_or_default(),
                    favorite: false,
                    color: String::new(),
                    main: false,
                    tags: Vec::new(),
                    deleted_at: None,
                };
                let res = { state.vault.lock().unwrap().add(account) };
                match res {
                    Ok(_) => rep.added += 1,
                    Err(e) => rep.failed.push(format!("…{tail}: {e}")),
                }
            }
            Err(e) => rep.failed.push(format!("…{tail}: {e}")),
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    state.push_log("launch", format!("Import: {} account(s) added out of {}", rep.added, rep.found));
    Ok(rep)
}

// ---------------------------------------------------------------------------
// Performances, fenêtres, système
// ---------------------------------------------------------------------------

/// Mesures de la machine + une ligne par client Roblox.
#[tauri::command]
pub async fn client_metrics(state: State<'_, AppState>) -> Result<crate::perf::Metrics> {
    let map = state.pids.lock().unwrap().clone();
    tokio::task::spawn_blocking(move || crate::perf::metrics(&map))
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Affiche ou réduit la fenêtre d'un client (ou de tous si `pid` est vide).
#[tauri::command]
pub async fn window_action(pid: Option<u32>, action: String) -> Result<usize> {
    tokio::task::spawn_blocking(move || {
        let pids: Vec<u32> = match pid {
            Some(p) => vec![p],
            None => proc::roblox_processes().into_iter().map(|p| p.pid).collect(),
        };
        crate::winmgmt::show_windows(pids, action == "minimize")
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))
}

/// Écrit (ou retire) les réglages graphiques de Roblox.
#[tauri::command]
pub async fn apply_graphics(enabled: bool, opts: crate::perf::GraphicsOpts) -> Result<String> {
    tokio::task::spawn_blocking(move || crate::perf::apply_graphics(enabled, &opts))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .map_err(AppError::Other)
}

/// Version de Roblox installée et dernière version publiée.
#[tauri::command]
pub async fn roblox_version() -> crate::perf::RobloxVersion {
    crate::perf::roblox_version().await
}

/// Ouvre un dossier dans l'Explorateur : "data" | "exports" | "roblox-logs".
#[tauri::command]
pub fn open_path(kind: String) -> Result<()> {
    let mut dir = match kind.as_str() {
        "roblox-logs" => {
            let mut d = dirs::data_local_dir().ok_or_else(|| AppError::Io("folder not found".into()))?;
            d.push("Roblox");
            d.push("logs");
            d
        }
        _ => {
            let mut d = dirs::data_local_dir().ok_or_else(|| AppError::Io("folder not found".into()))?;
            d.push("RoAccount");
            if kind == "exports" {
                d.push("exports");
            }
            d
        }
    };
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .arg(&dir)
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
        dir.clear();
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = dir;
        Err(AppError::Other("Only available on Windows.".into()))
    }
}

/// Enregistre un petit fichier texte dans le dossier d'exports (ex. config partagée).
#[tauri::command]
pub fn save_export(name: String, content: String) -> Result<String> {
    let ok = !name.is_empty()
        && name.len() <= 80
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        && !name.contains("..");
    if !ok {
        return Err(AppError::Other("Invalid file name.".into()));
    }
    if content.len() > 1_000_000 {
        return Err(AppError::Other("File too large.".into()));
    }
    let mut path = exports_dir()?;
    path.push(name);
    std::fs::write(&path, content)?;
    Ok(path.to_string_lossy().to_string())
}

/// Supprime les fichiers de logs de Roblox. Renvoie le nombre de fichiers supprimés.
#[tauri::command]
pub fn clean_roblox_logs() -> Result<usize> {
    let mut d = dirs::data_local_dir().ok_or_else(|| AppError::Io("folder not found".into()))?;
    d.push("Roblox");
    d.push("logs");
    let mut n = 0usize;
    if let Ok(rd) = std::fs::read_dir(&d) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_file() && std::fs::remove_file(&p).is_ok() {
                n += 1;
            }
        }
    }
    Ok(n)
}

/// Taille d'un dossier (récursif, erreurs ignorées).
fn dir_size(p: &std::path::Path) -> u64 {
    let mut n = 0u64;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let path = e.path();
            if let Ok(md) = e.metadata() {
                if md.is_dir() {
                    n += dir_size(&path);
                } else {
                    n += md.len();
                }
            }
        }
    }
    n
}

/// Vide le cache de Roblox (rbx-storage, fichiers temporaires). `dry_run` = ne fait que mesurer.
/// Renvoie les octets (à libérer, ou libérés). Les fichiers verrouillés par un client en cours sont ignorés.
#[tauri::command]
pub fn clean_roblox_cache(dry_run: bool) -> Result<u64> {
    let mut dirs_to_clean: Vec<std::path::PathBuf> = Vec::new();
    if let Some(mut d) = dirs::data_local_dir() {
        d.push("Roblox");
        let mut a = d.clone();
        a.push("rbx-storage");
        dirs_to_clean.push(a);
        let mut b = d.clone();
        b.push("Downloads");
        dirs_to_clean.push(b);
    }
    let mut t = std::env::temp_dir();
    t.push("Roblox");
    dirs_to_clean.push(t);

    let mut total = 0u64;
    for d in dirs_to_clean {
        if !d.is_dir() {
            continue;
        }
        let size = dir_size(&d);
        if dry_run {
            total += size;
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(&d) {
            for e in rd.flatten() {
                let p = e.path();
                let _ = if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
            }
        }
        total += size.saturating_sub(dir_size(&d));
    }
    Ok(total)
}

/// Lance RoAccount avec Windows (clé « Run » de l'utilisateur) ; `minimized` = démarre dans la zone de notification.
#[tauri::command]
pub fn set_autostart(enabled: bool, minimized: bool) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
        let mut cmd = std::process::Command::new("reg");
        if enabled {
            let exe = std::env::current_exe().map_err(|e| AppError::Io(e.to_string()))?;
            let mut val = format!("\"{}\"", exe.display());
            if minimized {
                val.push_str(" --minimized");
            }
            cmd.args(["add", key, "/v", "RoAccount", "/t", "REG_SZ", "/d", &val, "/f"]);
        } else {
            cmd.args(["delete", key, "/v", "RoAccount", "/f"]);
        }
        let out = cmd.creation_flags(0x0800_0000).output().map_err(|e| AppError::Other(e.to_string()))?;
        if !out.status.success() && enabled {
            return Err(AppError::Other("Couldn't write the Windows startup key.".into()));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (enabled, minimized);
    }
    Ok(())
}

/// Programme l'extinction du PC dans `minutes` minutes (0 = annule).
#[tauri::command]
pub fn schedule_shutdown(minutes: u32) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("shutdown");
        if minutes == 0 {
            cmd.arg("/a");
        } else {
            cmd.args(["/s", "/f", "/t", &(minutes.min(1440) * 60).to_string()]);
        }
        cmd.creation_flags(0x0800_0000)
            .output()
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = minutes;
        Err(AppError::Other("Only available on Windows.".into()))
    }
}

/// Annule le lot en cours : les comptes pas encore lancés sont ignorés.
#[tauri::command]
pub fn cancel_batch(state: State<'_, AppState>) {
    state.cancel_batch.store(true, Ordering::SeqCst);
}


/// Copies the encrypted vault into backups/ (only if it changed) and keeps the newest N automatic copies.
pub fn auto_backup(state: &AppState) {
    let (enabled, keep) = {
        let s = state.settings.lock().unwrap();
        (s.auto_backup, s.auto_backup_keep.max(1) as usize)
    };
    if !enabled {
        return;
    }
    let src = { state.vault.lock().unwrap().file_path() };
    if !src.exists() {
        return;
    }
    let Some(parent) = src.parent() else { return };
    let dir = parent.join("backups");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let is_auto = |p: &std::path::PathBuf| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with("RoAccount-auto-") && n.ends_with(".roavault"))
            .unwrap_or(false)
    };
    let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| is_auto(p)).collect())
        .unwrap_or_default();
    files.sort();
    files.reverse();
    if let (Some(newest), Ok(cur)) = (files.first(), std::fs::read(&src)) {
        if std::fs::read(newest).map(|old| old == cur).unwrap_or(false) {
            return; // unchanged since the last automatic backup
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if std::fs::copy(&src, dir.join(format!("RoAccount-auto-{ts}.roavault"))).is_err() {
        return;
    }
    files.insert(0, dir.join(format!("RoAccount-auto-{ts}.roavault")));
    for p in files.into_iter().skip(keep) {
        let _ = std::fs::remove_file(p);
    }
}

//! Boucle d'arrière-plan (every ~20 s) :
//!  - moteur de performances (priorité, cœurs, mémoire),
//!  - détection des clients figés,
//!  - reconnexion / redémarrage automatique (avec disjoncteur « N tries in M min »),
//!  - résumé de statut Discord.

use crate::settings::Settings;
use crate::state::{AppState, RejoinInfo};
use crate::{discord, launch, proc, roblox};
use std::collections::HashSet;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub async fn run(app: AppHandle) {
    // laisse le coffre se déverrouiller et l'UI démarrer
    tokio::time::sleep(Duration::from_secs(12)).await;
    loop {
        tick(&app).await;
        tokio::time::sleep(Duration::from_secs(20)).await;
    }
}

/// Termine un process Roblox précis, sans fenêtre console.
fn kill_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .creation_flags(0x0800_0000)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
    }
}

/// Relance un compte sur la cible courante et suit son nouveau PID.
async fn relaunch(app: &AppHandle, id: &str, settings: &Settings) -> bool {
    let state = app.state::<AppState>();
    let meta = {
        let v = state.vault.lock().unwrap();
        v.cookie_meta(id).ok()
    };
    let Some((cookie, _rid, _name)) = meta else { return false };
    let before: HashSet<u32> = proc::roblox_processes().into_iter().map(|p| p.pid).collect();
    if launch::launch(&cookie, &settings.target).await.is_err() {
        return false;
    }
    state.mark_running(id.to_string());
    crate::commands::track_pid(&state, id, &before, 25).await;
    true
}

/// Native Windows notification (when enabled in the settings).
pub fn desktop_notify(app: &AppHandle, settings: &Settings, title: &str, body: &str) {
    if !settings.notify_windows {
        return;
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Tells the UI about an incident (Windows notification) and sends the Discord alert, either right away or —
/// when `alert_after_min` is set — only if the account is still not back in game after that many minutes.
async fn incident(app: &AppHandle, settings: &Settings, id: &str, name: &str, kind: &str, text: &str, discord_on: bool) {
    let _ = app.emit("incident", serde_json::json!({ "id": id, "name": name, "kind": kind }));
    desktop_notify(app, settings, "RoAccount", &text.replace("**", ""));
    if !discord_on {
        return;
    }
    if settings.alert_after_min == 0 {
        discord::notify(settings, text, true).await;
    } else {
        let state = app.state::<AppState>();
        state.pending_alerts.lock().unwrap().insert(id.to_string(), (Instant::now(), text.to_string()));
    }
}

/// Sends the deferred alerts whose delay is over and whose account is still not in game.
async fn flush_pending(app: &AppHandle, settings: &Settings) {
    let state = app.state::<AppState>();
    if settings.alert_after_min == 0 {
        state.pending_alerts.lock().unwrap().clear();
        return;
    }
    let wait = Duration::from_secs(settings.alert_after_min as u64 * 60);
    let due: Vec<(String, String)> = {
        let m = state.pending_alerts.lock().unwrap();
        m.iter().filter(|(_, (t, _))| t.elapsed() >= wait).map(|(id, (_, txt))| (id.clone(), txt.clone())).collect()
    };
    for (id, txt) in due {
        state.pending_alerts.lock().unwrap().remove(&id);
        let meta = state.vault.lock().unwrap().cookie_meta(&id).ok();
        let back = match meta {
            Some((cookie, rid, _)) => roblox::presence_detail(&cookie, rid).await.map(|a| a.kind == "InGame").unwrap_or(false),
            None => true,
        };
        if !back {
            discord::notify(settings, &format!("{txt} (still offline after {} min)", settings.alert_after_min), true).await;
        }
    }
}

fn username_of(state: &AppState, id: &str) -> String {
    state
        .vault
        .lock()
        .unwrap()
        .cookie_meta(id)
        .map(|(_, _, u)| u)
        .unwrap_or_else(|_| "account".into())
}

/// Détecte les clients dont la fenêtre ne répond plus (2 passes d'affilée ≈ 40 s), alerte,
/// et — si le redémarrage auto est actif — les arrête et les relance.
async fn check_freeze(app: &AppHandle, settings: &Settings) {
    if !settings.alert_freeze && !settings.auto_restart {
        return;
    }
    let state = app.state::<AppState>();
    let hung: Vec<u32> = tokio::task::spawn_blocking(|| {
        let pids: Vec<u32> = proc::roblox_processes().into_iter().map(|p| p.pid).collect();
        crate::winmgmt::hung_pids(pids)
    })
    .await
    .unwrap_or_default();

    // pas de verdict « figé » pendant le chargement d'un client qui vient de démarrer
    let loading: HashSet<u32> = {
        let m = state.pids.lock().unwrap();
        m.iter().filter(|(id, _)| state.recently_launched(id, 150)).map(|(_, p)| *p).collect()
    };
    let hung: Vec<u32> = hung.into_iter().filter(|p| !loading.contains(p)).collect();

    let mut to_alert: Vec<u32> = Vec::new();
    {
        let mut map = state.hung.lock().unwrap();
        map.retain(|pid, _| hung.contains(pid));
        for pid in hung {
            let n = map.entry(pid).or_insert(0);
            *n += 1;
            if *n == 2 {
                to_alert.push(pid);
            }
        }
    }
    for pid in to_alert {
        state.push_log("crash", format!("Client PID {pid} frozen (not responding)"));
        let _ = app.emit("incident", serde_json::json!({ "id": "", "name": format!("PID {pid}"), "kind": "freeze" }));
        desktop_notify(app, settings, "RoAccount", &format!("A Roblox client (PID {pid}) is not responding."));
        if settings.alert_freeze {
            discord::notify(
                settings,
                &format!("🧊 A Roblox client (PID {pid}) is not responding — it is frozen."),
                true,
            )
            .await;
        }
        if settings.auto_restart {
            let id = {
                let m = state.pids.lock().unwrap();
                m.iter().find(|(_, p)| **p == pid).map(|(id, _)| id.clone())
            };
            if let Some(id) = id {
                let is_main = state.vault.lock().unwrap().is_main(&id);
                if !is_main {
                    kill_pid(pid);
                    state.hung.lock().unwrap().remove(&pid);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    if relaunch(app, &id, settings).await {
                        let name = username_of(&state, &id);
                        state.push_log("rejoin", format!("{name} frozen — restarted"));
                        if settings.alert_restart {
                            discord::notify(settings, &format!("🔄 **{name}** was frozen — restarted."), false).await;
                        }
                    }
                }
            }
        }
    }
}

/// Moteur de performances : applique les réglages choisis sur les clients en cours.
async fn perf_tick(app: &AppHandle, settings: &Settings, procs: &[crate::models::ProcInfo]) {
    let state = app.state::<AppState>();
    if procs.is_empty() {
        return;
    }

    // 1) tâches « sans réseau » dans un thread bloquant
    let do_trim = settings.trim_memory && {
        let mut last = state.last_trim.lock().unwrap();
        let due = last
            .map(|t| t.elapsed() >= Duration::from_secs(settings.trim_every_min.max(1) as u64 * 60))
            .unwrap_or(true);
        if due {
            *last = Some(Instant::now());
        }
        due
    };
    let spread: Vec<u32> = if settings.spread_cores {
        let mut done = state.spread_done.lock().unwrap();
        procs.iter().map(|p| p.pid).filter(|p| done.insert(*p)).collect()
    } else {
        Vec::new()
    };
    let already = state.spread_done.lock().unwrap().len();
    let s = settings.clone();
    let list: Vec<(u32, u64)> = procs.iter().map(|p| (p.pid, p.memory_mb)).collect();
    let _ = tokio::task::spawn_blocking(move || {
        let fg = crate::winmgmt::foreground_pid();
        let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1).min(64);

        for (i, pid) in spread.iter().enumerate() {
            // chaque client reçoit 2 cœurs voisins, en tournant
            let k = already.saturating_sub(spread.len()) + i;
            let a = (2 * k) % cores;
            let b = (2 * k + 1) % cores;
            let mask: usize = (1usize << a) | (1usize << b);
            crate::winmgmt::set_affinity(*pid, mask);
        }
        for (pid, mem) in &list {
            if s.adaptive_limits {
                crate::winmgmt::set_priority(*pid, if *pid == fg { "normal" } else { "below" });
            }
            if s.throttle_mem && *mem >= s.throttle_mem_mb {
                crate::winmgmt::set_priority(*pid, "below");
            }
            if do_trim {
                crate::winmgmt::trim_memory(*pid);
            }
        }
    })
    .await;

    // 2) redémarrage si mémoire élevée
    if settings.restart_mem {
        for p in procs.iter().filter(|p| p.memory_mb >= settings.restart_mem_mb) {
            let id = {
                let m = state.pids.lock().unwrap();
                m.iter().find(|(_, pid)| **pid == p.pid).map(|(id, _)| id.clone())
            };
            let Some(id) = id else { continue };
            if state.vault.lock().unwrap().is_main(&id) {
                continue;
            }
            let name = username_of(&state, &id);
            kill_pid(p.pid);
            tokio::time::sleep(Duration::from_secs(2)).await;
            if relaunch(app, &id, settings).await {
                state.push_log("rejoin", format!("{name} — restarted (memory {} MB)", p.memory_mb));
                if settings.alert_mem_restart {
                    discord::notify(
                        settings,
                        &format!("🧠 **{name}** restarted: it was using {} MB of memory.", p.memory_mb),
                        false,
                    )
                    .await;
                }
            }
        }
    }
}

async fn summary(app: &AppHandle, settings: &Settings) {
    if !settings.alert_summary {
        return;
    }
    let state = app.state::<AppState>();
    {
        let mut last = state.last_summary.lock().unwrap();
        let due = last
            .map(|t| t.elapsed() >= Duration::from_secs(settings.summary_every_min.max(1) as u64 * 60))
            .unwrap_or(false);
        if last.is_none() {
            *last = Some(Instant::now());
        }
        if !due {
            return;
        }
        *last = Some(Instant::now());
    }
    let map = state.pids.lock().unwrap().clone();
    let m = tokio::task::spawn_blocking(move || crate::perf::metrics(&map)).await;
    if let Ok(m) = m {
        let ram: u64 = m.clients.iter().map(|c| c.memory_mb).sum();
        let cpu: f32 = m.clients.iter().map(|c| c.cpu).sum();
        discord::notify(
            settings,
            &format!(
                "📊 **{}** client(s) running — RAM {:.1} GB, CPU {:.0} %.",
                m.clients.len(),
                ram as f32 / 1024.0,
                cpu
            ),
            false,
        )
        .await;
    }
}

async fn tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let settings = { state.settings.lock().unwrap().clone() };

    // clients vivants + comptes dont le client a disparu (crash)
    let procs = tokio::task::spawn_blocking(proc::roblox_processes).await.unwrap_or_default();
    let alive: HashSet<u32> = procs.iter().map(|p| p.pid).collect();
    let dead: HashSet<String> = {
        let m = state.pids.lock().unwrap();
        m.iter().filter(|(_, p)| !alive.contains(p)).map(|(id, _)| id.clone()).collect()
    };
    state.pids.lock().unwrap().retain(|_, p| alive.contains(p));
    state.spread_done.lock().unwrap().retain(|p| alive.contains(p));

    perf_tick(app, &settings, &procs).await;
    check_freeze(app, &settings).await;
    summary(app, &settings).await;
    flush_pending(app, &settings).await;

    if !settings.auto_rejoin && !settings.auto_restart {
        return;
    }
    // vault locked → rien à faire
    {
        if !state.vault.lock().unwrap().is_unlocked() {
            return;
        }
    }

    let ids: Vec<String> = { state.running.lock().unwrap().iter().cloned().collect() };
    let window = Duration::from_secs(settings.give_up_minutes.max(1) as u64 * 60);

    for id in ids {
        // délai de grâce : un client qui vient d'être lancé charge encore, Roblox ne le voit pas « in game »
        // tout de suite — le relancer maintenant ferait expulser le client qui démarre.
        if state.recently_launched(&id, 120) {
            continue;
        }
        let meta = {
            let v = state.vault.lock().unwrap();
            // le compte MAIN n'est jamais relancé automatiquement
            if v.is_main(&id) {
                None
            } else {
                v.cookie_meta(&id).ok()
            }
        };
        let (cookie, roblox_id, username) = match meta {
            Some(x) => x,
            None => continue,
        };

        let act = match roblox::presence_detail(&cookie, roblox_id).await {
            Ok(a) => a,
            Err(_) => continue,
        };
        let in_game = act.kind == "InGame";
        let crashed = dead.contains(&id);

        // un crash relance si le redémarrage auto OU la reconnexion auto est actif ;
        // une déconnexion (client toujours là) seulement si la reconnexion auto est active
        let allowed = settings.auto_rejoin || (settings.auto_restart && crashed);

        // décide de l'action sous verrou court
        let mut action: Option<bool> = None; // Some(true)=relancer, Some(false)=abandon
        {
            let mut map = state.rejoin.lock().unwrap();
            let e = map.entry(id.clone()).or_insert_with(RejoinInfo::default);
            if in_game {
                e.offline_strikes = 0;
                e.attempt_times.clear();
            } else if allowed {
                e.offline_strikes += 1;
                if e.offline_strikes >= 2 {
                    e.attempt_times.retain(|t| t.elapsed() <= window);
                    if e.attempt_times.len() as u32 >= settings.give_up_tries.max(1) {
                        action = Some(false);
                    } else {
                        let cooled = e
                            .last_attempt
                            .map(|t| t.elapsed() >= Duration::from_secs(30))
                            .unwrap_or(true);
                        if cooled {
                            e.attempt_times.push(Instant::now());
                            e.last_attempt = Some(Instant::now());
                            e.offline_strikes = 0;
                            action = Some(true);
                        }
                    }
                }
            }
        }

        match action {
            Some(true) => {
                if crashed {
                    state.push_log("crash", format!("{username} crashed"));
                    incident(app, &settings, &id, &username, "crash", &format!("💥 **{username}** crashed."), settings.alert_crash).await;
                } else {
                    state.push_log("rejoin", format!("{username} disconnected"));
                    incident(app, &settings, &id, &username, "disconnect", &format!("🔌 **{username}** was disconnected."), settings.alert_disconnect).await;
                }
                relaunch(app, &id, &settings).await;
                state.push_log("rejoin", format!("{username} — relaunched"));
                if settings.alert_restart {
                    discord::notify(
                        &settings,
                        &format!("🔄 **{username}** relaunched automatically."),
                        false,
                    )
                    .await;
                }
            }
            Some(false) => {
                state.running.lock().unwrap().remove(&id);
                state.rejoin.lock().unwrap().remove(&id);
                state.push_log(
                    "crash",
                    format!("{username} — giving up after {} tries", settings.give_up_tries),
                );
                let _ = app.emit("incident", serde_json::json!({ "id": id, "name": username, "kind": "giveup" }));
                desktop_notify(app, &settings, "RoAccount", &format!("{username} — giving up after {} tries", settings.give_up_tries));
                if settings.alert_give_up {
                    discord::notify(
                        &settings,
                        &format!(
                            "⛔ **{username}** — giving up after {} attempts in {} min.",
                            settings.give_up_tries, settings.give_up_minutes
                        ),
                        true,
                    )
                    .await;
                }
            }
            None => {}
        }
    }
}

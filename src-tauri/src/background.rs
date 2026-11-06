//! Boucle d'arrière-plan : auto-rejoin / auto-restart + alertes Discord.
//!
//! Toutes les ~20 s, pour chaque compte « en cours » (lancé puis non arrêté),
//! on vérifie sa présence. S'il n'est plus en jeu alors que l'auto-rejoin est
//! actif, on le relance — avec un disjoncteur (abandon après 3 essais) et un
//! délai entre tentatives, et une alerte Discord si configurée.

use crate::settings::Settings;
use crate::state::{AppState, RejoinInfo};
use crate::{discord, launch, roblox};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

pub async fn run(app: AppHandle) {
    // laisse le coffre se déverrouiller et l'UI démarrer
    tokio::time::sleep(Duration::from_secs(12)).await;
    loop {
        tick(&app).await;
        tokio::time::sleep(Duration::from_secs(20)).await;
    }
}

/// Détecte les clients dont la fenêtre ne répond plus (2 passes d'affilée ≈ 40 s) et alerte.
async fn check_freeze(app: &AppHandle, settings: &Settings) {
    if !settings.alert_freeze {
        return;
    }
    let state = app.state::<AppState>();
    let hung: Vec<u32> = tokio::task::spawn_blocking(|| {
        let pids: Vec<u32> = crate::proc::roblox_processes().into_iter().map(|p| p.pid).collect();
        crate::winmgmt::hung_pids(pids)
    })
    .await
    .unwrap_or_default();

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
        state.push_log("crash", format!("Client PID {pid} figé (ne répond plus)"));
        discord::notify(
            settings,
            &format!("🧊 Un client Roblox (PID {pid}) ne répond plus — il est figé."),
            true,
        )
        .await;
    }
}

async fn tick(app: &AppHandle) {
    let state = app.state::<AppState>();

    let settings = { state.settings.lock().unwrap().clone() };
    check_freeze(app, &settings).await;
    if !settings.auto_rejoin {
        return;
    }
    // coffre verrouillé → rien à faire
    {
        if !state.vault.lock().unwrap().is_unlocked() {
            return;
        }
    }

    let ids: Vec<String> = { state.running.lock().unwrap().iter().cloned().collect() };

    for id in ids {
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

        // décide de l'action sous verrou court
        let mut action: Option<bool> = None; // Some(true)=relancer, Some(false)=abandon
        {
            let mut map = state.rejoin.lock().unwrap();
            let e = map.entry(id.clone()).or_insert_with(RejoinInfo::default);
            if in_game {
                e.offline_strikes = 0;
                e.attempts = 0;
            } else {
                e.offline_strikes += 1;
                if e.offline_strikes >= 2 {
                    if e.attempts >= 3 {
                        action = Some(false);
                    } else {
                        let cooled = e
                            .last_attempt
                            .map(|t| t.elapsed() >= Duration::from_secs(30))
                            .unwrap_or(true);
                        if cooled {
                            e.attempts += 1;
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
                let _ = launch::launch(&cookie, &settings.target).await;
                state.push_log("rejoin", format!("{username} déconnecté — relancé"));
                if settings.alert_disconnect {
                    discord::notify(
                        &settings,
                        &format!("🔄 **{}** déconnecté — relancé automatiquement.", username),
                        true,
                    )
                    .await;
                }
            }
            Some(false) => {
                state.running.lock().unwrap().remove(&id);
                state.rejoin.lock().unwrap().remove(&id);
                state.push_log("crash", format!("{username} — abandon après 3 essais"));
                if settings.alert_crash {
                    discord::notify(
                        &settings,
                        &format!(
                            "⛔ **{}** — abandon après 3 tentatives de reconnexion.",
                            username
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

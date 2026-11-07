mod background;
mod bootstrap;
mod capture;
mod commands;
mod discord;
mod error;
mod launch;
mod macros;
mod models;
mod perf;
mod proc;
mod roblox;
mod settings;
mod singleton;
mod state;
mod tools;
mod tray;
mod vault;
mod winmgmt;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Multi-instance : tenir le mutex ROBLOX_singletonEvent avant tout.
    if settings::load().multi_instance {
        singleton::hold();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            {
                let st = app.state::<AppState>();
                let s = st.settings.lock().unwrap();
                launch::set_extra_args(s.extra.get("launchArgs").and_then(|v| v.as_str()).unwrap_or(""));
                bootstrap::configure(s.own_roblox, &s.own_roblox_pin, s.own_roblox_mods);
            }
            {
                let st = app.state::<AppState>();
                match singleton::state() {
                    1 => st.push_log("info", "Multi-instance: lock taken, clients can run side by side".into()),
                    2 => st.push_log("warn", "Multi-instance: Roblox was already running when RoAccount started. Close it (Close all), then relaunch your accounts".into()),
                    3 => st.push_log("error", "Multi-instance: couldn't create the lock".into()),
                    _ => {}
                }
            }
            // boucle d'arrière-plan : auto-rejoin + alertes
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                background::run(handle).await;
            });

            // icône tray + menu
            let _ = tray::build(app.handle());

            // fenêtre cachée au démarrage si lancé avec Windows (--minimized)
            if let Some(w) = app.get_webview_window("main") {
                if !std::env::args().any(|a| a == "--minimized") {
                    let _ = w.show();
                }
            }

            // fermer = réduire dans la zone de notification (réglable ; sinon l'appli quitte)
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let to_tray = handle.state::<AppState>().settings.lock().unwrap().close_to_tray;
                        if to_tray {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::create_vault,
            commands::unlock_vault,
            commands::lock_vault,
            commands::list_accounts,
            commands::add_account,
            commands::remove_account,
            commands::update_account,
            commands::refresh_account,
            commands::launch_account,
            commands::launch_batch,
            commands::launch_batch_servers,
            commands::set_mute,
            commands::pc_info,
            commands::get_news,
            commands::open_url,
            commands::friend_accounts,
            commands::list_private_servers,
            commands::buy_private_server,
            commands::update_private_server,
            commands::list_macros,
            commands::save_macro,
            commands::delete_macro,
            commands::ahk_status,
            commands::run_macro,
            commands::running_macros,
            commands::stop_macros,
            commands::export_cookies,
            commands::import_accounts,
            commands::kill_all,
            commands::login_roblox,
            commands::list_servers,
            commands::send_to_server,
            commands::monitor_processes,
            commands::test_discord,
            commands::capture_window,
            commands::get_settings,
            commands::save_settings,
            commands::reveal_cookie,
            commands::change_password,
            commands::export_backup,
            commands::list_backups,
            commands::import_backup,
            commands::follow_user,
            commands::get_log,
            commands::clear_log,
            commands::export_csv,
            commands::arrange_windows,
            commands::set_priority,
            commands::client_metrics,
            commands::window_action,
            commands::apply_graphics,
            commands::roblox_version,
            commands::open_path,
            commands::save_export,
            commands::clean_roblox_logs,
            commands::clean_roblox_cache,
            commands::stop_accounts,
            commands::multi_status,
            commands::set_autostart,
            commands::schedule_shutdown,
            commands::cancel_batch,
            commands::list_trash,
            commands::restore_account,
            commands::purge_trash,
            commands::discord_post,
            commands::notify_desktop,
            commands::set_rich_presence,
            commands::bootstrap_status,
            commands::bootstrap_install,
            commands::bootstrap_remove,
        ])
        .build(tauri::generate_context!())
        .expect("error while starting RoAccount")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                commands::auto_backup(&app.state::<AppState>());
            }
        });
}

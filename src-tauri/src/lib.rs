mod background;
mod capture;
mod commands;
mod discord;
mod error;
mod launch;
mod macros;
mod models;
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
    singleton::hold();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .setup(|app| {
            // boucle d'arrière-plan : auto-rejoin + alertes
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                background::run(handle).await;
            });

            // icône tray + menu
            let _ = tray::build(app.handle());

            // fermer = réduire dans la barre (ne quitte pas)
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
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
        ])
        .run(tauri::generate_context!())
        .expect("erreur au démarrage de RoAccount");
}

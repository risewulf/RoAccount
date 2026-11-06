//! Icône de la zone de notification (tray) + menu.

use crate::launch;
use crate::state::AppState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Afficher RoAccount", true, None::<&str>)?;
    let killall = MenuItem::with_id(app, "killall", "Tout arrêter", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &killall, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("RoAccount")
        .menu(&menu);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "killall" => {
                let _ = launch::kill_all();
                let state = app.state::<AppState>();
                state.running.lock().unwrap().clear();
                state.rejoin.lock().unwrap().clear();
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

//! Capture de la fenêtre d'un client Roblox, par PID, pour l'aperçu du Monitor.
//! Utilise xcap (API Windows derrière). Renvoie un data URL PNG prêt pour `<img>`.

use crate::error::{AppError, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};

pub fn capture_pid(pid: u32) -> Result<String> {
    let windows = xcap::Window::all().map_err(|e| AppError::Other(e.to_string()))?;

    let mut seen = false;
    for w in windows {
        if !w.pid().map(|p| p == pid).unwrap_or(false) {
            continue;
        }
        seen = true;
        if w.is_minimized().unwrap_or(true) {
            continue;
        }

        let img = w
            .capture_image()
            .map_err(|e| AppError::Other(e.to_string()))?;

        let mut buf: Vec<u8> = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| AppError::Other(e.to_string()))?;

        return Ok(format!("data:image/png;base64,{}", B64.encode(&buf)));
    }

    if seen {
        Err(AppError::Other(
            "Window minimized — restore it to capture it.".into(),
        ))
    } else {
        Err(AppError::Other("No window found for this client.".into()))
    }
}

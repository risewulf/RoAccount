//! Lancement d'un client Roblox pour un compte donné.
//!
//! Utilise le flux officiel de « ticket d'authentification » :
//!   1. récupérer un token CSRF,
//!   2. demander un ticket d'auth à usage unique,
//!   3. construire l'URI `roblox-player:` avec ce ticket,
//!   4. laisser l'OS ouvrir le client via le protocole enregistré.
//!
//! C'est le même mécanisme que le site officiel. À n'utiliser qu'avec des
//! comptes que l'on possède.

use crate::error::{AppError, Result};
use crate::roblox;

/// Résout une cible utilisateur (URL de jeu, place ID) en un placeId numérique.
pub fn resolve_place_id(target: &str) -> Result<u64> {
    let t = target.trim();

    // place ID brut
    if let Ok(id) = t.parse::<u64>() {
        return Ok(id);
    }

    // URL du type roblox.com/games/<placeId>/...
    if let Some(idx) = t.find("/games/") {
        let rest = &t[idx + "/games/".len()..];
        let num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(id) = num.parse::<u64>() {
            return Ok(id);
        }
    }

    Err(AppError::BadTarget(target.to_string()))
}

/// Demande un ticket d'authentification à usage unique pour ce cookie.
async fn authentication_ticket(cookie: &str) -> Result<String> {
    let csrf = roblox::csrf_token(cookie).await?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let cookie_hdr = if cookie.trim_start().starts_with(".ROBLOSECURITY") {
        cookie.to_string()
    } else {
        format!(".ROBLOSECURITY={}", cookie.trim())
    };

    let resp = client
        .post("https://auth.roblox.com/v1/authentication-ticket/")
        .header("Cookie", cookie_hdr)
        .header("X-CSRF-TOKEN", csrf)
        .header("Content-Type", "application/json")
        .header("Origin", "https://www.roblox.com")
        .header("Referer", "https://www.roblox.com/")
        .body("{}")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(AppError::Launch(format!(
            "demande de ticket refusée (HTTP {})",
            resp.status()
        )));
    }

    resp.headers()
        .get("rbx-authentication-ticket")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Launch("ticket d'authentification absent de la réponse".into()))
}

/// Construit l'URI `roblox-player:` à partir du ticket et d'une URL PlaceLauncher.
fn build_uri(ticket: &str, place_launcher: &str) -> String {
    let launch_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let encoded = urlencode(place_launcher);
    format!(
        "roblox-player:1+launchmode:play+gameinfo:{ticket}\
         +launchtime:{launch_time}+placelauncherurl:{encoded}\
         +robloxLocale:fr_fr+gameLocale:fr_fr+channel:"
    )
}

/// URI de lancement vers un jeu (serveur public au choix de Roblox).
fn build_launch_uri(ticket: &str, place_id: u64) -> String {
    let place_launcher = format!(
        "https://assetgame.roblox.com/game/PlaceLauncher.ashx?\
         request=RequestGame&browserTrackerId=0&placeId={place_id}&isPlayTogetherGame=false"
    );
    build_uri(ticket, &place_launcher)
}

/// URI de lancement vers un serveur précis (jobId).
fn build_job_uri(ticket: &str, place_id: u64, job_id: &str) -> String {
    let place_launcher = format!(
        "https://assetgame.roblox.com/game/PlaceLauncher.ashx?\
         request=RequestGameJob&browserTrackerId=0&placeId={place_id}&gameId={job_id}&isPlayTogetherGame=false"
    );
    build_uri(ticket, &place_launcher)
}

/// URI de lancement vers un serveur privé (accessCode + linkCode résolus pour ce compte).
fn build_private_uri(ticket: &str, place_id: u64, access_code: &str, link_code: &str) -> String {
    let place_launcher = format!(
        "https://assetgame.roblox.com/game/PlaceLauncher.ashx?\
         request=RequestPrivateGame&browserTrackerId=0&placeId={place_id}\
         &accessCode={access_code}&linkCode={link_code}"
    );
    build_uri(ticket, &place_launcher)
}

/// Encodage URL minimal pour le paramètre placelauncherurl.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Ouvre l'URI de protocole via le shell du système.
fn open_protocol(uri: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", uri])
            .spawn()
            .map_err(|e| AppError::Launch(e.to_string()))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(uri)
            .spawn()
            .map_err(|e| AppError::Launch(e.to_string()))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Le client Roblox officiel ne tourne pas sur Linux : en dev on log seulement.
        let _ = uri;
        Err(AppError::Launch(
            "le client Roblox n'est pas disponible sur cette plateforme (cible : Windows)".into(),
        ))
    }
}

/// Lance un client pour `cookie` sur la cible `target`.
pub async fn launch(cookie: &str, target: &str) -> Result<()> {
    let place_id = resolve_place_id(target)?;
    let ticket = authentication_ticket(cookie).await?;
    let uri = build_launch_uri(&ticket, place_id);
    open_protocol(&uri)
}

/// Lance un client vers un serveur précis (depuis le navigateur de serveurs).
pub async fn launch_to_job(cookie: &str, place_id: u64, job_id: &str) -> Result<()> {
    let ticket = authentication_ticket(cookie).await?;
    let uri = build_job_uri(&ticket, place_id, job_id);
    open_protocol(&uri)
}

/// Lance un client dans un serveur privé.
pub async fn launch_private(cookie: &str, place_id: u64, access_code: &str, link_code: &str) -> Result<()> {
    let ticket = authentication_ticket(cookie).await?;
    let uri = build_private_uri(&ticket, place_id, access_code, link_code);
    open_protocol(&uri)
}

/// Lance un client en suivant un utilisateur dans sa partie en cours.
pub async fn launch_follow(cookie: &str, user_id: u64) -> Result<()> {
    let ticket = authentication_ticket(cookie).await?;
    let place_launcher = format!(
        "https://assetgame.roblox.com/game/PlaceLauncher.ashx?\
         request=RequestFollowUser&userId={user_id}&browserTrackerId=0"
    );
    let uri = build_uri(&ticket, &place_launcher);
    open_protocol(&uri)
}

/// Termine tous les processus Roblox (bouton « Tout arrêter »).
pub fn kill_all() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        for proc in ["RobloxPlayerBeta.exe", "RobloxPlayerLauncher.exe"] {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", proc])
                .output();
        }
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err(AppError::Launch(
            "arrêt des clients disponible uniquement sur Windows".into(),
        ))
    }
}

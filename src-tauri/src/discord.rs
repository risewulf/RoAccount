//! Envoi d'alertes vers un webhook Discord (fire-and-forget pour la boucle).

use crate::settings::Settings;

/// Envoie une alerte. Avec `ping = true` et un ID Discord configuré, la mention
/// `<@id>` est ajoutée (seul cet utilisateur peut être notifié).
pub async fn notify(settings: &Settings, content: &str, ping: bool) {
    send(&settings.discord_webhook, if ping { &settings.discord_user_id } else { "" }, content).await;
}

pub async fn send(webhook: &str, user_id: &str, content: &str) {
    let w = webhook.trim();
    if !(w.starts_with("https://discord.com/api/webhooks/")
        || w.starts_with("https://discordapp.com/api/webhooks/"))
    {
        return;
    }
    let uid: String = user_id.chars().filter(|c| c.is_ascii_digit()).collect();
    let body = if uid.len() >= 15 {
        serde_json::json!({
            "content": format!("<@{uid}> {content}"),
            "allowed_mentions": { "users": [uid] },
        })
    } else {
        serde_json::json!({ "content": content, "allowed_mentions": { "parse": [] } })
    };
    let _ = reqwest::Client::new().post(w).json(&body).send().await;
}

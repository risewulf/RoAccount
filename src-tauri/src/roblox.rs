//! Client minimal de l'API Roblox.
//!
//! N'utilise que les endpoints officiels `*.roblox.com`, authentifiés avec le
//! cookie `.ROBLOSECURITY` du compte. À n'utiliser qu'avec des comptes que l'on
//! possède. Aucune création de compte, aucun contournement d'authentification.

use crate::error::{AppError, Result};
use crate::models::{RobloxProfile, ServerInfo};
use serde::Deserialize;

const UA: &str = "RoAccount/0.1 (+https://github.com/you/roaccount)";

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(Into::into)
}

/// Construit l'en-tête Cookie attendu par Roblox.
fn cookie_header(cookie: &str) -> String {
    // On accepte aussi bien le cookie brut que la forme ".ROBLOSECURITY=...".
    if cookie.trim_start().starts_with(".ROBLOSECURITY") {
        cookie.to_string()
    } else {
        format!(".ROBLOSECURITY={}", cookie.trim())
    }
}

#[derive(Deserialize)]
struct AuthUser {
    id: u64,
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

/// Valide le cookie et renvoie le profil associé. Sert au moment d'ajouter un compte.
pub async fn validate(cookie: &str) -> Result<RobloxProfile> {
    let resp = client()?
        .get("https://users.roblox.com/v1/users/authenticated")
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::InvalidCookie);
    }
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("HTTP {}", resp.status())));
    }

    let u: AuthUser = resp.json().await.map_err(|_| AppError::InvalidCookie)?;
    Ok(RobloxProfile {
        id: u.id,
        name: u.name,
        display_name: u.display_name,
    })
}

#[derive(Deserialize)]
struct Currency {
    robux: i64,
}

pub async fn robux(cookie: &str) -> Result<i64> {
    let resp = client()?
        .get("https://economy.roblox.com/v1/user/currency")
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("robux HTTP {}", resp.status())));
    }
    let c: Currency = resp.json().await.map_err(|_| AppError::InvalidCookie)?;
    Ok(c.robux)
}

#[derive(Deserialize)]
struct Membership {
    #[serde(default)]
    #[serde(rename = "isPremium")]
    is_premium: bool,
}

pub async fn premium(cookie: &str, roblox_id: u64) -> Result<bool> {
    // premiumfeatures renvoie directement un booléen sur cet endpoint.
    let url = format!(
        "https://premiumfeatures.roblox.com/v1/users/{}/validate-membership",
        roblox_id
    );
    let resp = client()?
        .get(url)
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?;
    if !resp.status().is_success() {
        return Ok(false);
    }
    // la réponse est un booléen brut `true`/`false`
    let text = resp.text().await.unwrap_or_default();
    Ok(text.trim() == "true")
}

#[derive(Deserialize)]
struct FriendCount {
    count: u64,
}

pub async fn friends_count(roblox_id: u64) -> Result<u64> {
    let url = format!(
        "https://friends.roblox.com/v1/users/{}/friends/count",
        roblox_id
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Ok(0);
    }
    let c: FriendCount = resp.json().await.unwrap_or(FriendCount { count: 0 });
    Ok(c.count)
}

/// Whether Roblox reports this user as banned (public users endpoint, no cookie needed).
pub async fn is_banned(roblox_id: u64) -> Result<bool> {
    let url = format!("https://users.roblox.com/v1/users/{}", roblox_id);
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Ok(false);
    }
    let v: serde_json::Value = resp.json().await.unwrap_or_default();
    Ok(v.get("isBanned").and_then(|b| b.as_bool()).unwrap_or(false))
}

#[derive(Deserialize)]
struct PresenceResp {
    #[serde(rename = "userPresences")]
    user_presences: Vec<Presence>,
}

#[derive(Deserialize)]
struct Presence {
    #[serde(rename = "userPresenceType")]
    presence_type: u8,
    #[serde(rename = "lastLocation", default)]
    last_location: Option<String>,
    #[serde(rename = "placeId", default)]
    place_id: Option<u64>,
    #[serde(rename = "universeId", default)]
    universe_id: Option<u64>,
}

/// Activité d'un compte : état de présence + jeu en cours.
pub struct Activity {
    pub kind: String,
    pub game: Option<String>,
    pub place_id: Option<u64>,
    pub universe_id: Option<u64>,
}

fn presence_name(kind: u8) -> &'static str {
    match kind {
        1 => "Online",
        2 => "InGame",
        3 => "Studio",
        _ => "Offline",
    }
}

/// Présence détaillée d'un compte : état + jeu (lastLocation, placeId, universeId).
pub async fn presence_detail(cookie: &str, roblox_id: u64) -> Result<Activity> {
    let resp = client()?
        .post("https://presence.roblox.com/v1/presence/users")
        .header("Cookie", cookie_header(cookie))
        .json(&serde_json::json!({ "userIds": [roblox_id] }))
        .send()
        .await?;
    if !resp.status().is_success() {
        return Ok(Activity { kind: "Offline".into(), game: None, place_id: None, universe_id: None });
    }
    let p: PresenceResp = resp.json().await.map_err(|_| AppError::InvalidCookie)?;
    match p.user_presences.into_iter().next() {
        Some(pr) => Ok(Activity {
            kind: presence_name(pr.presence_type).into(),
            game: if pr.presence_type == 2 { pr.last_location } else { None },
            place_id: pr.place_id,
            universe_id: pr.universe_id,
        }),
        None => Ok(Activity { kind: "Offline".into(), game: None, place_id: None, universe_id: None }),
    }
}

#[derive(Deserialize)]
struct ThumbResp {
    data: Vec<ThumbItem>,
}

#[derive(Deserialize)]
struct ThumbItem {
    #[serde(rename = "imageUrl", default)]
    image_url: Option<String>,
    #[serde(default)]
    state: Option<String>,
}

fn first_ready(t: ThumbResp) -> Option<String> {
    t.data.into_iter().find_map(|i| {
        if i.state.as_deref() == Some("Completed") {
            i.image_url
        } else {
            None
        }
    })
}

/// Vignette (icône) d'un jeu à partir de son universeId.
pub async fn game_icon(universe_id: u64) -> Result<Option<String>> {
    let url = format!(
        "https://thumbnails.roblox.com/v1/games/icons?universeIds={}&size=150x150&format=Png&isCircular=false",
        universe_id
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let t: ThumbResp = resp.json().await.map_err(|e| AppError::Network(e.to_string()))?;
    Ok(first_ready(t))
}

#[derive(Deserialize)]
struct UniverseResp {
    #[serde(rename = "universeId", default)]
    universe_id: Option<u64>,
}

/// Résout l'universeId d'un jeu à partir d'un placeId (quand la présence ne le donne pas).
pub async fn universe_for_place(place_id: u64) -> Option<u64> {
    let url = format!("https://apis.roblox.com/universes/v1/places/{}/universe", place_id);
    let resp = client().ok()?.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let r: UniverseResp = resp.json().await.ok()?;
    r.universe_id
}

#[derive(Deserialize)]
struct GamesResp {
    data: Vec<GameItem>,
}

#[derive(Deserialize)]
struct GameItem {
    #[serde(default)]
    name: Option<String>,
}

/// Nom d'un jeu à partir de son universeId.
pub async fn game_name(universe_id: u64) -> Option<String> {
    let url = format!("https://games.roblox.com/v1/games?universeIds={}", universe_id);
    let resp = client().ok()?.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let r: GamesResp = resp.json().await.ok()?;
    r.data.into_iter().next().and_then(|g| g.name)
}

/// Avatar (portrait) d'un compte à partir de son userId.
pub async fn avatar_headshot(roblox_id: u64) -> Result<Option<String>> {
    let url = format!(
        "https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={}&size=150x150&format=Png&isCircular=false",
        roblox_id
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let t: ThumbResp = resp.json().await.map_err(|e| AppError::Network(e.to_string()))?;
    Ok(first_ready(t))
}

#[derive(Deserialize)]
struct ServersResp {
    data: Vec<ServerRaw>,
}

#[derive(Deserialize)]
struct ServerRaw {
    id: String,
    #[serde(default)]
    playing: u32,
    #[serde(rename = "maxPlayers", default)]
    max_players: u32,
    #[serde(default)]
    ping: Option<u32>,
    #[serde(default)]
    fps: Option<f64>,
}

/// Liste les serveurs publics d'un jeu (endpoint public, sans authentification).
pub async fn public_servers(place_id: u64) -> Result<Vec<ServerInfo>> {
    let url = format!(
        "https://games.roblox.com/v1/games/{}/servers/Public?sortOrder=Asc&limit=100",
        place_id
    );
    let resp = client()?.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("servers HTTP {}", resp.status())));
    }
    let r: ServersResp = resp.json().await.map_err(|e| AppError::Network(e.to_string()))?;
    Ok(r
        .data
        .into_iter()
        .map(|s| ServerInfo {
            id: s.id,
            playing: s.playing,
            max_players: s.max_players,
            ping: s.ping,
            fps: s.fps,
        })
        .collect())
}

#[derive(Deserialize)]
struct NamesResp {
    data: Vec<NameItem>,
}

#[derive(Deserialize)]
struct NameItem {
    id: u64,
}

/// Résout un userId depuis un pseudo Roblox.
pub async fn user_id_for_username(name: &str) -> Option<u64> {
    let resp = client()
        .ok()?
        .post("https://users.roblox.com/v1/usernames/users")
        .json(&serde_json::json!({ "usernames": [name], "excludeBannedUsers": false }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let r: NamesResp = resp.json().await.ok()?;
    r.data.into_iter().next().map(|x| x.id)
}

/// Résout un utilisateur depuis un userId, un @pseudo ou un lien de profil.
pub async fn resolve_user(target: &str) -> Option<u64> {
    let t = target.trim().trim_start_matches('@');
    if let Ok(id) = t.parse::<u64>() {
        return Some(id);
    }
    if let Some(idx) = target.find("/users/") {
        let rest = &target[idx + "/users/".len()..];
        let num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(id) = num.parse::<u64>() {
            return Some(id);
        }
    }
    user_id_for_username(t).await
}

/// Récupère le token CSRF requis pour les POST authentifiés (flux ticket d'auth).
pub async fn csrf_token(cookie: &str) -> Result<String> {
    let resp = client()?
        .post("https://auth.roblox.com/v1/authentication-ticket/")
        .header("Cookie", cookie_header(cookie))
        .header("Content-Type", "application/json")
        .header("Origin", "https://www.roblox.com")
        .header("Referer", "https://www.roblox.com/")
        .body("{}")
        .send()
        .await?;
    resp.headers()
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Other("CSRF token not found".into()))
}

// ---------------------------------------------------------------------------
// Requêtes authentifiées génériques (amis, serveurs privés)
// ---------------------------------------------------------------------------

/// Requête authentifiée avec gestion du jeton CSRF (une relance si Roblox en renvoie un nouveau).
/// Renvoie (statut HTTP, corps, en-têtes).
pub async fn authed(
    cookie: &str,
    method: reqwest::Method,
    url: &str,
    body: Option<serde_json::Value>,
) -> Result<(u16, String, reqwest::header::HeaderMap)> {
    let c = client()?;
    let mut csrf = String::new();
    for attempt in 0..2 {
        let mut req = c
            .request(method.clone(), url)
            .header("Cookie", cookie_header(cookie))
            .header("Origin", "https://www.roblox.com")
            .header("Referer", "https://www.roblox.com/");
        if !csrf.is_empty() {
            req = req.header("X-CSRF-TOKEN", csrf.clone());
        }
        if let Some(b) = &body {
            req = req.json(b);
        }
        let resp = req.send().await?;
        let status = resp.status().as_u16();
        if status == 403 && attempt == 0 {
            if let Some(t) = resp.headers().get("x-csrf-token").and_then(|v| v.to_str().ok()) {
                csrf = t.to_string();
                continue;
            }
        }
        let headers = resp.headers().clone();
        let text = resp.text().await.unwrap_or_default();
        return Ok((status, text, headers));
    }
    Err(AppError::Other("request refused (CSRF token)".into()))
}

/// Message d'erreur lisible tiré d'une réponse d'erreur Roblox.
fn roblox_error(status: u16, text: &str, headers: &reqwest::header::HeaderMap) -> String {
    if headers.contains_key("rblx-challenge-id") {
        return "Roblox is asking for a verification (captcha) — try again later".into();
    }
    if status == 429 {
        return "too many requests (Roblox limit) — try again later".into();
    }
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|v| {
            v["errors"][0]["message"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| v["message"].as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| format!("HTTP {status}"))
}

// --- amis -------------------------------------------------------------------

/// Résultat d'une demande d'ami.
#[derive(Debug, PartialEq)]
pub enum FriendOutcome {
    Sent,
    Already,
    Failed(String),
}

/// Envoie une demande d'ami de `cookie` vers `target_id`.
pub async fn send_friend_request(cookie: &str, target_id: u64) -> Result<FriendOutcome> {
    let url = format!("https://friends.roblox.com/v1/users/{target_id}/request-friendship");
    let (st, text, h) = authed(
        cookie,
        reqwest::Method::POST,
        &url,
        Some(serde_json::json!({ "friendshipOriginSourceType": 0 })),
    )
    .await?;
    if st == 200 {
        let ok = serde_json::from_str::<serde_json::Value>(&text)
            .map(|v| v["success"].as_bool().unwrap_or(true))
            .unwrap_or(true);
        return Ok(if ok { FriendOutcome::Sent } else { FriendOutcome::Failed(roblox_error(st, &text, &h)) });
    }
    let msg = roblox_error(st, &text, &h);
    let low = msg.to_lowercase();
    if low.contains("already") && low.contains("friend") {
        return Ok(FriendOutcome::Already);
    }
    Ok(FriendOutcome::Failed(msg))
}

/// Accepte la demande d'ami reçue de `requester_id`.
pub async fn accept_friend_request(cookie: &str, requester_id: u64) -> Result<bool> {
    let url = format!("https://friends.roblox.com/v1/users/{requester_id}/accept-friend-request");
    let (st, _t, _h) = authed(cookie, reqwest::Method::POST, &url, Some(serde_json::json!({}))).await?;
    Ok(st == 200)
}

// --- serveurs privés --------------------------------------------------------

/// Extrait le premier UUID (8-4-4-4-12) trouvé dans `s`.
fn find_uuid(s: &str) -> Option<String> {
    let b = s.as_bytes();
    if b.len() < 36 {
        return None;
    }
    for i in 0..=(b.len() - 36) {
        let w = &b[i..i + 36];
        let ok = w.iter().enumerate().all(|(k, c)| match k {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        });
        if ok {
            return Some(String::from_utf8_lossy(w).to_string());
        }
    }
    None
}

/// Extrait la valeur numérique qui suit `key=` dans une URL / une chaîne.
fn param_after(s: &str, key: &str) -> Option<String> {
    let idx = s.find(key)? + key.len();
    let v: String = s[idx..].chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
    if v.is_empty() { None } else { Some(v) }
}

/// Résout un lien de serveur privé en (placeId, accessCode, linkCode) pour ce compte.
/// Suit les redirections (liens `roblox.com/share?code=…`) puis lit la page du jeu.
pub async fn resolve_private_link(cookie: &str, link: &str) -> Result<(u64, String, String)> {
    let link = link.trim();
    if !link.starts_with("https://www.roblox.com/") && !link.starts_with("https://roblox.com/") {
        return Err(AppError::BadTarget("invalid private server link".into()));
    }
    let resp = client()?
        .get(link)
        .header("Cookie", cookie_header(cookie))
        .send()
        .await?;
    let final_url = resp.url().to_string();
    let body = resp.text().await.unwrap_or_default();

    let place_id = crate::launch::resolve_place_id(&final_url)
        .or_else(|_| crate::launch::resolve_place_id(link))?;
    let link_code = param_after(&final_url, "privateServerLinkCode=")
        .or_else(|| param_after(link, "privateServerLinkCode="))
        .ok_or_else(|| AppError::BadTarget("private server code not found in the link".into()))?;

    // accessCode : dans l'appel JS joinPrivateGame(...) ou dans un champ accessCode
    let hay = body
        .find("joinPrivateGame(")
        .or_else(|| body.find("accessCode"))
        .map(|i| &body[i..body.len().min(i + 400)])
        .unwrap_or("");
    let access = find_uuid(hay).ok_or_else(|| {
        AppError::Other("couldn't resolve the link (does the account have access to this private server?)".into())
    })?;
    Ok((place_id, access, link_code))
}

fn pick_u64(v: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|k| v[*k].as_u64())
}

/// Liste les serveurs privés du compte (onglet « My private servers »).
pub async fn private_servers(cookie: &str) -> Result<Vec<crate::models::PrivateServer>> {
    let url = "https://games.roblox.com/v1/private-servers?privateServersTab=MyPrivateServers&itemsPerPage=50";
    let (st, text, h) = authed(cookie, reqwest::Method::GET, url, None).await?;
    if st != 200 {
        return Err(AppError::Network(roblox_error(st, &text, &h)));
    }
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| AppError::Network(e.to_string()))?;
    let mut out = Vec::new();
    for e in v["data"].as_array().cloned().unwrap_or_default() {
        let id = match pick_u64(&e, &["vipServerId", "id"]) {
            Some(i) => i,
            None => continue,
        };
        out.push(crate::models::PrivateServer {
            id,
            name: e["name"].as_str().unwrap_or("Private server").to_string(),
            game: e["game"]["name"].as_str().or_else(|| e["gameName"].as_str()).unwrap_or("").to_string(),
            place_id: pick_u64(&e["game"], &["placeId", "rootPlaceId", "id"]).or_else(|| pick_u64(&e, &["placeId"])),
            link: None,
            active: None,
        });
    }
    Ok(out)
}

/// Détails d'un serveur privé (lien de partage, actif ou non).
pub async fn private_server_details(cookie: &str, id: u64) -> Result<(Option<String>, Option<bool>, Option<String>)> {
    let url = format!("https://games.roblox.com/v1/vip-servers/{id}");
    let (st, text, h) = authed(cookie, reqwest::Method::GET, &url, None).await?;
    if st != 200 {
        return Err(AppError::Network(roblox_error(st, &text, &h)));
    }
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| AppError::Network(e.to_string()))?;
    let link = v["link"].as_str().map(|s| s.to_string());
    let active = v["active"].as_bool();
    let name = v["name"].as_str().map(|s| s.to_string());
    Ok((link, active, name))
}

/// Modifie un serveur privé : renommer, régénérer le lien, activer / désactiver.
pub async fn private_server_update(
    cookie: &str,
    id: u64,
    name: Option<String>,
    new_link: bool,
    active: Option<bool>,
) -> Result<()> {
    let mut body = serde_json::Map::new();
    if let Some(n) = name {
        body.insert("name".into(), n.into());
    }
    if new_link {
        body.insert("newJoinCode".into(), true.into());
    }
    if let Some(a) = active {
        body.insert("active".into(), a.into());
    }
    if body.is_empty() {
        return Ok(());
    }
    let url = format!("https://games.roblox.com/v1/vip-servers/{id}");
    let (st, text, h) =
        authed(cookie, reqwest::Method::PATCH, &url, Some(serde_json::Value::Object(body))).await?;
    if st == 200 {
        Ok(())
    } else {
        Err(AppError::Network(roblox_error(st, &text, &h)))
    }
}

/// Achète un serveur privé. `expected_price` doit être exactement le prix affiché par Roblox :
/// en cas d'écart, Roblox refuse l'achat (aucun Robux n'est dépensé).
pub async fn private_server_buy(
    cookie: &str,
    universe_id: u64,
    name: &str,
    expected_price: u64,
) -> Result<u64> {
    let url = format!("https://games.roblox.com/v1/games/vip-servers/{universe_id}");
    let (st, text, h) = authed(
        cookie,
        reqwest::Method::POST,
        &url,
        Some(serde_json::json!({ "name": name, "expectedPrice": expected_price })),
    )
    .await?;
    if st != 200 {
        return Err(AppError::Network(roblox_error(st, &text, &h)));
    }
    let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    Ok(pick_u64(&v, &["vipServerId", "id"]).unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_found_in_js_call() {
        let s = "Roblox.GameLauncher.joinPrivateGame(920587237, '1a2b3c4d-5e6f-7890-abcd-ef0123456789', '123')";
        assert_eq!(find_uuid(s).as_deref(), Some("1a2b3c4d-5e6f-7890-abcd-ef0123456789"));
        assert_eq!(find_uuid("rien ici"), None);
    }

    #[test]
    fn param_extraction() {
        let u = "https://www.roblox.com/games/920587237/x?privateServerLinkCode=12345abc&foo=1";
        assert_eq!(param_after(u, "privateServerLinkCode=").as_deref(), Some("12345abc"));
        assert_eq!(param_after(u, "nope="), None);
    }
}

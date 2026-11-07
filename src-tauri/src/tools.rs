//! Outils divers : mesure du PC, actualités, ouverture d'URL, import de comptes.

use crate::error::{AppError, Result};
use crate::models::{NewsItem, PcInfo};

/// Mesure rapide de la machine.
pub fn pc_info() -> PcInfo {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let mb = |b: u64| b / 1024 / 1024;
    PcInfo {
        cpu_name: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        cpu_threads: sys.cpus().len().max(1),
        ram_total_mb: mb(sys.total_memory()),
        ram_free_mb: mb(sys.available_memory()),
        os: System::long_os_version().unwrap_or_else(|| "inconnu".into()),
    }
}

const NEWS_URL: &str = "https://roaccount.xyz/news.json";

/// Actualités publiées sur roaccount.xyz (fichier news.json, plus récent en tête).
pub async fn fetch_news() -> Result<Vec<NewsItem>> {
    let resp = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("RoAccount")
        .build()?
        .get(NEWS_URL)
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("actualités HTTP {}", resp.status())));
    }
    resp.json::<Vec<NewsItem>>().await.map_err(|e| AppError::Network(e.to_string()))
}

/// Ouvre une URL dans le navigateur — uniquement pour une liste de sites autorisés.
pub fn open_url(url: &str) -> Result<()> {
    const ALLOWED: [&str; 5] = [
        "https://discord.gg/u6wWWSUz3G",
        "https://roaccount.xyz",
        "https://github.com/risewulf/RoAccount",
        "https://www.autohotkey.com",
        "https://www.roblox.com/download",
    ];
    let ok_chars = url.chars().all(|c| c.is_ascii_alphanumeric() || "/:._-?=#%&~".contains(c));
    if !ok_chars || !ALLOWED.iter().any(|a| url == *a || url.starts_with(&format!("{a}/"))) {
        return Err(AppError::Other("Lien non autorisé.".into()));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
        Ok(())
    }
}

/// Un compte trouvé dans un fichier d'import.
#[derive(Debug, Clone, PartialEq)]
pub struct ImportedAccount {
    pub cookie: String,
    pub group: Option<String>,
    pub alias: Option<String>,
    pub note: Option<String>,
}

const COOKIE_MARK: &str = "_|WARNING:-DO-NOT-SHARE-THIS";

/// Extrait un cookie `.ROBLOSECURITY` d'une ligne quelconque
/// (`cookie`, `user:pass:cookie`, `.ROBLOSECURITY=cookie`, …).
fn cookie_in(s: &str) -> Option<String> {
    let i = s.find(COOKIE_MARK)?;
    let c: String = s[i..]
        .chars()
        .take_while(|c| !c.is_whitespace() && *c != ';' && *c != '"' && *c != '\'' && *c != ',')
        .collect();
    // un vrai cookie est très long ; on écarte les bouts de texte
    if c.len() > 100 { Some(c) } else { None }
}

/// Lit un export de Roblox Account Manager (JSON) ou un texte brut (une entrée par ligne).
pub fn parse_import(text: &str) -> Vec<ImportedAccount> {
    let mut out: Vec<ImportedAccount> = Vec::new();

    // JSON : tableau d'objets, ou objet contenant un tableau (« Accounts », …)
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(text.trim()) {
        let arr = if v.is_array() {
            v.as_array().cloned()
        } else {
            v.as_object().and_then(|o| o.values().find_map(|x| x.as_array().cloned()))
        };
        if let Some(items) = arr {
            let get = |o: &serde_json::Value, keys: &[&str]| -> Option<String> {
                keys.iter()
                    .find_map(|k| o.get(*k).and_then(|x| x.as_str()))
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty())
            };
            for it in items {
                let raw = get(&it, &["SecurityToken", "Cookie", "cookie", ".ROBLOSECURITY", "Token"]);
                if let Some(c) = raw.as_deref().and_then(cookie_in) {
                    out.push(ImportedAccount {
                        cookie: c,
                        group: get(&it, &["Group", "group"]),
                        alias: get(&it, &["Alias", "alias"]),
                        note: get(&it, &["Description", "description", "Note", "note"]),
                    });
                }
            }
            if !out.is_empty() {
                return dedup(out);
            }
        }
    }

    // texte brut : on cherche un cookie dans chaque ligne
    for line in text.lines() {
        if let Some(c) = cookie_in(line) {
            out.push(ImportedAccount { cookie: c, group: None, alias: None, note: None });
        }
    }
    dedup(out)
}

fn dedup(v: Vec<ImportedAccount>) -> Vec<ImportedAccount> {
    let mut seen = std::collections::HashSet::new();
    v.into_iter().filter(|a| seen.insert(a.cookie.clone())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake() -> String {
        format!("{COOKIE_MARK}.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_{}", "A".repeat(80))
    }

    #[test]
    fn json_ram_export() {
        let c = fake();
        let j = format!(r#"[{{"Username":"a","SecurityToken":"{c}","Group":"Alts","Description":"n"}}]"#);
        let r = parse_import(&j);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].group.as_deref(), Some("Alts"));
        assert_eq!(r[0].note.as_deref(), Some("n"));
    }

    #[test]
    fn plain_lines_and_dedup() {
        let c = fake();
        let t = format!("user:pass:{c}\n{c}\nrien\n.ROBLOSECURITY={c};");
        let r = parse_import(&t);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].cookie, c);
    }

    #[test]
    fn url_whitelist() {
        assert!(open_url("https://evil.example/x").is_err());
        assert!(open_url("https://discord.gg/u6wWWSUz3G&calc").is_err());
        assert!(open_url("https://roaccount.xyz.evil.com").is_err());
    }
}

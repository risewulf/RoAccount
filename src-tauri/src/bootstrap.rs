//! RoAccount bootstrapper: installs, updates and launches the Roblox player by itself.
//!
//! Instead of relying on Roblox's own launcher, RoAccount can download the player from Roblox's CDN into
//! `%LOCALAPPDATA%\RoAccount\Roblox\Versions\version-xxxx`, keep it up to date, apply FFlags and optional
//! content mods, and start `RobloxPlayerBeta.exe` directly with the arguments of a `roblox-player:` URI.
//!
//! This module has no dependency on Tauri (errors are plain strings) so it can be tested on its own.

use md5::{Digest, Md5};
use serde::Serialize;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

const CLIENT_API: &str = "https://clientsettings.roblox.com/v2/client-version/WindowsPlayer";
const CDN: &str = "https://setup.rbxcdn.com";
const UA: &str = "RoAccount-bootstrapper/1.0";

/* ------------------------------------------------------------------ */
/* Configuration shared with the launcher                              */
/* ------------------------------------------------------------------ */

#[derive(Clone, Default)]
struct Config {
    enabled: bool,
    pin: String,
    mods: bool,
}

fn cfg() -> &'static Mutex<Config> {
    static C: OnceLock<Mutex<Config>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Config::default()))
}

/// Called whenever the settings change (and at startup).
pub fn configure(enabled: bool, pin: &str, mods: bool) {
    *cfg().lock().unwrap() = Config { enabled, pin: pin.trim().to_string(), mods };
}

pub fn enabled() -> bool {
    cfg().lock().unwrap().enabled
}

/* ------------------------------------------------------------------ */
/* Folders                                                             */
/* ------------------------------------------------------------------ */

/// `%LOCALAPPDATA%\RoAccount\Roblox` (override with ROACCOUNT_ROBLOX_ROOT, used by tests).
pub fn root_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ROACCOUNT_ROBLOX_ROOT") {
        return PathBuf::from(p);
    }
    let mut d = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    d.push("RoAccount");
    d.push("Roblox");
    d
}

pub fn versions_dir() -> PathBuf {
    root_dir().join("Versions")
}

pub fn mods_dir() -> PathBuf {
    root_dir().join("Mods")
}

pub fn version_dir(version: &str) -> PathBuf {
    versions_dir().join(version)
}

pub fn exe_path(version: &str) -> PathBuf {
    version_dir(version).join("RobloxPlayerBeta.exe")
}

/// Safe folder name for a version / channel coming from the network or the settings.
fn safe_name(s: &str) -> Result<&str, String> {
    if !s.is_empty() && s.len() < 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') {
        Ok(s)
    } else {
        Err(format!("invalid name: {s}"))
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct InstalledVersion {
    pub name: String,
    pub size_mb: u64,
    pub installed_at: u64,
}

fn dir_size(p: &Path) -> u64 {
    let mut n = 0;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            let path = e.path();
            match e.metadata() {
                Ok(m) if m.is_dir() => n += dir_size(&path),
                Ok(m) => n += m.len(),
                Err(_) => {}
            }
        }
    }
    n
}

/// Installed versions (a folder holding RobloxPlayerBeta.exe), newest first.
pub fn installed() -> Vec<InstalledVersion> {
    let mut v: Vec<InstalledVersion> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(versions_dir()) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || !e.path().join("RobloxPlayerBeta.exe").exists() {
                continue;
            }
            let at = std::fs::read_to_string(e.path().join(".roaccount-installed"))
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok())
                .or_else(|| {
                    e.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs())
                })
                .unwrap_or(0);
            v.push(InstalledVersion { name, size_mb: dir_size(&e.path()) / 1_048_576, installed_at: at });
        }
    }
    v.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    v
}

/// The version to launch: the pinned one if installed, else the newest.
pub fn current_name() -> Option<String> {
    let pin = cfg().lock().unwrap().pin.clone();
    let list = installed();
    if !pin.is_empty() && list.iter().any(|v| v.name == pin) {
        return Some(pin);
    }
    list.into_iter().next().map(|v| v.name)
}

/// Keeps the newest `keep` versions (at least 1) plus the pinned one and `also_keep`.
pub fn prune(keep: usize, also_keep: &str) -> usize {
    let pin = cfg().lock().unwrap().pin.clone();
    let mut removed = 0;
    for (i, v) in installed().into_iter().enumerate() {
        if i < keep.max(1) || v.name == pin || v.name == also_keep {
            continue;
        }
        if std::fs::remove_dir_all(version_dir(&v.name)).is_ok() {
            removed += 1;
        }
    }
    removed
}

pub fn remove(name: &str) -> Result<(), String> {
    let n = safe_name(name)?;
    std::fs::remove_dir_all(version_dir(n)).map_err(|e| e.to_string())
}

/* ------------------------------------------------------------------ */
/* Roblox CDN                                                          */
/* ------------------------------------------------------------------ */

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Clone, Debug, Serialize)]
pub struct Latest {
    /// `version-xxxxxxxxxxxxxxxx`: the folder / CDN name
    pub version: String,
    /// `0.746.0.7461267`: the human readable number
    pub number: String,
}

fn channel_path(channel: &str) -> Result<Option<String>, String> {
    let c = channel.trim().to_lowercase();
    if c.is_empty() || c == "live" || c == "zlive" {
        return Ok(None);
    }
    safe_name(&c)?;
    Ok(Some(c))
}

/// The newest Windows player for a channel (empty / "live" = production).
pub async fn latest(channel: &str) -> Result<Latest, String> {
    let url = match channel_path(channel)? {
        None => CLIENT_API.to_string(),
        Some(c) => format!("{CLIENT_API}/channel/{c}"),
    };
    let v: serde_json::Value = http()?.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let version = v.get("clientVersionUpload").and_then(|x| x.as_str()).ok_or("no version in the answer")?;
    safe_name(version)?;
    Ok(Latest { version: version.to_string(), number: v.get("version").and_then(|x| x.as_str()).unwrap_or("").to_string() })
}

#[derive(Clone, Debug)]
pub struct Package {
    pub name: String,
    pub md5: String,
    pub compressed: u64,
}

fn cdn_base(channel: &str, version: &str) -> Result<String, String> {
    safe_name(version)?;
    Ok(match channel_path(channel)? {
        None => format!("{CDN}/{version}-"),
        Some(c) => format!("{CDN}/channel/{c}/{version}-"),
    })
}

/// `v0`, then 4 lines per package: name, md5, compressed size, size.
pub fn parse_manifest(text: &str) -> Vec<Package> {
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    lines
        .get(1..)
        .unwrap_or(&[])
        .chunks(4)
        .filter(|c| c.len() == 4)
        .map(|c| Package { name: c[0].to_string(), md5: c[1].to_lowercase(), compressed: c[2].parse().unwrap_or(0) })
        .collect()
}

/// Where each package of the manifest goes inside the version folder. Unknown packages return None.
pub fn target_dir(package: &str) -> Option<&'static str> {
    Some(match package {
        "RobloxApp.zip" | "WebView2.zip" => "",
        "shaders.zip" => "shaders",
        "ssl.zip" => "ssl",
        "WebView2RuntimeInstaller.zip" => "WebView2RuntimeInstaller",
        "content-avatar.zip" => "content/avatar",
        "content-configs.zip" => "content/configs",
        "content-fonts.zip" => "content/fonts",
        "content-sky.zip" => "content/sky",
        "content-sounds.zip" => "content/sounds",
        "content-textures2.zip" => "content/textures",
        "content-models.zip" => "content/models",
        "content-textures3.zip" => "PlatformContent/pc/textures",
        "content-terrain.zip" => "PlatformContent/pc/terrain",
        "content-platform-fonts.zip" => "PlatformContent/pc/fonts",
        "content-platform-dictionaries.zip" => "PlatformContent/pc/shared_compression_dictionaries",
        "extracontent-luapackages.zip" => "ExtraContent/LuaPackages",
        "extracontent-translations.zip" => "ExtraContent/translations",
        "extracontent-models.zip" => "ExtraContent/models",
        "extracontent-textures.zip" => "ExtraContent/textures",
        "extracontent-places.zip" => "ExtraContent/places",
        _ => return None,
    })
}

#[derive(Clone, Debug, Serialize)]
pub struct Progress {
    /// "download" | "extract" | "finish"
    pub stage: String,
    pub done: u64,
    pub total: u64,
    pub item: String,
}

/// Unzips a package into `dest`. Entry names use Windows separators; paths that try to escape are refused.
fn extract(bytes: Vec<u8>, dest: &Path) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().replace('\\', "/");
        let name = name.trim_start_matches('/');
        if name.is_empty() || name.ends_with('/') {
            continue;
        }
        let rel = Path::new(name);
        if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
            return Err(format!("unsafe path in package: {name}"));
        }
        let out = dest.join(rel);
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut w).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn fetch_package(client: &reqwest::Client, url: &str, p: &Package, done: &AtomicU64, report: &(dyn Fn(Progress) + Send + Sync), total: u64) -> Result<Vec<u8>, String> {
    let mut last = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(2 * attempt)).await;
        }
        let mut got = 0u64;
        let res: Result<Vec<u8>, String> = async {
            let mut resp = client.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
            let mut buf: Vec<u8> = Vec::with_capacity(p.compressed as usize);
            while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
                buf.extend_from_slice(&chunk);
                got += chunk.len() as u64;
                let d = done.fetch_add(chunk.len() as u64, Ordering::Relaxed) + chunk.len() as u64;
                report(Progress { stage: "download".into(), done: d, total, item: p.name.clone() });
            }
            let sum = format!("{:x}", Md5::digest(&buf));
            if !p.md5.is_empty() && sum != p.md5 {
                return Err(format!("{}: checksum mismatch", p.name));
            }
            Ok(buf)
        }
        .await;
        match res {
            Ok(b) => return Ok(b),
            Err(e) => {
                last = e;
                done.fetch_sub(got, Ordering::Relaxed); // the retry counts these bytes again
            }
        }
    }
    Err(last)
}

/// Downloads, verifies and unpacks a version. Returns its folder. Does nothing if it is already installed.
pub async fn install<F>(version: &str, channel: &str, progress: F) -> Result<PathBuf, String>
where
    F: Fn(Progress) + Send + Sync + 'static,
{
    safe_name(version)?;
    let dest = version_dir(version);
    if exe_path(version).exists() {
        return Ok(dest);
    }
    let base = cdn_base(channel, version)?;
    let client = http()?;
    let text = client.get(format!("{base}rbxPkgManifest.txt")).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let pkgs: Vec<Package> = parse_manifest(&text).into_iter().filter(|p| p.name.ends_with(".zip") && target_dir(&p.name).is_some()).collect();
    if !pkgs.iter().any(|p| p.name == "RobloxApp.zip") {
        return Err("the package list has no RobloxApp.zip".into());
    }
    let total: u64 = pkgs.iter().map(|p| p.compressed).sum();

    let versions = versions_dir();
    std::fs::create_dir_all(&versions).map_err(|e| e.to_string())?;
    let tmp = versions.join(format!(".{version}.part"));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;

    let progress: Arc<dyn Fn(Progress) + Send + Sync> = Arc::new(progress);
    let done = Arc::new(AtomicU64::new(0));
    let sem = Arc::new(tokio::sync::Semaphore::new(4));
    let mut set = tokio::task::JoinSet::new();
    for p in pkgs {
        let (client, sem, done, progress, base, tmp) = (client.clone(), sem.clone(), done.clone(), progress.clone(), base.clone(), tmp.clone());
        set.spawn(async move {
            let _permit = sem.acquire_owned().await.map_err(|e| e.to_string())?;
            let bytes = fetch_package(&client, &format!("{base}{}", p.name), &p, &done, &*progress, total).await?;
            progress(Progress { stage: "extract".into(), done: done.load(Ordering::Relaxed), total, item: p.name.clone() });
            let target = tmp.join(target_dir(&p.name).unwrap_or(""));
            tokio::task::spawn_blocking(move || extract(bytes, &target)).await.map_err(|e| e.to_string())??;
            Ok::<(), String>(())
        });
    }
    while let Some(r) = set.join_next().await {
        if let Err(e) = r.map_err(|e| e.to_string()).and_then(|x| x) {
            set.abort_all();
            let _ = std::fs::remove_dir_all(&tmp);
            return Err(e);
        }
    }
    if !tmp.join("RobloxPlayerBeta.exe").exists() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err("RobloxPlayerBeta.exe is missing after the extraction".into());
    }
    std::fs::write(
        tmp.join("AppSettings.xml"),
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Settings>\n\t<ContentFolder>content</ContentFolder>\n\t<BaseUrl>http://www.roblox.com</BaseUrl>\n</Settings>\n",
    )
    .map_err(|e| e.to_string())?;
    // FFlags (ClientSettings) follow the user from one version to the next
    if let Some(prev) = installed().first() {
        let from = version_dir(&prev.name).join("ClientSettings");
        if from.exists() {
            let _ = copy_tree(&from, &tmp.join("ClientSettings"), false);
        }
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let _ = std::fs::write(tmp.join(".roaccount-installed"), now.to_string());
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    progress(Progress { stage: "finish".into(), done: total, total, item: version.to_string() });
    Ok(dest)
}

/* ------------------------------------------------------------------ */
/* Mods                                                                */
/* ------------------------------------------------------------------ */

fn blocked_ext(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("exe" | "dll" | "sys" | "bat" | "cmd" | "ps1" | "vbs" | "msi" | "scr" | "com" | "lnk" | "js")
    )
}

/// Copies `from` over `to`; with `only_safe` executables and scripts are skipped. Returns the number of files written.
fn copy_tree(from: &Path, to: &Path, only_safe: bool) -> Result<usize, String> {
    let mut n = 0;
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for e in std::fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
        let src = e.path();
        let dst = to.join(e.file_name());
        let md = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if md.is_dir() {
            n += copy_tree(&src, &dst, only_safe)?;
        } else if md.is_file() {
            if only_safe && blocked_ext(&src) {
                continue;
            }
            let same = std::fs::metadata(&dst).map(|d| d.len() == md.len() && d.modified().ok() >= md.modified().ok()).unwrap_or(false);
            if !same {
                std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
                n += 1;
            }
        }
    }
    Ok(n)
}

/// Overlays the files of the Mods folder (same layout as the version folder) onto a version. Executables are ignored.
pub fn apply_mods(version: &str) -> usize {
    let m = mods_dir();
    if !m.exists() {
        return 0;
    }
    copy_tree(&m, &version_dir(version), true).unwrap_or(0)
}

/* ------------------------------------------------------------------ */
/* Launching                                                           */
/* ------------------------------------------------------------------ */

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// `roblox-player:1+launchmode:play+gameinfo:T+…` → the command line of RobloxPlayerBeta.exe.
pub fn launch_args(uri: &str) -> Result<Vec<String>, String> {
    let body = uri.strip_prefix("roblox-player:").ok_or("not a roblox-player: link")?;
    let mut args: Vec<String> = Vec::new();
    for tok in body.split('+').skip(1) {
        let Some((k, v)) = tok.split_once(':') else { continue };
        if v.is_empty() {
            continue;
        }
        match k.to_lowercase().as_str() {
            "launchmode" => args.push(format!("--{v}")),
            "gameinfo" => { args.push("-t".into()); args.push(v.to_string()); }
            "placelauncherurl" => { args.push("-j".into()); args.push(pct_decode(v)); }
            "launchtime" => args.push(format!("--launchtime={v}")),
            "browsertrackerid" => { args.push("-b".into()); args.push(v.to_string()); }
            "robloxlocale" => { args.push("--rloc".into()); args.push(v.to_string()); }
            "gamelocale" => { args.push("--gloc".into()); args.push(v.to_string()); }
            "channel" => { args.push("-channel".into()); args.push(v.to_string()); }
            _ => {}
        }
    }
    if !args.iter().any(|a| a == "-t") || !args.iter().any(|a| a == "-j") {
        return Err("the launch link has no ticket or place".into());
    }
    Ok(args)
}

/// Starts the installed player with a `roblox-player:` link. Err when RoAccount's Roblox isn't installed.
pub fn launch_uri(uri: &str) -> Result<u32, String> {
    let name = current_name().ok_or("RoAccount's Roblox is not installed yet")?;
    let c = cfg().lock().unwrap().clone();
    if c.mods {
        apply_mods(&name);
    }
    let args = launch_args(uri)?;
    let dir = version_dir(&name);
    let mut cmd = std::process::Command::new(dir.join("RobloxPlayerBeta.exe"));
    cmd.args(args).current_dir(&dir);
    cmd.spawn().map(|c| c.id()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_and_mapping() {
        let t = "v0\nRobloxApp.zip\nabc\n10\n20\ncontent-avatar.zip\nDEF\n1\n2\nRobloxPlayerInstaller.exe\nzzz\n5\n5\n";
        let p = parse_manifest(t);
        assert_eq!(p.len(), 3);
        assert_eq!(p[1].md5, "def");
        assert_eq!(target_dir("content-textures3.zip"), Some("PlatformContent/pc/textures"));
        assert_eq!(target_dir("nope.zip"), None);
    }

    #[test]
    fn uri_to_args() {
        let uri = "roblox-player:1+launchmode:play+gameinfo:TICKET+launchtime:123+placelauncherurl:https%3A%2F%2Fassetgame.roblox.com%2Fgame%2FPlaceLauncher.ashx%3Frequest%3DRequestGame%26placeId%3D5+robloxLocale:en_us+gameLocale:en_us+channel:";
        let a = launch_args(uri).unwrap();
        assert_eq!(a[0], "--play");
        assert!(a.windows(2).any(|w| w == ["-t", "TICKET"]));
        assert!(a.windows(2).any(|w| w[0] == "-j" && w[1] == "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame&placeId=5"));
        assert!(a.contains(&"--launchtime=123".to_string()));
        assert!(!a.contains(&"-channel".to_string()));
        assert!(launch_args("https://x").is_err());
    }

    #[test]
    fn names_are_checked() {
        assert!(safe_name("version-f0ea5da9412f4e35").is_ok());
        assert!(safe_name("../evil").is_err());
        assert!(safe_name("").is_err());
    }
}

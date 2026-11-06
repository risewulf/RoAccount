<div align="center">

# RoAccount

**Local Roblox account manager for Windows.**
Encrypted vault, multi-client launching, private servers, macros — all on your machine.

[Website](https://roaccount.xyz) · [Discord](https://discord.gg/u6wWWSUz3G) · [Download](https://github.com/risewulf/RoAccount/releases/latest)

Tauri 2 · Rust · React

</div>

---

## Download

1. Go to the **[Releases](https://github.com/risewulf/RoAccount/releases/latest)** page.
2. Download **`RoAccount_x.y.z_x64-setup.exe`** and run it.
3. If Windows shows *"Windows protected your PC"* (SmartScreen), click **More info → Run anyway**. The app is not code-signed yet; the full source code is right here so you can check it.

> **Important:** close every Roblox client **before** starting RoAccount. Multi-client only works if RoAccount starts first.

## Features

| | |
|---|---|
| 🔐 **Encrypted vault** | Cookies are encrypted locally (Argon2id + AES-256-GCM) behind a master password. Nothing is ever stored in plain text. |
| 👥 **Live accounts** | Add an account with its cookie, it is validated against Roblox, then Robux / Premium / friends / presence / cookie status are shown. |
| 🚀 **Multi-client** | Run several Roblox clients at once, batch launch with an adjustable delay, "Kill all" button. |
| 🌐 **Different servers** | In a batch, every account in its own server: the same one, random, closest (lowest ping), or your own private server. |
| 🔑 **Private servers** | List, buy, rename, regenerate the link and enable/disable your private servers from the app. |
| ⭐ **MAIN account** | Mark the account you play on: it is left out of bulk actions and auto-rejoin. |
| 🧩 **AutoHotkey v2 macros** | Run your AHK scripts on your clients (the client PID is passed as `A_Args[1]`). |
| 🪟 **Monitor** | **Fit** / **Tiny** window layouts, per-client mute, process priority, close. |
| 🔔 **Discord alerts** | Webhook + @mention of your ID when a client crashes, disconnects or freezes. Auto-rejoin. |
| 💻 **For this PC** | Measures your CPU/RAM and suggests the right number of clients, delay and layout. |
| 🤝 **Make friends** | Your accounts send and accept friend requests between each other automatically. |
| 📦 **Import / export** | Import from Roblox Account Manager (JSON or text), export cookies. |
| 📰 **News** | Project news, right inside the app. |

> The app interface is currently in French.

## How multi-client works

Roblox only allows one client at a time through a Windows lock (a *mutex* named `ROBLOX_singletonEvent`). At startup, RoAccount creates that lock before Roblox does and keeps it open: clients see that it already exists and start anyway, side by side.
For each account, the app asks Roblox for a one-time **login ticket** (using the account's cookie), then opens the matching `roblox-player:` link: Windows starts the client already logged in.

Count roughly 1 to 1.5 GB of RAM per client.

## Security & usage

- Use it **only with accounts you own**.
- Cookies **stay on your machine**, encrypted in the vault. RoAccount only talks to the official `*.roblox.com` APIs (and to your Discord webhook if you set one).
- Never share your `.ROBLOSECURITY` cookie or your vault file.
- Cookie exports are plain text: store them carefully.
- Independent project, not affiliated with Roblox Corporation. Use at your own risk: Roblox's rules apply to your accounts.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org). *(Applied for — until it is approved, releases are unsigned and Windows shows "Unknown publisher".)*

- Only builds produced from this repository by the [GitHub Actions workflow](.github/workflows/release.yml) are submitted for signing. Nothing is built or signed locally.
- **Team roles:** author, reviewer and approver — [@risewulf](https://github.com/risewulf).
- Signing requests for releases are approved manually.

## Privacy policy

RoAccount does not collect, track or send any personal data to the author. It stores everything locally, and only contacts:

- the official `*.roblox.com` APIs, on your request (account checks, launching, servers, friends);
- `https://roaccount.xyz/news.json`, to display the News tab (a plain download, no data is sent);
- the Discord webhook you configure yourself, if any, to send your alerts.

This program will not transfer any other information to other networked systems unless specifically requested by the user or the person installing or operating it.

## Getting a cookie

In your browser, logged in to Roblox: developer tools → Application → Cookies → `roblox.com` → copy the value of `.ROBLOSECURITY`, then paste it in **Add account**.

## Development

**Requirements:** Node.js 20+, stable Rust, Visual Studio Build Tools ("Desktop development with C++" workload), WebView2.

```bash
npm install

# UI only, in the browser, with a mocked backend
npm run dev

# full app (front end + Rust backend)
npm run tauri dev

# build the installer (src-tauri/target/release/bundle/nsis/)
npm run tauri build
```

In the browser (`npm run dev`) the app runs on **sample data**: no real account, no launching.

### Publishing a release

The [`release.yml`](.github/workflows/release.yml) workflow builds the installer on GitHub Actions and publishes it to Releases:

```bash
# 1. bump the version in package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json
# 2. then:
git tag v0.2.0
git push origin v0.2.0
```

A manual run (*Actions → Build & Release → Run workflow*) produces a test build, available as an artifact.

## Project layout

```
roaccount/
├─ src/                      # React front end (views, components, typed bridge api.ts + mock)
│  ├─ styles/theme.css       # brand tokens (change the red here)
│  ├─ lib/ api.ts · types.ts
│  ├─ components/            # TopBar, Sidebar, AccountRow, AccountDetail…
│  └─ views/                 # Accounts, Launch, Monitor, Macros, Private servers, Tools, News…
└─ src-tauri/                # Rust backend
   └─ src/
      ├─ vault.rs            # encrypted vault
      ├─ roblox.rs           # Roblox API client (accounts, servers, friends, private servers)
      ├─ launch.rs           # launching through the authentication ticket
      ├─ singleton.rs        # multi-instance (Roblox mutex)
      ├─ winmgmt.rs          # windows, priority, mute (WASAPI), freeze detection
      ├─ macros.rs           # AutoHotkey v2 macros
      ├─ tools.rs            # For this PC, import/export, news
      ├─ background.rs       # auto-rejoin + alerts
      └─ commands.rs         # commands exposed to the UI
```

## License

[MIT](LICENSE) © Risewulf

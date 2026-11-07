import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { RobloxVersion, Settings } from "../lib/types";
import { Group, NumInput, Row, Seg, SettingsPage, Toggle } from "../components/Controls";
import { SHORTCUT_ACTIONS, bindingsOf, comboFromEvent, comboOf as bindingOf, validCombo } from "../lib/shortcuts";

/* ------------------------------------------------------------------ */
/* Lancement                                                            */
/* ------------------------------------------------------------------ */

/** Transforme un appui de touches en raccourci au format Tauri (ex. CommandOrControl+Shift+K). */
function comboOf(e: React.KeyboardEvent): string | null {
  const k = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return null;
  const mods = [e.ctrlKey || e.metaKey ? "CommandOrControl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
  if (!mods.length && !/^F\d{1,2}$/.test(k)) return null; // une touche seule gênerait la frappe normale
  const key = k.length === 1 ? k.toUpperCase() : k.replace("Arrow", "");
  return [...mods, key].join("+");
}

export function LancementSettings() {
  const store = useStore();
  const { settings: s } = store;
  const [ver, setVer] = useState<RobloxVersion | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [shut, setShut] = useState(false);
  const [mins, setMins] = useState(60);
  const set = (p: Partial<Settings>) => store.updateSettings(p);

  useEffect(() => { void api.robloxVersion().then(setVer).catch(() => setVer(null)); }, []);
  const outdated = !!(ver?.installed && ver?.latest && ver.installed !== ver.latest);

  return (
    <SettingsPage title="Launch">
      <Group>
        <Row title="Multi-instance" desc="One client per account, side by side. Applied the next time RoAccount starts." explain="RoAccount holds Roblox's lock (ROBLOX_singletonEvent) open before the first client. So close every Roblox client before starting RoAccount.">
          <Toggle on={s.multiInstance} label="Multi-instance" onChange={(v) => set({ multiInstance: v })} />
        </Row>
        <Row title="Launch delay" desc="The time between two clients in a batch. Longer is gentler on the PC.">
          <NumInput value={Math.round(s.cooldownMs / 1000)} onChange={(n) => set({ cooldownMs: n * 1000 })} min={0} max={120} width={80} /><span className="sub">s</span>
        </Row>
        <Row title="Wait for free RAM" desc="Before each client of a batch, wait until this much memory is free. 0 turns it off." explain="Handy with many accounts: RoAccount pauses the batch (up to 10 minutes per client) instead of starting a client that would push the PC into swap. Per-account extra delays are set in each account's Settings tab.">
          <NumInput value={s.queueMinFreeMb} onChange={(n) => set({ queueMinFreeMb: n })} min={0} max={32000} width={90} /><span className="sub">MB free</span>
        </Row>
        <Row title="Launch arguments" desc="Words added after each launch link." explain="Letters, digits and + : . _ - only. Leave empty if you don't know what it's for.">
          <input className="txt mono" style={{ width: 230 }} value={s.launchArgs} onChange={(e) => set({ launchArgs: e.target.value })} placeholder="none" aria-label="Launch arguments" />
        </Row>
        <Row title="Exclude MAIN from Select all" desc="The MAIN account stays out of selections and batches, unless you pick it yourself.">
          <Toggle on={s.excludeMainFromAll} label="Exclude MAIN" onChange={(v) => set({ excludeMainFromAll: v })} />
        </Row>
      </Group>

      <Group title="Recovery">
        <Row title="Auto-rejoin" desc="Relaunches to the same target a client that Roblox disconnects (kick, server closed, connection lost).">
          <Toggle on={s.autoRejoin} label="Auto-rejoin" onChange={(v) => set({ autoRejoin: v })} />
        </Row>
        <Row title="Auto-restart after a crash" desc="Relaunches a client that crashes or freezes.">
          <Toggle on={s.autoRestart} label="Auto-restart" onChange={(v) => set({ autoRestart: v })} />
        </Row>
        <Row title="Give up after" desc="RoAccount stops relaunching an account that fails too often.">
          <NumInput value={s.giveUpTries} onChange={(n) => set({ giveUpTries: n })} min={1} max={20} width={70} /><span className="sub">tries in</span>
          <NumInput value={s.giveUpMinutes} onChange={(n) => set({ giveUpMinutes: n })} min={1} max={240} width={70} /><span className="sub">min</span>
        </Row>
        <Row title="Anti-AFK" desc="Keeps idle clients from being kicked." explain="Uses a built-in AutoHotkey v2 macro (anti-AFK) run on each client. AutoHotkey v2 must be installed.">
          <Toggle on={s.antiAfk} label="Anti-AFK" onChange={(v) => set({ antiAfk: v })} />
        </Row>
      </Group>

      <Group title="Startup">
        <Row title="Start RoAccount with Windows" desc="The app starts by itself when you sign in." explain="Writes an entry to your Windows account startup (the user's Run key, no administrator rights). Turn the switch off to remove it. The vault stays locked: your master password is needed.">
          <Toggle on={s.startWithWindows} label="Start with Windows" onChange={(v) => { set({ startWithWindows: v }); void api.setAutostart(v, s.startMinimized).catch((e) => { store.toast(String(e)); set({ startWithWindows: !v }); }); }} />
        </Row>
        <Row title="Start minimized" desc="At Windows startup, RoAccount stays in the notification area." explain="Then open it from the notification area icon.">
          <Toggle on={s.startMinimized} label="Start minimized" onChange={(v) => { set({ startMinimized: v }); if (s.startWithWindows) void api.setAutostart(true, v).catch((e) => store.toast(String(e))); }} />
        </Row>
        <Row title="Profile launched at startup" desc="Automatically launches a profile a few seconds after RoAccount opens." explain="Profiles are created in Play. The vault must be unlocked for the launch to happen.">
          <select className="sort-select" value={s.autoLaunchProfile} onChange={(e) => set({ autoLaunchProfile: e.target.value })} aria-label="Startup profile">
            <option value="">None</option>
            {(s.profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row title="New Roblox version alert" desc="A message when Roblox ships a newer version than your clients'.">
          <Toggle on={s.robloxAlert} label="Roblox version alert" onChange={(v) => set({ robloxAlert: v })} />
        </Row>
      </Group>

      <Group title="Stop">
        <Row title="Emergency shortcut" desc="Stops all clients, from any app.">
          {s.emergencyHotkey && <span className="kbd">{s.emergencyHotkey.replace("CommandOrControl", "Ctrl")}</span>}
          <button
            className={"btn" + (capturing ? " on" : "")}
            onClick={() => setCapturing(true)}
            onKeyDown={(e) => {
              if (!capturing) return;
              e.preventDefault();
              if (e.key === "Escape") { setCapturing(false); return; }
              const c = comboOf(e);
              if (c) { set({ emergencyHotkey: c }); setCapturing(false); }
            }}
            onBlur={() => setCapturing(false)}
          >{capturing ? "Press the keys…" : s.emergencyHotkey ? "Changer" : "Set"}</button>
          {s.emergencyHotkey && <button className="btn" onClick={() => set({ emergencyHotkey: "" })}>Remove</button>}
        </Row>
        <Row title="Close delay" desc="The time a client that RoAccount closes gets to close by itself before being force-stopped.">
          <NumInput value={s.closeDelaySecs} onChange={(n) => set({ closeDelaySecs: n })} min={0} max={60} width={70} /><span className="sub">s</span>
        </Row>
        <Row title="Shut down the PC" desc="The Windows timer. It closes every app.">
          <button className="btn" onClick={() => setShut(true)}>Schedule…</button>
        </Row>
      </Group>

      <Group title="Roblox client">
        <Row
          title="Installed version"
          badge={ver && <span className={"ok-pill " + (outdated ? "warn" : "")} style={{ marginLeft: 8 }}><i />{outdated ? "outdated" : "up to date"}</span>}
          desc={ver ? (outdated ? `${ver.installed} · ${ver.latest} is out` : ver.installed ?? "Roblox is not installed") : "Checking…"}
          mono
        >
          <button className="btn" onClick={() => void api.openUrl("https://www.roblox.com/download").catch((e) => store.toast(String(e)))}>Update Roblox</button>
        </Row>
      </Group>

      {shut && (
        <div className="overlay" onClick={() => setShut(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Shut down the PC</h3>
            <p>Windows will shut the PC down after the chosen delay and close every app, without asking. Save your work first.</p>
            <div className="inline"><NumInput value={mins} onChange={setMins} min={1} max={1440} width={90} /><span className="sub">minutes</span></div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => void api.scheduleShutdown(0).then(() => { store.toast("Shutdown cancelled."); setShut(false); }).catch((e) => store.toast(String(e)))}>Cancel the schedule</button>
              <button className="btn primary" onClick={() => void api.scheduleShutdown(mins).then(() => { store.toast(`The PC will shut down in ${mins} min.`); setShut(false); }).catch((e) => store.toast(String(e)))}>Programmer</button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Apparence                                                            */
/* ------------------------------------------------------------------ */

const ACCENTS = ["#ff2d46", "#a3e635", "#ff3dbb", "#f9a8d4", "#ef5d3f", "#ff9f43", "#ffd23f", "#2dd4bf", "#4f8cff", "#a06cff"];

export function ApparenceSettings() {
  const store = useStore();
  const { settings: s } = store;
  const set = (p: Partial<Settings>) => store.updateSettings(p);
  return (
    <SettingsPage title="Appearance">
      <Group>
        <Row title="Theme" desc="System follows Windows (dark or light).">
          <Seg value={s.theme} onChange={(v) => set({ theme: v })} options={[{ v: "dark", label: "Dark" }, { v: "light", label: "Light" }, { v: "system", label: "System" }]} />
        </Row>
        <Row title="Accent colour" desc="Buttons, switches and highlights. Pick a preset or any colour.">
          <div className="accents">
            {ACCENTS.map((c) => (
              <button key={c} className={"acc-dot" + (s.accent.toLowerCase() === c ? " on" : "")} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={`Accent ${c}`} />
            ))}
            <span className="acc-add" title="Other colour">+<input type="color" value={/^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#ff2d46"} onChange={(e) => set({ accent: e.target.value })} aria-label="Custom colour" /></span>
          </div>
        </Row>
        <Row title="Density" desc="Row height in the account list.">
          <Seg value={s.density} onChange={(v) => set({ density: v })} options={[{ v: "detailed", label: "Detailed" }, { v: "compact", label: "Compact" }]} />
        </Row>
        <Row title="Tab layout" desc="Where to place accounts and RoAccount's sections.">
          <Seg value={s.tabLayout} onChange={(v) => set({ tabLayout: v })} options={[{ v: "top", label: "Accounts on top" }, { v: "side", label: "Accounts on the side" }]} />
        </Row>
        <Row title="Sound effects" desc="Subtle sounds for clicks, switches and notifications.">
          <Toggle on={s.sounds} label="Sound effects" onChange={(v) => set({ sounds: v })} />
        </Row>
        <Row title="Animations" desc="The interface transitions. “Reduced” shortens them to almost zero.">
          <Seg value={s.animations} onChange={(v) => set({ animations: v })} options={[{ v: "on", label: "On" }, { v: "reduced", label: "Reduced" }, { v: "off", label: "Off" }]} />
        </Row>
      </Group>
      <Group title="Window">
        <Row title="Minimize to the notification area" desc="Closing the window hides it; running clients and auto-rejoin keep working.">
          <Toggle on={s.closeToTray} label="Minimize to the notification area" onChange={(v) => set({ closeToTray: v })} />
        </Row>
      </Group>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Sécurité                                                             */
/* ------------------------------------------------------------------ */

export function SecuriteSettings() {
  const store = useStore();
  const { settings: s } = store;
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    if (newPw.length < 4) { setErr("Choose a password of at least 4 characters."); return; }
    setBusy(true); setErr("");
    try { await api.changePassword(oldPw, newPw); store.toast("Master password changed."); setOpen(false); setOldPw(""); setNewPw(""); }
    catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  return (
    <SettingsPage title="Security">
      <Group>
        <Row title="Cookie encryption" desc="AES-256-GCM with a key derived from your master password (Argon2id). Asked at startup and after auto-lock." explain="Cookies are never written in clear text on disk. Without your master password the vault is unreadable: there is no recovery code.">
          <span className="ok-pill"><i />Master password</span>
        </Row>
        <Row title="Master password" desc="Changing it only re-encrypts the key; cookies are not re-encrypted.">
          <button className="btn" onClick={() => setOpen(true)}>Change…</button>
        </Row>
        <Row title="Auto-lock after inactivity" desc="Locks the vault and wipes the key from memory.">
          <Seg mono value={s.autoLockMin} onChange={(v) => store.updateSettings({ autoLockMin: v })}
            options={[{ v: 0, label: "Off" }, { v: 5, label: "5 min" }, { v: 15, label: "15 min" }, { v: 30, label: "30 min" }, { v: 60, label: "60 min" }]} />
        </Row>
        <Row title="Clear the clipboard after copying a cookie" desc="0 to never empty it.">
          <NumInput value={s.clipboardClearSecs} onChange={(n) => store.updateSettings({ clipboardClearSecs: n })} min={0} max={600} width={80} /><span className="sub">s</span>
        </Row>
      </Group>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Change the master password</h3>
            <input className="txt" type="password" placeholder="Current password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoFocus style={{ marginBottom: 10 }} />
            <input className="txt" type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void change()} />
            <div className="lock-err" style={{ marginTop: 8 }}>{err}</div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={() => void change()}>{busy ? "…" : "Changer"}</button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Données                                                              */
/* ------------------------------------------------------------------ */

export function DonneesSettings() {
  const store = useStore();
  const { settings: s } = store;
  const [backups, setBackups] = useState<{ name: string; path: string }[] | null>(null);
  const t = (p: Promise<unknown>, ok: string) => p.then(() => store.toast(ok)).catch((e) => store.toast(String(e)));

  return (
    <SettingsPage title="Data">
      <Group>
        <Row title="Data folder" desc="%LOCALAPPDATA%\RoAccount" mono>
          <button className="btn" onClick={() => void api.openPath("data").catch((e) => store.toast(String(e)))}>Open</button>
          <button className="btn" onClick={() => void api.openPath("exports").catch((e) => store.toast(String(e)))}>Open exports</button>
        </Row>
        <Row title="Backup file" desc="A single file encrypted by your master password, with every account, its cookie and its groups.">
          <button className="btn" onClick={() => void api.listBackups().then(setBackups).catch((e) => store.toast(String(e)))}>Import…</button>
          <button className="btn" onClick={() => void api.exportBackup().then((p) => store.toast("Backup: " + p)).catch((e) => store.toast(String(e)))}>Export…</button>
        </Row>
        <Row title="Automatic backup" desc="Copies the encrypted vault to the backups folder every time RoAccount closes. Only changed vaults are copied.">
          {s.autoBackup && (<><span className="sub">keep</span><NumInput value={s.autoBackupKeep} onChange={(n) => store.updateSettings({ autoBackupKeep: n })} min={1} max={50} width={70} /></>)}
          <Toggle on={s.autoBackup} label="Automatic backup" onChange={(v) => store.updateSettings({ autoBackup: v })} />
        </Row>
        <Row title="Keep account info for" desc="How long before Robux, presence and game are refreshed automatically.">
          <NumInput value={s.accountCacheMin} onChange={(n) => store.updateSettings({ accountCacheMin: n })} min={1} max={120} width={80} /><span className="sub">min</span>
        </Row>
        <Row title="Clean Roblox logs" desc="Deletes Roblox's log files, which grow with several clients." explain="“Clean” deletes them right away; the switch also deletes them at every RoAccount startup.">
          <button className="btn" onClick={() => void api.cleanRobloxLogs().then((n) => store.toast(`${n} file(s) deleted.`)).catch((e) => store.toast(String(e)))}>Clean</button>
          <Toggle on={s.cleanRobloxLogs} label="Clean at every startup" onChange={(v) => store.updateSettings({ cleanRobloxLogs: v })} />
        </Row>
        <Row title="Empty the Roblox cache" desc="Deletes Roblox's downloads and temporary files. It re-downloads them when needed." explain="Close your clients first: files they use are skipped. The next launch may take a little longer.">
          <button className="btn" onClick={() => void api.cleanRobloxCache(true).then((n) => { if (window.confirm(`Free about ${(n / 1048576).toFixed(0)} MB?`)) return api.cleanRobloxCache(false).then((f) => store.toast(`${(f / 1048576).toFixed(0)} MB freed.`)); }).catch((e) => store.toast(String(e)))}>Measure and empty</button>
        </Row>
      </Group>

      {backups && (
        <div className="overlay" onClick={() => setBackups(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Import a backup</h3>
            <p>Choose a backup from the folder <code>backups</code>. It replaces the current vault.</p>
            {backups.length === 0 && <div className="placeholder">No backup found. Export one first.</div>}
            {backups.map((b) => (
              <button key={b.path} className="pop-item" onClick={() => void t(api.importBackup(b.path).then(() => store.reload()), "Backup imported.").then(() => setBackups(null))}>{b.name}</button>
            ))}
            <div className="dialog-actions"><button className="btn" onClick={() => setBackups(null)}>Close</button></div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* About                                                             */
/* ------------------------------------------------------------------ */

export function AProposSettings() {
  const store = useStore();
  const open = (u: string) => void api.openUrl(u).catch((e) => store.toast(String(e)));
  return (
    <SettingsPage title="About">
      <Group>
        <Row title="Check for RoAccount updates" desc="Opens the releases page: download the latest installer if a new version is out.">
          <button className="btn" onClick={() => open("https://github.com/risewulf/RoAccount/releases/latest")}>Check</button>
        </Row>
        <Row title={`RoAccount ${__APP_VERSION__}`} desc="What RoAccount connects to, and what it changes." explain="It talks to the official *.roblox.com APIs, downloads roaccount.xyz/news.json for the news, and posts to your Discord webhook if you set one. It writes to its own data folder and to Roblox's ClientAppSettings.json (graphics settings), and keeps the multi-instance lock open.">
          <button className="btn" onClick={() => open("https://github.com/risewulf/RoAccount/releases")}>Open the releases page</button>
        </Row>
        <Row title="Support RoAccount">
          <button className="btn" onClick={() => open("https://discord.gg/u6wWWSUz3G")}>Join our Discord</button>
          <button className="btn" onClick={() => open("https://github.com/risewulf/RoAccount")}>Source code</button>
        </Row>
      </Group>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Raccourcis                                                           */
/* ------------------------------------------------------------------ */

const FIXED: [string, string[]][] = [
  ["Remove the selection", ["Delete"]],
  ["Close the dialog, clear the selection", ["Esc"]],
  ["Show shortcuts", ["?"]],
];

export function RaccourcisSettings() {
  const store = useStore();
  const custom = store.settings.shortcuts ?? {};
  const [rec, setRec] = useState<string | null>(null);

  // while recording, the next key combination becomes the new shortcut
  useEffect(() => {
    if (!rec) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRec(null); return; }
      const c = comboFromEvent(e);
      if (!c) return;
      if (!validCombo(c)) { store.toast("Use Ctrl, Alt or Shift with a key, or a function key."); return; }
      const clash = bindingsOf(custom).get(c);
      if (clash && clash.id !== rec) { store.toast(`Already used by “${clash.label}”.`); return; }
      store.updateSettings({ shortcuts: { ...custom, [rec]: c } });
      setRec(null);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }); // eslint-disable-line

  const reset = (id: string) => { const n = { ...custom }; delete n[id]; store.updateSettings({ shortcuts: n }); };
  const Row2 = ({ id }: { id: string }) => {
    const a = SHORTCUT_ACTIONS.find((x) => x.id === id)!;
    const c = bindingOf(custom, a);
    return (
      <div className="kb-row">
        <span>{a.label}</span>
        <span className="kbs">
          {rec === id ? <span className="sub">Press the keys…</span> : c.split("+").map((x) => <span key={x} className="kbd">{x}</span>)}
          <button className="btn sm" onClick={() => setRec(rec === id ? null : id)}>{rec === id ? "Cancel" : "Change"}</button>
          {custom[id] && <button className="btn sm" onClick={() => reset(id)} title={`Back to ${a.def}`}>Reset</button>}
        </span>
      </div>
    );
  };
  const nav = SHORTCUT_ACTIONS.filter((a) => a.id.startsWith("go:"));
  const other = SHORTCUT_ACTIONS.filter((a) => !a.id.startsWith("go:"));
  return (
    <SettingsPage title="Shortcuts">
      <div className="card">
        <div className="kb-grid">
          <div>{nav.map((a) => <Row2 key={a.id} id={a.id} />)}</div>
          <div>
            {other.map((a) => <Row2 key={a.id} id={a.id} />)}
            {FIXED.map(([t, k]) => (<div className="kb-row" key={t}><span>{t}</span><span className="kbs">{k.map((x) => <span key={x} className="kbd">{x}</span>)}</span></div>))}
          </div>
        </div>
      </div>
    </SettingsPage>
  );
}

import { useState } from "react";
import { api } from "../lib/api";
import { IconLock, IconEye, IconMoon, IconSun } from "../components/icons";
import { BrandMark } from "../components/Brand";
import { WindowControls } from "../components/Shell";

export function LockScreen({
  exists, count, onUnlocked, theme, onTheme,
}: { exists: boolean; count: number; onUnlocked: () => void; theme: "dark" | "light"; onTheme: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function submit() {
    if (!password) { setErr("Enter your password."); return; }
    setBusy(true); setErr("");
    try {
      if (exists) await api.unlockVault(password);
      else await api.createVault(password);
      onUnlocked();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="lock">
      <header className="titlebar" data-tauri-drag-region style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="tb-left" data-tauri-drag-region>
          <span className="brand-btn"><BrandMark size={24} /><span>Ro<b>Account</b></span></span>
        </div>
        <div className="tb-right" data-tauri-drag-region>
          <button className="tb-ghost" onClick={onTheme} aria-label="Theme" title="Light / dark theme">{theme === "dark" ? <IconSun /> : <IconMoon />}</button>
          <WindowControls />
        </div>
      </header>
      <div className="lock-body">
        <div className="lock-card">
          <IconLock className="lk" />
          <h1>{exists ? "Vault locked" : "Create your vault"}</h1>
          <p>
            {exists
              ? `Locked. Enter your master password to access ${count > 0 ? `your ${count} accounts` : "your accounts"}.`
              : "Choose a master password: it encrypts all your cookies on this PC."}
          </p>
          <label htmlFor="pw">Master password</label>
          <div className="field">
            <input id="pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} autoFocus aria-label="Master password" />
            <button onClick={() => setShow((s) => !s)} aria-label="Show password" style={{ display: "grid", placeItems: "center" }}><IconEye /></button>
          </div>
          <div className="lock-err">{err}</div>
          <button className="btn solid" onClick={() => void submit()} disabled={busy}>{busy ? "…" : exists ? "Unlock" : "Create the vault"}</button>
          {exists && <button className="forgot link-btn" style={{ textDecoration: "none", color: "var(--fg)" }} onClick={() => setForgot((f) => !f)}>Forgot your password?</button>}
          {forgot && <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>There is no recovery: cookies are encrypted with this password. You can start over by deleting the folder <code>%LOCALAPPDATA%\RoAccount</code>, then adding your accounts again.</p>}
          <div className="fine">Nothing leaves this PC.</div>
        </div>
      </div>
    </div>
  );
}


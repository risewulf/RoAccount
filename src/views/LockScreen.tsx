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
    if (!password) { setErr("Entre ton mot de passe."); return; }
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
          <button className="tb-ghost" onClick={onTheme} aria-label="Thème" title="Thème clair / sombre">{theme === "dark" ? <IconSun /> : <IconMoon />}</button>
          <WindowControls />
        </div>
      </header>
      <div className="lock-body">
        <div className="lock-card">
          <IconLock className="lk" />
          <h1>{exists ? "Coffre verrouillé" : "Crée ton coffre"}</h1>
          <p>
            {exists
              ? `Verrouillé. Saisis ton mot de passe maître pour accéder à ${count > 0 ? `tes ${count} comptes` : "tes comptes"}.`
              : "Choisis un mot de passe maître : il chiffre tous tes cookies sur ce PC."}
          </p>
          <label htmlFor="pw">Mot de passe maître</label>
          <div className="field">
            <input id="pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} autoFocus aria-label="Mot de passe maître" />
            <button onClick={() => setShow((s) => !s)} aria-label="Afficher le mot de passe" style={{ display: "grid", placeItems: "center" }}><IconEye /></button>
          </div>
          <div className="lock-err">{err}</div>
          <button className="btn solid" onClick={() => void submit()} disabled={busy}>{busy ? "…" : exists ? "Déverrouiller" : "Créer le coffre"}</button>
          {exists && <button className="forgot link-btn" style={{ textDecoration: "none", color: "var(--fg)" }} onClick={() => setForgot((f) => !f)}>Mot de passe oublié ?</button>}
          {forgot && <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>Il n'existe pas de récupération : les cookies sont chiffrés avec ce mot de passe. Tu peux repartir de zéro en supprimant le dossier <code>%LOCALAPPDATA%\RoAccount</code>, puis en réajoutant tes comptes.</p>}
          <div className="fine">Rien ne quitte ce PC.</div>
        </div>
      </div>
    </div>
  );
}


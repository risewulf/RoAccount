import { useState } from "react";
import { BrandMark } from "../components/Brand";
import { api } from "../lib/api";
import { IconLock } from "../components/icons";

export function LockScreen({
  exists,
  onUnlocked,
}: {
  exists: boolean;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!password) { setErr("Entre ton mot de passe."); return; }
    setBusy(true); setErr("");
    try {
      if (exists) await api.unlockVault(password);
      else await api.createVault(password);
      onUnlocked();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lock">
      <div className="lock-card">
        <BrandMark size={48} />
        <h1>Ro<b>Account</b></h1>
        <p>{exists ? "Déverrouille ton coffre pour continuer." : "Choisis un mot de passe maître pour créer ton coffre."}</p>

        <label className="field">
          <IconLock />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={exists ? "Mot de passe maître" : "Nouveau mot de passe maître"}
            autoFocus
          />
        </label>

        <div className="lock-err">{err}</div>

        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "…" : exists ? "Déverrouiller" : "Créer le coffre"}
        </button>
      </div>
    </div>
  );
}

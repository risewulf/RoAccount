import { useState } from "react";
import { api } from "../lib/api";
import type { AccountMeta } from "../lib/types";
import { IconBolt, IconKey, IconX } from "./icons";

type Mode = "auto" | "cookie";

export function AddAccountDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (meta: AccountMeta) => void;
}) {
  const [mode, setMode] = useState<Mode>("auto");
  const [cookie, setCookie] = useState("");
  const [group, setGroup] = useState("Sans groupe");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showTuto, setShowTuto] = useState(false);

  async function loginAuto() {
    setBusy(true); setErr("");
    try {
      const meta = await api.loginRoblox(group.trim() || "Sans groupe");
      onAdded(meta); onClose();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function addCookie() {
    if (!cookie.trim()) { setErr("Colle un cookie .ROBLOSECURITY."); return; }
    setBusy(true); setErr("");
    try {
      const meta = await api.addAccount(cookie.trim(), group.trim() || "Sans groupe");
      onAdded(meta); onClose();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Ajouter un compte</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><IconX /></button>
        </div>

        <div className="tabs">
          <button className={"tab" + (mode === "auto" ? " on" : "")} onClick={() => { setMode("auto"); setErr(""); }}>
            <IconBolt />Connexion Roblox
          </button>
          <button className={"tab" + (mode === "cookie" ? " on" : "")} onClick={() => { setMode("cookie"); setErr(""); }}>
            <IconKey />Coller un cookie
          </button>
        </div>

        <label className="field" style={{ margin: "14px 0" }}>
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Groupe (Main, Alts, Farm…)" />
        </label>

        {mode === "auto" ? (
          <>
            <p className="hint">
              Ouvre une fenêtre de connexion Roblox officielle. Connecte-toi normalement —
              RoAccount récupère le cookie <code>.ROBLOSECURITY</code> tout seul, sans copier-coller,
              et le chiffre dans le coffre. Rien ne transite ailleurs que par Roblox.
            </p>
            {err && <div className="lock-err" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
              <button className="btn primary" onClick={loginAuto} disabled={busy}>
                {busy ? "En attente de connexion…" : "Se connecter à Roblox"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Colle le cookie <code>.ROBLOSECURITY</code> d'un compte que tu possèdes.{" "}
              <button className="link-btn" onClick={() => setShowTuto((v) => !v)}>
                {showTuto ? "Masquer le tuto" : "Comment l'obtenir ?"}
              </button>
            </p>

            {showTuto && (
              <ol className="tuto">
                <li>Ouvre <b>roblox.com</b> dans ton navigateur et connecte-toi au compte voulu.</li>
                <li>Appuie sur <b>F12</b> pour ouvrir les outils développeur.</li>
                <li>Onglet <b>Application</b> (Chrome) ou <b>Stockage</b> (Firefox) → <b>Cookies</b> → <b>https://www.roblox.com</b>.</li>
                <li>Trouve la ligne <code>.ROBLOSECURITY</code>, copie toute sa <b>valeur</b>.</li>
                <li>Colle-la ci-dessous. Elle ne quitte jamais ta machine.</li>
              </ol>
            )}

            <textarea
              placeholder="_|WARNING:-DO-NOT-SHARE-THIS...|_..."
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              spellCheck={false}
            />
            {err && <div className="lock-err" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
              <button className="btn primary" onClick={addCookie} disabled={busy}>
                {busy ? "Validation…" : "Ajouter"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

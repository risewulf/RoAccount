import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { AccountMeta } from "../lib/types";
import { IconX } from "./icons";

export function RevealCookieModal({ account, onClose }: { account: AccountMeta; onClose: () => void }) {
  const { settings } = useStore();
  const [revealed, setRevealed] = useState(false);
  const [cookie, setCookie] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setBusy(true); setErr("");
    try {
      setCookie(await api.revealCookie(account.id));
      setRevealed(true);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function copy() {
    if (!cookie) return;
    try {
      await navigator.clipboard.writeText(cookie);
      // vide le presse-papiers après le délai réglé (Sécurité)
      if (settings.clipboardClearSecs > 0) {
        window.setTimeout(() => { void navigator.clipboard.writeText("").catch(() => {}); }, settings.clipboardClearSecs * 1000);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Copie refusée — sélectionne le texte manuellement.");
    }
  }

  const masked = cookie ? cookie.slice(0, 12) + "•".repeat(24) + cookie.slice(-6) : "";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Cookie de {account.username}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><IconX /></button>
        </div>

        {!revealed ? (
          <>
            <p>Le cookie <code>.ROBLOSECURITY</code> donne un accès complet au compte. Ne le partage jamais. Révéler&nbsp;?</p>
            {err && <div className="lock-err" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={onClose}>Annuler</button>
              <button className="btn primary" onClick={reveal} disabled={busy}>{busy ? "…" : "Révéler"}</button>
            </div>
          </>
        ) : (
          <>
            <textarea readOnly value={show ? (cookie ?? "") : masked} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
            {err && <div className="lock-err" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShow((v) => !v)}>{show ? "Masquer" : "Afficher"}</button>
              <button className="btn" onClick={copy}>{copied ? "Copié ✓" : "Copier"}</button>
              <button className="btn primary" onClick={onClose}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

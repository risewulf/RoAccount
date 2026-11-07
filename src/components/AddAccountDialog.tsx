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
  const [group, setGroup] = useState("No group");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showTuto, setShowTuto] = useState(false);

  async function loginAuto() {
    setBusy(true); setErr("");
    try {
      const meta = await api.loginRoblox(group.trim() || "No group");
      onAdded(meta); onClose();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function addCookie() {
    if (!cookie.trim()) { setErr("Paste a .ROBLOSECURITY cookie."); return; }
    setBusy(true); setErr("");
    try {
      const meta = await api.addAccount(cookie.trim(), group.trim() || "No group");
      onAdded(meta); onClose();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Add account</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>

        <div className="tabs">
          <button className={"tab" + (mode === "auto" ? " on" : "")} onClick={() => { setMode("auto"); setErr(""); }}>
            <IconBolt />Roblox login
          </button>
          <button className={"tab" + (mode === "cookie" ? " on" : "")} onClick={() => { setMode("cookie"); setErr(""); }}>
            <IconKey />Paste a cookie
          </button>
        </div>

        <label className="field" style={{ margin: "14px 0" }}>
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group (Main, Alts, Farm…)" />
        </label>

        {mode === "auto" ? (
          <>
            <p className="hint">
              Opens the official Roblox sign-in window. Sign in as usual —
              RoAccount picks up the <code>.ROBLOSECURITY</code> cookie by itself, no copy-paste,
              and encrypts it in the vault. Nothing goes anywhere except to Roblox.
            </p>
            {err && <div className="lock-err" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={loginAuto} disabled={busy}>
                {busy ? "Waiting for sign-in…" : "Sign in to Roblox"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Paste the <code>.ROBLOSECURITY</code> cookie of an account you own.{" "}
              <button className="link-btn" onClick={() => setShowTuto((v) => !v)}>
                {showTuto ? "Hide the guide" : "How do I get it?"}
              </button>
            </p>

            {showTuto && (
              <ol className="tuto">
                <li>Open <b>roblox.com</b> in your browser and sign in to the account you want.</li>
                <li>Press <b>F12</b> to open the developer tools.</li>
                <li>Tab <b>Application</b> (Chrome) or <b>Storage</b> (Firefox) → <b>Cookies</b> → <b>https://www.roblox.com</b>.</li>
                <li>Find the row <code>.ROBLOSECURITY</code>, copy its whole <b>value</b>.</li>
                <li>Paste it below. It never leaves your machine.</li>
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
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={addCookie} disabled={busy}>
                {busy ? "Validating…" : "Add"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

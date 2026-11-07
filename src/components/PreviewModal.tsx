import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { IconX } from "./icons";

export function PreviewModal({ pid, onClose }: { pid: number; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function capture() {
    setLoading(true); setErr("");
    try { setImg(await api.captureWindow(pid)); }
    catch (e) { setErr(String(e)); setImg(null); } finally { setLoading(false); }
  }

  useEffect(() => { void capture(); /* eslint-disable-next-line */ }, [pid]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog preview-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3>Preview — PID {pid}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>

        {loading ? (
          <div className="placeholder">Capturing…</div>
        ) : err ? (
          <div className="lock-err" style={{ textAlign: "center", padding: "16px 0" }}>{err}</div>
        ) : img ? (
          <img src={img} alt="Screenshot of the Roblox window" className="preview-img" />
        ) : null}

        <div className="dialog-actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={capture} disabled={loading}>Recapture</button>
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

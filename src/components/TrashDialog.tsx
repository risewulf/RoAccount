import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { TrashItem } from "../lib/types";
import { IconTrash } from "./icons";

function ago(t: number): string {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

/** Accounts removed in the last 7 days: restore them or delete them for good. */
export function TrashDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const load = () => api.listTrash().then(setItems).catch((e) => store.toast(String(e)));
  useEffect(() => { void load(); }, []); // eslint-disable-line

  async function restore(id: string) {
    try { const m = await api.restoreAccount(id); store.addAccount(m); store.toast(`${m.username} restored.`); await load(); }
    catch (e) { store.toast(String(e)); }
  }
  async function purge(id?: string) {
    try { await api.purgeTrash(id); store.toast(id ? "Deleted for good." : "Trash emptied."); await load(); }
    catch (e) { store.toast(String(e)); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 420 }}>
        <h3 style={{ display: "flex", gap: 8, alignItems: "center" }}><IconTrash style={{ width: 18, height: 18 }} />Trash</h3>
        <p className="sub" style={{ marginTop: 0 }}>Removed accounts stay here, encrypted, for 7 days. After that they are gone.</p>
        {items === null && <div className="placeholder">Loading…</div>}
        {items && items.length === 0 && <div className="placeholder">The trash is empty.</div>}
        {items && items.map((t) => (
          <div className="sched" key={t.id}>
            <div className="t"><b>{t.display_name || t.username}</b><span>@{t.username} · removed {ago(t.deleted_at)}</span></div>
            <button className="btn sm" onClick={() => void restore(t.id)}>Restore</button>
            <button className="btn sm danger" onClick={() => void purge(t.id)}>Delete</button>
          </div>
        ))}
        <div className="dialog-actions">
          {items && items.length > 0 && <button className="btn danger" onClick={() => void purge()}>Empty the trash</button>}
          <button className="btn solid" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

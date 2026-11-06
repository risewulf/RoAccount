import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { ProcInfo } from "../lib/types";
import { IconRefresh, IconVolume, IconVolumeOff } from "../components/icons";
import { PreviewModal } from "../components/PreviewModal";

export function MonitorView() {
  const store = useStore();
  const [procs, setProcs] = useState<ProcInfo[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  async function load() {
    try { setProcs(await api.monitorProcesses()); }
    catch (e) { store.toast(String(e)); }
  }

  async function arrange() {
    try {
      await api.arrangeWindows(store.settings.windowLayout);
      store.toast(store.settings.windowLayout === "tiny" ? "Fenêtres réduites en vignettes." : "Fenêtres ajustées à l'écran.");
    }
    catch (e) { store.toast(String(e)); }
  }

  async function mute(pid: number | null, on: boolean) {
    try {
      const n = await api.setMute(pid, on);
      store.toast(n ? (on ? "Son coupé." : "Son rétabli.") : "Aucune session audio trouvée (le client n'a peut-être pas encore de son).");
    } catch (e) { store.toast(String(e)); }
  }

  async function setPriority(pid: number, level: string) {
    try { await api.setPriority(pid, level); store.toast("Priorité mise à jour."); }
    catch (e) { store.toast(String(e)); }
  }

  useEffect(() => {
    void load();
    timer.current = window.setInterval(load, 4000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalMem = procs.reduce((s, p) => s + p.memory_mb, 0);

  return (
    <section>
      <div className="vhead">
        <div><h1>Monitor</h1><p>Clients Roblox en cours sur ta machine.</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="sort-select" value={store.settings.windowLayout} onChange={(e) => store.updateSettings({ windowLayout: e.target.value as "fit" | "tiny" })} aria-label="Disposition">
            <option value="fit">Disposition : Fit (plein écran)</option>
            <option value="tiny">Disposition : Tiny (vignettes)</option>
          </select>
          <button className="btn" onClick={arrange} disabled={!procs.length}>Arranger les fenêtres</button>
          <button className="btn" onClick={() => mute(null, true)} disabled={!procs.length} title="Couper le son de tous les clients"><IconVolumeOff />Muet</button>
          <button className="btn" onClick={() => mute(null, false)} disabled={!procs.length} title="Rétablir le son"><IconVolume />Son</button>
          <button className="btn" onClick={load}><IconRefresh />Rafraîchir</button>
        </div>
      </div>

      <div className="totals">
        <div className="tot"><div className="k">Clients actifs</div><div className="v">{procs.length}</div></div>
        <div className="tot"><div className="k">Mémoire totale</div><div className="v">{(totalMem / 1024).toFixed(1)} Go</div></div>
        <div className="tot"><div className="k">Mémoire moy. / client</div><div className="v">{procs.length ? Math.round(totalMem / procs.length) : 0} Mo</div></div>
      </div>

      {procs.length === 0 ? (
        <div className="placeholder">Aucun client Roblox en cours. Lance un compte pour le voir ici.</div>
      ) : (
        <div className="mon-grid">
          {procs.map((p) => (
            <div className="mon" key={p.pid}>
              <div className="mh">
                <span className="proc-dot" />
                <b>RobloxPlayerBeta</b>
                <span className="up">PID {p.pid}</span>
              </div>
              <div className="gauge">
                <div className="gl"><span>Mémoire</span><b>{p.memory_mb.toLocaleString("fr-FR")} Mo</b></div>
                <div className="bar"><i style={{ width: Math.min(100, (p.memory_mb / 2048) * 100) + "%" }} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => setPreview(p.pid)}>Aperçu</button>
                <button className="btn" onClick={() => mute(p.pid, true)} title="Couper le son de ce client" aria-label="Muet"><IconVolumeOff /></button>
                <button className="btn" onClick={() => mute(p.pid, false)} title="Rétablir le son de ce client" aria-label="Son"><IconVolume /></button>
                <select className="sort-select" style={{ flexBasis: "100%" }} defaultValue="normal" onChange={(e) => setPriority(p.pid, e.target.value)} aria-label="Priorité">
                  <option value="normal">Priorité normale</option>
                  <option value="below">Priorité basse</option>
                  <option value="idle">Priorité veille</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview !== null && <PreviewModal pid={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

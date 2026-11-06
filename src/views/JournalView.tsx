import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { LogEntry } from "../lib/types";

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  launch: { label: "Lancement", color: "var(--ok)" },
  follow: { label: "Rejoindre", color: "var(--info)" },
  rejoin: { label: "Reconnexion", color: "var(--warn)" },
  crash: { label: "Abandon", color: "var(--crit)" },
  stop: { label: "Arrêt", color: "var(--faint)" },
};

export function JournalView() {
  const store = useStore();
  const [log, setLog] = useState<LogEntry[]>([]);
  const timer = useRef<number | null>(null);

  async function load() {
    try { setLog(await api.getLog()); } catch { /* ignore */ }
  }

  useEffect(() => {
    void load();
    timer.current = window.setInterval(load, 4000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function clear() {
    try { await api.clearLog(); setLog([]); store.toast("Journal vidé."); }
    catch (e) { store.toast(String(e)); }
  }

  const fmtTime = (t: number) => new Date(t * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <section>
      <div className="vhead">
        <div><h1>Journal</h1><p>Historique des lancements, reconnexions et arrêts.</p></div>
        <button className="btn" onClick={clear} disabled={!log.length}>Vider</button>
      </div>

      {log.length === 0 ? (
        <div className="placeholder">Aucune activité pour l'instant.</div>
      ) : (
        <div className="card" style={{ padding: "6px 16px" }}>
          {log.map((e, i) => {
            const meta = KIND_LABEL[e.kind] ?? { label: e.kind, color: "var(--muted)" };
            return (
              <div className="log-row" key={i}>
                <span className="log-time">{fmtTime(e.time)}</span>
                <span className="log-kind" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
                <span className="log-msg">{e.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

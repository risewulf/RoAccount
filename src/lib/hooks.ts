import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Metrics } from "./types";

export interface MetricHistory { cpu: number[]; mem: number[]; clients: number[]; io: number[]; commit: number[] }

const EMPTY: MetricHistory = { cpu: [], mem: [], clients: [], io: [], commit: [] };

/** Interroge les mesures (CPU/mémoire/clients) à intervalle régulier et garde un historique. */
export function useMetrics(intervalMs = 2000, enabled = true) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<MetricHistory>(EMPTY);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    let t: number | undefined;
    const push = (a: number[], v: number) => [...a, v].slice(-40);
    const loop = async () => {
      try {
        const m = await api.clientMetrics();
        if (!alive.current) return;
        setMetrics(m);
        const mem = m.clients.reduce((s, c) => s + c.memory_mb, 0);
        const commit = m.clients.reduce((s, c) => s + c.commit_mb, 0);
        const cpu = m.clients.reduce((s, c) => s + c.cpu, 0);
        const io = m.clients.reduce((s, c) => s + c.read_kbps + c.write_kbps, 0);
        setHistory((h) => ({
          cpu: push(h.cpu, cpu), mem: push(h.mem, mem), clients: push(h.clients, m.clients.length),
          io: push(h.io, io), commit: push(h.commit, commit),
        }));
      } catch { /* ignore */ }
      if (alive.current) t = window.setTimeout(loop, intervalMs);
    };
    void loop();
    return () => { alive.current = false; if (t) window.clearTimeout(t); };
  }, [intervalMs, enabled]);

  return { metrics, history };
}

/** Capture d'écran régulière d'un client (aperçu en direct). */
export function usePreview(pid: number | null, fps: number, enabled: boolean) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || pid == null) { setImg(null); return; }
    let stop = false;
    let t: number | undefined;
    // une capture PNG est lourde : on plafonne à ~2 images/s quel que soit le réglage
    const every = Math.max(500, Math.round(1000 / Math.max(1, fps)));
    const loop = async () => {
      try { const s = await api.captureWindow(pid); if (!stop) setImg(s); } catch { if (!stop) setImg(null); }
      if (!stop) t = window.setTimeout(loop, every);
    };
    void loop();
    return () => { stop = true; if (t) window.clearTimeout(t); };
  }, [pid, fps, enabled]);
  return img;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { clearDebug, getDebugLines, subscribeDebug } from "../lib/debuglog";
import { copyText } from "../lib/ui";
import { IconCopy, IconSearch } from "../components/icons";

type Lv = "error" | "warn" | "info" | "debug";
interface Line { t: number; lv: Lv; src: string; msg: string; }

const LV_LABEL: Record<Lv, string> = { error: "Erreurs", warn: "Avertissements", info: "Infos", debug: "Debug" };
const KIND_LV: Record<string, Lv> = { crash: "error", rejoin: "warn", stop: "warn" };

function stamp(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function DebugView() {
  const store = useStore();
  const [back, setBack] = useState<Line[]>([]);
  const [ui, setUi] = useState<Line[]>([]);
  const [show, setShow] = useState<Record<Lv, boolean>>({ error: true, warn: true, info: true, debug: false });
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    let stop = false;
    const load = async () => {
      try {
        const l = await api.getLog();
        if (!stop) setBack(l.map((e) => ({ t: e.time * 1000, lv: KIND_LV[e.kind] ?? "info", src: "roaccount", msg: e.message })));
      } catch { /* ignore */ }
    };
    void load();
    const t = window.setInterval(load, 2500);
    const sync = () => setUi(getDebugLines().map((l) => ({ t: l.t, lv: l.level, src: "ui", msg: l.msg })));
    sync();
    const off = subscribeDebug(sync);
    return () => { stop = true; window.clearInterval(t); off(); };
  }, [paused]);

  const all = useMemo(() => [...back, ...ui].sort((a, b) => a.t - b.t), [back, ui]);
  const count = (lv: Lv) => all.filter((l) => l.lv === lv).length;
  const shown = all.filter((l) => show[l.lv] && (!q || l.msg.toLowerCase().includes(q.toLowerCase())));

  useEffect(() => { if (!paused && box.current) box.current.scrollTop = box.current.scrollHeight; }, [shown.length, paused]);

  async function diagnostic() {
    let pc = "";
    try { const p = await api.pcInfo(); pc = `${p.os} · ${p.cpu_name} (${p.cpu_threads} threads) · RAM ${Math.round(p.ram_total_mb / 1024)} Go`; } catch { /* ignore */ }
    let rv = "";
    try { const v = await api.robloxVersion(); rv = `Roblox installé : ${v.installed ?? "?"} · dernière : ${v.latest ?? "?"}`; } catch { /* ignore */ }
    const text = [
      "RoAccount — diagnostic", pc, rv, `Comptes : ${store.accounts.length}`, "",
      ...all.slice(-120).map((l) => `[${stamp(l.t)}][${l.lv.toUpperCase()}] ${l.msg}`),
    ].filter((x) => x !== undefined).join("\n");
    store.toast((await copyText(text)) ? "Diagnostic copié." : "Copie refusée.");
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Debug</h1><p>Tout ce que RoAccount consigne : erreurs, avertissements et actions effectuées.</p></div></div>
      <div className="inline" style={{ marginBottom: 14, position: "relative" }}>
        {(["error", "warn", "info", "debug"] as Lv[]).map((lv) => (
          <button key={lv} className={"chip lv-chip" + (show[lv] ? " on" : "")} onClick={() => setShow((s) => ({ ...s, [lv]: !s[lv] }))}>
            <span className="ic" style={{ background: lv === "error" ? "var(--crit)" : lv === "warn" ? "var(--warn)" : lv === "info" ? "var(--info)" : "var(--faint)" }} />
            {LV_LABEL[lv]} <span className="n">{count(lv)}</span>
          </button>
        ))}
        <label className="field" style={{ flex: "1 1 220px", maxWidth: 420 }}>
          <IconSearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les lignes" aria-label="Filtrer les lignes" />
        </label>
        <button className="btn" onClick={() => setPaused((p) => !p)}>{paused ? "Reprendre" : "Pause"}</button>
        <button className="btn" onClick={() => void diagnostic()}><IconCopy />Copier le diagnostic</button>
        <button className="icon-btn" aria-label="Plus" onClick={() => setMenu((m) => !m)}>⋯</button>
        {menu && (
          <div className="popover right" style={{ top: 44 }}>
            <button className="pop-item" onClick={() => { void api.clearLog(); clearDebug(); setBack([]); setMenu(false); }}>Vider le journal</button>
            <button className="pop-item" onClick={() => { void api.openPath("data").catch((e) => store.toast(String(e))); setMenu(false); }}>Ouvrir le dossier de données</button>
          </div>
        )}
      </div>
      <div className="log-box" ref={box}>
        {shown.length === 0 && <div className="lv-debug">Aucune ligne.</div>}
        {shown.map((l, i) => (
          <div key={i} className={"lv-" + l.lv}>{`[${stamp(l.t)}][${l.src}][${l.lv.toUpperCase()}] ${l.msg}`}</div>
        ))}
      </div>
    </div>
  );
}

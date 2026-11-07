import { useMemo, useState } from "react";
import { useStore } from "../store";
import { clearHistory, dayKey, fmtDuration, loadDays, loadEvents } from "../lib/history";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import type { SessionEvent } from "../lib/types";
import { IconDownload, IconTrash } from "../components/icons";

const KIND: Record<SessionEvent["kind"], { label: string; color: string }> = {
  launch: { label: "Lancé", color: "var(--ok)" },
  end: { label: "Fermé / déconnecté", color: "var(--warn)" },
  fail: { label: "Échec", color: "var(--crit)" },
  restart: { label: "Relancé", color: "var(--brand)" },
};

export function HistoriqueView() {
  const store = useStore();
  const { accounts } = store;
  const [tick, setTick] = useState(0);
  const [who, setWho] = useState("all");
  const days = useMemo(() => loadDays(), [tick]);   // eslint-disable-line
  const events = useMemo(() => loadEvents(), [tick]); // eslint-disable-line

  const name = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? (a.alias || a.username) : "compte retiré"; };
  const last7 = useMemo(() => {
    const out: { key: string; label: string; secs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const row = days.find((x) => x.day === k);
      out.push({ key: k, label: d.toLocaleDateString("fr-FR", { weekday: "short" }), secs: row ? Object.values(row.secs).reduce((s, v) => s + v, 0) : 0 });
    }
    return out;
  }, [days]);
  const max = Math.max(60, ...last7.map((d) => d.secs));
  const todayKey = dayKey();

  const rows = useMemo(() => {
    const ids = new Set<string>();
    days.forEach((d) => { Object.keys(d.secs).forEach((i) => ids.add(i)); Object.keys(d.launches).forEach((i) => ids.add(i)); });
    events.forEach((e) => ids.add(e.accountId));
    return [...ids].map((id) => {
      const today = days.find((d) => d.day === todayKey);
      const week = last7.map((d) => days.find((x) => x.day === d.key)).filter(Boolean);
      return {
        id,
        today: today?.secs[id] ?? 0,
        week: week.reduce((s, d) => s + (d!.secs[id] ?? 0), 0),
        launches: week.reduce((s, d) => s + (d!.launches[id] ?? 0), 0),
        ends: week.reduce((s, d) => s + (d!.ends[id] ?? 0), 0),
        restarts: events.filter((e) => e.accountId === id && e.kind === "restart" && Date.now() - e.t < 7 * 86400_000).length,
        fails: events.filter((e) => e.accountId === id && e.kind === "fail" && Date.now() - e.t < 7 * 86400_000).length,
      };
    }).sort((a, b) => b.week - a.week);
  }, [days, events, last7, todayKey]);

  const shown = events.filter((e) => who === "all" || e.accountId === who).slice().reverse().slice(0, 120);
  const totalToday = last7[last7.length - 1].secs;

  async function exportCsv() {
    const lines = ["jour,compte,secondes_de_jeu,lancements,fermetures"];
    days.forEach((d) => {
      const ids = new Set([...Object.keys(d.secs), ...Object.keys(d.launches), ...Object.keys(d.ends)]);
      ids.forEach((id) => lines.push(`${d.day},${name(id)},${d.secs[id] ?? 0},${d.launches[id] ?? 0},${d.ends[id] ?? 0}`));
    });
    try { const p = await api.saveExport(`historique-${todayKey}.csv`, lines.join("\n")); store.toast("Exporté : " + p); } catch (e) { store.toast(String(e)); }
  }
  function wipe() { clearHistory(); setTick((t) => t + 1); store.toast("Historique effacé."); }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Historique</h1><p>Temps de jeu, lancements, fermetures et relances. Gardé sur ce PC pendant 60 jours.</p></div>
        <div className="inline">
          <button className="btn" onClick={() => void exportCsv()}><IconDownload />Exporter en CSV</button>
          <button className="btn danger" onClick={wipe}><IconTrash />Effacer</button>
        </div>
      </div>

      <div className="card pad">
        <h3>7 derniers jours</h3>
        <div className="sub">Aujourd'hui : {fmtDuration(totalToday)} de jeu cumulé sur tous les comptes.</div>
        <div className="hist-bars">
          {last7.map((d) => (
            <div key={d.key} className={"hist-bar" + (d.key === todayKey ? " today" : "")} title={fmtDuration(d.secs)}>
              <span className="v">{d.secs ? fmtDuration(d.secs) : "—"}</span>
              <i style={{ height: Math.max(3, (d.secs / max) * 100) + "%" }} />
              <span className="l">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card pad">
        <h3>Par compte (7 jours)</h3>
        {rows.length === 0 ? <div className="placeholder">Rien d'enregistré pour l'instant : lance un compte, l'historique se remplit tout seul.</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Compte</th><th>Aujourd'hui</th><th>7 jours</th><th>Lancements</th><th>Fermetures</th><th>Relances</th><th>Échecs</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const a = accounts.find((x) => x.id === r.id);
                  return (
                    <tr key={r.id}>
                      <td><div className="who">{a && <Avatar account={a} size={30} />}<b>{name(r.id)}</b></div></td>
                      <td>{fmtDuration(r.today)}</td><td>{fmtDuration(r.week)}</td><td>{r.launches}</td><td>{r.ends}</td>
                      <td>{r.restarts}</td><td style={{ color: r.fails ? "var(--crit)" : undefined }}>{r.fails}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card pad">
        <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Journal des événements</h3>
          <select className="sort-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Compte">
            <option value="all">Tous les comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias || a.username}</option>)}
          </select>
        </div>
        {shown.length === 0 ? <div className="placeholder">Aucun événement.</div> : (
          <div className="ev-list">
            {shown.map((e, i) => (
              <div className="ev" key={e.t + "-" + i}>
                <i style={{ background: KIND[e.kind].color }} />
                <span className="when">{new Date(e.t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <b>{name(e.accountId)}</b>
                <span>{KIND[e.kind].label}</span>
                {e.note && <small>{e.note}</small>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

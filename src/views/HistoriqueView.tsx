import { useMemo, useState } from "react";
import { useStore } from "../store";
import { clearHistory, dayKey, fmtDuration, loadDays, loadEvents } from "../lib/history";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import type { SessionEvent } from "../lib/types";
import { IconDownload, IconTrash } from "../components/icons";

const KIND: Record<SessionEvent["kind"], { label: string; color: string }> = {
  launch: { label: "Launched", color: "var(--ok)" },
  end: { label: "Closed / disconnected", color: "var(--warn)" },
  fail: { label: "Failed", color: "var(--crit)" },
  restart: { label: "Relaunched", color: "var(--brand)" },
};

export function HistoriqueView() {
  const store = useStore();
  const { accounts } = store;
  const [tick, setTick] = useState(0);
  const [who, setWho] = useState("all");
  const days = useMemo(() => loadDays(), [tick]);   // eslint-disable-line
  const events = useMemo(() => loadEvents(), [tick]); // eslint-disable-line

  const name = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? (a.alias || a.username) : "account removed"; };
  const last7 = useMemo(() => {
    const out: { key: string; label: string; secs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const row = days.find((x) => x.day === k);
      out.push({ key: k, label: d.toLocaleDateString("en-US", { weekday: "short" }), secs: row ? Object.values(row.secs).reduce((s, v) => s + v, 0) : 0 });
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
    const lines = ["day,account,play_seconds,launches,closures"];
    days.forEach((d) => {
      const ids = new Set([...Object.keys(d.secs), ...Object.keys(d.launches), ...Object.keys(d.ends)]);
      ids.forEach((id) => lines.push(`${d.day},${name(id)},${d.secs[id] ?? 0},${d.launches[id] ?? 0},${d.ends[id] ?? 0}`));
    });
    try { const p = await api.saveExport(`historique-${todayKey}.csv`, lines.join("\n")); store.toast("Exported: " + p); } catch (e) { store.toast(String(e)); }
  }
  function wipe() { clearHistory(); setTick((t) => t + 1); store.toast("History cleared."); }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>History</h1><p>Play time, launches, closures and relaunches. Kept on this PC for 60 days.</p></div>
        <div className="inline">
          <button className="btn" onClick={() => void exportCsv()}><IconDownload />Export as CSV</button>
          <button className="btn danger" onClick={wipe}><IconTrash />Clear</button>
        </div>
      </div>

      <div className="card pad">
        <h3>Last 7 days</h3>
        <div className="sub">Today: {fmtDuration(totalToday)} of play time across all accounts.</div>
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
        <h3>By account (7 days)</h3>
        {rows.length === 0 ? <div className="placeholder">Nothing recorded yet: launch an account and the history fills itself.</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Account</th><th>Today</th><th>7 days</th><th>Launches</th><th>Closures</th><th>Relaunches</th><th>Failures</th></tr></thead>
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
          <h3 style={{ margin: 0 }}>Event log</h3>
          <select className="sort-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Account">
            <option value="all">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias || a.username}</option>)}
          </select>
        </div>
        {shown.length === 0 ? <div className="placeholder">No events.</div> : (
          <div className="ev-list">
            {shown.map((e, i) => (
              <div className="ev" key={e.t + "-" + i}>
                <i style={{ background: KIND[e.kind].color }} />
                <span className="when">{new Date(e.t).toLocaleString("en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
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

import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { useMetrics, type MetricHistory } from "../lib/hooks";
import { fmtDuration, fmtMem, fmtRate } from "../lib/ui";
import type { ClientMetric } from "../lib/types";
import { Avatar } from "../components/Avatar";
import { Seg } from "../components/Controls";
import { IconX } from "../components/icons";

function Spark({ data, max }: { data: number[]; max?: number }) {
  if (data.length < 2) return <svg className="spark" viewBox="0 0 100 26" preserveAspectRatio="none" />;
  const hi = Math.max(max ?? 0, ...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${24 - (v / hi) * 22}`);
  return <svg className="spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden><path d={"M" + pts.join(" L")} /></svg>;
}

function Strip({ cpu, mem, commit, clients, io, h }: { cpu: number; mem: number; commit: number; clients: number; io: number; h: MetricHistory }) {
  return (
    <div className="stat-strip">
      <div><span className="k">Clients</span><span className="v">{clients}</span><Spark data={h.clients} /></div>
      <div><span className="k">CPU, tous les clients</span><span className="v">{Math.round(cpu)} %</span><Spark data={h.cpu} max={100} /></div>
      <div><span className="k">Mémoire, tous les clients</span><span className="v">{fmtMem(mem)}</span><Spark data={h.mem} /></div>
      <div><span className="k">Mémoire validée</span><span className="v">{fmtMem(commit)}</span><Spark data={h.commit} /></div>
      <div><span className="k">Mémoire GPU</span><span className="v" style={{ color: "var(--faint)" }}>—</span><span className="sub" style={{ fontSize: 12 }}>non mesurée</span></div>
      <div><span className="k">Toutes les E/S</span><span className="v">{fmtRate(io)}</span><Spark data={h.io} /></div>
    </div>
  );
}

export function MoniteurView() {
  const store = useStore();
  const { accounts } = store;
  const { metrics, history } = useMetrics(2000, true);
  const [limits, setLimits] = useState<ClientMetric | null>(null);

  const clients = metrics?.clients ?? [];
  const nameOf = (c: ClientMetric) => {
    const a = accounts.find((x) => x.id === c.account_id);
    return { a, label: a ? a.alias || a.username : `PID ${c.pid}` };
  };
  const sum = (f: (c: ClientMetric) => number) => clients.reduce((s, c) => s + f(c), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>Moniteur</h1>
          <span className="ok-pill warn"><i />{clients.length} en cours</span>
        </div>
      </div>

      <Strip
        cpu={sum((c) => c.cpu)} mem={sum((c) => c.memory_mb)} commit={sum((c) => c.commit_mb)}
        clients={clients.length} io={sum((c) => c.read_kbps + c.write_kbps)} h={history}
      />

      {clients.length === 0 ? (
        <div className="empty-state"><IconX /><div>Aucun client Roblox en cours.</div></div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Compte</th><th>État</th><th className="r">CPU</th><th className="r">Mémoire</th><th className="r">Validée</th>
                <th className="r">GPU</th><th className="r">Lecture</th><th className="r">Écriture</th><th className="r">Durée</th><th />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const { a, label } = nameOf(c);
                const ok = !a || a.presence === "InGame";
                return (
                  <tr key={c.pid} className="hov">
                    <td><div className="who">{a ? <Avatar account={a} size={30} /> : <span className="ava" style={{ width: 30, height: 30 }} />}{label}</div></td>
                    <td><span className={"ok-pill" + (ok ? "" : " warn")}><i />{ok ? "En jeu" : "Déconnecté"}</span></td>
                    <td className="r">{c.cpu.toFixed(1).replace(".", ",")} %</td>
                    <td className="r">{fmtMem(c.memory_mb)}</td>
                    <td className="r">{fmtMem(c.commit_mb)}</td>
                    <td className="r" style={{ color: "var(--faint)" }}>—</td>
                    <td className="r">{fmtRate(c.read_kbps)}</td>
                    <td className="r">{fmtRate(c.write_kbps)}</td>
                    <td className="r">{fmtDuration(c.uptime_s)}</td>
                    <td className="r"><button className="link-btn" style={{ textDecoration: "none", color: "var(--muted)" }} onClick={() => setLimits(c)}>Limites…</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {limits && (
        <div className="overlay" onClick={() => setLimits(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Limites — {nameOf(limits).label}</h3>
            <p>Réglages appliqués tout de suite à ce client (PID {limits.pid}).</p>
            <div className="srow col" style={{ borderTop: 0 }}>
              <div className="l"><b>Priorité CPU</b></div>
              <Seg value={"normal"} options={[{ v: "normal", label: "Normale" }, { v: "below", label: "Basse" }, { v: "idle", label: "Veille" }]}
                onChange={(v) => void api.setPriority(limits.pid, v).then(() => store.toast("Priorité mise à jour.")).catch((e) => store.toast(String(e)))} />
            </div>
            <div className="srow col">
              <div className="l"><b>Son</b></div>
              <div className="inline">
                <button className="btn sm" onClick={() => void api.setMute(limits.pid, true).then(() => store.toast("Son coupé.")).catch((e) => store.toast(String(e)))}>Couper</button>
                <button className="btn sm" onClick={() => void api.setMute(limits.pid, false).then(() => store.toast("Son rétabli.")).catch((e) => store.toast(String(e)))}>Rétablir</button>
              </div>
            </div>
            <div className="dialog-actions"><button className="btn primary" onClick={() => setLimits(null)}>Fermer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

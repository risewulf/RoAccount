import { useMemo, useState } from "react";
import { robuxSeries } from "../lib/robux";

/** Small line chart of an account's Robux balance over the last 24 hours or 7 days. */
export function RobuxChart({ id, current }: { id: string; current: number | null }) {
  const [range, setRange] = useState<"24h" | "7d">("7d");
  const pts = useMemo(() => robuxSeries(id, (range === "24h" ? 1 : 7) * 24 * 3600 * 1000), [id, range, current]); // eslint-disable-line
  const W = 300, H = 90, P = 6;

  let body: React.ReactNode;
  if (pts.length < 2) {
    body = <div className="placeholder" style={{ padding: "18px 8px" }}>Collecting data… the chart fills as the account is refreshed.</div>;
  } else {
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    const vs = pts.map((p) => p.v);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const y = (v: number) => H - P - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (H - 2 * P);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    const delta = vs[vs.length - 1] - vs[0];
    body = (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Robux over time" style={{ display: "block" }}>
          <path d={`${d} L${x(t1)} ${H - P} L${x(t0)} ${H - P} Z`} fill="var(--brand)" opacity=".12" />
          <path d={d} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="sub" style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span>min {lo.toLocaleString("en-US")}</span>
          <b style={{ color: delta >= 0 ? "var(--ok)" : "var(--crit)" }}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("en-US")} R$</b>
          <span>max {hi.toLocaleString("en-US")}</span>
        </div>
      </>
    );
  }

  return (
    <div className="psec">
      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div className="k" style={{ margin: 0 }}>Robux history</div>
        <div className="seg">
          <button className={range === "24h" ? "on" : ""} onClick={() => setRange("24h")}>24 h</button>
          <button className={range === "7d" ? "on" : ""} onClick={() => setRange("7d")}>7 days</button>
        </div>
      </div>
      {body}
    </div>
  );
}

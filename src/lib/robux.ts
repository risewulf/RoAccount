/** Robux history per account, kept on this PC (localStorage), fed by every account refresh. */
export interface RobuxPoint { t: number; v: number; }

const KEY = "roaccount.robux";
const KEEP_MS = 8 * 24 * 3600 * 1000;

function read(): Record<string, RobuxPoint[]> {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as Record<string, RobuxPoint[]>; } catch { /* ignore */ }
  return {};
}
function write(v: Record<string, RobuxPoint[]>) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/** Records a balance. A point is added when the value changed, or at most once an hour otherwise. */
export function recordRobux(id: string, v: number | null | undefined) {
  if (v == null) return;
  const all = read();
  const arr = all[id] ?? [];
  const now = Date.now();
  const last = arr[arr.length - 1];
  if (last && last.v === v && now - last.t < 3600_000) return;
  if (last && now - last.t < 60_000) { last.v = v; last.t = now; } else arr.push({ t: now, v });
  all[id] = arr.filter((p) => now - p.t < KEEP_MS);
  write(all);
}

export function robuxSeries(id: string, windowMs: number): RobuxPoint[] {
  const now = Date.now();
  return (read()[id] ?? []).filter((p) => now - p.t <= windowMs);
}

/** Demo only: fills a plausible week so the chart has something to show in the browser preview. */
export function seedDemoRobux(id: string, now: number) {
  const all = read();
  if ((all[id] ?? []).length > 3) return;
  let v = Math.max(50, now - 900);
  const pts: RobuxPoint[] = [];
  const t0 = Date.now() - 6.8 * 24 * 3600 * 1000;
  for (let i = 0; i < 40; i++) {
    v += Math.round((Math.sin(i / 3) * 40 + 60) * (id.length % 3 + 1));
    pts.push({ t: t0 + (i * 6.8 * 24 * 3600 * 1000) / 40, v });
  }
  pts.push({ t: Date.now(), v: now });
  all[id] = pts;
  write(all);
}

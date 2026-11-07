import type { SessionDay, SessionEvent } from "./types";

const DAYS_KEY = "roaccount.history.days";
const EVENTS_KEY = "roaccount.history.events";
const KEEP_DAYS = 60;
const KEEP_EVENTS = 400;

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function read<T>(k: string, fallback: T): T {
  try { const r = localStorage.getItem(k); if (r) return JSON.parse(r) as T; } catch { /* ignore */ }
  return fallback;
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}

export function loadDays(): SessionDay[] { return read<SessionDay[]>(DAYS_KEY, []); }
export function loadEvents(): SessionEvent[] { return read<SessionEvent[]>(EVENTS_KEY, []); }

function today(days: SessionDay[]): SessionDay {
  const k = dayKey();
  let d = days.find((x) => x.day === k);
  if (!d) { d = { day: k, secs: {}, launches: {}, ends: {} }; days.push(d); }
  return d;
}

/** Ajoute du temps de jeu (en secondes) à un compte pour aujourd'hui. */
export function addPlaytime(accountId: string, secs: number) {
  const days = loadDays();
  const d = today(days);
  d.secs[accountId] = (d.secs[accountId] ?? 0) + secs;
  write(DAYS_KEY, days.slice(-KEEP_DAYS));
}

export function logEvent(e: Omit<SessionEvent, "t"> & { t?: number }) {
  const ev: SessionEvent = { t: e.t ?? Date.now(), accountId: e.accountId, kind: e.kind, note: e.note };
  const events = loadEvents();
  events.push(ev);
  write(EVENTS_KEY, events.slice(-KEEP_EVENTS));
  if (e.kind === "launch" || e.kind === "end" || e.kind === "restart") {
    const days = loadDays();
    const d = today(days);
    const bag = e.kind === "end" ? d.ends : d.launches;
    bag[e.accountId] = (bag[e.accountId] ?? 0) + 1;
    write(DAYS_KEY, days.slice(-KEEP_DAYS));
  }
}

export function clearHistory() {
  try { localStorage.removeItem(DAYS_KEY); localStorage.removeItem(EVENTS_KEY); } catch { /* ignore */ }
}

export function fmtDuration(secs: number): string {
  const s = Math.round(secs);
  if (s < 60) return s + " s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  return h + " h " + String(m % 60).padStart(2, "0");
}

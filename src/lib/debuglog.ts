/** Petit journal interne : capte la console de l'interface pour la page Debug. */
export interface DebugLine { t: number; level: "error" | "warn" | "info" | "debug"; msg: string; }

const buf: DebugLine[] = [];
let installed = false;
const subs = new Set<() => void>();

function add(level: DebugLine["level"], args: unknown[]) {
  const msg = args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
  buf.push({ t: Date.now(), level, msg: msg.slice(0, 600) });
  if (buf.length > 3000) buf.splice(0, buf.length - 3000);
  subs.forEach((f) => f());
}

export function installDebugLog() {
  if (installed) return;
  installed = true;
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  for (const [fn, lvl] of [["error", "error"], ["warn", "warn"], ["info", "info"], ["log", "info"], ["debug", "debug"]] as const) {
    const orig = c[fn].bind(console);
    c[fn] = (...a: unknown[]) => { add(lvl, a); orig(...a); };
  }
  window.addEventListener("error", (e) => add("error", [e.message]));
  window.addEventListener("unhandledrejection", (e) => add("error", ["promesse rejetée :", String(e.reason)]));
  add("info", ["RoAccount — interface démarrée"]);
}

export function getDebugLines(): DebugLine[] { return buf; }
export function subscribeDebug(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function clearDebug() { buf.length = 0; subs.forEach((f) => f()); }
export function logDebug(msg: string) { add("debug", [msg]); }

import type { Settings } from "./types";

/** Applique thème, accent, densité et animations sur <html>. */
export function applyAppearance(s: Pick<Settings, "theme" | "accent" | "density" | "animations">) {
  const root = document.documentElement;
  const dark =
    s.theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : s.theme === "dark";
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-density", s.density);
  root.setAttribute("data-motion", s.animations);
  const accent = /^#[0-9a-fA-F]{6}$/.test(s.accent) ? s.accent : "#ff2d46";
  root.style.setProperty("--brand", accent);
  root.style.setProperty("--brand-ink", readableOn(accent));
}

/** Noir ou blanc selon la luminosité de l'accent. */
function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#111111" : "#ffffff";
}

let actx: AudioContext | null = null;

/** Petit « tic » discret (effets sonores de l'interface). */
export function tick(enabled: boolean, freq = 740) {
  if (!enabled) return;
  try {
    actx = actx ?? new AudioContext();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, actx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.07);
    o.connect(g).connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + 0.08);
  } catch { /* audio indisponible */ }
}

export function fmtDuration(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtMem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} GB` : `${Math.round(mb)} MB`;
}

export function fmtRate(kbps: number): string {
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(1).replace(".", ",")} MB/s` : `${Math.round(kbps)} KB/s`;
}

/** Lit un fichier choisi par l'utilisateur (config partagée). */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = accept;
    i.onchange = () => {
      const f = i.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve).catch(() => resolve(null));
    };
    i.click();
  });
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { ViewId } from "../lib/types";
import { tick } from "../lib/ui";
import { BrandMark } from "./Brand";
import { Avatar } from "./Avatar";
import {
  IconBell, IconChevDown, IconClock, IconCode, IconDatabase, IconDownload, IconDiscord, IconGauge, IconGear, IconGrid, IconHome, IconInfo,
  IconKeyboard, IconLock, IconMax, IconMin, IconMoon, IconPalette, IconPlay, IconPulse, IconRefresh, IconRocket,
  IconServer, IconShield, IconShrink, IconSidebar, IconSun, IconTerminal, IconTool, IconUser, IconX,
} from "./icons";

interface NavDef { id: ViewId; label: string; icon: ReactNode; }

export const MAIN_NAV: NavDef[] = [
  { id: "accueil", label: "Home", icon: <IconHome /> },
  { id: "jouer", label: "Play", icon: <IconPlay /> },
  { id: "comptes", label: "Accounts", icon: <IconUser /> },
  { id: "perf", label: "Performance", icon: <IconGauge /> },
];
export const TOOLS_NAV: NavDef[] = [
  { id: "serveurs", label: "Servers", icon: <IconServer /> },
  { id: "moniteur", label: "Monitor", icon: <IconPulse /> },
  { id: "historique", label: "History", icon: <IconClock /> },
  { id: "discord", label: "Discord", icon: <IconBell /> },
  { id: "debug", label: "Debug", icon: <IconTerminal /> },
  { id: "macros", label: "Macros", icon: <IconCode /> },
  { id: "outils", label: "Tools", icon: <IconTool /> },
];
export const SETTINGS_NAV: NavDef[] = [
  { id: "s-lancement", label: "Launch", icon: <IconRocket /> },
  { id: "s-apparence", label: "Appearance", icon: <IconPalette /> },
  { id: "s-securite", label: "Security", icon: <IconShield /> },
  { id: "s-donnees", label: "Data", icon: <IconDatabase /> },
  { id: "s-roblox", label: "Roblox", icon: <IconDownload /> },
  { id: "s-apropos", label: "About", icon: <IconInfo /> },
  { id: "s-raccourcis", label: "Shortcuts", icon: <IconKeyboard /> },
];

const Dots = () => <span className="more"><i /><i /><i /></span>;

/** Bouton « maintenir pour arrêter » : il faut garder le clic enfoncé ~1,2 s. */
function HoldToStop({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null);
  const t0 = useRef(0);

  function stop() {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setP(0);
  }
  function step() {
    const v = Math.min(1, (performance.now() - t0.current) / 1200);
    setP(v);
    if (v >= 1) { stop(); onDone(); return; }
    raf.current = requestAnimationFrame(step);
  }
  function start() {
    t0.current = performance.now();
    raf.current = requestAnimationFrame(step);
  }
  useEffect(() => stop, []);

  return (
    <button
      className="pop-hold"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onDone(); }}
    >
      <i style={{ width: p * 100 + "%" }} />
      <span>Hold to stop everything</span>
    </button>
  );
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, close]);
  return ref;
}

export function TitleBar({ onLock, onKillAll }: { onLock: () => void; onKillAll: () => void }) {
  const store = useStore();
  const { view, setView, accounts, settings } = store;
  const [open, setOpen] = useState<"tools" | "settings" | null>(null);
  const [shown, setShown] = useState<"tools" | "settings">("tools"); // contenu gardé pendant l'animation de fermeture
  const [menu, setMenu] = useState(false);
  const [tray, setTray] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const menuRef = useOutside(menu, () => setMenu(false));
  const trayRef = useOutside(tray, () => setTray(false));

  const running = accounts.filter((a) => a.running);
  const go = (v: ViewId) => { tick(settings.sounds); setView(v); };
  const inTools = TOOLS_NAV.some((n) => n.id === view);
  const inSettings = SETTINGS_NAV.some((n) => n.id === view);

  // la sous-barre se ferme au clic ailleurs ou sur Échap
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest(".subbar-wrap, .nav-grp")) return;
      setOpen(null);
    };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const mainItem = (n: NavDef) => (
    <button key={n.id} className={"nav-i" + (view === n.id ? " on" : "")} onClick={() => go(n.id)} title={n.label} aria-label={n.label}>
      {n.icon}{view === n.id && <span>{n.label}</span>}
    </button>
  );

  /** Un bouton à plusieurs pages : il ouvre une seconde barre, qui se referme dès qu'on choisit une page. */
  function group(g: "tools" | "settings", list: NavDef[], icon: ReactNode, label: string, active: boolean) {
    const cur = list.find((n) => n.id === view);
    const isOpen = open === g;
    return (
      <button
        className={"nav-i nav-grp" + (active ? " on" : "") + (isOpen ? " open" : "")}
        onClick={() => { tick(settings.sounds); if (isOpen) setOpen(null); else { setShown(g); setOpen(g); } }}
        title={label}
        aria-label={label}
        aria-expanded={isOpen}
      >
        {active && cur && g !== "settings" ? cur.icon : icon}
        {active && cur && <span>{cur.label}</span>}
        <Dots />
      </button>
    );
  }

  const subList = shown === "tools" ? TOOLS_NAV : SETTINGS_NAV;
  const pickSub = (id: ViewId) => { go(id); setOpen(null); };

  return (
    <>
    <header className="titlebar" data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        <div className="pop-wrap" ref={menuRef}>
          <button className="brand-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
            <BrandMark size={24} />
            <span>Ro<b>Account</b></span>
            <IconChevDown className="chev" />
          </button>
          {menu && (
            <div className="popover left" role="menu">
              <div className="pop-head"><IconLock />Encrypted on this PC</div>
              <button className="pop-item" onClick={() => { setMenu(false); void store.refreshAll(); store.toast("Accounts refreshed."); }}>
                <IconRefresh />Refresh<span className="kbd">F5</span>
              </button>
              <button className="pop-item" onClick={() => { setMenu(false); setView("s-raccourcis"); }}><IconKeyboard />Shortcuts</button>
              <button className="pop-item" onClick={() => { setMenu(false); void api.openUrl("https://discord.gg/u6wWWSUz3G").catch(() => {}); }}>
                <IconDiscord />Join our Discord
              </button>
              <HoldToStop onDone={() => { setMenu(false); onKillAll(); }} />
            </div>
          )}
        </div>
        <button className="circle-btn" title="Discord RoAccount" aria-label="Discord" onClick={() => { void api.openUrl("https://discord.gg/u6wWWSUz3G").catch(() => {}); }}>
          <IconDiscord />
        </button>
      </div>

      <nav className="nav" aria-label="Navigation">
        {MAIN_NAV.map(mainItem)}
        {group("tools", TOOLS_NAV, <IconTool />, "Tools", inTools)}
        {group("settings", SETTINGS_NAV, <IconGear />, "Settings", inSettings)}
        <span className="nav-sep" />
        <div className="pop-wrap" ref={trayRef}>
          <button className={"run-pill" + (running.length ? " on" : "")} onClick={() => setTray((t) => !t)} aria-label="Running clients">
            <span className="dia" />{running.length}
          </button>
          {tray && (
            <div className="popover right" style={{ minWidth: 330, right: -60 }}>
              {running.length === 0 && <div className="placeholder" style={{ padding: "14px 8px" }}>No running clients.</div>}
              {running.map((a) => (
                <div key={a.id} className="pop-acc">
                  <Avatar account={a} size={28} />
                  <span>{a.alias || a.username}</span>
                  <span className="st"><i className="dot" style={{ width: 7, height: 7, borderRadius: "50%", background: a.presence === "InGame" ? "var(--ok)" : "var(--warn)" }} />
                    {a.presence === "InGame" ? "In game" : "Disconnected"}
                  </span>
                </div>
              ))}
              <div className="pop-actions">
                <button className="btn sm" onClick={() => { setTray(false); setView("accueil"); }}><IconHome />Home</button>
                <button className="btn sm" onClick={() => { void api.windowAction(null, "minimize").catch((e) => store.toast(String(e))); setTray(false); }}><IconShrink />Minimize all</button>
                <button className="btn sm" onClick={() => { void api.arrangeWindows(settings.windowLayout).catch((e) => store.toast(String(e))); setTray(false); }}><IconGrid />Tile the windows</button>
              </div>
              <HoldToStop onDone={() => { setTray(false); onKillAll(); }} />
            </div>
          )}
        </div>
      </nav>

      <div className="tb-right" data-tauri-drag-region>
        <button
          className={"close-all" + (confirmKill ? " confirm" : "") + (running.length ? " live" : "")}
          title="Close all Roblox clients"
          aria-label="Close all"
          onClick={() => {
            if (!confirmKill) { setConfirmKill(true); window.setTimeout(() => setConfirmKill(false), 3000); return; }
            setConfirmKill(false);
            onKillAll();
          }}
        >
          <IconX />
          <span>{confirmKill ? "Confirm?" : "Close all"}</span>
          {!confirmKill && running.length > 0 && <b>{running.length}</b>}
        </button>
        <button className="tb-ghost" title="Refresh (F5)" aria-label="Refresh" onClick={() => { void store.refreshAll(); store.toast("Accounts refreshed."); }}><IconRefresh /></button>
        <button
          className={"tb-ghost"}
          title={settings.tabLayout === "side" ? "Accounts on top" : "Accounts on the side"}
          aria-label="Layout"
          aria-pressed={settings.tabLayout === "side"}
          onClick={() => store.updateSettings({ tabLayout: settings.tabLayout === "side" ? "top" : "side" })}
        ><IconSidebar /></button>
        <button
          className="tb-ghost"
          title={dark ? "Light mode" : "Dark mode"}
          aria-label="Theme"
          onClick={() => store.updateSettings({ theme: dark ? "light" : "dark" })}
        >{dark ? <IconSun /> : <IconMoon />}</button>
        <button className="tb-ghost" title="Lock the vault (Ctrl+L)" aria-label="Lock" onClick={onLock}><IconLock /></button>
        <WindowControls />
      </div>
    </header>
    <div className={"subbar-wrap" + (open ? " open" : "")} aria-hidden={!open}>
      <div className="subbar-in">
        <nav className="nav subnav" key={shown} aria-label={shown === "tools" ? "Tools" : "Settings"}>
          {subList.map((n, i) => (
            <button
              key={n.id}
              style={{ ["--i" as string]: i }}
              className={"nav-i sub" + (view === n.id ? " on" : "")}
              tabIndex={open ? 0 : -1}
              onClick={() => pickSub(n.id)}
            >
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
    </>
  );
}

/** Avertit quand le multi-compte ne peut pas marcher : un Roblox tournait déjà quand RoAccount a démarré. */
export function MultiBanner({ onKillAll }: { onKillAll: () => void }) {
  const [st, setSt] = useState<{ enabled: boolean; state: number; foreign: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = () => { void api.multiStatus().then((s) => { if (alive) setSt(s); }).catch(() => {}); };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  if (!st) return null;
  if (!st.enabled) {
    return <div className="multi-banner"><span>Multi-instance is off: only one Roblox client can run at a time.</span></div>;
  }
  if (st.state === 3) return <div className="multi-banner"><span>Couldn't create the multi-instance lock. Restart RoAccount as administrator.</span></div>;
  if (st.state === 2 && st.foreign > 0) {
    return (
      <div className="multi-banner">
        <span><b>Multi-instance blocked.</b> Roblox was already open when RoAccount started ({st.foreign} client{st.foreign !== 1 ? "s" : ""} of its own). Close {st.foreign > 1 ? "them" : "it"}, then relaunch your accounts: no need to restart RoAccount.</span>
        <button className="btn sm" onClick={onKillAll}>Close these clients</button>
      </div>
    );
  }
  return null;
}

export function WindowControls() {
  return (
    <div className="win-ctl">
      <button title="Minimize" aria-label="Minimize" onClick={() => void api.winControl("minimize")}><IconMin /></button>
      <button title="Maximize" aria-label="Maximize" onClick={() => void api.winControl("maximize")}><IconMaxSq /></button>
      <button className="close" title="Close" aria-label="Close" onClick={() => void api.winControl("close")}><IconX /></button>
    </div>
  );
}
const IconMaxSq = IconMax;

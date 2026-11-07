import { useCallback, useEffect, useRef, useState } from "react";
import { TitleBar } from "./components/Shell";
import { AccountSide } from "./components/AccountSide";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { AccueilView } from "./views/AccueilView";
import { JouerView } from "./views/JouerView";
import { AccountsView } from "./views/AccountsView";
import { PerfView } from "./views/PerfView";
import { ServeursView } from "./views/ServeursView";
import { MoniteurView } from "./views/MoniteurView";
import { DiscordView } from "./views/DiscordView";
import { DebugView } from "./views/DebugView";
import { MacrosView } from "./views/MacrosView";
import { ToolsView } from "./views/ToolsView";
import {
  AProposSettings, ApparenceSettings, DonneesSettings, LancementSettings, RaccourcisSettings, SecuriteSettings,
} from "./views/SettingsViews";
import { LockScreen } from "./views/LockScreen";
import { StoreProvider, useStore } from "./store";
import { api } from "./lib/api";
import { applyAppearance } from "./lib/ui";
import { installDebugLog } from "./lib/debuglog";
import { DEFAULT_SETTINGS, type Settings, type VaultStatus, type ViewId } from "./lib/types";

installDebugLog();

const ANTI_AFK = `#Requires AutoHotkey v2.0
; Anti-AFK RoAccount : envoie la touche Espace au client toutes les 4 minutes.
; Reçoit le PID du client Roblox dans A_Args[1].
pid := A_Args[1]
Loop {
    Sleep 240000
    if !WinExist("ahk_pid " pid)
        ExitApp
    ControlSend "{Space}", , "ahk_pid " pid
}
`;

function readSaved(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("roaccount.settings") || "{}") }; } catch { return { ...DEFAULT_SETTINGS }; }
}

/** Tout ce qui tourne tant que le coffre est ouvert : raccourcis, verrouillage auto, Anti-AFK, raccourci d'urgence. */
function Runtime({ onLock, onKillAll }: { onLock: () => void; onKillAll: () => void }) {
  const store = useStore();
  const { settings, setView } = store;
  const last = useRef(Date.now());
  const warned = useRef(false);

  // clavier
  useEffect(() => {
    const go: Record<string, ViewId> = {
      "1": "accueil", "2": "comptes", "3": "jouer", "4": "serveurs", "5": "s-lancement",
      "6": "moniteur", "7": "discord", "8": "debug", "9": "perf",
    };
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && go[e.key]) { e.preventDefault(); setView(go[e.key]); return; }
      if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); store.setAddOpen(true); return; }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); window.dispatchEvent(new Event("roa-search")); return; }
      if (mod && e.key.toLowerCase() === "l") { e.preventDefault(); onLock(); return; }
      if (mod && e.key === "Enter") { e.preventDefault(); window.dispatchEvent(new Event("roa-play")); return; }
      if (e.key === "F5") { e.preventDefault(); void store.refreshAll(); store.toast("Comptes actualisés."); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); window.dispatchEvent(new Event("roa-selectall")); return; }
      if (mod && e.key.toLowerCase() === "r") { e.preventDefault(); window.dispatchEvent(new Event("roa-verify")); return; }
      if (e.key === "Delete") { window.dispatchEvent(new Event("roa-delete")); return; }
      if (e.key === "?") { setView("s-raccourcis"); return; }
      if (e.key === "Escape") { store.setAddOpen(false); store.clearSelection(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line

  // verrouillage auto après inactivité
  useEffect(() => {
    const bump = () => { last.current = Date.now(); };
    const evs = ["mousemove", "keydown", "mousedown", "wheel"];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = window.setInterval(() => {
      if (!settings.autoLockMin) return;
      if (Date.now() - last.current > settings.autoLockMin * 60000) onLock();
    }, 15000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); window.clearInterval(t); };
  }, [settings.autoLockMin, onLock]);

  // raccourci d'urgence global
  useEffect(() => {
    void api.setGlobalHotkey(settings.emergencyHotkey || null, onKillAll).catch((e) => store.toast("Raccourci d'urgence : " + String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.emergencyHotkey]);

  // Anti-AFK : macro AutoHotkey intégrée, lancée sur chaque client
  useEffect(() => {
    if (!settings.antiAfk) { void api.stopMacros("anti-afk").catch(() => {}); warned.current = false; return; }
    let stop = false;
    const run = async () => {
      try {
        if (!(await api.ahkStatus())) {
          if (!warned.current) { warned.current = true; store.toast("Anti-AFK : installe AutoHotkey v2 (autohotkey.com)."); }
          return;
        }
        const macros = await api.listMacros();
        if (!macros.some((m) => m.name === "anti-afk")) await api.saveMacro("anti-afk", ANTI_AFK);
        const m = await api.clientMetrics();
        const running = await api.runningMacros();
        for (const c of m.clients) {
          if (stop) return;
          if (!running.some((r) => r.name === "anti-afk" && r.pid === c.pid)) await api.runMacro("anti-afk", c.pid);
        }
      } catch { /* ignore */ }
    };
    void run();
    const t = window.setInterval(run, 30000);
    return () => { stop = true; window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.antiAfk]);

  // nettoyage des logs Roblox au démarrage
  useEffect(() => {
    if (settings.cleanRobloxLogs) void api.cleanRobloxLogs().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function Pages() {
  const { view } = useStore();
  switch (view) {
    case "accueil": return <AccueilView />;
    case "jouer": return <JouerView />;
    case "comptes": return <AccountsView />;
    case "perf": return <PerfView />;
    case "serveurs": return <ServeursView />;
    case "moniteur": return <MoniteurView />;
    case "discord": return <DiscordView />;
    case "debug": return <DebugView />;
    case "macros": return <div className="page"><MacrosView /></div>;
    case "outils": return <div className="page"><ToolsView /></div>;
    case "s-lancement": return <LancementSettings />;
    case "s-apparence": return <ApparenceSettings />;
    case "s-securite": return <SecuriteSettings />;
    case "s-donnees": return <DonneesSettings />;
    case "s-apropos": return <AProposSettings />;
    case "s-raccourcis": return <RaccourcisSettings />;
  }
}

function Shell({ onLock, onKillAll }: { onLock: () => void; onKillAll: () => void }) {
  const store = useStore();
  const { settings } = store;
  useEffect(() => { applyAppearance(settings); }, [settings.theme, settings.accent, settings.density, settings.animations]); // eslint-disable-line
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyAppearance(settings);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [settings]);

  return (
    <div className="win">
      <TitleBar onLock={onLock} onKillAll={onKillAll} />
      <div className="body">
        {settings.tabLayout === "side" && <AccountSide />}
        <main className="main"><Pages /></main>
      </div>
      <Runtime onLock={onLock} onKillAll={onKillAll} />
      {store.addOpen && (
        <AddAccountDialog
          onClose={() => store.setAddOpen(false)}
          onAdded={(meta) => { store.addAccount(meta); store.setCurrent(meta.id); store.setView("comptes"); store.toast(`Compte ${meta.username} ajouté.`); }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<Settings["theme"]>(() => readSaved().theme);

  // thème / accent dès le premier rendu (écran de verrouillage compris)
  useEffect(() => { applyAppearance({ ...readSaved(), theme }); }, [theme]);

  useEffect(() => {
    void api.vaultStatus().then(setStatus).catch(() => setStatus({ exists: false, unlocked: false, count: 0 }));
  }, []);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const killAll = useCallback(async () => {
    try { await api.killAll(); showToast("Tous les clients arrêtés."); } catch (e) { showToast(String(e)); }
  }, [showToast]);

  const lock = useCallback(async () => {
    await api.lockVault();
    setStatus(await api.vaultStatus());
  }, []);

  function toggleLockTheme() {
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    const next: Settings["theme"] = dark ? "light" : "dark";
    try { localStorage.setItem("roaccount.settings", JSON.stringify({ ...readSaved(), theme: next })); } catch { /* ignore */ }
    setTheme(next);
  }

  if (!status) return null;

  return (
    <>
      {!status.unlocked ? (
        <LockScreen
          exists={status.exists}
          count={status.count}
          theme={document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"}
          onTheme={toggleLockTheme}
          onUnlocked={async () => setStatus(await api.vaultStatus())}
        />
      ) : (
        <StoreProvider onToast={showToast}>
          <Shell onLock={lock} onKillAll={killAll} />
        </StoreProvider>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

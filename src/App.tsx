import { useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar, type ViewId } from "./components/Sidebar";
import { AccountsView } from "./views/AccountsView";
import { LaunchView } from "./views/LaunchView";
import { ServersView } from "./views/ServersView";
import { MonitorView } from "./views/MonitorView";
import { JournalView } from "./views/JournalView";
import { DiscordView } from "./views/DiscordView";
import { SettingsView } from "./views/SettingsView";
import { MacrosView } from "./views/MacrosView";
import { ToolsView } from "./views/ToolsView";
import { PrivateView } from "./views/PrivateView";
import { NewsView } from "./views/NewsView";
import { LockScreen } from "./views/LockScreen";
import { StoreProvider } from "./store";
import { api } from "./lib/api";
import type { VaultStatus } from "./lib/types";

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [view, setView] = useState<ViewId>("comptes");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void api.vaultStatus().then(setStatus).catch(() => setStatus({ exists: false, unlocked: false, count: 0 }));
  }, []);

  function showToast(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(null), 2800);
  }

  function toggleTheme() {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme");
    const dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "light" : "dark");
  }

  async function killAll() {
    try { await api.killAll(); showToast("Tous les clients arrêtés."); }
    catch (e) { showToast(String(e)); }
  }

  async function afterUnlock() { setStatus(await api.vaultStatus()); }

  async function lock() {
    await api.lockVault();
    setStatus(await api.vaultStatus());
  }

  if (!status) return null;
  if (!status.unlocked) return <LockScreen exists={status.exists} onUnlocked={afterUnlock} />;

  return (
    <StoreProvider onToast={showToast}>
      <div className="app">
        <TopBar unlocked onToggleTheme={toggleTheme} onKillAll={killAll} />
        <div className="shell">
          <Sidebar current={view} onSelect={setView} counts={{ comptes: status.count }} />
          <main className="main">
            {view === "comptes" && <AccountsView />}
            {view === "lancement" && <LaunchView />}
            {view === "serveurs" && <ServersView />}
            {view === "prives" && <PrivateView />}
            {view === "monitor" && <MonitorView />}
            {view === "macros" && <MacrosView />}
            {view === "outils" && <ToolsView />}
            {view === "news" && <NewsView />}
            {view === "journal" && <JournalView />}
            {view === "discord" && <DiscordView />}
            {view === "reglages" && <SettingsView onLock={lock} />}
          </main>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </StoreProvider>
  );
}

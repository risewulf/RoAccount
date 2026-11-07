import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { api } from "./lib/api";
import { DEFAULT_SETTINGS, type AccountMeta, type Settings, type ViewId } from "./lib/types";

interface Store {
  view: ViewId;
  setView: (v: ViewId) => void;
  addOpen: boolean;
  setAddOpen: (b: boolean) => void;
  /** compte ouvert dans la fiche (liste latérale / tableau) */
  current: string | null;
  setCurrent: (id: string | null) => void;
  accounts: AccountMeta[];
  selected: Set<string>;
  settings: Settings;
  toast: (m: string) => void;
  reload: () => Promise<void>;
  refreshAll: () => Promise<void>;
  toggle: (id: string) => void;
  setSelection: (ids: string[], on: boolean) => void;
  clearSelection: () => void;
  patch: (id: string, p: Partial<AccountMeta>) => void;
  replace: (a: AccountMeta) => void;
  addAccount: (a: AccountMeta) => void;
  dropAccount: (id: string) => void;
  updateSettings: (p: Partial<Settings>) => void;
}

const Ctx = createContext<Store | null>(null);

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("roaccount.settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function StoreProvider({ onToast, children }: { onToast: (m: string) => void; children: ReactNode }) {
  const [view, setView] = useState<ViewId>("accueil");
  const [current, setCurrent] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountMeta[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  const reload = useCallback(async () => {
    try {
      setAccounts(await api.listAccounts());
    } catch (e) {
      toastRef.current(String(e));
    }
  }, []);

  // enrichit chaque compte (avatar, présence, jeu, robux) un par un, en douceur
  const refreshingRef = useRef(false);
  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const list = await api.listAccounts();
      for (const a of list) {
        try {
          const m = await api.refreshAccount(a.id);
          setAccounts((cur) => cur.map((x) => (x.id === m.id ? m : x)));
        } catch { /* on continue malgré une erreur ponctuelle */ }
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void reload().then(() => { if (!api.isMock) void refreshAll(); });
  }, [reload, refreshAll]);

  // charge les réglages depuis le backend (source de vérité pour la boucle)
  useEffect(() => {
    if (api.isMock) return;
    api.getSettings()
      .then((s) => setSettings((cur) => ({ ...DEFAULT_SETTINGS, ...cur, ...s })))
      .catch(() => { /* garde les réglages locaux */ });
  }, []);

  // rafraîchissement auto périodique (présence, jeu, robux…) — durée réglable (Données)
  const everyMin = settings.accountCacheMin;
  useEffect(() => {
    if (api.isMock) return;
    const t = window.setInterval(() => { void refreshAll(); }, Math.max(1, everyMin) * 60000);
    return () => window.clearInterval(t);
  }, [refreshAll, everyMin]);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const setSelection = useCallback((ids: string[], on: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const patch = useCallback((id: string, p: Partial<AccountMeta>) => {
    setAccounts((list) => list.map((a) => (a.id === id ? { ...a, ...p } : a)));
  }, []);

  const replace = useCallback((a: AccountMeta) => {
    setAccounts((list) => list.map((x) => (x.id === a.id ? a : x)));
  }, []);

  const addAccount = useCallback((a: AccountMeta) => {
    setAccounts((list) => [...list.filter((x) => x.id !== a.id), a]);
  }, []);

  const dropAccount = useCallback((id: string) => {
    setAccounts((list) => list.filter((a) => a.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
  }, []);

  const updateSettings = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      try { localStorage.setItem("roaccount.settings", JSON.stringify(next)); } catch { /* ignore */ }
      if (!api.isMock) api.saveSettings(next).catch(() => { /* best-effort */ });
      return next;
    });
  }, []);

  const value = useMemo<Store>(() => ({
    view, setView, current, setCurrent, addOpen, setAddOpen,
    accounts, selected, settings,
    toast: (m) => toastRef.current(m),
    reload, refreshAll, toggle, setSelection, clearSelection, patch, replace, addAccount, dropAccount, updateSettings,
  }), [view, current, addOpen, accounts, selected, settings, reload, refreshAll, toggle, setSelection, clearSelection, patch, replace, addAccount, dropAccount, updateSettings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore hors StoreProvider");
  return s;
}

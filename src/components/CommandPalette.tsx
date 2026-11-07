import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { launchable, runProfile } from "../lib/launcher";
import { logEvent } from "../lib/history";
import { MAIN_NAV, SETTINGS_NAV, TOOLS_NAV } from "./Shell";
import {
  IconCommand, IconLock, IconMoon, IconPlay, IconPlus, IconRefresh, IconSearch, IconX,
} from "./icons";

interface Cmd { id: string; label: string; hint?: string; icon: ReactNode; run: () => void | Promise<void>; kw: string; }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Ctrl+K : taper « lancer luna », « moniteur », « verrouiller »… */
export function CommandPalette({ onLock, onKillAll }: { onLock: () => void; onKillAll: () => void }) {
  const store = useStore();
  const { accounts, settings } = store;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => { setOpen((o) => !o); setQ(""); setSel(0); };
    window.addEventListener("roa-palette", h);
    return () => window.removeEventListener("roa-palette", h);
  }, []);
  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const close = () => setOpen(false);

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    [...MAIN_NAV, ...TOOLS_NAV, ...SETTINGS_NAV].forEach((n) => {
      const settingsPage = n.id.startsWith("s-");
      out.push({ id: "nav:" + n.id, label: (settingsPage ? "Settings · " : "Go to ") + n.label, icon: n.icon, kw: `aller ${n.label} ${settingsPage ? "parametres reglages" : ""}`, run: () => store.setView(n.id) });
    });
    (settings.profiles ?? []).forEach((p) => {
      out.push({
        id: "prof:" + p.id, label: `Launch profile “${p.name}”`, hint: `${p.accountIds.length} account(s)`, icon: <IconPlay />, kw: `launch profile ${p.name}`,
        run: async () => {
          try {
            const r = await runProfile(p, accounts);
            r.launched.forEach((id) => { store.patch(id, { running: true, presence: "InGame" }); logEvent({ accountId: id, kind: "launch", note: p.name }); });
            store.toast(r.launched.length ? `Profile “${p.name}”: ${r.launched.length} client(s) launched.` : "None of the profile's accounts are available.");
          } catch (e) { store.toast(String(e)); }
        },
      });
    });
    accounts.forEach((a) => {
      const name = a.alias || a.username;
      if (launchable(a)) out.push({
        id: "run:" + a.id, label: `Launch ${name}`, hint: "on the current target", icon: <IconPlay />, kw: `launch ${name} ${a.username} ${a.display_name}`,
        run: async () => {
          try { await api.launchAccount(a.id, settings.target); store.patch(a.id, { running: true, presence: "InGame" }); logEvent({ accountId: a.id, kind: "launch", note: settings.target }); store.toast(`${name} launched.`); }
          catch (e) { store.toast(String(e)); }
        },
      });
      out.push({ id: "open:" + a.id, label: `Open ${name}`, hint: "account page", icon: <IconSearch />, kw: `open account ${name} ${a.username} ${a.display_name}`, run: () => { store.setCurrent(a.id); store.setView("comptes"); } });
    });
    out.push(
      { id: "add", label: "Add account", icon: <IconPlus />, kw: "add new account", run: () => store.setAddOpen(true) },
      { id: "refresh", label: "Refresh accounts", hint: "F5", icon: <IconRefresh />, kw: "refresh reload check", run: () => { void store.refreshAll(); store.toast("Accounts refreshed."); } },
      { id: "theme", label: "Toggle light / dark", icon: <IconMoon />, kw: "theme mode light dark", run: () => store.updateSettings({ theme: document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light" }) },
      { id: "lock", label: "Lock the vault", hint: "Ctrl L", icon: <IconLock />, kw: "lock vault block", run: onLock },
      { id: "kill", label: "Stop all", hint: "closes every client", icon: <IconX />, kw: "stop close kill all clients", run: onKillAll },
    );
    return out;
  }, [accounts, settings.profiles, settings.target]); // eslint-disable-line

  const shown = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const list = terms.length ? cmds.filter((c) => { const t = norm(c.label + " " + c.kw); return terms.every((x) => t.includes(x)); }) : cmds.filter((c) => c.id.startsWith("nav:") && !c.id.startsWith("nav:s-")).concat(cmds.filter((c) => !c.id.startsWith("nav:") && !c.id.startsWith("open:") && !c.id.startsWith("run:")));
    return list.slice(0, 40);
  }, [cmds, q]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(".cp-i.on")?.scrollIntoView({ block: "nearest" }); }, [sel]);

  if (!open) return null;

  function pick(c: Cmd | undefined) {
    if (!c) return;
    close();
    void c.run();
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[sel]); }
  }

  return (
    <div className="overlay cp-overlay" onMouseDown={close}>
      <div className="cp" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <label className="cp-in">
          <IconCommand />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Type a command: launch luna, monitor, lock…" aria-label="Command" />
          <span className="kbd">Esc</span>
        </label>
        <div className="cp-list" ref={listRef}>
          {shown.length === 0 && <div className="placeholder" style={{ padding: 20 }}>No matching command.</div>}
          {shown.map((c, i) => (
            <button key={c.id} className={"cp-i" + (i === sel ? " on" : "")} onMouseMove={() => setSel(i)} onClick={() => pick(c)}>
              {c.icon}<span>{c.label}</span>{c.hint && <small>{c.hint}</small>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

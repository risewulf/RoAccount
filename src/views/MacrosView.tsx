import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { MacroInfo, ProcInfo, RunningMacro } from "../lib/types";
import { IconPlay, IconPlus, IconTrash, IconX } from "../components/icons";

const NEW_TEMPLATE = `#Requires AutoHotkey v2.0
; Receives the Roblox client PID: A_Args[1]
pid := A_Args[1]
if !WinExist("ahk_pid " pid)
    ExitApp
; your code here…
`;

export function MacrosView() {
  const store = useStore();
  const [macros, setMacros] = useState<MacroInfo[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [ahk, setAhk] = useState<string | null | undefined>(undefined);
  const [procs, setProcs] = useState<ProcInfo[]>([]);
  const [target, setTarget] = useState("all");
  const [running, setRunning] = useState<RunningMacro[]>([]);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");

  async function loadAll(select?: string) {
    try {
      const list = await api.listMacros();
      setMacros(list);
      const pick = list.find((m) => m.name === (select ?? current)) ?? list[0];
      if (pick) { setCurrent(pick.name); setCode(pick.code); setDirty(false); }
    } catch (e) { store.toast(String(e)); }
  }

  async function poll() {
    try { setRunning(await api.runningMacros()); } catch { /* ignore */ }
    try { setProcs(await api.monitorProcesses()); } catch { /* ignore */ }
  }

  useEffect(() => {
    void loadAll();
    void api.ahkStatus().then(setAhk).catch(() => setAhk(null));
    void poll();
    const t = window.setInterval(poll, 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(m: MacroInfo) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setCurrent(m.name); setCode(m.code); setDirty(false);
  }

  async function save() {
    if (!current) return;
    try {
      await api.saveMacro(current, code);
      setMacros((l) => l.map((m) => (m.name === current ? { ...m, code } : m)));
      setDirty(false);
      store.toast("Macro saved.");
    } catch (e) { store.toast(String(e)); }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.saveMacro(name, NEW_TEMPLATE);
      setNewName("");
      await loadAll(name);
    } catch (e) { store.toast(String(e)); }
  }

  async function remove() {
    if (!current || !window.confirm(`Delete the macro “${current}”?`)) return;
    try { await api.deleteMacro(current); setCurrent(null); await loadAll(); }
    catch (e) { store.toast(String(e)); }
  }

  async function run() {
    if (!current) return;
    setBusy(true);
    try {
      if (dirty) await api.saveMacro(current, code);
      setDirty(false);
      const n = await api.runMacro(current, target === "all" ? undefined : Number(target));
      store.toast(`Macro launched on ${n} client(s).`);
      await poll();
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function stop() {
    try { const n = await api.stopMacros(); store.toast(`${n} macro(s) stopped.`); await poll(); }
    catch (e) { store.toast(String(e)); }
  }

  return (
    <section>
      <div className="vhead">
        <div>
          <h1>Macros</h1>
          <p>Run your AutoHotkey v2 scripts on your Roblox clients: one instance per client, with its PID as an argument.</p>
        </div>
      </div>

      {ahk === null && (
        <div className="card">
          <h3>AutoHotkey v2 not found</h3>
          <p className="sub">Install AutoHotkey v2 and come back, or set its path in Settings → Macros.</p>
          <button className="btn" onClick={() => void api.openUrl("https://www.autohotkey.com").catch(() => { /* ignore */ })}>Open autohotkey.com</button>
        </div>
      )}
      {typeof ahk === "string" && <p className="hint" style={{ marginBottom: 12 }}>AutoHotkey detected: <b>{ahk}</b></p>}

      <div className="two-col">
        <div className="card">
          <h3>My macros</h3>
          <p className="sub">Stored in RoAccount's data folder.</p>
          {macros.map((m) => (
            <button key={m.name} className={"list-item" + (current === m.name ? " on" : "")} onClick={() => open(m)}>
              <span>{m.name}</span>
              {running.some((r) => r.name === m.name) && <span className="badge fav">running</span>}
            </button>
          ))}
          <div className="inline" style={{ marginTop: 12 }}>
            <label className="field" style={{ flex: 1, minWidth: 100 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New macro" onKeyDown={(e) => e.key === "Enter" && create()} />
            </label>
            <button className="btn" onClick={create} disabled={!newName.trim()} aria-label="Create"><IconPlus /></button>
          </div>
        </div>

        <div className="card">
          {current ? (
            <>
              <h3>{current}.ahk {dirty && <span style={{ color: "var(--warn)" }}>●</span>}</h3>
              <p className="sub">The client's PID arrives in <code>A_Args[1]</code>. <code>#SingleInstance Off</code> is added automatically so several instances can run.</p>
              <textarea className="code" value={code} spellCheck={false} onChange={(e) => { setCode(e.target.value); setDirty(true); }} />
              <div className="inline" style={{ marginTop: 12 }}>
                <button className="btn" onClick={save} disabled={!dirty}>Save</button>
                <select className="sort-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target">
                  <option value="all">All clients ({procs.length})</option>
                  {procs.map((p) => <option key={p.pid} value={p.pid}>Client PID {p.pid}</option>)}
                </select>
                <button className="btn primary" onClick={run} disabled={busy || ahk === null}><IconPlay />Launch</button>
                <button className="btn" onClick={remove} aria-label="Delete the macro"><IconTrash /></button>
              </div>
            </>
          ) : (
            <div className="placeholder">Create or pick a macro.</div>
          )}
        </div>
      </div>

      {running.length > 0 && (
        <div className="card">
          <h3>Running</h3>
          <p className="sub">{running.length} instance(s) AutoHotkey active(s).</p>
          {running.map((r, i) => (
            <div className="row" key={r.name + r.pid + i}>
              <div className="l"><b>{r.name}</b><div>Client PID {r.pid}</div></div>
            </div>
          ))}
          <button className="btn" style={{ marginTop: 10 }} onClick={stop}><IconX />Stop all</button>
        </div>
      )}
    </section>
  );
}

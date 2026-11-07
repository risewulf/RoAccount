import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { ServerInfo } from "../lib/types";
import { Toggle } from "../components/Controls";
import { IconCopy, IconRefresh, IconSend } from "../components/icons";
import { PrivateView } from "./PrivateView";
import { isDead } from "../lib/launcher";

type Sort = "ping" | "full" | "empty";

export function ServeursView() {
  const store = useStore();
  const { accounts, settings } = store;
  const [tab, setTab] = useState<"public" | "private">("public");
  const [target, setTarget] = useState(settings.target);
  const [servers, setServers] = useState<ServerInfo[] | null>(null);
  const [sort, setSort] = useState<Sort>("full");
  const [hideFull, setHideFull] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [senders, setSenders] = useState<Set<string>>(new Set());
  const [loadedAt, setLoadedAt] = useState(0);
  const [, setNow] = useState(0);

  useEffect(() => { const t = window.setInterval(() => setNow((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);

  async function load() {
    setBusy(true);
    try {
      setServers(await api.listServers(target));
      setLoadedAt(Date.now());
      setPicked(null);
      store.updateSettings({ target });
    } catch (e) { store.toast(String(e)); setServers([]); } finally { setBusy(false); }
  }

  const list = useMemo(() => {
    let l = [...(servers ?? [])];
    if (hideFull) l = l.filter((s) => s.playing < s.max_players);
    l.sort((a, b) =>
      sort === "ping" ? (a.ping ?? 9999) - (b.ping ?? 9999) : sort === "full" ? b.playing - a.playing : a.playing - b.playing);
    return l;
  }, [servers, sort, hideFull]);

  const usable = accounts.filter((a) => !isDead(a) && !a.main);
  function toggleSender(id: string) {
    setSenders((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function send() {
    if (!picked) { store.toast("Pick a server first."); return; }
    const ids = [...senders];
    if (!ids.length) { store.toast("Pick an account first."); return; }
    setBusy(true);
    try {
      for (const id of ids) {
        await api.sendToServer(id, target, picked);
        store.patch(id, { running: true, presence: "InGame" });
        await new Promise((r) => setTimeout(r, Math.min(settings.cooldownMs, 3000)));
      }
      store.toast(`${ids.length} account(s) sent to the server.`);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  useEffect(() => {
    const h = () => { void send(); };
    window.addEventListener("roa-play", h);
    return () => window.removeEventListener("roa-play", h);
  }); // eslint-disable-line

  const place = (target.match(/games\/(\d+)/) ?? target.match(/^(\d+)$/))?.[1];
  const ago = loadedAt ? Math.max(0, Math.round((Date.now() - loadedAt) / 1000)) : null;

  return (
    <div className="page">
      <div className="srv-top">
        <h1>Servers</h1>
        <div className="inline" style={{ flex: "0 1 520px", flexWrap: "nowrap" }}>
          <label className="field mono" style={{ flex: 1 }}>
            <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load()} placeholder="Game link or Place ID" aria-label="Game link or Place ID" />
          </label>
          <button className="btn solid" disabled={busy} onClick={() => void load()}>Load</button>
        </div>
      </div>

      <div className="srv-bar">
        <div className="seg">
          <button className={tab === "public" ? "on" : ""} onClick={() => setTab("public")}>Public</button>
          <button className={tab === "private" ? "on" : ""} onClick={() => setTab("private")}>Private</button>
        </div>
        {tab === "public" && (
          <>
            <div className="seg">
              <button className={sort === "ping" ? "on" : ""} onClick={() => setSort("ping")}>Best ping</button>
              <button className={sort === "full" ? "on" : ""} onClick={() => setSort("full")}>Fullest</button>
              <button className={sort === "empty" ? "on" : ""} onClick={() => setSort("empty")}>Emptiest</button>
            </div>
            <span className="inline" style={{ gap: 10 }}>
              <Toggle on={hideFull} label="Hide full servers" onChange={setHideFull} /><span style={{ fontWeight: 600 }}>Hide full servers</span>
            </span>
            <span style={{ flex: 1 }} />
            {ago !== null && <span className="sub">Refreshed {ago} s ago</span>}
            <button className="btn" disabled={busy} onClick={() => void load()}><IconRefresh />Refresh</button>
          </>
        )}
      </div>

      {tab === "private" ? (
        <div className="embedded"><PrivateView /></div>
      ) : (
        <>
          <div className="srv-list">
            {servers === null ? (
              <div className="empty-state" style={{ minHeight: 280 }}>
                <IconSend />
                <div>Paste a game link or a Place ID to see its servers.</div>
              </div>
            ) : list.length === 0 ? (
              <div className="placeholder">No public server found for this target.</div>
            ) : (
              <>
                <div className="srv-row h"><span /><span>Server ID</span><span>Players</span><span>Friends</span><span>Ping</span><span>FPS</span><span /></div>
                {list.map((s) => {
                  const pc = s.max_players ? Math.round((s.playing / s.max_players) * 100) : 0;
                  return (
                    <div key={s.id} className={"srv-row" + (picked === s.id ? " sel" : "")} onClick={() => setPicked(s.id)} style={{ cursor: "pointer" }}>
                      <span className={"radio" + (picked === s.id ? " on" : "")} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{s.id.slice(0, 8)}…{s.id.slice(-4)}</span>
                      <span className="inline" style={{ flexWrap: "nowrap" }}>
                        <span className="bar" style={{ flex: 1 }}><i style={{ width: pc + "%" }} /></span>
                        <span style={{ minWidth: 44 }}>{s.playing}/{s.max_players}</span>
                      </span>
                      <span style={{ color: "var(--faint)" }}>—</span>
                      <span style={{ fontWeight: 600, color: s.ping == null ? "var(--muted)" : s.ping < 80 ? "var(--ok)" : s.ping < 140 ? "var(--warn)" : "var(--crit)" }}>{s.ping == null ? "—" : s.ping + " ms"}</span>
                      <span>{s.fps == null ? "—" : s.fps.toFixed(1)}</span>
                      <button className="icon-btn" aria-label="Copy ID" onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(s.id).then(() => store.toast("ID copied.")).catch(() => {}); }}><IconCopy /></button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="send-bar">
            <div>
              <div className="inline" style={{ marginBottom: 10, gap: 8 }}>
                <span className={"radio" + (picked ? " on" : "")} /><b>{picked ? `Server ${picked.slice(0, 8)}…` : "No server picked"}</b>
                {place && <span className="sub">· place {place}</span>}
              </div>
              <div className="who">
                {usable.map((a) => (
                  <button key={a.id} className={"who-chip" + (senders.has(a.id) ? " on" : "")} onClick={() => toggleSender(a.id)}>
                    <i className="c" style={{ background: a.color || "var(--brand)" }} />{a.alias || a.username}
                    {(a.presence === "InGame" || a.running) && <small>· already in game</small>}
                  </button>
                ))}
                {usable.length === 0 && <span className="sub">No account available.</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <button className="btn primary" disabled={busy || !picked || senders.size === 0} onClick={() => void send()}>
                <IconSend />{!senders.size ? "Pick an account first" : `Send ${senders.size} account${senders.size !== 1 ? "s" : ""}`}<span className="kbd" style={{ marginLeft: 4 }}>Ctrl ↵</span>
              </button>
              {!picked && <div className="sub" style={{ marginTop: 6 }}>Pick a server first</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

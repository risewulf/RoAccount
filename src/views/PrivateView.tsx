import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { PrivateServer } from "../lib/types";
import { IconRefresh } from "../components/icons";

export function PrivateView() {
  const store = useStore();
  const { accounts, selected, settings } = store;
  const usable = accounts.filter((a) => a.health !== "cookie_expired");
  const [accId, setAccId] = useState<string>("");
  const [servers, setServers] = useState<PrivateServer[] | null>(null);
  const [busy, setBusy] = useState(false);

  // achat
  const [target, setTarget] = useState(settings.target);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!accId && usable.length) setAccId(usable[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  async function load() {
    if (!accId) return;
    setBusy(true);
    try { setServers(await api.listPrivateServers(accId)); }
    catch (e) { store.toast(String(e)); setServers([]); } finally { setBusy(false); }
  }

  async function buy() {
    const p = Number(price);
    if (!accId || !name.trim() || !Number.isFinite(p) || p < 0) { store.toast("Enter the game, a name and the price shown by Roblox."); return; }
    setBusy(true);
    try {
      await api.buyPrivateServer(accId, target, name.trim(), p);
      store.toast("Private server bought.");
      setOk(false); setName("");
      await load();
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function update(s: PrivateServer, patch: { name?: string; newLink?: boolean; active?: boolean }) {
    try {
      await api.updatePrivateServer(accId, s.id, patch);
      store.toast("Private server updated.");
      await load();
    } catch (e) { store.toast(String(e)); }
  }

  function rename(s: PrivateServer) {
    const n = window.prompt("New private server name:", s.name);
    if (n && n.trim() && n.trim() !== s.name) void update(s, { name: n.trim() });
  }

  function regenerate(s: PrivateServer) {
    if (window.confirm("Generate a new link? The old link will stop working.")) void update(s, { newLink: true });
  }

  function useLink(s: PrivateServer) {
    if (!s.link) { store.toast("Roblox gave no link for this server."); return; }
    store.updateSettings({ privateLink: s.link, serverMode: "private" });
    store.toast(`“Private server” mode on (${selected.size || "0"} account(s) selected) — launch from the Launch tab.`);
  }

  async function copy(s: PrivateServer) {
    if (!s.link) return;
    try { await navigator.clipboard.writeText(s.link); store.toast("Link copied."); }
    catch { store.toast(s.link); }
  }

  return (
    <section>
      <div className="vhead">
        <div><h1>Private servers</h1><p>Buy and manage your accounts' private servers, then launch your selection into them.</p></div>
        <button className="btn" onClick={load} disabled={busy || !accId}><IconRefresh />{busy ? "Loading…" : "Load"}</button>
      </div>

      <div className="card">
        <h3>Account</h3>
        <p className="sub">Private servers belong to a specific account.</p>
        <select className="sort-select select-wide" value={accId} onChange={(e) => { setAccId(e.target.value); setServers(null); }} aria-label="Account">
          {usable.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
        </select>
      </div>

      <div className="card">
        <h3>My private servers</h3>
        {servers === null ? (
          <div className="placeholder">Click “Load” to show this account's private servers.</div>
        ) : servers.length === 0 ? (
          <div className="placeholder">No private server on this account.</div>
        ) : (
          <div className="tscroll">
            <table className="table">
              <thead><tr><th>Name</th><th>Game</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.game || "—"}</td>
                    <td>{s.active == null ? "—" : s.active ? <span className="badge fav">actif</span> : <span className="badge">off</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => useLink(s)} disabled={!s.link}>Use</button>{" "}
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => copy(s)} disabled={!s.link}>Copy link</button>{" "}
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => rename(s)}>Rename</button>{" "}
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => regenerate(s)}>New link</button>{" "}
                      {s.active != null && (
                        <button className="btn" style={{ padding: "6px 10px" }} onClick={() => update(s, { active: !s.active })}>
                          {s.active ? "Turn off" : "Turn on"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Buy a private server</h3>
        <p className="sub">Spends Robux from the chosen account. Enter exactly the monthly price Roblox shows for this game: if it doesn't match, Roblox refuses the purchase.</p>
        <label className="field" style={{ marginBottom: 8 }}>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="roblox.com/games/… or place ID" />
        </label>
        <label className="field" style={{ marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name" maxLength={50} />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="Price in Robux (e.g. 100)" inputMode="numeric" />
        </label>
        <label className="inline" style={{ marginBottom: 12, fontSize: 13 }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          I confirm spending {price || "…"} Robux on account {usable.find((a) => a.id === accId)?.username ?? "…"}.
        </label>
        <button className="btn primary" disabled={busy || !ok || !name.trim() || !price} onClick={buy}>Buy</button>
      </div>
    </section>
  );
}

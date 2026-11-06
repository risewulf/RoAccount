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
    if (!accId || !name.trim() || !Number.isFinite(p) || p < 0) { store.toast("Renseigne le jeu, un nom et le prix affiché par Roblox."); return; }
    setBusy(true);
    try {
      await api.buyPrivateServer(accId, target, name.trim(), p);
      store.toast("Serveur privé acheté.");
      setOk(false); setName("");
      await load();
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function update(s: PrivateServer, patch: { name?: string; newLink?: boolean; active?: boolean }) {
    try {
      await api.updatePrivateServer(accId, s.id, patch);
      store.toast("Serveur privé mis à jour.");
      await load();
    } catch (e) { store.toast(String(e)); }
  }

  function rename(s: PrivateServer) {
    const n = window.prompt("Nouveau nom du serveur privé :", s.name);
    if (n && n.trim() && n.trim() !== s.name) void update(s, { name: n.trim() });
  }

  function regenerate(s: PrivateServer) {
    if (window.confirm("Générer un nouveau lien ? L'ancien lien ne fonctionnera plus.")) void update(s, { newLink: true });
  }

  function useLink(s: PrivateServer) {
    if (!s.link) { store.toast("Roblox n'a pas fourni de lien pour ce serveur."); return; }
    store.updateSettings({ privateLink: s.link, serverMode: "private" });
    store.toast(`Mode « Serveur privé » activé (${selected.size || "0"} compte(s) sélectionné(s)) — lance depuis l'onglet Lancement.`);
  }

  async function copy(s: PrivateServer) {
    if (!s.link) return;
    try { await navigator.clipboard.writeText(s.link); store.toast("Lien copié."); }
    catch { store.toast(s.link); }
  }

  return (
    <section>
      <div className="vhead">
        <div><h1>Serveurs privés</h1><p>Achète et gère les serveurs privés de tes comptes, puis lance-y ta sélection.</p></div>
        <button className="btn" onClick={load} disabled={busy || !accId}><IconRefresh />{busy ? "Chargement…" : "Charger"}</button>
      </div>

      <div className="card">
        <h3>Compte</h3>
        <p className="sub">Les serveurs privés appartiennent à un compte précis.</p>
        <select className="sort-select select-wide" value={accId} onChange={(e) => { setAccId(e.target.value); setServers(null); }} aria-label="Compte">
          {usable.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
        </select>
      </div>

      <div className="card">
        <h3>Mes serveurs privés</h3>
        {servers === null ? (
          <div className="placeholder">Clique sur « Charger » pour afficher les serveurs privés de ce compte.</div>
        ) : servers.length === 0 ? (
          <div className="placeholder">Aucun serveur privé sur ce compte.</div>
        ) : (
          <div className="tscroll">
            <table className="table">
              <thead><tr><th>Nom</th><th>Jeu</th><th>État</th><th></th></tr></thead>
              <tbody>
                {servers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.game || "—"}</td>
                    <td>{s.active == null ? "—" : s.active ? <span className="badge fav">actif</span> : <span className="badge">désactivé</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => useLink(s)} disabled={!s.link}>Utiliser</button>{" "}
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => copy(s)} disabled={!s.link}>Copier le lien</button>{" "}
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => rename(s)}>Renommer</button>{" "}
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => regenerate(s)}>Nouveau lien</button>{" "}
                      {s.active != null && (
                        <button className="btn" style={{ padding: "6px 10px" }} onClick={() => update(s, { active: !s.active })}>
                          {s.active ? "Désactiver" : "Activer"}
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
        <h3>Acheter un serveur privé</h3>
        <p className="sub">Dépense des Robux du compte choisi. Saisis exactement le prix mensuel affiché par Roblox pour ce jeu : s'il ne correspond pas, Roblox refuse l'achat.</p>
        <label className="field" style={{ marginBottom: 8 }}>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="roblox.com/games/… ou place ID" />
        </label>
        <label className="field" style={{ marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du serveur" maxLength={50} />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="Prix en Robux (ex. 100)" inputMode="numeric" />
        </label>
        <label className="inline" style={{ marginBottom: 12, fontSize: 13 }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          Je confirme dépenser {price || "…"} Robux sur le compte {usable.find((a) => a.id === accId)?.username ?? "…"}.
        </label>
        <button className="btn primary" disabled={busy || !ok || !name.trim() || !price} onClick={buy}>Acheter</button>
      </div>
    </section>
  );
}

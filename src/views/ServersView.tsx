import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { ServerInfo } from "../lib/types";
import { IconGlobe, IconSearch, IconSend } from "../components/icons";

export function ServersView() {
  const store = useStore();
  const { accounts, selected, settings } = store;
  const [target, setTarget] = useState(settings.target);
  const [servers, setServers] = useState<ServerInfo[] | null>(null);
  const [busy, setBusy] = useState(false);

  // compte utilisé pour « Envoyer » : premier sélectionné, sinon premier compte
  const sender = accounts.find((a) => selected.has(a.id)) ?? accounts[0] ?? null;

  async function browse() {
    setBusy(true);
    try {
      setServers(await api.listServers(target));
      store.updateSettings({ target });
    } catch (e) { store.toast(String(e)); setServers([]); } finally { setBusy(false); }
  }

  async function send(jobId: string) {
    if (!sender) { store.toast("Aucun compte disponible."); return; }
    try {
      await api.sendToServer(sender.id, target, jobId);
      store.patch(sender.id, { running: true, presence: "InGame" });
      store.toast(`${sender.username} envoyé dans le serveur.`);
    } catch (e) { store.toast(String(e)); }
  }

  return (
    <section>
      <div className="vhead"><div><h1>Navigateur de serveurs</h1><p>Parcours les parties publiques et envoie un compte dans celle de ton choix.</p></div></div>

      <div className="target" style={{ marginBottom: 14 }}>
        <IconSearch />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="roblox.com/games/… ou place ID" onKeyDown={(e) => e.key === "Enter" && browse()} />
        <button className="btn primary" disabled={busy} onClick={browse}><IconGlobe />{busy ? "Recherche…" : "Parcourir"}</button>
      </div>

      {sender && (
        <p className="hint" style={{ marginBottom: 12 }}>
          Compte utilisé pour « Envoyer » : <b>{sender.username}</b>{" "}
          (le premier sélectionné dans Comptes).
        </p>
      )}

      <div className="card">
        {servers === null ? (
          <div className="placeholder">Lance une recherche pour voir les serveurs.</div>
        ) : servers.length === 0 ? (
          <div className="placeholder">Aucun serveur public trouvé pour cette cible.</div>
        ) : (
          <div className="tscroll">
            <table className="table">
              <thead><tr><th>Serveur</th><th>Joueurs</th><th>Remplissage</th><th>Ping</th><th></th></tr></thead>
              <tbody>
                {servers.map((s) => {
                  const pc = s.max_players ? Math.round((s.playing / s.max_players) * 100) : 0;
                  const pingc = s.ping == null ? "var(--muted)" : s.ping < 60 ? "var(--ok)" : s.ping < 130 ? "var(--warn)" : "var(--crit)";
                  return (
                    <tr key={s.id}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.id.slice(0, 12)}…</td>
                      <td>{s.playing}/{s.max_players}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="bar"><i style={{ width: pc + "%" }} /></div>
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>{pc}%</span>
                        </div>
                      </td>
                      <td className="ping" style={{ color: pingc }}>{s.ping == null ? "—" : s.ping + " ms"}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn" style={{ padding: "6px 11px" }} onClick={() => send(s.id)} disabled={!sender}>
                          <IconSend />Envoyer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

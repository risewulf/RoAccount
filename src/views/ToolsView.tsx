import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { FriendReport, ImportReport, PcInfo } from "../lib/types";

/** Réglages conseillés d'après la machine. */
export function recommend(pc: PcInfo) {
  const ramBased = Math.max(1, Math.floor((pc.ram_total_mb - 3072) / 1200)); // ~1,2 Go / client, 3 Go réservés au système
  const cpuBased = Math.max(1, Math.floor(pc.cpu_threads * 0.75));
  const maxClients = Math.min(ramBased, cpuBased);
  const cooldownMs = pc.cpu_threads >= 12 ? 5000 : pc.cpu_threads >= 6 ? 8000 : 12000;
  const layout: "fit" | "tiny" = maxClients > 4 ? "tiny" : "fit";
  const mute = maxClients > 2;
  return { maxClients, cooldownMs, layout, mute, ramBased, cpuBased };
}

export function ToolsView() {
  const store = useStore();
  const { accounts, selected, settings } = store;

  // ---- Ce PC
  const [pc, setPc] = useState<PcInfo | null>(null);
  const [applying, setApplying] = useState(false);
  useEffect(() => { api.pcInfo().then(setPc).catch((e) => store.toast(String(e))); /* eslint-disable-next-line */ }, []);
  const reco = pc ? recommend(pc) : null;

  async function applyReco() {
    if (!reco) return;
    setApplying(true);
    try {
      store.updateSettings({ cooldownMs: reco.cooldownMs, windowLayout: reco.layout, muteOnLaunch: reco.mute });
      let n = 0;
      if (reco.maxClients > 2) {
        for (const p of await api.monitorProcesses()) { try { await api.setPriority(p.pid, "below"); n++; } catch { /* ignore */ } }
      }
      store.toast(`Réglages appliqués${n ? ` · priorité basse sur ${n} client(s)` : ""}.`);
    } catch (e) { store.toast(String(e)); } finally { setApplying(false); }
  }

  // ---- Rendre amis
  const bulk = accounts.filter((a) => selected.has(a.id) && !a.main && a.health !== "cookie_expired");
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendRep, setFriendRep] = useState<FriendReport | null>(null);
  async function makeFriends() {
    const pairs = (bulk.length * (bulk.length - 1)) / 2;
    if (!window.confirm(`Envoyer et accepter ${pairs} demande(s) d'ami entre ${bulk.length} comptes ? Compte environ ${Math.ceil(pairs * 3.5 / 60)} min.`)) return;
    setFriendBusy(true); setFriendRep(null);
    try { setFriendRep(await api.friendAccounts(bulk.map((a) => a.id))); }
    catch (e) { store.toast(String(e)); } finally { setFriendBusy(false); }
  }

  // ---- Import / export
  const [text, setText] = useState("");
  const [group, setGroup] = useState("");
  const [impBusy, setImpBusy] = useState(false);
  const [impRep, setImpRep] = useState<ImportReport | null>(null);
  async function doImport() {
    setImpBusy(true); setImpRep(null);
    try {
      const rep = await api.importAccounts(text, group.trim() || undefined);
      setImpRep(rep);
      if (rep.added) { setText(""); await store.reload(); void store.refreshAll(); }
    } catch (e) { store.toast(String(e)); } finally { setImpBusy(false); }
  }

  const [warned, setWarned] = useState(false);
  const [exportPath, setExportPath] = useState<string | null>(null);
  async function doExport(format: "json" | "cookies") {
    try { setExportPath(await api.exportCookies([...selected], format)); }
    catch (e) { store.toast(String(e)); }
  }

  const fmtGo = (mb: number) => (mb / 1024).toFixed(1) + " Go";
  const runningCount = accounts.filter((a) => a.running).length;

  return (
    <section>
      <div className="vhead"><div><h1>Outils</h1><p>Optimisation du PC, amis entre comptes, import et export.</p></div></div>

      <div className="card">
        <h3>Pour ce PC</h3>
        <p className="sub">RoAccount mesure ta machine et propose les réglages adaptés au nombre de clients que tu peux faire tourner.</p>
        {!pc ? <div className="placeholder">Mesure en cours…</div> : reco && (
          <>
            <div className="reco">
              <div className="tot"><div className="k">Processeur</div><div className="v" style={{ fontSize: 13 }}>{pc.cpu_name || "—"}</div></div>
              <div className="tot"><div className="k">Threads</div><div className="v">{pc.cpu_threads}</div></div>
              <div className="tot"><div className="k">RAM libre / totale</div><div className="v" style={{ fontSize: 15 }}>{fmtGo(pc.ram_free_mb)} / {fmtGo(pc.ram_total_mb)}</div></div>
              <div className="tot"><div className="k">Clients conseillés</div><div className="v" style={{ color: "var(--ok)" }}>{reco.maxClients}</div></div>
            </div>
            <ul className="tips">
              <li>Jusqu'à <b>{reco.maxClients}</b> clients en même temps (limite mémoire : {reco.ramBased}, limite processeur : {reco.cpuBased}).{runningCount > reco.maxClients ? " Tu en as plus en cours : surveille les ralentissements." : ""}</li>
              <li>Délai entre lancements conseillé : <b>{reco.cooldownMs / 1000} s</b> (actuel : {(settings.cooldownMs / 1000).toFixed(0)} s).</li>
              <li>Disposition conseillée : <b>{reco.layout === "tiny" ? "Tiny (vignettes)" : "Fit (plein écran)"}</b>.</li>
              {reco.mute && <li>Couper le son au lancement des lots pour éviter le bruit de {reco.maxClients} clients.</li>}
              {reco.maxClients > 2 && <li>Priorité CPU « basse » sur les clients en arrière-plan.</li>}
              <li>Dans Roblox : Échap → Paramètres → qualité graphique manuelle au minimum, et limite les FPS des clients secondaires.</li>
            </ul>
            <button className="btn primary" onClick={applyReco} disabled={applying}>{applying ? "…" : "Appliquer ces réglages"}</button>
          </>
        )}
      </div>

      <div className="card">
        <h3>Rendre amis</h3>
        <p className="sub">Envoie une demande d'ami entre chaque paire de comptes sélectionnés et l'accepte automatiquement. Le compte MAIN est exclu. 12 comptes maximum par passe.</p>
        <button className="btn primary" onClick={makeFriends} disabled={friendBusy || bulk.length < 2}>
          {friendBusy ? "En cours… (ne ferme pas l'app)" : `Rendre amis (${bulk.length} comptes)`}
        </button>
        {bulk.length < 2 && <p className="hint" style={{ marginTop: 8 }}>Coche au moins 2 comptes dans l'onglet Comptes.</p>}
        {friendRep && (
          <div className="report">
            <b>{friendRep.sent}</b> demande(s) envoyée(s), <b>{friendRep.accepted}</b> acceptée(s), <b>{friendRep.already}</b> déjà amis sur {friendRep.pairs} paire(s).
            {friendRep.failed.length > 0 && <ul>{friendRep.failed.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Importer des comptes</h3>
        <p className="sub">Colle un export JSON de Roblox Account Manager (ou de RoAccount), des cookies .ROBLOSECURITY (un par ligne, « user:pass:cookie » accepté), ou le chemin d'un fichier.</p>
        <textarea className="code" style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Colle ici les cookies, l'export JSON ou un chemin de fichier…" spellCheck={false} />
        <div className="inline" style={{ marginTop: 10 }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Groupe (par défaut : Importé)" />
          </label>
          <button className="btn primary" onClick={doImport} disabled={impBusy || !text.trim()}>{impBusy ? "Import…" : "Importer"}</button>
        </div>
        {impRep && (
          <div className="report">
            <b>{impRep.added}</b> compte(s) ajouté(s) sur <b>{impRep.found}</b> trouvé(s).
            {impRep.failed.length > 0 && <ul>{impRep.failed.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Exporter les cookies</h3>
        <p className="sub">Écrit les cookies <b>en clair</b> dans un fichier (pour migrer vers un autre outil). Quiconque lit ce fichier prend le contrôle des comptes : supprime-le après usage. {selected.size ? `${selected.size} compte(s) sélectionné(s).` : "Aucune sélection : tous les comptes seront exportés."}</p>
        <label className="inline" style={{ marginBottom: 12, fontSize: 13 }}>
          <input type="checkbox" checked={warned} onChange={(e) => setWarned(e.target.checked)} />
          Je comprends que le fichier n'est pas chiffré.
        </label>
        <div className="inline">
          <button className="btn" disabled={!warned} onClick={() => doExport("json")}>Exporter en JSON</button>
          <button className="btn" disabled={!warned} onClick={() => doExport("cookies")}>Exporter en liste de cookies</button>
        </div>
        {exportPath && <div className="report">Fichier créé : <b style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{exportPath}</b></div>}
      </div>
    </section>
  );
}

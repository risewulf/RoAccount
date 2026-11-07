import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { FriendReport, ImportReport, PcInfo } from "../lib/types";
import { isDead } from "../lib/launcher";

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
      store.toast(`Settings applied${n ? ` · low priority on ${n} client(s)` : ""}.`);
    } catch (e) { store.toast(String(e)); } finally { setApplying(false); }
  }

  // ---- Make friends
  const bulk = accounts.filter((a) => selected.has(a.id) && !a.main && !isDead(a));
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendRep, setFriendRep] = useState<FriendReport | null>(null);
  async function makeFriends() {
    const pairs = (bulk.length * (bulk.length - 1)) / 2;
    if (!window.confirm(`Send and accept ${pairs} friend request(s) between ${bulk.length} accounts? Takes about ${Math.ceil(pairs * 3.5 / 60)} min.`)) return;
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

  const fmtGo = (mb: number) => (mb / 1024).toFixed(1) + " GB";
  const runningCount = accounts.filter((a) => a.running).length;

  return (
    <section>
      <div className="vhead"><div><h1>Tools</h1><p>PC optimisation, friends between accounts, import and export.</p></div></div>

      <div className="card">
        <h3>For this PC</h3>
        <p className="sub">RoAccount measures your machine and suggests settings suited to how many clients you can run.</p>
        {!pc ? <div className="placeholder">Measuring…</div> : reco && (
          <>
            <div className="reco">
              <div className="tot"><div className="k">CPU</div><div className="v" style={{ fontSize: 13 }}>{pc.cpu_name || "—"}</div></div>
              <div className="tot"><div className="k">Threads</div><div className="v">{pc.cpu_threads}</div></div>
              <div className="tot"><div className="k">Free / total RAM</div><div className="v" style={{ fontSize: 15 }}>{fmtGo(pc.ram_free_mb)} / {fmtGo(pc.ram_total_mb)}</div></div>
              <div className="tot"><div className="k">Recommended clients</div><div className="v" style={{ color: "var(--ok)" }}>{reco.maxClients}</div></div>
            </div>
            <ul className="tips">
              <li>Up to <b>{reco.maxClients}</b> clients at the same time (memory limit: {reco.ramBased}, CPU limit: {reco.cpuBased}).{runningCount > reco.maxClients ? " You have more running: watch for slowdowns." : ""}</li>
              <li>Recommended launch delay: <b>{reco.cooldownMs / 1000} s</b> (current: {(settings.cooldownMs / 1000).toFixed(0)} s).</li>
              <li>Recommended layout: <b>{reco.layout === "tiny" ? "Tiny (thumbnails)" : "Fit (full screen)"}</b>.</li>
              {reco.mute && <li>Mute on batch launch to avoid the noise of {reco.maxClients} clients.</li>}
              {reco.maxClients > 2 && <li>“Low” CPU priority on background clients.</li>}
              <li>In Roblox: Esc → Settings → manual graphics quality at minimum, and limit the FPS of secondary clients.</li>
            </ul>
            <button className="btn primary" onClick={applyReco} disabled={applying}>{applying ? "…" : "Apply these settings"}</button>
          </>
        )}
      </div>

      <div className="card">
        <h3>Make friends</h3>
        <p className="sub">Sends a friend request between each pair of selected accounts and accepts it automatically. The MAIN account is excluded. 12 accounts maximum per pass.</p>
        <button className="btn primary" onClick={makeFriends} disabled={friendBusy || bulk.length < 2}>
          {friendBusy ? "Working… (don't close the app)" : `Make friends (${bulk.length} accounts)`}
        </button>
        {bulk.length < 2 && <p className="hint" style={{ marginTop: 8 }}>Tick at least 2 accounts in the Accounts tab.</p>}
        {friendRep && (
          <div className="report">
            <b>{friendRep.sent}</b> request(s) sent, <b>{friendRep.accepted}</b> accepted, <b>{friendRep.already}</b> already friends out of {friendRep.pairs} pair(s).
            {friendRep.failed.length > 0 && <ul>{friendRep.failed.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Import accounts</h3>
        <p className="sub">Paste a Roblox Account Manager (or RoAccount) JSON export, .ROBLOSECURITY cookies (one per line, “user:pass:cookie” accepted), or a file path.</p>
        <textarea className="code" style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste cookies, the JSON export or a file path here…" spellCheck={false} />
        <div className="inline" style={{ marginTop: 10 }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group (default: Imported)" />
          </label>
          <button className="btn primary" onClick={doImport} disabled={impBusy || !text.trim()}>{impBusy ? "Import…" : "Import"}</button>
        </div>
        {impRep && (
          <div className="report">
            <b>{impRep.added}</b> account(s) added out of <b>{impRep.found}</b> found.
            {impRep.failed.length > 0 && <ul>{impRep.failed.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}</ul>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Export cookies</h3>
        <p className="sub">Writes the cookies <b>in clear text</b> to a file (to migrate to another tool). Anyone who reads this file takes control of the accounts: delete it after use. {selected.size ? `${selected.size} account(s) selected.` : "No selection: every account will be exported."}</p>
        <label className="inline" style={{ marginBottom: 12, fontSize: 13 }}>
          <input type="checkbox" checked={warned} onChange={(e) => setWarned(e.target.checked)} />
          I understand the file is not encrypted.
        </label>
        <div className="inline">
          <button className="btn" disabled={!warned} onClick={() => doExport("json")}>Export as JSON</button>
          <button className="btn" disabled={!warned} onClick={() => doExport("cookies")}>Export as a cookie list</button>
        </div>
        {exportPath && <div className="report">File created: <b style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{exportPath}</b></div>}
      </div>
    </section>
  );
}

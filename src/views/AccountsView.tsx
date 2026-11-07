import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountMeta } from "../lib/types";
import { api } from "../lib/api";
import { useStore } from "../store";
import { Avatar } from "../components/Avatar";
import { RevealCookieModal } from "../components/RevealCookieModal";
import { Toggle } from "../components/Controls";
import { IconCheck, IconKey, IconPlay, IconPlus, IconRefresh, IconSearch, IconTrash, IconUpload } from "../components/icons";

export const TAG_COLORS = ["", "#ff2d46", "#ff9f43", "#3ddc84", "#5aa9ff", "#a06cff", "#ff6ad5"];

export function statusLine(a: AccountMeta): { text: string; color: string } {
  if (a.health === "cookie_expired") return { text: "Déconnecté — à vérifier", color: "var(--warn)" };
  if (a.presence === "InGame") return { text: a.game ? `En jeu · ${a.game}` : "En jeu", color: "var(--ok)" };
  if (a.presence === "Online") return { text: "En ligne", color: "var(--info)" };
  if (a.presence === "Studio") return { text: "Dans Studio", color: "var(--warn)" };
  if (a.presence === "Offline") return { text: "Hors ligne", color: "var(--faint)" };
  return { text: "Non vérifié", color: "var(--muted)" };
}

function loadGroups(): string[] {
  try { return JSON.parse(localStorage.getItem("roaccount.groups") || "[]"); } catch { return []; }
}

/* ------------------------------------------------------------------ */
/* Fiche d'un compte                                                    */
/* ------------------------------------------------------------------ */

export function AccountPanel({ account, groups, wide }: { account: AccountMeta | null; groups: string[]; wide?: boolean }) {
  const store = useStore();
  const [tab, setTab] = useState<"over" | "set" | "cookie">("over");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [alias, setAlias] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => { setAlias(account?.alias ?? ""); setNote(account?.note ?? ""); setConfirmDel(false); }, [account?.id]); // eslint-disable-line

  if (!account) return <aside className="panel"><div className="placeholder">Choisis un compte.</div></aside>;
  const a = account;
  const st = statusLine(a);
  const fmt = (n: number | null) => (n != null ? n.toLocaleString("fr-FR") : "—");

  async function update(patch: Partial<AccountMeta>) {
    try { store.replace(await api.updateAccount(a.id, patch)); } catch (e) { store.toast(String(e)); }
  }
  async function check() {
    setBusy(true);
    try { store.replace(await api.refreshAccount(a.id)); store.toast("Compte vérifié."); } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }
  async function launch() {
    setBusy(true);
    try {
      await api.launchAccount(a.id, store.settings.target);
      store.patch(a.id, { running: true, presence: "InGame" });
      store.toast("Client lancé.");
      window.setTimeout(() => { void check(); }, 8000);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }
  async function remove() {
    try { await api.removeAccount(a.id); store.dropAccount(a.id); store.setCurrent(null); store.toast("Compte retiré."); }
    catch (e) { store.toast(String(e)); }
  }

  return (
    <aside className="panel" style={wide ? { position: "static", maxWidth: 760, margin: "0 auto" } : undefined}>
      <div className="p-head">
        <Avatar account={a} size={60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{a.alias || a.display_name || a.username}</b>
          <span>@{a.username}</span>
          <div style={{ color: "var(--faint)", fontSize: 12.5 }}>ID {a.roblox_id}</div>
        </div>
        <button className={"fav-star" + (a.favorite ? " on" : "")} onClick={() => void update({ favorite: !a.favorite })} aria-label="Favori" title="Favori">★</button>
      </div>

      <div className="seg" style={{ marginBottom: 6 }}>
        <button className={tab === "over" ? "on" : ""} onClick={() => setTab("over")}>Aperçu</button>
        <button className={tab === "set" ? "on" : ""} onClick={() => setTab("set")}>Réglages</button>
        <button className={tab === "cookie" ? "on" : ""} onClick={() => setTab("cookie")}>Cookie</button>
      </div>

      {tab === "over" && (
        <>
          <div className="psec">
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <span className="pill" style={{ color: st.color }}><i className="dot" style={{ background: st.color }} />{st.text}</span>
              <button className="btn sm" disabled={busy} onClick={() => void check()}><IconRefresh />Vérifier</button>
            </div>
          </div>
          {a.presence === "InGame" && (
            <div className="psec">
              <div className="k">Présence</div>
              <div className="game-box">
                {a.game_icon ? <img src={a.game_icon} alt="" /> : <div className="ph" />}
                <div><b>{a.game ?? "Partie en cours"}</b>{a.place_id && <div className="sub">place {a.place_id}</div>}</div>
              </div>
              {a.place_id && (
                <button className="btn sm" onClick={() => void api.openUrl(`https://www.roblox.com/games/${a.place_id}`).catch(() => store.toast("Lien non autorisé."))}>Ouvrir la page du jeu</button>
              )}
            </div>
          )}
          <div className="psec">
            <div className="kv">
              <div><div className="k">Robux</div><div className="v">{fmt(a.robux)}</div></div>
              <div><div className="k">Premium</div><div className="v" style={{ color: a.premium ? "var(--warn)" : "var(--faint)" }}>{a.premium == null ? "—" : a.premium ? "Oui" : "Non"}</div></div>
              <div><div className="k">Amis</div><div className="v">{fmt(a.friends)}</div></div>
              <div><div className="k">Groupe</div><div className="v" style={{ fontSize: 14 }}>{a.group}</div></div>
            </div>
          </div>
          {a.note && <div className="psec"><div className="k">Note</div><div className="note-box">{a.note}</div></div>}
          <div className="act-row">
            <button className="btn primary" disabled={busy} onClick={() => void launch()}><IconPlay />Lancer</button>
          </div>
        </>
      )}

      {tab === "set" && (
        <>
          <div className="psec">
            <div className="k">Alias</div>
            <input className="txt" value={alias} placeholder={a.username} onChange={(e) => setAlias(e.target.value)} onBlur={() => alias !== a.alias && void update({ alias })} />
          </div>
          <div className="psec">
            <div className="k">Groupe</div>
            <select className="sel" style={{ width: "100%" }} value={a.group} onChange={(e) => void update({ group: e.target.value })}>
              {[...new Set([a.group, ...groups])].map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="psec">
            <div className="k">Couleur</div>
            <div className="swatches">
              {TAG_COLORS.map((c) => (
                <button key={c || "none"} className={"swatch" + (a.color === c ? " on" : "") + (c ? "" : " none")} style={c ? { background: c } : undefined} onClick={() => void update({ color: c })} aria-label={c ? "Couleur" : "Aucune couleur"} />
              ))}
            </div>
          </div>
          <div className="psec">
            <div className="k">Note</div>
            <textarea className="code" style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== a.note && void update({ note })} />
          </div>
          <div className="psec">
            <div className="srow" style={{ padding: 0, border: 0 }}>
              <div className="l"><b>Compte MAIN</b><small>Exclu des lots, de « Rendre amis » et de la relance auto.</small></div>
              <div className="r"><Toggle on={a.main} label="Compte MAIN" onChange={(v) => void update({ main: v })} /></div>
            </div>
          </div>
        </>
      )}

      {tab === "cookie" && (
        <>
          <div className="psec">
            <p className="hint" style={{ marginBottom: 12 }}>Le cookie <code>.ROBLOSECURITY</code> donne un accès complet au compte. Ne le partage jamais.</p>
            <button className="btn" onClick={() => setReveal(true)}><IconKey />Révéler le cookie</button>
          </div>
          <div className="psec">
            {!confirmDel ? (
              <button className="btn danger" onClick={() => setConfirmDel(true)}><IconTrash />Retirer ce compte</button>
            ) : (
              <div className="inline">
                <span className="hint">Retirer {a.username} du coffre ?</span>
                <button className="btn sm danger" onClick={() => void remove()}>Oui, retirer</button>
                <button className="btn sm" onClick={() => setConfirmDel(false)}>Annuler</button>
              </div>
            )}
          </div>
        </>
      )}

      {reveal && <RevealCookieModal account={a} onClose={() => setReveal(false)} />}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Page Comptes                                                         */
/* ------------------------------------------------------------------ */

export function AccountsView() {
  const store = useStore();
  const { accounts, selected, settings, current } = store;
  const side = settings.tabLayout === "side";
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Tous");
  const [state, setState] = useState<"all" | "ingame" | "offline" | "check">("all");
  const [custom, setCustom] = useState<string[]>(loadGroups);
  const [newGroup, setNewGroup] = useState(false);
  const [gname, setGname] = useState("");
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener("roa-search", h);
    return () => window.removeEventListener("roa-search", h);
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    accounts.forEach((a) => m.set(a.group, (m.get(a.group) ?? 0) + 1));
    custom.forEach((g) => { if (!m.has(g)) m.set(g, 0); });
    return [...m.entries()];
  }, [accounts, custom]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/^@/, "");
    return [...accounts]
      .filter((a) => {
        if (group !== "Tous" && a.group !== group) return false;
        if (state === "ingame" && a.presence !== "InGame") return false;
        if (state === "offline" && a.presence === "InGame") return false;
        if (state === "check" && a.health !== "cookie_expired") return false;
        return !q || (a.username + " " + a.display_name + " " + a.alias).toLowerCase().includes(q);
      })
      .sort((x, y) => (Number(y.main) - Number(x.main)) || (Number(y.favorite) - Number(x.favorite)) || x.username.localeCompare(y.username));
  }, [accounts, query, group, state]);

  const cur = accounts.find((a) => a.id === current) ?? (side ? null : filtered[0] ?? null);
  const expired = accounts.filter((a) => a.health === "cookie_expired").length;

  function addGroup() {
    const n = gname.trim();
    if (n && !groups.some(([g]) => g === n)) {
      const next = [...custom, n];
      setCustom(next);
      try { localStorage.setItem("roaccount.groups", JSON.stringify(next)); } catch { /* ignore */ }
    }
    setGname(""); setNewGroup(false);
  }

  const [report, setReport] = useState<{ ok: string[]; expired: string[]; failed: string[] } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  /** Teste tous les cookies et en fait un rapport (valides / expirés / erreurs réseau). */
  async function checkAll() {
    setBusy(true);
    const r = { ok: [] as string[], expired: [] as string[], failed: [] as string[] };
    try {
      for (const a of accounts) {
        const label = a.alias || a.username;
        try {
          const m = await api.refreshAccount(a.id);
          store.replace(m);
          (m.health === "cookie_expired" ? r.expired : r.ok).push(label);
        } catch { r.failed.push(label); }
      }
      setReport(r);
    } finally { setBusy(false); }
  }
  function dragIds(e: React.DragEvent, id: string) {
    const ids = selected.has(id) ? [...selected] : [id];
    e.dataTransfer.setData("text/roaccount-ids", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  }
  async function dropOnGroup(e: React.DragEvent, g: string) {
    e.preventDefault();
    setDropOn(null);
    let ids: string[] = [];
    try { ids = JSON.parse(e.dataTransfer.getData("text/roaccount-ids") || "[]"); } catch { /* ignore */ }
    ids = ids.filter((id) => accounts.find((a) => a.id === id)?.group !== g);
    if (!ids.length) return;
    try {
      for (const id of ids) store.replace(await api.updateAccount(id, { group: g }));
      store.toast(`${ids.length} compte(s) déplacé(s) vers « ${g} ».`);
    } catch (err) { store.toast(String(err)); }
  }
  async function launch(a: AccountMeta) {
    try {
      await api.launchAccount(a.id, settings.target);
      store.patch(a.id, { running: true, presence: "InGame" });
      store.toast("Client lancé.");
    } catch (e) { store.toast(String(e)); }
  }

  const pool = filtered.filter((a) => !(a.main && settings.excludeMainFromAll));
  const allOn = pool.length > 0 && pool.every((a) => selected.has(a.id));

  // raccourcis « Tout sélectionner » / « Vérifier la sélection » / « Retirer »
  useEffect(() => {
    const sel = () => store.setSelection(pool.map((a) => a.id), !allOn);
    const chk = async () => {
      const ids = selected.size ? [...selected] : accounts.map((a) => a.id);
      setBusy(true);
      try { for (const id of ids) store.replace(await api.refreshAccount(id)); store.toast("Vérification terminée."); }
      catch (e) { store.toast(String(e)); } finally { setBusy(false); }
    };
    const del = async () => {
      if (!selected.size) return;
      for (const id of [...selected]) { try { await api.removeAccount(id); store.dropAccount(id); } catch (e) { store.toast(String(e)); } }
      store.toast("Sélection retirée.");
    };
    window.addEventListener("roa-selectall", sel);
    window.addEventListener("roa-verify", chk);
    window.addEventListener("roa-delete", del);
    return () => { window.removeEventListener("roa-selectall", sel); window.removeEventListener("roa-verify", chk); window.removeEventListener("roa-delete", del); };
  }); // eslint-disable-line

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Comptes</h1>
          <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {accounts.length} au total{expired > 0 && <span className="tag brand">{expired} à reconnecter</span>}
          </p>
        </div>
        <div className="inline">
          <button className="btn" disabled={busy} onClick={() => void checkAll()}><IconRefresh />Tout vérifier</button>
          <button className="btn" onClick={() => store.setView("outils")}><IconUpload />Exporter les cookies…</button>
          <button className="btn solid" onClick={() => store.setAddOpen(true)}><IconPlus />Ajouter un compte</button>
        </div>
      </div>

      {side ? (
        <AccountPanel account={cur} groups={groups.map(([g]) => g)} wide />
      ) : (
        <>
          <div className="inline" style={{ marginBottom: 12 }}>
            <label className="field" style={{ flex: "1 1 280px", maxWidth: 420 }}>
              <IconSearch />
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrer par nom, @pseudo, id" aria-label="Filtrer les comptes" />
              <span className="kbd">Ctrl F</span>
            </label>
            <select className="sort-select" value={state} onChange={(e) => setState(e.target.value as typeof state)} aria-label="Statut">
              <option value="all">Statut : tous</option>
              <option value="ingame">En jeu</option>
              <option value="offline">Hors jeu</option>
              <option value="check">À vérifier</option>
            </select>
          </div>
          <div className="chips" style={{ marginBottom: 16 }}>
            <button className={"chip" + (group === "Tous" ? " on" : "")} onClick={() => setGroup("Tous")}>Tous</button>
            {groups.map(([g, n]) => (
              <button
                key={g}
                className={"chip" + (group === g ? " on" : "") + (dropOn === g ? " drop" : "")}
                onClick={() => setGroup(g)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropOn !== g) setDropOn(g); }}
                onDragLeave={() => setDropOn((d) => (d === g ? null : d))}
                onDrop={(e) => void dropOnGroup(e, g)}
              >
                <span className="d" style={{ background: "var(--brand)" }} />{g}<span className="n">{n}</span>
              </button>
            ))}
            {newGroup ? (
              <span className="inline">
                <input className="txt" style={{ height: 34, width: 160 }} autoFocus value={gname} onChange={(e) => setGname(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addGroup(); if (e.key === "Escape") setNewGroup(false); }} placeholder="Nom du groupe" />
                <button className="btn sm" onClick={addGroup}>Créer</button>
              </span>
            ) : (
              <button className="chip" onClick={() => setNewGroup(true)}><IconPlus />Nouveau groupe…</button>
            )}
          </div>

          <div className="acc-grid">
            <div className="acc-table">
              {filtered.length === 0 ? (
                <div className="placeholder">Aucun compte. Ajoute-en un avec « Ajouter un compte ».</div>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <span className={"cbx" + (allOn ? " on" : "")} role="checkbox" aria-checked={allOn} tabIndex={0} onClick={() => store.setSelection(pool.map((a) => a.id), !allOn)}><IconCheck /></span>
                        </th>
                        <th>Compte</th><th>Statut</th><th /><th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => {
                        const st = statusLine(a);
                        const on = selected.has(a.id);
                        return (
                          <tr key={a.id} className="hov acc-row" draggable onDragStart={(e) => dragIds(e, a.id)} title="Glisse sur un groupe pour déplacer" style={{ cursor: "pointer", background: cur?.id === a.id ? "var(--surface-2)" : undefined }} onClick={() => store.setCurrent(a.id)}>
                            <td onClick={(e) => e.stopPropagation()}>
                              <span className={"cbx" + (on ? " on" : "")} role="checkbox" aria-checked={on} tabIndex={0} onClick={() => store.toggle(a.id)}><IconCheck /></span>
                            </td>
                            <td>
                              <div className="who">
                                <Avatar account={a} size={38} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    {a.color && <i style={{ width: 8, height: 8, borderRadius: "50%", background: a.color }} />}
                                    {a.alias || a.display_name || a.username}
                                    {a.main && <span className="badge main">MAIN</span>}
                                  </div>
                                  <div className="sub" style={{ fontWeight: 500 }}>@{a.username}</div>
                                </div>
                              </div>
                            </td>
                            <td><span style={{ color: st.color, fontWeight: 600 }}>● </span>{st.text}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button className={"fav-star" + (a.favorite ? " on" : "")} onClick={() => void api.updateAccount(a.id, { favorite: !a.favorite }).then(store.replace)} aria-label="Favori">★</button>
                            </td>
                            <td className="r" onClick={(e) => e.stopPropagation()}>
                              {a.presence !== "InGame" && !a.running && <button className="icon-btn" title="Lancer" aria-label="Lancer" onClick={() => void launch(a)}><IconPlay /></button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <AccountPanel account={cur} groups={groups.map(([g]) => g)} />
          </div>
        </>
      )}

      {report && (
        <div className="overlay" onClick={() => setReport(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Vérification des comptes</h3>
            <div className="health-sum">
              <div><b style={{ color: "var(--ok)" }}>{report.ok.length}</b><span>valide{report.ok.length > 1 ? "s" : ""}</span></div>
              <div><b style={{ color: "var(--warn)" }}>{report.expired.length}</b><span>à reconnecter</span></div>
              <div><b style={{ color: "var(--crit)" }}>{report.failed.length}</b><span>erreur{report.failed.length > 1 ? "s" : ""} réseau</span></div>
            </div>
            {report.expired.length > 0 && <p><b>Cookie expiré :</b> {report.expired.join(", ")}. Reconnecte-les avec « Ajouter un compte → Roblox login ».</p>}
            {report.failed.length > 0 && <p><b>Non testés :</b> {report.failed.join(", ")}. Vérifie ta connexion et réessaie.</p>}
            {report.expired.length === 0 && report.failed.length === 0 && <p>Tous les cookies sont valides.</p>}
            <div className="dialog-actions">
              {report.expired.length > 0 && <button className="btn" onClick={() => { setState("check"); setReport(null); }}>Voir les comptes à reconnecter</button>}
              <button className="btn solid" onClick={() => setReport(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { AccountMeta } from "../lib/types";
import { Avatar } from "../components/Avatar";
import { Seg } from "../components/Controls";
import { IconCheck, IconPlay, IconPlus, IconSearch, IconServer, IconUser, IconX } from "../components/icons";

interface Fav { name: string; target: string; }
interface Prog { stage: string; error?: string | null; }

const STAGES = ["TKT", "RUN", "JOIN", "IN"];

function loadFavs(): Fav[] {
  try { const r = localStorage.getItem("roaccount.profiles"); if (r) return JSON.parse(r); } catch { /* ignore */ }
  return [
    { name: "Adopt Me!", target: "roblox.com/games/920587237/Adopt-Me" },
    { name: "Pet Sim 99", target: "roblox.com/games/8737899170" },
  ];
}

/** Ce que l'utilisateur a collé : jeu, serveur privé, joueur à suivre… */
function detect(t: string): { kind: "game" | "private" | "user" | "none"; label: string } {
  const s = t.trim();
  if (!s) return { kind: "none", label: "Colle un lien de jeu, un serveur privé, un ID de place ou un @pseudo." };
  if (s.includes("privateServerLinkCode") || s.includes("share?code=")) return { kind: "private", label: "Serveur privé détecté" };
  if (s.startsWith("@") || s.includes("/users/")) return { kind: "user", label: `Rejoindre ${s.startsWith("@") ? s : "ce joueur"}` };
  const m = s.match(/games\/(\d+)/) ?? s.match(/^(\d+)$/);
  if (m) return { kind: "game", label: `Jeu · place ${m[1]}` };
  return { kind: "none", label: "Cible non reconnue." };
}

function statusOf(a: AccountMeta, excludeMain: boolean): { text: string; warn: boolean; disabled: boolean } {
  // Un compte MAIN reste lançable quand on le choisit à la main : l'exclusion ne vaut que pour « tout sélectionner ».
  const note = a.main && excludeMain ? " · hors sélection auto" : "";
  if (a.health === "cookie_expired") return { text: "À vérifier", warn: true, disabled: true };
  if (a.presence === "InGame" || a.running) return { text: "Déjà en jeu", warn: false, disabled: true };
  if (a.presence === "Online" || a.presence === "Studio") return { text: "En ligne" + note, warn: false, disabled: false };
  if (a.presence === "Offline") return { text: "Hors ligne" + note, warn: false, disabled: false };
  return { text: "Non vérifié" + note, warn: false, disabled: false };
}

export function JouerView() {
  const store = useStore();
  const { accounts, selected, settings } = store;
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("Tous");
  const [favs, setFavs] = useState<Fav[]>(loadFavs);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const det = detect(settings.target);

  // progression d'un lot, envoyée par le backend
  useEffect(() => {
    let off: (() => void) | undefined;
    void api.onBatch((e) => setProg((p) => ({ ...p, [e.id]: { stage: e.stage, error: e.error } }))).then((u) => { off = u; });
    return () => { off?.(); };
  }, []);

  // « Lancer » : Ctrl+Entrée
  const launchRef = useRef<() => void>(() => {});
  useEffect(() => {
    const h = () => launchRef.current();
    window.addEventListener("roa-play", h);
    return () => window.removeEventListener("roa-play", h);
  }, []);
  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener("roa-search", h);
    return () => window.removeEventListener("roa-search", h);
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    accounts.forEach((a) => m.set(a.group, (m.get(a.group) ?? 0) + 1));
    return [...m.entries()];
  }, [accounts]);

  const list = accounts.filter((a) => {
    if (group !== "Tous" && a.group !== group) return false;
    const t = (a.username + " " + a.display_name + " " + a.alias).toLowerCase();
    return !q || t.includes(q.replace(/^@/, "").toLowerCase());
  });

  const picked = accounts.filter((a) => selected.has(a.id));
  const usable = picked.filter((a) => !statusOf(a, settings.excludeMainFromAll).disabled);

  function saveFav() {
    const name = settings.target.split("/").filter(Boolean).pop() || settings.target;
    if (!settings.target.trim() || favs.some((f) => f.target === settings.target)) return;
    const next = [...favs, { name: name.slice(0, 24), target: settings.target }];
    setFavs(next);
    try { localStorage.setItem("roaccount.profiles", JSON.stringify(next)); } catch { /* ignore */ }
    store.toast("Favori enregistré.");
  }
  function dropFav(t: string) {
    const next = favs.filter((f) => f.target !== t);
    setFavs(next);
    try { localStorage.setItem("roaccount.profiles", JSON.stringify(next)); } catch { /* ignore */ }
  }

  async function launch() {
    if (busy) return;
    const ids = usable.map((a) => a.id);
    if (!ids.length) { store.toast("Choisis au moins un compte disponible."); return; }
    if (det.kind === "none") { store.toast("Colle une cible valide (lien de jeu, serveur privé, ID de place ou @pseudo)."); return; }
    setBusy(true);
    setBatchIds(ids);
    setProg(Object.fromEntries(ids.map((id) => [id, { stage: "queued" }])));
    setStartedAt(Date.now());
    try {
      let launched: string[];
      if (det.kind === "user") {
        launched = await api.followUser(ids, settings.target.trim(), settings.cooldownMs);
        ids.forEach((id) => setProg((p) => ({ ...p, [id]: { stage: "join" } })));
      } else {
        const privateLink = det.kind === "private" ? settings.target.trim() : settings.privateLink;
        const mode = det.kind === "private" ? "private" : settings.serverMode;
        if (mode === "private" && !privateLink.trim()) { store.toast("Colle le lien du serveur privé."); setBusy(false); return; }
        launched = await api.launchBatchServers(ids, settings.target, mode, privateLink, settings.cooldownMs);
      }
      launched.forEach((id) => store.patch(id, { running: true, presence: "InGame" }));
      store.toast(`${launched.length} client(s) lancé(s).`);
      window.setTimeout(() => { void store.refreshAll(); }, 8000);
      if (settings.minimizeOnLaunch) window.setTimeout(() => { void api.windowAction(null, "minimize").catch(() => {}); }, 12000);
      else if (settings.tinyOnLaunch) window.setTimeout(() => { void api.arrangeWindows("tiny").catch(() => {}); }, 12000);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }
  launchRef.current = () => { void launch(); };

  async function cancel() {
    try { await api.cancelBatch(); store.toast("Lot annulé : les comptes restants ne seront pas lancés."); } catch (e) { store.toast(String(e)); }
  }

  // une fois « joined », la présence Roblox confirme que le compte est en jeu
  const rows = batchIds.map((id) => {
    const a = accounts.find((x) => x.id === id)!;
    const p = prog[id] ?? { stage: "queued" };
    const inGame = a?.presence === "InGame" && ["join"].includes(p.stage);
    return { a, p, stage: inGame ? "in" : p.stage };
  });
  const nIn = rows.filter((r) => r.stage === "in" || r.stage === "join").length;
  const nFail = rows.filter((r) => r.stage === "failed").length;
  const idx = (s: string) => ({ queued: 0, ticket: 1, run: 2, join: 3, in: 4 } as Record<string, number>)[s] ?? 0;

  const sub = (r: { stage: string; p: Prog; a: AccountMeta }) => {
    if (r.stage === "failed") return <span className="err">échec · {r.p.error}</span>;
    if (r.stage === "cancelled") return <span>annulé</span>;
    if (r.stage === "queued") return <span>en attente</span>;
    if (r.stage === "in") return <span>en jeu</span>;
    return <span>{r.stage === "ticket" ? "demande du ticket…" : r.stage === "run" ? "client lancé…" : "connexion au serveur…"}</span>;
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Jouer</h1><p>Choisis les comptes, la destination, puis lance.</p></div></div>
      <div className="steps">
        {/* 1 — comptes */}
        <div className="step">
          <div className="step-h"><span className={"step-n" + (picked.length ? " done" : "")}>{picked.length ? <IconCheck /> : "1"}</span>Qui joue ?</div>
          <label className="field">
            <IconSearch />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom, @pseudo, id" aria-label="Filtrer les comptes" />
          </label>
          <div className="chips" style={{ marginTop: 12 }}>
            <button className={"chip" + (group === "Tous" ? " on" : "")} onClick={() => setGroup("Tous")}>Tous</button>
            {groups.map(([g, n]) => (
              <button key={g} className={"chip" + (group === g ? " on" : "")} onClick={() => setGroup(g)}>{g}<span className="n">{n}</span></button>
            ))}
          </div>
          <div className="sub" style={{ marginTop: 14 }}>{picked.length} sur {accounts.length} choisi{picked.length > 1 ? "s" : ""}</div>
          <div className="pick-grid">
            {list.map((a) => {
              const st = statusOf(a, settings.excludeMainFromAll);
              const on = selected.has(a.id);
              return (
                <button key={a.id} className={"pick" + (on ? " on" : "") + (st.disabled ? " dis" : "")} disabled={st.disabled && !on} onClick={() => store.toggle(a.id)}>
                  <Avatar account={a} size={36} />
                  <span className="t">
                    <b>{a.alias || a.username}{a.main && <span className="badge main">MAIN</span>}</b>
                    <span className={st.warn ? "warn" : ""}>{st.text}</span>
                  </span>
                </button>
              );
            })}
            {list.length === 0 && <div className="placeholder" style={{ gridColumn: "1 / -1" }}>Aucun compte.</div>}
          </div>
        </div>

        {/* 2 — destination */}
        <div className="step">
          <div className="step-h"><span className={"step-n" + (det.kind !== "none" ? " done" : "")}>{det.kind !== "none" ? <IconCheck /> : "2"}</span>Où ?</div>
          <div className="inline" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <span className="sub">Favoris</span>
            <span className="inline">
              <button className="btn sm" onClick={() => store.setView("serveurs")}><IconServer />Parcourir les serveurs</button>
            </span>
          </div>
          <div className="fav-row">
            {favs.map((f) => (
              <span className="fav" key={f.target}>
                <button onClick={() => store.updateSettings({ target: f.target })} title={f.target}>★ {f.name}</button>
                <button className="x" onClick={() => dropFav(f.target)} aria-label={`Retirer ${f.name}`}><IconX /></button>
              </span>
            ))}
            <button className="fav" onClick={saveFav}><IconPlus />Enregistrer</button>
          </div>

          <span className="lbl">Lien de jeu, serveur privé, ID de place ou @pseudo</span>
          <label className="field mono">
            {det.kind === "user" ? <IconUser /> : <IconSearch />}
            <input value={settings.target} onChange={(e) => store.updateSettings({ target: e.target.value })} placeholder="https://www.roblox.com/games/…" aria-label="Destination" />
          </label>
          <div className="inline" style={{ margin: "10px 2px 0", color: det.kind === "none" ? "var(--faint)" : "var(--muted)", fontSize: 13 }}>
            <span style={{ color: det.kind === "none" ? "var(--faint)" : "var(--ok)" }}>●</span> {det.label}
          </div>

          {det.kind === "game" && (
            <>
              <span className="lbl">Serveurs</span>
              <Seg
                value={settings.serverMode}
                onChange={(v) => store.updateSettings({ serverMode: v })}
                options={[{ v: "same", label: "Même" }, { v: "random", label: "Aléatoires" }, { v: "closest", label: "Plus proches" }, { v: "private", label: "Privé" }]}
              />
              {settings.serverMode === "private" && (
                <label className="field mono" style={{ marginTop: 10 }}>
                  <input value={settings.privateLink} onChange={(e) => store.updateSettings({ privateLink: e.target.value })} placeholder="Lien du serveur privé" aria-label="Lien du serveur privé" />
                </label>
              )}
            </>
          )}

          <div className="inline" style={{ marginTop: 18, justifyContent: "space-between" }}>
            <span className="sub">Délai de {(settings.cooldownMs / 1000).toFixed(0)} s entre deux clients</span>
            <button className="btn primary" disabled={busy || usable.length === 0} onClick={() => void launch()}>
              <IconPlay />{busy ? "Lancement…" : `Lancer ${usable.length} compte${usable.length > 1 ? "s" : ""}`}<span className="kbd" style={{ marginLeft: 4 }}>Ctrl ↵</span>
            </button>
          </div>

          {batchIds.length > 0 && (
            <div className="batch">
              <div className="batch-h"><span>Lot · {((Date.now() - startedAt) / 1000 | 0)} s</span>{busy && <button className="btn sm" onClick={() => void cancel()}>Annuler</button>}</div>
              <div className="batch-n">{nIn}/{rows.length}<small>en jeu{nFail ? ` · ${nFail} échec${nFail > 1 ? "s" : ""}` : ""}</small></div>
              <div className="prog"><i style={{ width: (rows.length ? (nIn / rows.length) * 100 : 0) + "%" }} /></div>
              <div className="stage-h">{STAGES.map((s) => <span key={s}>{s}</span>)}</div>
              {rows.map((r) => (
                <div className="b-row" key={r.a.id}>
                  <Avatar account={r.a} size={30} />
                  <div className="t"><b>{r.a.alias || r.a.username}</b>{sub(r)}</div>
                  <div className="stages">
                    {STAGES.map((_, i) => {
                      const k = idx(r.stage);
                      const cls = r.stage === "failed" ? (i === 1 ? "bad" : "") : i < k ? "on" : i === k ? "cur" : "";
                      return <i key={i} className={cls} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

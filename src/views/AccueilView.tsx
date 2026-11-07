import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { useMetrics, usePreview } from "../lib/hooks";
import { fmtDuration, fmtMem } from "../lib/ui";
import type { AccountMeta, ClientMetric, NewsItem, RobloxVersion } from "../lib/types";
import { Avatar } from "../components/Avatar";
import { Toggle } from "../components/Controls";
import { loadEvents, logEvent } from "../lib/history";
import { launchable, newId, runProfile } from "../lib/launcher";
import { IconCheck, IconGrid, IconRefresh, IconShrink, IconX } from "../components/icons";

type Tab = "news" | "overview";

/* ------------------------------------------------------------------ */
/* Actualités                                                           */
/* ------------------------------------------------------------------ */

interface Item { id: string; source: "RoAccount" | "Client Roblox"; date: string; title: string; body: string; url?: string | null; }

function NewsTab() {
  const store = useStore();
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [ver, setVer] = useState<RobloxVersion | null>(null);
  const [filter, setFilter] = useState<"Tout" | Item["source"]>("Tout");
  const [read, setRead] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("roaccount.read") || "[]")); } catch { return new Set(); }
  });

  async function load() {
    try { setNews(await api.getNews()); } catch { setNews([]); }
    try { setVer(await api.robloxVersion()); } catch { setVer(null); }
  }
  useEffect(() => { void load(); }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = (news ?? []).map((n) => ({ id: "n:" + n.date + n.title, source: "RoAccount", date: n.date, title: n.title, body: n.body, url: n.url }));
    if (ver?.latest) {
      const outdated = ver.installed && ver.installed !== ver.latest;
      out.push({
        id: "v:" + ver.latest, source: "Client Roblox", date: "",
        title: `Roblox mis à jour vers ${ver.latest}`,
        body: outdated
          ? "Les nouveaux clients démarrent sur cette version. Ceux en cours gardent la leur jusqu'à leur fermeture."
          : "Tu as la dernière version du client Roblox.",
      });
    }
    return out;
  }, [news, ver]);

  const shown = items.filter((i) => filter === "Tout" || i.source === filter);
  const hero = (news ?? [])[0];
  const outdated = !!(ver?.installed && ver?.latest && ver.installed !== ver.latest);

  function markAllRead() {
    const s = new Set(items.map((i) => i.id));
    setRead(s);
    try { localStorage.setItem("roaccount.read", JSON.stringify([...s])); } catch { /* ignore */ }
    store.toast("Tout est marqué comme lu.");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Actualités</h1>
          <p>{outdated ? "Une nouvelle version de Roblox est disponible." : "Tu es à jour."}</p>
        </div>
        <div className="inline">
          <button className="btn" onClick={markAllRead}><IconCheck />Tout marquer comme lu</button>
          <button className="icon-btn" onClick={() => void load()} aria-label="Actualiser"><IconRefresh /></button>
        </div>
      </div>
      <div className="steps" style={{ gridTemplateColumns: "1fr 1.2fr" }}>
        <div className="card pad news-big">
          {hero ? (
            <>
              <div className="sub">RoAccount · {hero.date}</div>
              <h2>{hero.title}</h2>
              <div className="fx"><b>Nouveautés</b><span>{hero.body}</span></div>
              {hero.url && <div style={{ marginTop: 18 }}><button className="btn sm" onClick={() => void api.openUrl(hero.url!).catch((e) => store.toast(String(e)))}>Page de la version</button></div>}
            </>
          ) : <div className="placeholder">Aucune actualité pour l'instant.</div>}
        </div>
        <div className="card pad">
          <div className="chips" style={{ marginBottom: 6 }}>
            {(["Tout", "RoAccount", "Client Roblox"] as const).map((f) => (
              <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          {shown.length === 0 && <div className="placeholder">Rien à afficher.</div>}
          {shown.map((i) => (
            <div className="news-item" key={i.id}>
              <div className="src">{i.source}{i.date && <span>{i.date}</span>}{!read.has(i.id) && <span style={{ color: "var(--brand)" }}>● nouveau</span>}</div>
              <b>{i.title}</b>
              <p>{i.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Vue d'ensemble                                                       */
/* ------------------------------------------------------------------ */

function ClientCard({ a, m, detailed }: { a: AccountMeta; m?: ClientMetric; detailed: boolean }) {
  const store = useStore();
  const { settings } = store;
  const img = usePreview(m?.pid ?? null, settings.previewFps, detailed && !!m);
  const [menu, setMenu] = useState(false);

  const tags: string[] = [];
  if (settings.fpsCap > 0) tags.push(`${settings.fpsCap} FPS max`);
  if (settings.lowestGraphics) tags.push("Graphismes minimum");
  if (settings.adaptiveLimits) tags.push("Limites adaptatives");
  if (a.main) tags.push("MAIN");

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) store.toast(ok); } catch (e) { store.toast(String(e)); }
    setMenu(false);
  };

  return (
    <div className="cc">
      {detailed && (
        <div className="cc-shot">
          {img ? <img src={img} alt={`Aperçu de ${a.username}`} /> : <div className="none">{m ? "Capture en cours…" : "Client lancé hors de RoAccount : pas d'aperçu."}</div>}
        </div>
      )}
      <div className="cc-who">
        <Avatar account={a} size={40} />
        <div style={{ minWidth: 0 }}>
          <b>{a.alias || a.username}</b>
          <span>{a.game ?? "Partie en cours"} · {m ? fmtDuration(m.uptime_s) : "—"}</span>
        </div>
      </div>
      {tags.length > 0 && <div className="cc-tags">{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
      <div className="cc-m">
        <span className="meter">CPU <span className="bar"><i style={{ width: Math.min(100, (m?.cpu ?? 0) * 4) + "%" }} /></span><b>{m ? m.cpu.toFixed(1).replace(".", ",") + " %" : "—"}</b></span>
        <span className="meter">Mémoire <span className="bar"><i style={{ width: Math.min(100, ((m?.memory_mb ?? 0) / 2048) * 100) + "%" }} /></span><b>{m ? fmtMem(m.memory_mb) : "—"}</b></span>
      </div>
      <div className="cc-act" style={{ position: "relative" }}>
        <button className="btn" disabled={!m} onClick={() => m && act(() => api.windowAction(m.pid, "show"))}>Afficher</button>
        <button className="btn" disabled={!m} onClick={() => m && act(() => api.windowAction(m.pid, "minimize"))}><IconShrink />Réduire</button>
        <button className="icon-btn" disabled={!m} aria-label="Plus" onClick={() => setMenu((x) => !x)}>⋯</button>
        {menu && m && (
          <div className="popover right" style={{ top: "auto", bottom: 46 }}>
            <button className="pop-item" onClick={() => act(() => api.setMute(m.pid, true), "Son coupé.")}>Couper le son</button>
            <button className="pop-item" onClick={() => act(() => api.setMute(m.pid, false), "Son rétabli.")}>Rétablir le son</button>
            <button className="pop-item" onClick={() => act(() => api.setPriority(m.pid, "below"), "Priorité basse.")}>Priorité basse</button>
            <button className="pop-item" onClick={() => act(() => api.setPriority(m.pid, "normal"), "Priorité normale.")}>Priorité normale</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Overview() {
  const store = useStore();
  const { accounts, settings } = store;
  const { metrics } = useMetrics(2000, true);
  const playing = accounts.filter((a) => a.running || a.presence === "InGame");
  const byId = new Map((metrics?.clients ?? []).filter((c) => c.account_id).map((c) => [c.account_id!, c]));
  const detailed = settings.homeView === "detailed";

  // clients fermés ou plantés récemment (dernier événement = fermeture, il y a moins d'une heure)
  const crashed = useMemo(() => {
    const last = new Map<string, { kind: string; t: number }>();
    loadEvents().forEach((e) => last.set(e.accountId, { kind: e.kind, t: e.t }));
    return accounts.filter((a) => { const l = last.get(a.id); return !!l && l.kind === "end" && Date.now() - l.t < 3600_000 && launchable(a); });
  }, [accounts, metrics]); // eslint-disable-line

  async function relaunchCrashed() {
    try {
      const r = await runProfile({ id: newId(), name: "relance", accountIds: crashed.map((a) => a.id), target: settings.target, serverMode: settings.serverMode, privateLink: settings.privateLink, cooldownMs: settings.cooldownMs }, accounts);
      r.launched.forEach((id) => { store.patch(id, { running: true, presence: "InGame" }); logEvent({ accountId: id, kind: "restart", note: "relance manuelle" }); });
      store.toast(`${r.launched.length} client(s) relancé(s).`);
    } catch (e) { store.toast(String(e)); }
  }

  const game = playing.find((a) => a.game)?.game ?? null;
  const cpu = metrics ? metrics.clients.reduce((s, c) => s + c.cpu, 0) : 0;
  const memPct = metrics?.mem_pct ?? 0;
  const load = Math.max(cpu, memPct);
  const status = load < 60 ? { t: "Large marge", c: "" } : load < 85 ? { t: "Charge correcte", c: "warn" } : { t: "Charge élevée", c: "crit" };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{playing.length} compte{playing.length > 1 ? "s" : ""} en jeu</h1>
          <p>
            {game ? `Dans ${game}. ` : ""}Reconnexion auto {settings.autoRejoin ? "activée" : "désactivée"}.{" "}
            <button className="link-btn" onClick={() => store.updateSettings({ autoRejoin: !settings.autoRejoin })}>{settings.autoRejoin ? "Désactiver" : "Activer"}</button>
          </p>
        </div>
        {crashed.length > 0 && (
          <button className="btn primary" onClick={() => void relaunchCrashed()}><IconRefresh />Relancer {crashed.length} client{crashed.length > 1 ? "s" : ""} fermé{crashed.length > 1 ? "s" : ""}</button>
        )}
      </div>

      <div className="sys-bar">
        <span className={"ok-pill " + status.c}><i />{status.t}</span>
        <span className="meter">CPU <span className="bar"><i style={{ width: Math.min(100, metrics?.cpu ?? 0) + "%" }} /></span><b>{Math.round(metrics?.cpu ?? 0)} %</b></span>
        <span className="meter">Mémoire <span className="bar"><i style={{ width: Math.min(100, memPct) + "%" }} /></span><b>{memPct.toFixed(1).replace(".", ",")} %</b></span>
        <span className="meter">GPU <span className="bar"><i style={{ width: "0%" }} /></span><b>—</b></span>
        <span style={{ flex: 1 }} />
        <span className="tgl">Anti-AFK <Toggle on={settings.antiAfk} label="Anti-AFK" onChange={(v) => store.updateSettings({ antiAfk: v })} /></span>
        <div className="seg">
          <button className={detailed ? "on" : ""} onClick={() => store.updateSettings({ homeView: "detailed" })}>Détaillé</button>
          <button className={!detailed ? "on" : ""} onClick={() => store.updateSettings({ homeView: "compact" })}>Compact</button>
        </div>
        <button className="icon-btn" title="Disposer en mosaïque" aria-label="Disposer en mosaïque" onClick={() => void api.arrangeWindows(settings.windowLayout).catch((e) => store.toast(String(e)))}><IconGrid /></button>
        <button className="icon-btn" title="Tout réduire" aria-label="Tout réduire" onClick={() => void api.windowAction(null, "minimize").catch((e) => store.toast(String(e)))}><IconShrink /></button>
      </div>

      {playing.length === 0 ? (
        <div className="empty-state">
          <IconX />
          <div>Aucun client en cours.</div>
          <button className="btn primary" onClick={() => store.setView("jouer")}>Lancer des comptes</button>
        </div>
      ) : (
        <div className={"clients" + (detailed ? "" : " compact")}>
          {playing.map((a) => <ClientCard key={a.id} a={a} m={byId.get(a.id)} detailed={detailed} />)}
        </div>
      )}
    </>
  );
}

export function AccueilView() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("roaccount.hometab") as Tab) || "overview");
  useEffect(() => {
    const h = () => setTab((localStorage.getItem("roaccount.hometab") as Tab) || "overview");
    window.addEventListener("roa-hometab", h);
    return () => window.removeEventListener("roa-hometab", h);
  }, []);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem("roaccount.hometab", t); } catch { /* ignore */ } };

  return (
    <div className="page">
      <div className="tabbar">
        <button className={"chip" + (tab === "news" ? " on" : "")} onClick={() => pick("news")}>Actualités</button>
        <button className={"chip" + (tab === "overview" ? " on" : "")} onClick={() => pick("overview")}>Vue d'ensemble</button>
      </div>
      {tab === "news" ? <NewsTab /> : <Overview />}
    </div>
  );
}

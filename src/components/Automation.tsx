import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { isDead, launchable, runProfile } from "../lib/launcher";
import { addPlaytime, dayKey, fmtDuration, logEvent, loadDays, loadEvents } from "../lib/history";

const TICK_S = 10;

/** Tout ce qui tourne en tâche de fond tant que le coffre est ouvert : planification, historique, profil au démarrage, alerte de version. */
export function Automation() {
  const store = useStore();
  const { settings, accounts } = store;
  const accRef = useRef(accounts);
  accRef.current = accounts;
  const setRef = useRef(settings);
  setRef.current = settings;
  const storeRef = useRef(store);
  storeRef.current = store;

  // ---- historique de session : temps de jeu, fins de session, relances ----
  useEffect(() => {
    const prev = new Map<number, string>();
    const lastEnd = new Map<string, number>();
    let first = true;
    const t = window.setInterval(async () => {
      try {
        const m = await api.clientMetrics();
        const cur = new Map<number, string>();
        m.clients.forEach((c) => { if (c.account_id) cur.set(c.pid, c.account_id); });
        cur.forEach((id) => addPlaytime(id, TICK_S));
        prev.forEach((id, pid) => {
          if (!cur.has(pid)) { logEvent({ accountId: id, kind: "end" }); lastEnd.set(id, Date.now()); }
        });
        if (!first) {
          const recentLaunch = (id: string) => loadEvents().some((e) => e.accountId === id && e.kind === "launch" && Date.now() - e.t < 90_000);
          cur.forEach((id, pid) => {
            if (!prev.has(pid) && Date.now() - (lastEnd.get(id) ?? 0) < 120_000 && !recentLaunch(id)) logEvent({ accountId: id, kind: "restart", note: "automatic relaunch" });
          });
        }
        prev.clear();
        cur.forEach((id, pid) => prev.set(pid, id));
        first = false;
      } catch { /* ignore */ }
    }, TICK_S * 1000);
    return () => window.clearInterval(t);
  }, []);

  // ---- incidents detected by the background loop → history ----
  useEffect(() => {
    let un: () => void = () => {};
    let gone = false;
    void api.onIncident((e) => { if (e.id) logEvent({ accountId: e.id, kind: "fail", note: e.kind }); }).then((f) => { if (gone) f(); else un = f; });
    return () => { gone = true; un(); };
  }, []);

  // ---- an account refresh found a dead cookie or a ban: toast, Windows notification, Discord ----
  useEffect(() => {
    const h = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { id: string; name: string; health: string };
      const banned = d.health === "banned";
      const msg = banned ? `${d.name} was banned by Roblox.` : `${d.name}'s cookie expired: sign in again.`;
      storeRef.current.toast(msg);
      logEvent({ accountId: d.id, kind: "fail", note: d.health });
      void api.notifyDesktop("RoAccount", msg).catch(() => {});
      if (setRef.current.alertDeadCookie) void api.discordPost((banned ? "⛔ " : "🔑 ") + `**${d.name}** ` + (banned ? "was banned by Roblox." : "— cookie expired, sign in again.")).catch(() => {});
    };
    window.addEventListener("roa-account-alert", h);
    return () => window.removeEventListener("roa-account-alert", h);
  }, []);

  // ---- daily summary on Discord ----
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = setRef.current;
      if (!s.dailySummary) return;
      const now = new Date();
      const k = dayKey(now);
      if (now.getHours() !== s.dailySummaryHour || s.lastDailySummary === k) return;
      storeRef.current.updateSettings({ lastDailySummary: k });
      const d = loadDays().find((x) => x.day === k);
      const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
      const incidents = loadEvents().filter((e) => e.kind === "fail" && dayKey(new Date(e.t)) === k).length;
      const running = accRef.current.filter((a) => a.running || a.presence === "InGame").length;
      void api.discordPost(`📅 **RoAccount daily summary** — play time ${fmtDuration(sum(d?.secs))}, ${sum(d?.launches)} launch(es), ${sum(d?.ends)} closure(s), ${incidents} incident(s), ${running} client(s) running now.`).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, []);

  // ---- rotation: keep N accounts of a profile running and swap them on a timer ----
  const rot = useRef({ started: new Map<string, number>(), lastRan: new Map<string, number>(), lastSwap: 0, busy: false });
  useEffect(() => {
    const t = window.setInterval(async () => {
      const s = setRef.current;
      const r = s.rotation;
      const st = rot.current;
      if (!r?.enabled || st.busy) return;
      const p = (s.profiles ?? []).find((x) => x.id === r.profileId);
      if (!p) return;
      const byId = new Map(accRef.current.map((a) => [a.id, a]));
      const pool = p.accountIds.filter((id) => { const a = byId.get(id); return !!a && !a.main && !isDead(a); });
      const isRun = (id: string) => { const a = byId.get(id); return !!a && (a.running || a.presence === "InGame"); };
      const running = pool.filter(isRun);
      const waiting = pool.filter((id) => !isRun(id) && launchable(byId.get(id)!)).sort((x, y) => (st.lastRan.get(x) ?? 0) - (st.lastRan.get(y) ?? 0));
      const nm = (id: string) => byId.get(id)?.username ?? id;
      const start = async (id: string) => {
        const res = await runProfile({ ...p, accountIds: [id] }, accRef.current);
        res.launched.forEach((a) => { storeRef.current.patch(a, { running: true, presence: "InGame" }); logEvent({ accountId: a, kind: "launch", note: `${p.name} (rotation)` }); st.started.set(a, Date.now()); st.lastRan.set(a, Date.now()); });
      };
      st.busy = true;
      try {
        if (running.length < r.keep && waiting.length) {
          await start(waiting[0]);
          st.lastSwap = Date.now();
        } else if (running.length >= r.keep && waiting.length && Date.now() - st.lastSwap >= Math.max(5, r.everyMin) * 60_000) {
          const out = [...running].sort((x, y) => (st.started.get(x) ?? 0) - (st.started.get(y) ?? 0))[0];
          await api.stopAccounts([out]);
          storeRef.current.patch(out, { running: false, presence: "Offline" });
          await start(waiting[0]);
          st.lastSwap = Date.now();
          storeRef.current.toast(`Rotation: ${nm(out)} → ${nm(waiting[0])}`);
        }
      } catch (e) { storeRef.current.toast(String(e)); } finally { st.busy = false; }
    }, 20_000);
    return () => window.clearInterval(t);
  }, []);

  // ---- planification : démarre / arrête un profil à l'heure dite ----
  useEffect(() => {
    const t = window.setInterval(async () => {
      const s = setRef.current;
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      const stamp = dayKey(now) + " " + hhmm;
      for (const sc of s.schedules ?? []) {
        if (!sc.enabled || sc.time !== hhmm || sc.last === stamp) continue;
        if (sc.days.length && !sc.days.includes(now.getDay())) continue;
        const p = (s.profiles ?? []).find((x) => x.id === sc.profileId);
        if (!p) continue;
        // marquer d'abord : une exécution par minute, même si elle échoue
        storeRef.current.updateSettings({ schedules: (setRef.current.schedules ?? []).map((x) => (x.id === sc.id ? { ...x, last: stamp } : x)) });
        try {
          if (sc.action === "start") {
            const r = await runProfile(p, accRef.current);
            r.launched.forEach((id) => { storeRef.current.patch(id, { running: true, presence: "InGame" }); logEvent({ accountId: id, kind: "launch", note: `${p.name} (scheduled)` }); });
            storeRef.current.toast(`Scheduled: “${p.name}” launched (${r.launched.length} client${r.launched.length !== 1 ? "s" : ""}).`);
          } else {
            const n = await api.stopAccounts(p.accountIds);
            p.accountIds.forEach((id) => storeRef.current.patch(id, { running: false, presence: "Offline" }));
            storeRef.current.toast(`Scheduled: “${p.name}” stopped (${n} client${n !== 1 ? "s" : ""}).`);
          }
        } catch (e) { storeRef.current.toast(String(e)); }
      }
    }, 15_000);
    return () => window.clearInterval(t);
  }, []);

  // ---- profil lancé au démarrage de RoAccount ----
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !accounts.length) return;
    autoDone.current = true;
    const id = setRef.current.autoLaunchProfile;
    const p = (setRef.current.profiles ?? []).find((x) => x.id === id);
    if (!p) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await runProfile(p, accRef.current);
        r.launched.forEach((a) => { storeRef.current.patch(a, { running: true, presence: "InGame" }); logEvent({ accountId: a, kind: "launch", note: `${p.name} (startup)` }); });
        storeRef.current.toast(`Startup: “${p.name}” launched.`);
      } catch (e) { storeRef.current.toast(String(e)); }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [accounts.length]);

  // ---- alerte : nouvelle version du client Roblox ----
  useEffect(() => {
    if (!settings.robloxAlert) return;
    void api.robloxVersion().then((v) => {
      if (!v.installed || !v.latest || v.installed === v.latest) return;
      let seen = "";
      try { seen = localStorage.getItem("roaccount.robloxAlert") || ""; } catch { /* ignore */ }
      if (seen === v.latest) return;
      try { localStorage.setItem("roaccount.robloxAlert", v.latest); } catch { /* ignore */ }
      storeRef.current.toast("Roblox has a new version: restart your clients to use it.");
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.robloxAlert]);

  return null;
}

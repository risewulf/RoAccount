import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { runProfile } from "../lib/launcher";
import { addPlaytime, dayKey, logEvent, loadEvents } from "../lib/history";

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

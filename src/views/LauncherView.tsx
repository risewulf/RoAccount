import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { Avatar } from "../components/Avatar";
import { Toggle } from "../components/Controls";
import { useMetrics } from "../lib/hooks";
import { detect, isDead, launchable, newId, runProfile } from "../lib/launcher";
import { logEvent } from "../lib/history";
import { fmtMem } from "../lib/ui";
import type { BootProgress, BootStatus, LaunchProfile, NewsItem, Settings } from "../lib/types";
import { IconCheck, IconChevDown, IconGauge, IconGear, IconHome, IconPlay, IconRocket, IconServer, IconUser, IconX } from "../components/icons";

type Tab = "home" | "mods";
type Stage = "queued" | "ticket" | "run" | "join" | "failed" | "cancelled";

/** One card of the Mods grid: a switch (or a few steps) bound to a setting. */
interface ModCard { id: string; icon: string; title: string; desc: string; on: boolean; toggle?: (v: boolean) => Partial<Settings>; steps?: { label: string; patch: Partial<Settings>; active: boolean }[]; extra?: React.ReactNode; }

export function LauncherView() {
  const store = useStore();
  const { accounts, selected, settings: s } = store;
  const [tab, setTab] = useState<Tab>("home");
  const [pop, setPop] = useState<null | "acc" | "ver" | "game">(null);
  const [boot, setBoot] = useState<BootStatus | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<BootProgress | null>(null);
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const { metrics } = useMetrics(2500, tab === "home");
  const popRef = useRef<HTMLDivElement>(null);

  const refreshBoot = () => api.bootstrapStatus().then(setBoot).catch(() => {});
  useEffect(() => {
    void refreshBoot();
    void api.getNews().then(setNews).catch(() => {});
    let un: () => void = () => {};
    let gone = false;
    void api.onBatch((e) => setStages((m) => ({ ...m, [e.id]: e.stage as Stage }))).then((f) => { if (gone) f(); else un = f; });
    return () => { gone = true; un(); };
  }, []); // eslint-disable-line

  // click outside closes the popover
  useEffect(() => {
    if (!pop) return;
    const h = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setPop(null); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [pop]);

  // graphics flags are written to Roblox a moment after a Mods card changes them
  const lastGfx = useRef(JSON.stringify([s.fpsCap, s.lowestGraphics, s.msaa, s.textures, s.render, s.graySky, s.noGrass]));
  useEffect(() => {
    const key = JSON.stringify([s.fpsCap, s.lowestGraphics, s.msaa, s.textures, s.render, s.graySky, s.noGrass]);
    if (key === lastGfx.current) return;
    lastGfx.current = key;
    const t = window.setTimeout(() => {
      const any = s.fpsCap > 0 || s.lowestGraphics || s.msaa > 0 || s.textures !== "default" || s.render !== "default" || s.graySky || s.noGrass;
      api.applyGraphics(any, { fpsCap: s.fpsCap, lowestGraphics: s.lowestGraphics, msaa: s.msaa, textures: s.textures, render: s.render, graySky: s.graySky, noGrass: s.noGrass })
        .then(() => store.toast(any ? "Applied — active on the next client launch." : "Graphics settings removed."))
        .catch((e) => store.toast(String(e)));
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fpsCap, s.lowestGraphics, s.msaa, s.textures, s.render, s.graySky, s.noGrass]);

  const picked = accounts.filter((a) => selected.has(a.id));
  const usable = picked.filter((a) => launchable(a));
  const main = accounts.find((a) => a.main) ?? accounts.find((a) => a.favorite) ?? accounts[0];
  const det = detect(s.target);
  const gameName = (usable[0] ?? picked[0] ?? accounts.find((a) => a.game))?.game ?? (det.kind === "game" ? det.label : det.kind === "none" ? "Choose a game" : det.label);

  const live = accounts.filter((a) => a.running || a.presence === "InGame");
  const byId = new Map((metrics?.clients ?? []).filter((c) => c.account_id).map((c) => [c.account_id!, c]));

  // ---- Roblox build picker ----
  const upToDate = !!(boot?.latest && boot.installed.some((v) => v.name === boot.latest));
  const verLabel = !s.ownRoblox
    ? "Official launcher"
    : boot?.current
      ? (boot.current === boot.latest && boot.latest_number ? boot.latest_number : boot.current.replace("version-", "").slice(0, 8)) + " · RoAccount"
      : "Not installed";
  async function installLatest() {
    setPop(null);
    setInstalling({ stage: "download", done: 0, total: 1, item: "" });
    let un: () => void = () => {};
    void api.onBootstrap((p) => setInstalling(p)).then((f) => { un = f; });
    try { await api.bootstrapInstall(); store.updateSettings({ ownRoblox: true, ownRobloxPin: "" }); store.toast("Roblox is installed and ready."); }
    catch (e) { store.toast(String(e)); }
    finally { un(); setInstalling(null); void refreshBoot(); }
  }

  async function launch() {
    if (busy) return;
    const ids = usable.map((a) => a.id);
    if (!ids.length) { setPop("acc"); store.toast(picked.length ? "Those accounts are already in game." : "Pick the accounts to launch."); return; }
    if (det.kind === "none") { setPop("game"); store.toast("Choose a game first."); return; }
    if (s.ownRoblox && boot && boot.installed.length === 0) { store.toast("Install Roblox first (the version button)."); setPop("ver"); return; }
    setBusy(true);
    setStages(Object.fromEntries(ids.map((id) => [id, "queued" as Stage])));
    try {
      const p: LaunchProfile = { id: newId(), name: "Launcher", accountIds: ids, target: s.target, serverMode: s.serverMode, privateLink: s.privateLink, cooldownMs: s.cooldownMs };
      const r = await runProfile(p, accounts);
      r.launched.forEach((id) => { store.patch(id, { running: true, presence: "InGame" }); logEvent({ accountId: id, kind: "launch", note: s.target }); });
      store.toast(`${r.launched.length} client${r.launched.length !== 1 ? "s" : ""} launched.`);
      window.setTimeout(() => { void store.refreshAll(); }, 8000);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  const stageText: Record<Stage, string> = { queued: "Waiting", ticket: "Signing in", run: "Starting", join: "In game", failed: "Failed", cancelled: "Cancelled" };
  const profiles = s.profiles ?? [];
  const set = (p: Partial<Settings>) => store.updateSettings({ ...p, preset: "custom" });

  const mods: ModCard[] = [
    { id: "fps", icon: "⚡", title: "FPS unlock", desc: "Raise or cap the frame rate of every client.", on: s.fpsCap > 0,
      steps: [{ label: "Off", patch: { fpsCap: 0 }, active: s.fpsCap === 0 }, { label: "30", patch: { fpsCap: 30 }, active: s.fpsCap === 30 }, { label: "60", patch: { fpsCap: 60 }, active: s.fpsCap === 60 }, { label: "144", patch: { fpsCap: 144 }, active: s.fpsCap === 144 }] },
    { id: "gfx", icon: "🎛️", title: "Minimum graphics", desc: "Saves a lot of GPU and CPU with several clients.", on: s.lowestGraphics, toggle: (v) => ({ lowestGraphics: v }) },
    { id: "tex", icon: "🧱", title: "Low textures", desc: "Smaller textures, less video memory.", on: s.textures !== "default", toggle: (v) => ({ textures: v ? "low" : "default" }) },
    { id: "sky", icon: "☁️", title: "Grey sky", desc: "Replaces the skybox with a flat grey.", on: s.graySky, toggle: (v) => ({ graySky: v }) },
    { id: "grass", icon: "🌿", title: "No grass", desc: "Removes grass from rendering.", on: s.noGrass, toggle: (v) => ({ noGrass: v }) },
    { id: "mute", icon: "🔇", title: "Mute on launch", desc: "New clients start silent.", on: s.muteOnLaunch, toggle: (v) => ({ muteOnLaunch: v }) },
    { id: "tiny", icon: "🪟", title: "Tiny windows", desc: "Shrinks a batch to small thumbnails once it is in game.", on: s.tinyOnLaunch, toggle: (v) => ({ tinyOnLaunch: v }) },
    { id: "afk", icon: "🕹️", title: "Anti-AFK", desc: "Keeps idle clients from being kicked.", on: s.antiAfk, toggle: (v) => ({ antiAfk: v }) },
    { id: "rejoin", icon: "🔁", title: "Auto-rejoin", desc: "Relaunches a client that Roblox disconnects.", on: s.autoRejoin, toggle: (v) => ({ autoRejoin: v }) },
    { id: "files", icon: "📁", title: "File mods", desc: "Sounds, fonts and textures from your Mods folder.", on: s.ownRobloxMods && s.ownRoblox, toggle: (v) => ({ ownRobloxMods: v }),
      extra: <button className="btn sm" onClick={() => void api.openPath("roblox-mods").catch((e) => store.toast(String(e)))}>Open folder</button> },
  ];

  return (
    <div className="lc">
      <nav className="lc-rail" aria-label="Launcher">
        <button className={tab === "home" ? "on" : ""} onClick={() => setTab("home")}><IconHome /><span>Home</span></button>
        <button className={tab === "mods" ? "on" : ""} onClick={() => setTab("mods")}><IconGauge /><span>Mods</span></button>
        <button onClick={() => store.setView("comptes")}><IconUser /><span>Accounts</span></button>
        <button onClick={() => store.setView("serveurs")}><IconServer /><span>Servers</span></button>
        <button onClick={() => store.setView("s-roblox")}><IconRocket /><span>Roblox</span></button>
        <button onClick={() => store.setView("s-lancement")}><IconGear /><span>Settings</span></button>
      </nav>

      <div className="lc-main">
        {tab === "home" && (
          <>
            <section className="lc-hero">
              <div className="lc-art" aria-hidden="true"><i /><i /><i /></div>
              <div className="lc-top">
                <span className="lc-badge"><i className={s.ownRoblox ? "ok" : ""} />{s.ownRoblox ? "RoAccount bootstrapper" : "Official launcher"}</span>
                <span className="lc-badge soft">{live.length} in game</span>
              </div>
              <div className="lc-title">
                <small>Welcome back{main ? `, ${main.alias || main.display_name || main.username}` : ""}</small>
                <h1>Ready to <em>play</em>?</h1>
              </div>

              <div className="lc-bar" ref={popRef}>
                <div className="lc-launch">
                  <button className="lc-go" disabled={busy || !!installing} onClick={() => void launch()}>
                    <IconPlay />
                    <span><b>{busy ? "Launching…" : installing ? "Installing…" : usable.length > 1 ? `Launch ${usable.length} accounts` : "Launch"}</b><small>{gameName}</small></span>
                  </button>
                  <button className="lc-ver" onClick={() => setPop(pop === "ver" ? null : "ver")} aria-haspopup="listbox" aria-label="Roblox version">
                    <span><small>Roblox</small><b>{verLabel}</b></span><IconChevDown />
                  </button>
                </div>

                <button className="lc-pill" onClick={() => setPop(pop === "acc" ? null : "acc")} aria-label="Accounts">
                  <span className="lc-stack">{picked.slice(0, 4).map((a) => <Avatar key={a.id} account={a} size={30} />)}{picked.length === 0 && <i className="lc-empty"><IconUser /></i>}</span>
                  <span><small>Accounts</small><b>{picked.length ? `${picked.length} selected` : "Choose"}</b></span>
                </button>
                <button className="lc-pill" onClick={() => setPop(pop === "game" ? null : "game")} aria-label="Game">
                  <span className="lc-ico"><IconServer /></span>
                  <span><small>Game · {s.serverMode === "same" ? "same server" : s.serverMode}</small><b>{det.kind === "none" ? "Choose" : det.kind === "game" ? "Place " + (s.target.match(/(\d{4,})/)?.[1] ?? "") : det.label}</b></span>
                </button>

                {pop === "ver" && (
                  <div className="lc-pop lc-pop-ver" role="listbox">
                    <div className="lc-pop-h">Roblox build</div>
                    <button className={"lc-opt" + (!s.ownRoblox ? " on" : "")} onClick={() => { store.updateSettings({ ownRoblox: false }); setPop(null); }}>Official Roblox launcher{!s.ownRoblox && <IconCheck />}</button>
                    <button className={"lc-opt" + (s.ownRoblox && !s.ownRobloxPin ? " on" : "")} disabled={!boot || boot.installed.length === 0} onClick={() => { store.updateSettings({ ownRoblox: true, ownRobloxPin: "" }); setPop(null); }}>
                      <span>RoAccount · newest{boot?.latest_number ? ` (${boot.latest_number})` : ""}</span>{s.ownRoblox && !s.ownRobloxPin && <IconCheck />}
                    </button>
                    {(boot?.installed ?? []).map((v) => (
                      <button key={v.name} className={"lc-opt" + (s.ownRoblox && s.ownRobloxPin === v.name ? " on" : "")} onClick={() => { store.updateSettings({ ownRoblox: true, ownRobloxPin: v.name }); setPop(null); }}>
                        <span>{v.name.replace("version-", "").slice(0, 10)} <small>{v.size_mb} MB{v.name === boot?.latest ? " · latest" : ""}</small></span>{s.ownRoblox && s.ownRobloxPin === v.name && <IconCheck />}
                      </button>
                    ))}
                    <button className="lc-opt accent" disabled={upToDate && !!boot} onClick={() => void installLatest()}>{boot && boot.installed.length === 0 ? "Install Roblox" : upToDate ? "Up to date" : "Install the latest"}</button>
                  </div>
                )}

                {pop === "acc" && (
                  <div className="lc-pop lc-pop-acc">
                    <div className="lc-pop-h">Who plays?<span><button className="link-btn" onClick={() => store.setSelection(accounts.filter((a) => !a.main && !isDead(a)).map((a) => a.id), true)}>All</button> · <button className="link-btn" onClick={() => store.clearSelection()}>None</button></span></div>
                    <div className="lc-list">
                      {accounts.map((a) => (
                        <button key={a.id} className={"lc-acc" + (selected.has(a.id) ? " on" : "")} onClick={() => store.toggle(a.id)} disabled={isDead(a)}>
                          <Avatar account={a} size={32} />
                          <span><b>{a.alias || a.display_name || a.username}</b><small>{isDead(a) ? "Sign in again" : a.presence === "InGame" ? "In game" : a.presence ?? "Offline"}</small></span>
                          {selected.has(a.id) && <IconCheck />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pop === "game" && (
                  <div className="lc-pop lc-pop-game">
                    <div className="lc-pop-h">Where?</div>
                    <input className="txt" autoFocus value={s.target} placeholder="Game link, private server, place ID or @username" onChange={(e) => store.updateSettings({ target: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") setPop(null); }} />
                    <div className="seg" style={{ margin: "10px 0" }}>
                      {(["same", "random", "closest"] as const).map((m) => <button key={m} className={s.serverMode === m ? "on" : ""} onClick={() => store.updateSettings({ serverMode: m })}>{m === "same" ? "Same" : m === "random" ? "Random" : "Closest"}</button>)}
                    </div>
                    {profiles.length > 0 && <div className="lc-pop-h" style={{ marginTop: 6 }}>Saved profiles</div>}
                    {profiles.map((p) => (
                      <button key={p.id} className="lc-opt" onClick={() => { store.updateSettings({ target: p.target, serverMode: p.serverMode, privateLink: p.privateLink, cooldownMs: p.cooldownMs }); store.clearSelection(); store.setSelection(p.accountIds.filter((id) => accounts.some((a) => a.id === id)), true); setPop(null); }}>
                        <span>{p.name} <small>{p.accountIds.length} account{p.accountIds.length !== 1 ? "s" : ""}</small></span>
                      </button>
                    ))}
                    <div className="lc-det">{det.label}</div>
                  </div>
                )}
              </div>

              {installing && (
                <div className="lc-prog" aria-live="polite">
                  <div className="bar" style={{ width: "100%", height: 8 }}><i style={{ width: Math.min(100, Math.round((installing.done / Math.max(1, installing.total)) * 100)) + "%" }} /></div>
                  <span>{installing.stage === "extract" ? `Unpacking ${installing.item}…` : installing.stage === "finish" ? "Finishing…" : `Downloading Roblox… ${Math.round((installing.done / Math.max(1, installing.total)) * 100)}%`}</span>
                </div>
              )}
              {Object.keys(stages).length > 0 && (
                <div className="lc-steps">
                  {Object.entries(stages).map(([id, st]) => { const a = accounts.find((x) => x.id === id); return a ? (
                    <span key={id} className={"lc-step " + st}><Avatar account={a} size={22} />{a.alias || a.username}<em>{stageText[st]}</em></span>
                  ) : null; })}
                  {busy && <button className="btn sm" onClick={() => void api.cancelBatch().catch(() => {})}><IconX />Cancel</button>}
                </div>
              )}
            </section>

            <div className="lc-cols">
              <section>
                <h2 className="lc-h">Latest news</h2>
                <div className="lc-news">
                  {news.length === 0 && <div className="placeholder">No news yet.</div>}
                  {news.slice(0, 4).map((n) => (
                    <button key={n.title + n.date} className="lc-card" onClick={() => n.url && void api.openUrl(n.url).catch(() => {})}>
                      <small>{n.date}</small><b>{n.title}</b><span>{n.body}</span>
                    </button>
                  ))}
                </div>
                {profiles.length > 0 && (
                  <>
                    <h2 className="lc-h">Quick launch</h2>
                    <div className="lc-quick">
                      {profiles.map((p) => (
                        <button key={p.id} className="lc-card tile" onClick={() => { store.updateSettings({ target: p.target, serverMode: p.serverMode, privateLink: p.privateLink, cooldownMs: p.cooldownMs }); store.clearSelection(); store.setSelection(p.accountIds.filter((id) => accounts.some((a) => a.id === id)), true); store.toast(`“${p.name}” loaded — press Launch.`); }}>
                          <b>{p.name}</b><span>{p.accountIds.length} account{p.accountIds.length !== 1 ? "s" : ""} · {p.serverMode}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
              <aside>
                <h2 className="lc-h">Running now</h2>
                <div className="lc-live">
                  {live.length === 0 && <div className="placeholder">Nothing is running.</div>}
                  {live.map((a) => { const m = byId.get(a.id); return (
                    <div className="lc-run" key={a.id}>
                      <Avatar account={a} size={36} />
                      <span><b>{a.alias || a.username}</b><small>{a.game ?? "In game"}</small></span>
                      <em>{m ? `${m.cpu.toFixed(0)}% · ${fmtMem(m.memory_mb)}` : "—"}</em>
                    </div>
                  ); })}
                </div>
              </aside>
            </div>
          </>
        )}

        {tab === "mods" && (
          <>
            <div className="page-head"><div><h1>Mods</h1><p>Switch things on and off. Graphics are written to Roblox and apply to the next client you launch.</p></div></div>
            <div className="lc-grid">
              {mods.map((m) => (
                <div key={m.id} className={"lc-mod" + (m.on ? " on" : "")}>
                  <div className="lc-mod-h"><span className="lc-mod-ico">{m.icon}</span>
                    {m.toggle && <Toggle on={m.on} label={m.title} onChange={(v) => set(m.toggle!(v))} />}
                  </div>
                  <b>{m.title}</b>
                  <span>{m.desc}</span>
                  {m.steps && <div className="seg">{m.steps.map((st) => <button key={st.label} className={st.active ? "on" : ""} onClick={() => set(st.patch)}>{st.label}</button>)}</div>}
                  {m.extra}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

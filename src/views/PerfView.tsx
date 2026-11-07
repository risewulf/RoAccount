import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { copyText, fmtMem, pickTextFile } from "../lib/ui";
import { DEFAULT_SETTINGS, type Settings } from "../lib/types";
import { NumInput, Row, Seg, Toggle } from "../components/Controls";
import { IconCopy, IconDownload, IconFile, IconUpload } from "../components/icons";
import { FPS_UNLIMITED, fpsLabel, gfxAny, gfxKey, gfxOf } from "../lib/gfx";

type Patch = Partial<Settings>;

const PERF_KEYS = [
  "fpsCap", "lowestGraphics", "msaa", "textures", "render", "graySky", "noGrass", "voxelLighting", "noShadows", "noPostFx",
  "minimizeOnLaunch", "tinyOnLaunch", "muteOnLaunch",
  "adaptiveLimits", "spreadCores", "trimMemory", "trimEveryMin", "throttleMem", "throttleMemMb", "restartMem", "restartMemMb", "previewFps",
] as const;

const BASE_OFF: Patch = {
  fpsCap: 0, lowestGraphics: false, msaa: 0, textures: "default", render: "default", graySky: false, noGrass: false, voxelLighting: false, noShadows: false, noPostFx: false,
  minimizeOnLaunch: false, tinyOnLaunch: false, muteOnLaunch: false,
  adaptiveLimits: false, spreadCores: false, trimMemory: false, throttleMem: false, restartMem: false,
};

const PRESETS: { id: "max" | "balanced" | "defaults"; name: string; desc: string; lines: string[]; more: string; patch: Patch }[] = [
  {
    id: "max", name: "Max accounts", desc: "As many clients as possible, minimum detail.",
    lines: ["10 FPS", "Minimum graphics", "Tiny clients"], more: "+6 settings",
    patch: { ...BASE_OFF, fpsCap: 10, lowestGraphics: true, msaa: 1, textures: "min", noGrass: true, tinyOnLaunch: true, muteOnLaunch: true, adaptiveLimits: true, spreadCores: true, trimMemory: true },
  },
  {
    id: "balanced", name: "Balanced", desc: "A good start for most PCs.",
    lines: ["30 FPS", "Minimum graphics", "Visible windows"], more: "+1 setting",
    patch: { ...BASE_OFF, fpsCap: 30, lowestGraphics: true, adaptiveLimits: true },
  },
  {
    id: "defaults", name: "Roblox defaults", desc: "RoAccount leaves Roblox as it is.",
    lines: ["Roblox's own FPS cap", "Your own graphics", "Visible windows"], more: "+1 setting",
    patch: { ...BASE_OFF },
  },
];

function matches(s: Settings, p: Patch): boolean {
  return (Object.keys(p) as (keyof Settings)[]).every((k) => s[k] === p[k]);
}

const FPS_CHOICES = [0, 10, 15, 30, 60, 144, FPS_UNLIMITED];

export function PerfView() {
  const store = useStore();
  const { settings: s } = store;
  const [plan, setPlan] = useState(4);
  const [measuring, setMeasuring] = useState(0);
  const [result, setResult] = useState<null | { n: number; mem: number; cpu: number; ramTotal: number; predicted: number; budget: number; advice: "max" | "balanced" }>(null);
  const [shareOpen, setShareOpen] = useState<null | "paste">(null);
  const [pasteTxt, setPasteTxt] = useState("");
  const lastGfx = useRef(gfxKey(s));

  const current = PRESETS.find((p) => matches(s, p.patch))?.id ?? null;

  function set(p: Patch) { store.updateSettings({ ...p, preset: "custom" }); }

  // écrit les réglages graphiques de Roblox (après une courte pause pour éviter les écritures en rafale)
  useEffect(() => {
    const key = gfxKey(s);
    if (key === lastGfx.current) return; // rien n'a changé : on n'écrit rien
    lastGfx.current = key;
    const t = window.setTimeout(() => {
      const any = gfxAny(s);
      api.applyGraphics(any, gfxOf(s))
        .then(() => store.toast(any ? "Graphics settings written — active on the next client launch." : "Graphics settings removed."))
        .catch((e) => store.toast(String(e)));
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gfxKey(s)]); // eslint-disable-line

  async function measure() {
    const samples: { n: number; mem: number; cpu: number; ram: number; used: number }[] = [];
    let total = 0;
    setResult(null);
    for (let i = 0; i < 12; i++) {
      setMeasuring(Math.round(((i + 1) / 12) * 100));
      try {
        const m = await api.clientMetrics();
        total = m.mem_total_mb;
        if (m.clients.length) {
          samples.push({
            n: m.clients.length,
            mem: m.clients.reduce((a, c) => a + c.memory_mb, 0) / m.clients.length,
            cpu: m.clients.reduce((a, c) => a + c.cpu, 0) / m.clients.length,
            ram: m.mem_total_mb, used: m.mem_used_mb,
          });
        }
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setMeasuring(0);
    if (!samples.length) { store.toast("No client in game: launch a few accounts first."); return; }
    const avg = (f: (x: (typeof samples)[number]) => number) => samples.reduce((a, x) => a + f(x), 0) / samples.length;
    const mem = avg((x) => x.mem), cpu = avg((x) => x.cpu), n = Math.round(avg((x) => x.n));
    const budget = total * 0.8 - (avg((x) => x.used) - mem * n);
    const predicted = mem * plan;
    setResult({ n, mem, cpu, ramTotal: total, predicted, budget, advice: predicted <= budget * 0.75 && cpu * plan < 80 ? "balanced" : "max" });
  }

  const share = () => JSON.stringify(Object.fromEntries(PERF_KEYS.map((k) => [k, s[k]])));
  const shareCode = () => "RoA1:" + btoa(unescape(encodeURIComponent(share())));
  function importRaw(txt: string) {
    try {
      const raw = txt.trim().startsWith("RoA1:") ? decodeURIComponent(escape(atob(txt.trim().slice(5)))) : txt;
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of PERF_KEYS) if (k in obj && typeof obj[k] === typeof DEFAULT_SETTINGS[k]) patch[k] = obj[k];
      if (!Object.keys(patch).length) throw new Error("vide");
      store.updateSettings({ ...(patch as Patch), preset: "custom" });
      store.toast("Configuration loaded.");
      setShareOpen(null); setPasteTxt("");
    } catch { store.toast("Invalid code or configuration file."); }
  }

  return (
    <div className="page narrow">
      <div className="set-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>Performance</h1>
          {!current && <span className="tag">Your mix</span>}
        </div>
      </div>
      <p className="sub" style={{ margin: "-12px 0 18px" }}>Choose how hard RoAccount works your PC. Graphics settings apply to the next clients you launch.</p>

      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={"preset" + (current === p.id ? " on" : "")} onClick={() => { store.updateSettings({ ...p.patch, preset: p.id }); }} aria-pressed={current === p.id}>
            <span className={"radio" + (current === p.id ? " on" : "")} />
            <b>{p.name}</b>
            <span className="d">{p.desc}</span>
            {p.lines.map((l) => <span key={l} className="li">{l}</span>)}
            <span className="more">{p.more}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <Row title="For this PC" desc="Watches your in-game clients for about 25 seconds, then advises what to turn on. Nothing new is launched.">
          <span className="sub">Plan for</span>
          <NumInput value={plan} onChange={setPlan} min={1} max={60} width={70} />
          <span className="sub">clients</span>
          <button className="btn solid" disabled={measuring > 0} onClick={() => void measure()}>{measuring ? `${measuring}%` : "Measure"}</button>
        </Row>
        {result && (
          <div className="explain" style={{ paddingTop: 0 }}>
            <b style={{ color: "var(--fg)" }}>{result.n} client{result.n !== 1 ? "s" : ""}</b> use on average {fmtMem(result.mem)} and {result.cpu.toFixed(1)}% CPU each.
            For <b style={{ color: "var(--fg)" }}>{plan}</b>: about {fmtMem(result.predicted)} of memory, leaving {fmtMem(Math.max(0, result.budget))} spare out of {fmtMem(result.ramTotal)}.
            Conseil : <b style={{ color: "var(--fg)" }}>{result.advice === "max" ? "Max accounts" : "Balanced"}</b>.{" "}
            <button className="link-btn" onClick={() => store.updateSettings({ ...PRESETS.find((p) => p.id === result.advice)!.patch, preset: result.advice })}>Apply</button>
          </div>
        )}
      </div>

      <h2 className="group-title">Fine tuning</h2>
      <div className="card">
        <Row title="FPS limit" desc="The maximum frames per second drawn by each client. Lower means less load." explain="Written to Roblox's settings (ClientAppSettings.json): applied on the next client launch. Roblox may ignore some settings.">
          <div className="fps-set">
            {FPS_CHOICES.map((f) => <button key={f} className={s.fpsCap === f ? "on" : ""} onClick={() => set({ fpsCap: f })}>{fpsLabel(f)}</button>)}
          </div>
        </Row>
        <Row title="Minimum graphics" desc="Saves a lot of GPU and CPU with several clients.">
          <Toggle on={s.lowestGraphics} label="Minimum graphics" onChange={(v) => set({ lowestGraphics: v })} />
        </Row>
        <div className="sub-card" style={{ marginBottom: 14 }}>
          <Row title="Anti-aliasing (MSAA)" desc="The lower, the faster, but edges get jagged.">
            <select className="sel" value={s.msaa} onChange={(e) => set({ msaa: Number(e.target.value) })} aria-label="MSAA">
              <option value={0}>Roblox setting</option><option value={1}>x1</option><option value={2}>x2</option><option value={4}>x4</option><option value={8}>x8</option>
            </select>
          </Row>
          <Row title="Texture quality" desc="The lowest setting uses the least GPU memory.">
            <select className="sel" value={s.textures} onChange={(e) => set({ textures: e.target.value as Settings["textures"] })} aria-label="Textures">
              <option value="default">Roblox setting</option><option value="min">Minimum</option><option value="low">Low</option><option value="med">Average</option>
            </select>
          </Row>
          <Row title="Render mode" desc="Only change it if you get artifacts or crashes. Roblox may ignore Vulkan and OpenGL.">
            <select className="sel" value={s.render} onChange={(e) => set({ render: e.target.value as Settings["render"] })} aria-label="Rendering">
              <option value="default">Roblox setting</option><option value="d3d11">Direct3D 11</option><option value="vulkan">Vulkan</option><option value="opengl">OpenGL</option>
            </select>
          </Row>
          <div className="inset-title">Remove visual effects</div>
          <Row title="Grey sky" desc="Replaces the skybox with a flat grey."><Toggle on={s.graySky} label="Grey sky" onChange={(v) => set({ graySky: v })} /></Row>
          <Row title="No grass" desc="Removes grass from rendering."><Toggle on={s.noGrass} label="No grass" onChange={(v) => set({ noGrass: v })} /></Row>
          <Row title="No shadows" desc="Turns the shadows off."><Toggle on={s.noShadows} label="No shadows" onChange={(v) => set({ noShadows: v })} /></Row>
          <Row title="No post-processing" desc="Turns off bloom, blur and colour effects."><Toggle on={s.noPostFx} label="No post-processing" onChange={(v) => set({ noPostFx: v })} /></Row>
          <Row title="Voxel lighting" desc="Uses the lightest lighting engine instead of the game's own."><Toggle on={s.voxelLighting} label="Voxel lighting" onChange={(v) => set({ voxelLighting: v })} /></Row>
        </div>
        <Row title="Minimize on launch" desc="Each batch is minimized to the taskbar once it is in game, without stealing focus.">
          <Toggle on={s.minimizeOnLaunch} label="Minimize on launch" onChange={(v) => set({ minimizeOnLaunch: v })} />
        </Row>
        <Row title="Start clients tiny" desc="After a batch, windows shrink to small thumbnails (384×240).">
          <Toggle on={s.tinyOnLaunch} label="Tiny clients" onChange={(v) => set({ tinyOnLaunch: v })} />
        </Row>
        <Row title="Mute clients on launch" desc="Each new client is muted as soon as it is in game. Restore sound from Home or the Windows mixer.">
          <Toggle on={s.muteOnLaunch} label="Mute" onChange={(v) => set({ muteOnLaunch: v })} />
        </Row>
      </div>

      <h2 className="group-title">Resources</h2>
      <div className="card">
        <Row title="Adaptive limits" desc="Lowers the priority of clients that are not in the foreground.">
          <Toggle on={s.adaptiveLimits} label="Adaptive limits" onChange={(v) => set({ adaptiveLimits: v })} />
        </Row>
        <Row title="Spread clients across cores" desc="Gives each client two neighbouring CPU cores, in rotation.">
          <Toggle on={s.spreadCores} label="Spread across cores" onChange={(v) => set({ spreadCores: v })} />
        </Row>
        <Row title="Trim memory every" desc="Regularly pages clients' memory out to disk.">
          <NumInput value={s.trimEveryMin} onChange={(n) => set({ trimEveryMin: n })} min={1} max={240} width={70} /><span className="sub">min</span>
          <Toggle on={s.trimMemory} label="Trim memory" onChange={(v) => set({ trimMemory: v })} />
        </Row>
        <Row title="Throttle when memory is high" desc="Drops a client to low priority above this size.">
          <NumInput value={s.throttleMemMb} onChange={(n) => set({ throttleMemMb: n })} min={500} max={32000} width={90} /><span className="sub">Mo</span>
          <Toggle on={s.throttleMem} label="Throttle when memory is high" onChange={(v) => set({ throttleMem: v })} />
        </Row>
        <Row title="Restart when memory is high" desc="Stops and relaunches a client above this size (the MAIN account is spared).">
          <NumInput value={s.restartMemMb} onChange={(n) => set({ restartMemMb: n })} min={1000} max={32000} width={90} /><span className="sub">Mo</span>
          <Toggle on={s.restartMem} label="Restart when memory is high" onChange={(v) => set({ restartMem: v })} />
        </Row>
      </div>

      <h2 className="group-title">RoAccount itself</h2>
      <div className="card">
        <Row title="Preview FPS" desc="How often each live preview is redrawn (capped at about 2 frames per second, since a screenshot is costly).">
          <Seg value={s.previewFps} onChange={(v) => store.updateSettings({ previewFps: v })} mono options={[{ v: 5, label: "5 FPS" }, { v: 15, label: "15 FPS" }, { v: 30, label: "30 FPS" }, { v: 60, label: "60 FPS" }]} />
        </Row>
      </div>

      <h2 className="group-title">Share your config</h2>
      <div className="card">
        <div className="share-grid" style={{ padding: "16px 0" }}>
          <button className="btn" onClick={async () => store.toast((await copyText(shareCode())) ? "Share code copied." : "Copy blocked.")}><IconCopy />Copy share code</button>
          <button className="btn" onClick={() => setShareOpen("paste")}><IconDownload />Paste a share code</button>
          <button className="btn" onClick={() => void api.saveExport("roaccount-config.json", share()).then((p) => store.toast("Saved: " + p)).catch((e) => store.toast(String(e)))}><IconFile />Save to a file</button>
          <button className="btn" onClick={async () => { const t = await pickTextFile(".json,.txt"); if (t) importRaw(t); }}><IconUpload />Load from a file</button>
        </div>
      </div>

      {shareOpen && (
        <div className="overlay" onClick={() => setShareOpen(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Paste a share code</h3>
            <p>Paste the code (it starts with <code>RoA1:</code>) or the contents of a configuration file.</p>
            <textarea value={pasteTxt} onChange={(e) => setPasteTxt(e.target.value)} placeholder="RoA1:…" spellCheck={false} autoFocus />
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShareOpen(null)}>Cancel</button>
              <button className="btn primary" onClick={() => importRaw(pasteTxt)}>Load</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

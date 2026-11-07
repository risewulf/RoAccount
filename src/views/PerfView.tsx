import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { copyText, fmtMem, pickTextFile } from "../lib/ui";
import { DEFAULT_SETTINGS, type Settings } from "../lib/types";
import { NumInput, Row, Seg, Toggle } from "../components/Controls";
import { IconCopy, IconDownload, IconFile, IconUpload } from "../components/icons";

type Patch = Partial<Settings>;

const PERF_KEYS = [
  "fpsCap", "lowestGraphics", "msaa", "textures", "render", "graySky", "noGrass",
  "minimizeOnLaunch", "tinyOnLaunch", "muteOnLaunch",
  "adaptiveLimits", "spreadCores", "trimMemory", "trimEveryMin", "throttleMem", "throttleMemMb", "restartMem", "restartMemMb", "previewFps",
] as const;

const BASE_OFF: Patch = {
  fpsCap: 0, lowestGraphics: false, msaa: 0, textures: "default", render: "default", graySky: false, noGrass: false,
  minimizeOnLaunch: false, tinyOnLaunch: false, muteOnLaunch: false,
  adaptiveLimits: false, spreadCores: false, trimMemory: false, throttleMem: false, restartMem: false,
};

const PRESETS: { id: "max" | "balanced" | "defaults"; name: string; desc: string; lines: string[]; more: string; patch: Patch }[] = [
  {
    id: "max", name: "Max comptes", desc: "Un maximum de clients, un minimum de détails.",
    lines: ["10 FPS", "Graphismes au minimum", "Clients en minuscule"], more: "+6 réglages",
    patch: { ...BASE_OFF, fpsCap: 10, lowestGraphics: true, msaa: 1, textures: "min", noGrass: true, tinyOnLaunch: true, muteOnLaunch: true, adaptiveLimits: true, spreadCores: true, trimMemory: true },
  },
  {
    id: "balanced", name: "Équilibré", desc: "Un bon départ pour la plupart des PC.",
    lines: ["30 FPS", "Graphismes au minimum", "Fenêtres visibles"], more: "+1 réglage",
    patch: { ...BASE_OFF, fpsCap: 30, lowestGraphics: true, adaptiveLimits: true },
  },
  {
    id: "defaults", name: "Défauts Roblox", desc: "RoAccount laisse Roblox tel quel.",
    lines: ["Pas de limite de FPS", "Tes propres graphismes", "Fenêtres visibles"], more: "+1 réglage",
    patch: { ...BASE_OFF },
  },
];

function matches(s: Settings, p: Patch): boolean {
  return (Object.keys(p) as (keyof Settings)[]).every((k) => s[k] === p[k]);
}

const FPS_CHOICES = [0, 10, 15, 30, 60, 144];

export function PerfView() {
  const store = useStore();
  const { settings: s } = store;
  const [plan, setPlan] = useState(4);
  const [measuring, setMeasuring] = useState(0);
  const [result, setResult] = useState<null | { n: number; mem: number; cpu: number; ramTotal: number; predicted: number; budget: number; advice: "max" | "balanced" }>(null);
  const [shareOpen, setShareOpen] = useState<null | "paste">(null);
  const [pasteTxt, setPasteTxt] = useState("");
  const lastGfx = useRef(JSON.stringify([s.fpsCap, s.lowestGraphics, s.msaa, s.textures, s.render, s.graySky, s.noGrass]));

  const current = PRESETS.find((p) => matches(s, p.patch))?.id ?? null;

  function set(p: Patch) { store.updateSettings({ ...p, preset: "custom" }); }

  // écrit les réglages graphiques de Roblox (après une courte pause pour éviter les écritures en rafale)
  useEffect(() => {
    const key = JSON.stringify([s.fpsCap, s.lowestGraphics, s.msaa, s.textures, s.render, s.graySky, s.noGrass]);
    if (key === lastGfx.current) return; // rien n'a changé : on n'écrit rien
    lastGfx.current = key;
    const t = window.setTimeout(() => {
      const any = s.fpsCap > 0 || s.lowestGraphics || s.msaa > 0 || s.textures !== "default" || s.render !== "default" || s.graySky || s.noGrass;
      api.applyGraphics(any, { fpsCap: s.fpsCap, lowestGraphics: s.lowestGraphics, msaa: s.msaa, textures: s.textures, render: s.render, graySky: s.graySky, noGrass: s.noGrass })
        .then(() => store.toast(any ? "Réglages graphiques écrits — actifs au prochain lancement d'un client." : "Réglages graphiques retirés."))
        .catch((e) => store.toast(String(e)));
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fpsCap, s.lowestGraphics, s.msaa, s.textures, s.render, s.graySky, s.noGrass]);

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
    if (!samples.length) { store.toast("Aucun client en jeu : lance quelques comptes d'abord."); return; }
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
      store.toast("Configuration chargée.");
      setShareOpen(null); setPasteTxt("");
    } catch { store.toast("Code ou fichier de configuration invalide."); }
  }

  return (
    <div className="page narrow">
      <div className="set-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>Performances</h1>
          {!current && <span className="tag">Ton mélange</span>}
        </div>
      </div>
      <p className="sub" style={{ margin: "-12px 0 18px" }}>Choisis à quel point RoAccount sollicite ton PC. Les réglages graphiques s'appliquent aux prochains clients lancés.</p>

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
        <Row title="Pour ce PC" desc="Observe tes clients en jeu pendant environ 25 secondes, puis te conseille quoi activer. Rien de nouveau n'est lancé.">
          <span className="sub">Prévoir pour</span>
          <NumInput value={plan} onChange={setPlan} min={1} max={60} width={70} />
          <span className="sub">clients</span>
          <button className="btn solid" disabled={measuring > 0} onClick={() => void measure()}>{measuring ? `${measuring} %` : "Mesurer"}</button>
        </Row>
        {result && (
          <div className="explain" style={{ paddingTop: 0 }}>
            <b style={{ color: "var(--fg)" }}>{result.n} client{result.n > 1 ? "s" : ""}</b> utilisent en moyenne {fmtMem(result.mem)} et {result.cpu.toFixed(1).replace(".", ",")} % de CPU chacun.
            Pour <b style={{ color: "var(--fg)" }}>{plan}</b> : environ {fmtMem(result.predicted)} de mémoire, pour {fmtMem(Math.max(0, result.budget))} de marge sur {fmtMem(result.ramTotal)}.
            Conseil : <b style={{ color: "var(--fg)" }}>{result.advice === "max" ? "Max comptes" : "Équilibré"}</b>.{" "}
            <button className="link-btn" onClick={() => store.updateSettings({ ...PRESETS.find((p) => p.id === result.advice)!.patch, preset: result.advice })}>Appliquer</button>
          </div>
        )}
      </div>

      <h2 className="group-title">Réglage fin</h2>
      <div className="card">
        <Row title="Limite de FPS" desc="Le nombre maximal d'images par seconde dessinées par chaque client. Plus bas, moins de charge." explain="Écrit dans les réglages de Roblox (ClientAppSettings.json) : pris en compte au prochain lancement d'un client. Roblox peut ignorer certains réglages.">
          <div className="fps-set">
            {FPS_CHOICES.map((f) => <button key={f} className={s.fpsCap === f ? "on" : ""} onClick={() => set({ fpsCap: f })}>{f === 0 ? "Aucune" : f}</button>)}
          </div>
        </Row>
        <Row title="Graphismes au minimum" desc="Économise beaucoup de GPU et de CPU avec plusieurs clients.">
          <Toggle on={s.lowestGraphics} label="Graphismes au minimum" onChange={(v) => set({ lowestGraphics: v })} />
        </Row>
        <div className="sub-card" style={{ marginBottom: 14 }}>
          <Row title="Anticrénelage (MSAA)" desc="Plus c'est bas, plus c'est rapide, mais les bords sont crénelés.">
            <select className="sel" value={s.msaa} onChange={(e) => set({ msaa: Number(e.target.value) })} aria-label="MSAA">
              <option value={0}>Réglage Roblox</option><option value={1}>x1</option><option value={2}>x2</option><option value={4}>x4</option><option value={8}>x8</option>
            </select>
          </Row>
          <Row title="Qualité des textures" desc="Le minimum utilise le moins de mémoire GPU.">
            <select className="sel" value={s.textures} onChange={(e) => set({ textures: e.target.value as Settings["textures"] })} aria-label="Textures">
              <option value="default">Réglage Roblox</option><option value="min">Minimum</option><option value="low">Basse</option><option value="med">Moyenne</option>
            </select>
          </Row>
          <Row title="Mode de rendu" desc="Ne le change qu'en cas d'artefacts ou de crashs. Roblox peut ignorer Vulkan et OpenGL.">
            <select className="sel" value={s.render} onChange={(e) => set({ render: e.target.value as Settings["render"] })} aria-label="Rendu">
              <option value="default">Réglage Roblox</option><option value="d3d11">Direct3D 11</option><option value="vulkan">Vulkan</option><option value="opengl">OpenGL</option>
            </select>
          </Row>
          <div className="inset-title">Retirer des effets visuels</div>
          <Row title="Ciel gris" desc="Remplace la skybox par un gris uni."><Toggle on={s.graySky} label="Ciel gris" onChange={(v) => set({ graySky: v })} /></Row>
          <Row title="Pas d'herbe" desc="Retire l'herbe du rendu."><Toggle on={s.noGrass} label="Pas d'herbe" onChange={(v) => set({ noGrass: v })} /></Row>
        </div>
        <Row title="Réduire au lancement" desc="Chaque lot est réduit dans la barre des tâches après son entrée en jeu, sans voler le focus.">
          <Toggle on={s.minimizeOnLaunch} label="Réduire au lancement" onChange={(v) => set({ minimizeOnLaunch: v })} />
        </Row>
        <Row title="Démarrer les clients en minuscule" desc="Après un lot, les fenêtres passent en petites vignettes (384×240).">
          <Toggle on={s.tinyOnLaunch} label="Clients en minuscule" onChange={(v) => set({ tinyOnLaunch: v })} />
        </Row>
        <Row title="Couper le son des clients au lancement" desc="Chaque nouveau client est mis en sourdine dès qu'il est en jeu. Rétablis le son depuis l'Accueil ou le mélangeur de Windows.">
          <Toggle on={s.muteOnLaunch} label="Couper le son" onChange={(v) => set({ muteOnLaunch: v })} />
        </Row>
      </div>

      <h2 className="group-title">Ressources</h2>
      <div className="card">
        <Row title="Limites adaptatives" desc="Baisse la priorité des clients qui ne sont pas au premier plan.">
          <Toggle on={s.adaptiveLimits} label="Limites adaptatives" onChange={(v) => set({ adaptiveLimits: v })} />
        </Row>
        <Row title="Répartir les clients sur les cœurs" desc="Donne à chaque client deux cœurs voisins du processeur, en tournant.">
          <Toggle on={s.spreadCores} label="Répartir sur les cœurs" onChange={(v) => set({ spreadCores: v })} />
        </Row>
        <Row title="Alléger la mémoire toutes les" desc="Décharge régulièrement la mémoire des clients sur le disque.">
          <NumInput value={s.trimEveryMin} onChange={(n) => set({ trimEveryMin: n })} min={1} max={240} width={70} /><span className="sub">min</span>
          <Toggle on={s.trimMemory} label="Alléger la mémoire" onChange={(v) => set({ trimMemory: v })} />
        </Row>
        <Row title="Brider si mémoire élevée" desc="Passe en priorité basse un client au-delà de cette taille.">
          <NumInput value={s.throttleMemMb} onChange={(n) => set({ throttleMemMb: n })} min={500} max={32000} width={90} /><span className="sub">Mo</span>
          <Toggle on={s.throttleMem} label="Brider si mémoire élevée" onChange={(v) => set({ throttleMem: v })} />
        </Row>
        <Row title="Redémarrer si mémoire élevée" desc="Arrête et relance un client au-delà de cette taille (le compte MAIN est épargné).">
          <NumInput value={s.restartMemMb} onChange={(n) => set({ restartMemMb: n })} min={1000} max={32000} width={90} /><span className="sub">Mo</span>
          <Toggle on={s.restartMem} label="Redémarrer si mémoire élevée" onChange={(v) => set({ restartMem: v })} />
        </Row>
      </div>

      <h2 className="group-title">RoAccount lui-même</h2>
      <div className="card">
        <Row title="FPS de l'aperçu" desc="La fréquence à laquelle chaque aperçu en direct est redessiné (plafonnée à environ 2 images par seconde, une capture d'écran étant coûteuse).">
          <Seg value={s.previewFps} onChange={(v) => store.updateSettings({ previewFps: v })} mono options={[{ v: 5, label: "5 FPS" }, { v: 15, label: "15 FPS" }, { v: 30, label: "30 FPS" }, { v: 60, label: "60 FPS" }]} />
        </Row>
      </div>

      <h2 className="group-title">Partage ta config</h2>
      <div className="card">
        <div className="share-grid" style={{ padding: "16px 0" }}>
          <button className="btn" onClick={async () => store.toast((await copyText(shareCode())) ? "Code de partage copié." : "Copie refusée.")}><IconCopy />Copier le code de partage</button>
          <button className="btn" onClick={() => setShareOpen("paste")}><IconDownload />Coller un code de partage</button>
          <button className="btn" onClick={() => void api.saveExport("roaccount-config.json", share()).then((p) => store.toast("Enregistré : " + p)).catch((e) => store.toast(String(e)))}><IconFile />Enregistrer dans un fichier</button>
          <button className="btn" onClick={async () => { const t = await pickTextFile(".json,.txt"); if (t) importRaw(t); }}><IconUpload />Charger depuis un fichier</button>
        </div>
      </div>

      {shareOpen && (
        <div className="overlay" onClick={() => setShareOpen(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Coller un code de partage</h3>
            <p>Colle le code (qui commence par <code>RoA1:</code>) ou le contenu d'un fichier de configuration.</p>
            <textarea value={pasteTxt} onChange={(e) => setPasteTxt(e.target.value)} placeholder="RoA1:…" spellCheck={false} autoFocus />
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShareOpen(null)}>Annuler</button>
              <button className="btn primary" onClick={() => importRaw(pasteTxt)}>Charger</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

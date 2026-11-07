import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { RobloxVersion, Settings } from "../lib/types";
import { Group, NumInput, Row, Seg, SettingsPage, Toggle } from "../components/Controls";

/* ------------------------------------------------------------------ */
/* Lancement                                                            */
/* ------------------------------------------------------------------ */

/** Transforme un appui de touches en raccourci au format Tauri (ex. CommandOrControl+Shift+K). */
function comboOf(e: React.KeyboardEvent): string | null {
  const k = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(k)) return null;
  const mods = [e.ctrlKey || e.metaKey ? "CommandOrControl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
  if (!mods.length && !/^F\d{1,2}$/.test(k)) return null; // une touche seule gênerait la frappe normale
  const key = k.length === 1 ? k.toUpperCase() : k.replace("Arrow", "");
  return [...mods, key].join("+");
}

export function LancementSettings() {
  const store = useStore();
  const { settings: s } = store;
  const [ver, setVer] = useState<RobloxVersion | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [shut, setShut] = useState(false);
  const [mins, setMins] = useState(60);
  const set = (p: Partial<Settings>) => store.updateSettings(p);

  useEffect(() => { void api.robloxVersion().then(setVer).catch(() => setVer(null)); }, []);
  const outdated = !!(ver?.installed && ver?.latest && ver.installed !== ver.latest);

  return (
    <SettingsPage title="Lancement">
      <Group>
        <Row title="Multi-instance" desc="Un client par compte, côte à côte. Pris en compte au prochain démarrage de RoAccount." explain="RoAccount garde le verrou de Roblox (ROBLOX_singletonEvent) ouvert avant le premier client. Il faut donc fermer tous les clients Roblox avant de démarrer RoAccount.">
          <Toggle on={s.multiInstance} label="Multi-instance" onChange={(v) => set({ multiInstance: v })} />
        </Row>
        <Row title="Délai de lancement" desc="Le temps entre deux clients d'un lot. Plus long, c'est plus doux pour le PC.">
          <NumInput value={Math.round(s.cooldownMs / 1000)} onChange={(n) => set({ cooldownMs: n * 1000 })} min={0} max={120} width={80} /><span className="sub">s</span>
        </Row>
        <Row title="Arguments de lancement" desc="Mots ajoutés après chaque lien de lancement." explain="Lettres, chiffres et + : . _ - uniquement. Laisse vide si tu ne sais pas à quoi ça sert.">
          <input className="txt mono" style={{ width: 230 }} value={s.launchArgs} onChange={(e) => set({ launchArgs: e.target.value })} placeholder="aucun" aria-label="Arguments de lancement" />
        </Row>
        <Row title="Exclure MAIN de Tout sélectionner" desc="Le compte MAIN reste hors des sélections et des lots, sauf si tu le choisis toi-même.">
          <Toggle on={s.excludeMainFromAll} label="Exclure MAIN" onChange={(v) => set({ excludeMainFromAll: v })} />
        </Row>
      </Group>

      <Group title="Récupération">
        <Row title="Reconnexion auto" desc="Relance vers la même cible un client que Roblox déconnecte (expulsion, serveur fermé, connexion perdue).">
          <Toggle on={s.autoRejoin} label="Reconnexion auto" onChange={(v) => set({ autoRejoin: v })} />
        </Row>
        <Row title="Redémarrage auto après un crash" desc="Relance un client qui crashe ou se fige.">
          <Toggle on={s.autoRestart} label="Redémarrage auto" onChange={(v) => set({ autoRestart: v })} />
        </Row>
        <Row title="Abandonner après" desc="RoAccount cesse de relancer un compte qui échoue trop souvent.">
          <NumInput value={s.giveUpTries} onChange={(n) => set({ giveUpTries: n })} min={1} max={20} width={70} /><span className="sub">essais en</span>
          <NumInput value={s.giveUpMinutes} onChange={(n) => set({ giveUpMinutes: n })} min={1} max={240} width={70} /><span className="sub">min</span>
        </Row>
        <Row title="Anti-AFK" desc="Évite que les clients inactifs soient expulsés." explain="Utilise une macro AutoHotkey v2 intégrée (anti-afk) lancée sur chaque client. AutoHotkey v2 doit être installé.">
          <Toggle on={s.antiAfk} label="Anti-AFK" onChange={(v) => set({ antiAfk: v })} />
        </Row>
      </Group>

      <Group title="Arrêt">
        <Row title="Raccourci d'urgence" desc="Arrête tous les clients, depuis n'importe quelle appli.">
          {s.emergencyHotkey && <span className="kbd">{s.emergencyHotkey.replace("CommandOrControl", "Ctrl")}</span>}
          <button
            className={"btn" + (capturing ? " on" : "")}
            onClick={() => setCapturing(true)}
            onKeyDown={(e) => {
              if (!capturing) return;
              e.preventDefault();
              if (e.key === "Escape") { setCapturing(false); return; }
              const c = comboOf(e);
              if (c) { set({ emergencyHotkey: c }); setCapturing(false); }
            }}
            onBlur={() => setCapturing(false)}
          >{capturing ? "Appuie sur les touches…" : s.emergencyHotkey ? "Changer" : "Définir"}</button>
          {s.emergencyHotkey && <button className="btn" onClick={() => set({ emergencyHotkey: "" })}>Retirer</button>}
        </Row>
        <Row title="Délai de fermeture" desc="Le temps laissé à un client que RoAccount ferme pour se fermer tout seul avant d'être arrêté de force.">
          <NumInput value={s.closeDelaySecs} onChange={(n) => set({ closeDelaySecs: n })} min={0} max={60} width={70} /><span className="sub">s</span>
        </Row>
        <Row title="Éteindre le PC" desc="Le minuteur de Windows. Il ferme toutes les applis.">
          <button className="btn" onClick={() => setShut(true)}>Programmer…</button>
        </Row>
      </Group>

      <Group title="Client Roblox">
        <Row
          title="Version installée"
          badge={ver && <span className={"ok-pill " + (outdated ? "warn" : "")} style={{ marginLeft: 8 }}><i />{outdated ? "obsolète" : "à jour"}</span>}
          desc={ver ? (outdated ? `${ver.installed} · ${ver.latest} est sortie` : ver.installed ?? "Roblox n'est pas installé") : "Vérification…"}
          mono
        >
          <button className="btn" onClick={() => void api.openUrl("https://www.roblox.com/download").catch((e) => store.toast(String(e)))}>Mettre à jour Roblox</button>
        </Row>
      </Group>

      {shut && (
        <div className="overlay" onClick={() => setShut(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Éteindre le PC</h3>
            <p>Windows éteindra le PC dans le délai choisi et fermera toutes les applications, sans demander. Enregistre ton travail avant.</p>
            <div className="inline"><NumInput value={mins} onChange={setMins} min={1} max={1440} width={90} /><span className="sub">minutes</span></div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => void api.scheduleShutdown(0).then(() => { store.toast("Extinction annulée."); setShut(false); }).catch((e) => store.toast(String(e)))}>Annuler la programmation</button>
              <button className="btn primary" onClick={() => void api.scheduleShutdown(mins).then(() => { store.toast(`Le PC s'éteindra dans ${mins} min.`); setShut(false); }).catch((e) => store.toast(String(e)))}>Programmer</button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Apparence                                                            */
/* ------------------------------------------------------------------ */

const ACCENTS = ["#ff2d46", "#a3e635", "#ff3dbb", "#f9a8d4", "#ef5d3f", "#ff9f43", "#ffd23f", "#2dd4bf", "#4f8cff", "#a06cff"];

export function ApparenceSettings() {
  const store = useStore();
  const { settings: s } = store;
  const set = (p: Partial<Settings>) => store.updateSettings(p);
  return (
    <SettingsPage title="Apparence">
      <Group>
        <Row title="Thème" desc="Système suit Windows (sombre ou clair).">
          <Seg value={s.theme} onChange={(v) => set({ theme: v })} options={[{ v: "dark", label: "Sombre" }, { v: "light", label: "Clair" }, { v: "system", label: "Système" }]} />
        </Row>
        <Row title="Couleur d'accent" desc="Boutons, interrupteurs et surlignages. Choisis un préréglage ou n'importe quelle couleur.">
          <div className="accents">
            {ACCENTS.map((c) => (
              <button key={c} className={"acc-dot" + (s.accent.toLowerCase() === c ? " on" : "")} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={`Accent ${c}`} />
            ))}
            <span className="acc-add" title="Autre couleur">+<input type="color" value={/^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : "#ff2d46"} onChange={(e) => set({ accent: e.target.value })} aria-label="Couleur personnalisée" /></span>
          </div>
        </Row>
        <Row title="Densité" desc="Hauteur des lignes dans la liste des comptes.">
          <Seg value={s.density} onChange={(v) => set({ density: v })} options={[{ v: "detailed", label: "Détaillée" }, { v: "compact", label: "Compacte" }]} />
        </Row>
        <Row title="Disposition des onglets" desc="Où placer les comptes et les sections de RoAccount.">
          <Seg value={s.tabLayout} onChange={(v) => set({ tabLayout: v })} options={[{ v: "top", label: "Comptes en haut" }, { v: "side", label: "Comptes sur le côté" }]} />
        </Row>
        <Row title="Effets sonores" desc="Sons discrets pour les clics, les interrupteurs et les notifications.">
          <Toggle on={s.sounds} label="Effets sonores" onChange={(v) => set({ sounds: v })} />
        </Row>
        <Row title="Animations" desc="Les transitions de l'interface. « Réduites » les raccourcit presque à zéro.">
          <Seg value={s.animations} onChange={(v) => set({ animations: v })} options={[{ v: "on", label: "Activées" }, { v: "reduced", label: "Réduites" }, { v: "off", label: "Désactivées" }]} />
        </Row>
      </Group>
      <Group title="Fenêtre">
        <Row title="Réduire dans la zone de notification" desc="Fermer la fenêtre la masque ; les clients en cours et la reconnexion auto continuent de fonctionner.">
          <Toggle on={s.closeToTray} label="Réduire dans la zone de notification" onChange={(v) => set({ closeToTray: v })} />
        </Row>
      </Group>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Sécurité                                                             */
/* ------------------------------------------------------------------ */

export function SecuriteSettings() {
  const store = useStore();
  const { settings: s } = store;
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    if (newPw.length < 4) { setErr("Choisis un mot de passe d'au moins 4 caractères."); return; }
    setBusy(true); setErr("");
    try { await api.changePassword(oldPw, newPw); store.toast("Mot de passe maître changé."); setOpen(false); setOldPw(""); setNewPw(""); }
    catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  return (
    <SettingsPage title="Sécurité">
      <Group>
        <Row title="Chiffrement des cookies" desc="AES-256-GCM avec une clé issue de ton mot de passe maître (Argon2id). Demandé au démarrage et après le verrouillage auto." explain="Les cookies ne sont jamais écrits en clair sur le disque. Sans ton mot de passe maître, le coffre est illisible : il n'existe pas de code de récupération.">
          <span className="ok-pill"><i />Mot de passe maître</span>
        </Row>
        <Row title="Mot de passe maître" desc="Le changer ne fait que rechiffrer la clé ; les cookies ne sont pas rechiffrés.">
          <button className="btn" onClick={() => setOpen(true)}>Changer…</button>
        </Row>
        <Row title="Verrouillage auto après inactivité" desc="Verrouille le coffre et efface la clé de la mémoire.">
          <Seg mono value={s.autoLockMin} onChange={(v) => store.updateSettings({ autoLockMin: v })}
            options={[{ v: 0, label: "Désactivé" }, { v: 5, label: "5 min" }, { v: 15, label: "15 min" }, { v: 30, label: "30 min" }, { v: 60, label: "60 min" }]} />
        </Row>
        <Row title="Vider le presse-papiers après la copie d'un cookie" desc="0 pour ne jamais le vider.">
          <NumInput value={s.clipboardClearSecs} onChange={(n) => store.updateSettings({ clipboardClearSecs: n })} min={0} max={600} width={80} /><span className="sub">s</span>
        </Row>
      </Group>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Changer le mot de passe maître</h3>
            <input className="txt" type="password" placeholder="Mot de passe actuel" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoFocus style={{ marginBottom: 10 }} />
            <input className="txt" type="password" placeholder="Nouveau mot de passe" value={newPw} onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void change()} />
            <div className="lock-err" style={{ marginTop: 8 }}>{err}</div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn primary" disabled={busy} onClick={() => void change()}>{busy ? "…" : "Changer"}</button>
            </div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Données                                                              */
/* ------------------------------------------------------------------ */

export function DonneesSettings() {
  const store = useStore();
  const { settings: s } = store;
  const [backups, setBackups] = useState<{ name: string; path: string }[] | null>(null);
  const t = (p: Promise<unknown>, ok: string) => p.then(() => store.toast(ok)).catch((e) => store.toast(String(e)));

  return (
    <SettingsPage title="Données">
      <Group>
        <Row title="Dossier des données" desc="%LOCALAPPDATA%\RoAccount" mono>
          <button className="btn" onClick={() => void api.openPath("data").catch((e) => store.toast(String(e)))}>Ouvrir</button>
          <button className="btn" onClick={() => void api.openPath("exports").catch((e) => store.toast(String(e)))}>Ouvrir les exports</button>
        </Row>
        <Row title="Fichier de sauvegarde" desc="Un seul fichier chiffré par ton mot de passe maître, avec chaque compte, son cookie et ses groupes.">
          <button className="btn" onClick={() => void api.listBackups().then(setBackups).catch((e) => store.toast(String(e)))}>Importer…</button>
          <button className="btn" onClick={() => void api.exportBackup().then((p) => store.toast("Sauvegarde : " + p)).catch((e) => store.toast(String(e)))}>Exporter…</button>
        </Row>
        <Row title="Garder les infos du compte pendant" desc="Combien de temps avant que Robux, présence et jeu soient réactualisés automatiquement.">
          <NumInput value={s.accountCacheMin} onChange={(n) => store.updateSettings({ accountCacheMin: n })} min={1} max={120} width={80} /><span className="sub">min</span>
        </Row>
        <Row title="Nettoyer les logs Roblox" desc="Supprime les fichiers de logs de Roblox, qui grossissent avec plusieurs clients." explain="« Nettoyer » les supprime tout de suite ; l'interrupteur les supprime aussi à chaque démarrage de RoAccount.">
          <button className="btn" onClick={() => void api.cleanRobloxLogs().then((n) => store.toast(`${n} fichier(s) supprimé(s).`)).catch((e) => store.toast(String(e)))}>Nettoyer</button>
          <Toggle on={s.cleanRobloxLogs} label="Nettoyer à chaque démarrage" onChange={(v) => store.updateSettings({ cleanRobloxLogs: v })} />
        </Row>
      </Group>

      {backups && (
        <div className="overlay" onClick={() => setBackups(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Importer une sauvegarde</h3>
            <p>Choisis une sauvegarde du dossier <code>backups</code>. Elle remplace le coffre actuel.</p>
            {backups.length === 0 && <div className="placeholder">Aucune sauvegarde trouvée. Exporte-en une d'abord.</div>}
            {backups.map((b) => (
              <button key={b.path} className="pop-item" onClick={() => void t(api.importBackup(b.path).then(() => store.reload()), "Sauvegarde importée.").then(() => setBackups(null))}>{b.name}</button>
            ))}
            <div className="dialog-actions"><button className="btn" onClick={() => setBackups(null)}>Fermer</button></div>
          </div>
        </div>
      )}
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* À propos                                                             */
/* ------------------------------------------------------------------ */

export function AProposSettings() {
  const store = useStore();
  const open = (u: string) => void api.openUrl(u).catch((e) => store.toast(String(e)));
  return (
    <SettingsPage title="À propos">
      <Group>
        <Row title="Chercher les mises à jour de RoAccount" desc="Ouvre la page des versions : télécharge le dernier installeur si une nouvelle version est sortie.">
          <button className="btn" onClick={() => open("https://github.com/risewulf/RoAccount/releases/latest")}>Vérifier</button>
        </Row>
        <Row title={`RoAccount ${__APP_VERSION__}`} desc="Ce à quoi RoAccount se connecte, et ce qu'il modifie." explain="Il parle aux API officielles *.roblox.com, télécharge roaccount.xyz/news.json pour les actualités, et envoie vers ton webhook Discord si tu en as réglé un. Il écrit dans son dossier de données, dans ClientAppSettings.json de Roblox (réglages graphiques) et garde le verrou de multi-instance ouvert.">
          <button className="btn" onClick={() => open("https://github.com/risewulf/RoAccount/releases")}>Ouvrir la page des versions</button>
        </Row>
        <Row title="Soutenir RoAccount">
          <button className="btn" onClick={() => open("https://discord.gg/u6wWWSUz3G")}>Rejoindre notre Discord</button>
          <button className="btn" onClick={() => open("https://github.com/risewulf/RoAccount")}>Code source</button>
        </Row>
      </Group>
    </SettingsPage>
  );
}

/* ------------------------------------------------------------------ */
/* Raccourcis                                                           */
/* ------------------------------------------------------------------ */

const LEFT: [string, string[]][] = [
  ["Aller à l'Accueil", ["Ctrl", "1"]], ["Aller à Comptes", ["Ctrl", "2"]], ["Aller à Jouer", ["Ctrl", "3"]],
  ["Aller à Serveurs", ["Ctrl", "4"]], ["Aller à Paramètres", ["Ctrl", "5"]], ["Aller à Moniteur", ["Ctrl", "6"]],
  ["Aller à Discord", ["Ctrl", "7"]], ["Aller à Debug", ["Ctrl", "8"]], ["Aller à Performances", ["Ctrl", "9"]],
];
const RIGHT: [string, string[]][] = [
  ["Ajouter un compte", ["Ctrl", "N"]], ["Rechercher", ["Ctrl", "F"]], ["Tout sélectionner (affichés)", ["Ctrl", "A"]],
  ["Vérifier la sélection, ou tout", ["Ctrl", "R"]], ["Retirer la sélection", ["Delete"]], ["Appuyer sur Jouer", ["Ctrl", "Enter"]],
  ["Actualiser l'affichage", ["F5"]], ["Verrouiller le coffre (mot de passe maître)", ["Ctrl", "L"]],
  ["Fermer la boîte de dialogue, vider la sélection", ["Esc"]], ["Afficher les raccourcis", ["?"]],
];

export function RaccourcisSettings() {
  const R = ({ rows }: { rows: [string, string[]][] }) => (
    <div>{rows.map(([t, k]) => (<div className="kb-row" key={t}><span>{t}</span><span className="kbs">{k.map((x) => <span key={x} className="kbd">{x}</span>)}</span></div>))}</div>
  );
  return (
    <SettingsPage title="Raccourcis">
      <div className="card"><div className="kb-grid"><R rows={LEFT} /><R rows={RIGHT} /></div></div>
    </SettingsPage>
  );
}

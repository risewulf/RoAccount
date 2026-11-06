import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { BackupInfo } from "../lib/types";

export function SettingsView({ onLock }: { onLock: () => void }) {
  const store = useStore();
  const { settings } = store;

  function toggle<K extends keyof typeof settings>(k: K) {
    store.updateSettings({ [k]: !settings[k] } as Partial<typeof settings>);
  }

  // --- changer le mot de passe ---
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function changePw() {
    if (!newPw || newPw !== confirmPw) { store.toast("Les nouveaux mots de passe ne correspondent pas."); return; }
    setPwBusy(true);
    try {
      await api.changePassword(oldPw, newPw);
      setOldPw(""); setNewPw(""); setConfirmPw("");
      store.toast("Mot de passe maître changé.");
    } catch (e) { store.toast(String(e)); } finally { setPwBusy(false); }
  }

  // --- sauvegardes ---
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  async function loadBackups() {
    try { setBackups(await api.listBackups()); } catch { /* ignore */ }
  }
  useEffect(() => { void loadBackups(); /* eslint-disable-next-line */ }, []);

  async function exportBackup() {
    try {
      const path = await api.exportBackup();
      store.toast("Sauvegarde créée.");
      await loadBackups();
      console.log("Backup:", path);
    } catch (e) { store.toast(String(e)); }
  }

  async function importBackup(path: string) {
    try {
      await api.importBackup(path);
      store.toast("Sauvegarde importée — déverrouille avec son mot de passe.");
      onLock();
    } catch (e) { store.toast(String(e)); }
  }

  return (
    <section>
      <div className="vhead"><div><h1>Réglages</h1><p>Coffre, sécurité et lancement.</p></div></div>

      <div className="card">
        <h3>Coffre</h3>
        <p className="sub">Les cookies sont chiffrés en local (Argon2id + AES-256-GCM) et jamais partagés.</p>
        <div className="row">
          <div className="l"><b>Verrouiller maintenant</b><div>Efface la clé de la mémoire</div></div>
          <button className="btn" onClick={onLock}>Verrouiller</button>
        </div>
      </div>

      <div className="card">
        <h3>Changer le mot de passe maître</h3>
        <p className="sub">Re-chiffre le coffre avec un nouveau mot de passe.</p>
        <label className="field" style={{ marginBottom: 8 }}>
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Mot de passe actuel" />
        </label>
        <label className="field" style={{ marginBottom: 8 }}>
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Nouveau mot de passe" />
        </label>
        <label className="field" style={{ marginBottom: 12 }}>
          <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirmer le nouveau" />
        </label>
        <button className="btn primary" onClick={changePw} disabled={pwBusy || !oldPw || !newPw}>
          {pwBusy ? "…" : "Changer le mot de passe"}
        </button>
      </div>

      <div className="card">
        <h3>Sauvegardes chiffrées</h3>
        <p className="sub">Une copie du coffre chiffré. L'import remplace le coffre actuel (il faudra le mot de passe de la sauvegarde).</p>
        <button className="btn primary" onClick={exportBackup}>Créer une sauvegarde</button>
        {backups.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {backups.map((b) => (
              <div className="row" key={b.path}>
                <div className="l"><b style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{b.name}</b></div>
                <button className="btn" onClick={() => importBackup(b.path)}>Restaurer</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Lancement par défaut</h3>
        <div className="row">
          <div className="l"><b>Serveurs d'un lot</b><div>Même serveur, un serveur différent par compte, ou serveur privé</div></div>
          <select className="sort-select" value={settings.serverMode} onChange={(e) => store.updateSettings({ serverMode: e.target.value as typeof settings.serverMode })} aria-label="Mode serveur">
            <option value="same">Même serveur</option>
            <option value="random">Aléatoire</option>
            <option value="closest">Plus proche</option>
            <option value="private">Serveur privé</option>
          </select>
        </div>
        <div className="row">
          <div className="l"><b>Auto-rejoin</b><div>Un client déconnecté rejoint tout seul</div></div>
          <button className={"tg" + (settings.autoRejoin ? " on" : "")} onClick={() => toggle("autoRejoin")} aria-pressed={settings.autoRejoin} />
        </div>
        <div className="row">
          <div className="l"><b>Cooldown entre lancements</b><div>{(settings.cooldownMs / 1000).toFixed(0)} secondes</div></div>
          <input type="range" min={0} max={20000} step={1000} value={settings.cooldownMs} onChange={(e) => store.updateSettings({ cooldownMs: Number(e.target.value) })} />
        </div>
      </div>

      <div className="card">
        <h3>Macros</h3>
        <p className="sub">Chemin d'AutoHotkey v2 si la détection automatique ne le trouve pas.</p>
        <label className="field">
          <input value={settings.ahkPath} onChange={(e) => store.updateSettings({ ahkPath: e.target.value })} placeholder="C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe (vide = auto)" spellCheck={false} />
        </label>
      </div>

      <div className="footnote">
        RoAccount — projet indépendant, sans lien avec Roblox Corporation. À utiliser uniquement avec des comptes qui t'appartiennent.
        {api.isMock ? " Mode démo navigateur : aucune action réelle." : ""}
      </div>
    </section>
  );
}

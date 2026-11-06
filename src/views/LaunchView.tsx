import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { Avatar } from "../components/Avatar";
import { IconPlus, IconRocket, IconSearch, IconUsers, IconX } from "../components/icons";

interface Profile { name: string; target: string; }

const SERVER_MODES = [
  { id: "same", label: "Même serveur", desc: "Tous les comptes rejoignent la même partie" },
  { id: "random", label: "Aléatoire", desc: "Chaque compte dans un serveur public différent, au hasard" },
  { id: "closest", label: "Plus proche", desc: "Chaque compte dans un des serveurs au ping le plus bas" },
  { id: "private", label: "Serveur privé", desc: "Tous les comptes dans ton serveur privé (lien)" },
] as const;

function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem("roaccount.profiles");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [
    { name: "Adopt Me!", target: "roblox.com/games/920587237/Adopt-Me" },
    { name: "Pet Sim 99", target: "roblox.com/games/8737899170" },
  ];
}

export function LaunchView() {
  const store = useStore();
  const { accounts, selected, settings } = store;
  const [busy, setBusy] = useState(false);
  const [friend, setFriend] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>(loadProfiles);

  const selectedAccounts = accounts.filter((a) => selected.has(a.id));
  // le compte MAIN est exclu des lancements en lot (aussi côté Rust)
  const liveIds = () => selectedAccounts.filter((a) => a.health !== "cookie_expired" && !a.main).map((a) => a.id);

  function toggleSetting<K extends keyof typeof settings>(k: K) {
    store.updateSettings({ [k]: !settings[k] } as Partial<typeof settings>);
  }

  function saveProfiles(list: Profile[]) {
    setProfiles(list);
    try { localStorage.setItem("roaccount.profiles", JSON.stringify(list)); } catch { /* ignore */ }
  }
  function saveCurrentAsProfile() {
    const name = settings.target.split("/").filter(Boolean).pop() || settings.target;
    if (profiles.some((p) => p.target === settings.target)) return;
    saveProfiles([...profiles, { name: name.slice(0, 24), target: settings.target }]);
    store.toast("Profil enregistré.");
  }

  async function launchAll() {
    if (!selectedAccounts.length) { store.toast("Coche des comptes dans l'onglet Comptes."); return; }
    setBusy(true);
    try {
      if (settings.serverMode === "private" && !settings.privateLink.trim()) {
        store.toast("Colle le lien du serveur privé."); setBusy(false); return;
      }
      const launched = await api.launchBatchServers(liveIds(), settings.target, settings.serverMode, settings.privateLink, settings.cooldownMs);
      launched.forEach((id) => store.patch(id, { running: true, presence: "InGame" }));
      store.toast(`${launched.length} client(s) lancé(s).`);
      window.setTimeout(() => { void store.refreshAll(); }, 8000);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function follow() {
    if (!friend.trim()) { store.toast("Entre un @pseudo, un userId ou un lien de profil."); return; }
    if (!selectedAccounts.length) { store.toast("Coche des comptes à faire rejoindre."); return; }
    setBusy(true);
    try {
      const launched = await api.followUser(liveIds(), friend.trim(), settings.cooldownMs);
      launched.forEach((id) => store.patch(id, { running: true, presence: "InGame" }));
      store.toast(`${launched.length} compte(s) envoyé(s) rejoindre ${friend.trim()}.`);
      window.setTimeout(() => { void store.refreshAll(); }, 8000);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  return (
    <section>
      <div className="vhead"><div><h1>Lancement</h1><p>Colle un lien de jeu ou un place ID, choisis tes options, lance la sélection.</p></div></div>

      <div className="launch-grid">
        <div>
          <div className="target">
            <IconSearch />
            <input value={settings.target} onChange={(e) => store.updateSettings({ target: e.target.value })} placeholder="roblox.com/games/… ou place ID" />
            <button className="btn primary" disabled={busy} onClick={launchAll}>
              <IconRocket />{busy ? "En cours…" : "Lancer la sélection"}
            </button>
          </div>

          {/* profils */}
          <div className="profiles">
            {profiles.map((p) => (
              <span key={p.target} className="profile-chip">
                <button onClick={() => store.updateSettings({ target: p.target })} title={p.target}>{p.name}</button>
                <button className="profile-x" onClick={() => saveProfiles(profiles.filter((x) => x.target !== p.target))} aria-label="Supprimer le profil"><IconX /></button>
              </span>
            ))}
            <button className="profile-add" onClick={saveCurrentAsProfile}><IconPlus />Enregistrer la cible</button>
          </div>

          {/* rejoindre un ami */}
          <div className="card" style={{ marginTop: 14 }}>
            <h3>Rejoindre un ami</h3>
            <p className="sub">Envoie les comptes sélectionnés dans la partie d'un joueur.</p>
            <div className="target" style={{ background: "var(--surface-2)" }}>
              <IconUsers />
              <input value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="@pseudo, userId ou lien de profil" onKeyDown={(e) => e.key === "Enter" && follow()} />
              <button className="btn" disabled={busy} onClick={follow}>Rejoindre</button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3>Options de lancement</h3>
            <p className="sub">Comment RoAccount ouvre les clients.</p>
            <div className="row">
              <div className="l"><b>Serveurs</b><div>{SERVER_MODES.find((m) => m.id === settings.serverMode)?.desc}</div></div>
              <select className="sort-select" value={settings.serverMode} onChange={(e) => store.updateSettings({ serverMode: e.target.value as typeof settings.serverMode })} aria-label="Mode serveur">
                {SERVER_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {settings.serverMode === "private" && (
              <label className="field" style={{ margin: "4px 0 10px" }}>
                <input value={settings.privateLink} onChange={(e) => store.updateSettings({ privateLink: e.target.value })} placeholder="https://www.roblox.com/games/…?privateServerLinkCode=…" spellCheck={false} />
              </label>
            )}
            <Row label="Couper le son" desc="Mute les nouveaux clients au lancement (le compte MAIN n'est pas touché)" on={settings.muteOnLaunch} onClick={() => toggleSetting("muteOnLaunch")} />
            <Row label="Lancement en file" desc={`Cooldown de ${(settings.cooldownMs / 1000).toFixed(0)} s entre chaque client`} on={settings.cooldownMs > 0} onClick={() => store.updateSettings({ cooldownMs: settings.cooldownMs > 0 ? 0 : 6000 })} />
            <Row label="Auto-rejoin" desc="Un client déconnecté rejoint tout seul" on={settings.autoRejoin} onClick={() => toggleSetting("autoRejoin")} />
          </div>
        </div>

        <div className="sel-summary">
          <div className="k-eyebrow">Sélection</div>
          <div className="big-n">{selectedAccounts.length}</div>
          <div className="sub-n">comptes prêts à lancer{selectedAccounts.some((a) => a.main) ? " · MAIN ignoré" : ""}</div>
          {selectedAccounts.length === 0 ? (
            <div style={{ color: "var(--faint)", fontSize: 13, padding: "8px 0" }}>Coche des comptes dans l'onglet Comptes.</div>
          ) : (
            selectedAccounts.map((a) => (
              <div className="mini" key={a.id}>
                <Avatar account={a} size={26} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.username}</span>
                {a.main && <span className="badge main" style={{ marginLeft: "auto" }}>MAIN</span>}
                {a.health === "cookie_expired" && <span className="badge" style={{ color: "var(--crit)", marginLeft: "auto" }}>cookie</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, desc, on, onClick }: { label: string; desc: string; on: boolean; onClick: () => void }) {
  return (
    <div className="row">
      <div className="l"><b>{label}</b><div>{desc}</div></div>
      <button className={"tg" + (on ? " on" : "")} onClick={onClick} aria-pressed={on} aria-label={label} />
    </div>
  );
}

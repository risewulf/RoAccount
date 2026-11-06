import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";

export function DiscordView() {
  const store = useStore();
  const { settings } = store;
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    try { await api.testDiscord(settings.discordWebhook); store.toast("Message de test envoyé sur Discord."); }
    catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  function toggle<K extends keyof typeof settings>(k: K) {
    store.updateSettings({ [k]: !settings[k] } as Partial<typeof settings>);
  }

  return (
    <section>
      <div className="vhead"><div><h1>Alertes Discord</h1><p>Reçois les crashs, déconnexions et fins de lot sur ton propre webhook.</p></div></div>

      <div className="card">
        <h3>Webhook</h3>
        <p className="sub">Gardé en local. Rien n'est envoyé tant que ce champ est vide.</p>
        <label className="field" style={{ marginBottom: 12 }}>
          <input
            value={settings.discordWebhook}
            onChange={(e) => store.updateSettings({ discordWebhook: e.target.value })}
            placeholder="https://discord.com/api/webhooks/…"
            spellCheck={false}
          />
        </label>
        <button className="btn primary" onClick={test} disabled={busy || !settings.discordWebhook}>
          {busy ? "Envoi…" : "Envoyer un test"}
        </button>
      </div>

      <div className="card">
        <h3>Ping</h3>
        <p className="sub">Ajoute une @mention de toi dans les alertes crash, déconnexion et figé. Laisse vide pour ne pas être pingé.</p>
        <label className="field" style={{ marginBottom: 8 }}>
          <input
            value={settings.discordUserId}
            onChange={(e) => store.updateSettings({ discordUserId: e.target.value.replace(/\D/g, "") })}
            placeholder="Ton ID Discord (ex. 123456789012345678)"
            inputMode="numeric"
            spellCheck={false}
          />
        </label>
        <p className="hint">Discord → Réglages → Avancé → active le mode développeur, puis clic droit sur ton profil → « Copier l'identifiant ».</p>
      </div>

      <div className="card">
        <h3>Événements</h3>
        <p className="sub">Choisis ce qui déclenche une alerte.</p>
        <Row label="Crash d'un client" desc="Avec la raison tirée du log" on={settings.alertCrash} onClick={() => toggle("alertCrash")} />
        <Row label="Déconnexion" desc="Quand un compte quitte la partie" on={settings.alertDisconnect} onClick={() => toggle("alertDisconnect")} />
        <Row label="Client figé" desc="La fenêtre ne répond plus depuis ~40 s" on={settings.alertFreeze} onClick={() => toggle("alertFreeze")} />
        <Row label="Lot terminé" desc="Tous les comptes d'un lancement sont entrés" on={settings.alertBatch} onClick={() => toggle("alertBatch")} />
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

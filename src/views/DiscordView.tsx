import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { Settings } from "../lib/types";
import { NumInput, Row, Toggle } from "../components/Controls";

const EVENTS: { k: keyof Settings; title: string; desc: string }[] = [
  { k: "alertLaunch", title: "Lancements", desc: "Un client est entré en jeu (hors reconnexion ou redémarrage)." },
  { k: "alertCrash", title: "Crashs", desc: "Un client s'est fermé sans que RoAccount l'ait fermé." },
  { k: "alertFreeze", title: "Ne répond plus", desc: "La fenêtre d'un client ne répond plus depuis 30 s." },
  { k: "alertDisconnect", title: "Déconnexions", desc: "Roblox a expulsé un client, son serveur a fermé ou la connexion a été perdue." },
  { k: "alertRestart", title: "Reconnexions et redémarrages", desc: "La reconnexion auto ou le redémarrage auto a relancé un compte." },
  { k: "alertMemRestart", title: "Redémarrages mémoire", desc: "Un client a été redémarré parce qu'il utilisait trop de mémoire." },
  { k: "alertGiveUp", title: "Abandon", desc: "RoAccount a cessé de relancer un compte après trop d'essais." },
  { k: "alertBatch", title: "Lot terminé", desc: "Combien de comptes d'un lot sont entrés en jeu." },
  { k: "alertSummary", title: "Résumé de statut", desc: "Combien de clients tournent, avec leur RAM et leur CPU." },
];

export function DiscordView() {
  const store = useStore();
  const { settings } = store;
  const [hook, setHook] = useState(settings.discordWebhook);
  const [busy, setBusy] = useState(false);
  const saved = hook.trim() === settings.discordWebhook.trim();

  async function test() {
    setBusy(true);
    try { await api.testDiscord(hook.trim()); store.toast("Message de test envoyé sur Discord."); }
    catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="page narrow">
      <div className="set-head"><div><h1>Discord</h1><p className="sub" style={{ marginTop: 4 }}>Des alertes dans un salon de ton serveur, avec une mention si tu veux.</p></div></div>

      <div className="card">
        <Row title="Webhook" desc={settings.discordWebhook ? "Défini. Les alertes partent vers ce salon." : "Non défini. Colle l'URL du webhook affichée par Discord (Copier l'URL du webhook)."} col>
          <div className="inline" style={{ width: "100%", flexWrap: "nowrap" }}>
            <input className="txt mono" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" spellCheck={false} aria-label="Webhook Discord" />
            <button className="btn" disabled={saved} onClick={() => { store.updateSettings({ discordWebhook: hook.trim() }); store.toast("Webhook enregistré."); }}>Enregistrer</button>
            <button className="btn" disabled={busy || !hook.trim()} onClick={() => void test()}>{busy ? "Envoi…" : "Tester"}</button>
          </div>
        </Row>
        <Row title="Mention" desc="Ton ID Discord, ou un rôle sous la forme <@&id>. Les crashs, déconnexions et blocages te mentionnent.">
          <input className="txt mono" style={{ width: 230 }} value={settings.discordUserId} onChange={(e) => store.updateSettings({ discordUserId: e.target.value })} placeholder="désactivé" aria-label="Mention Discord" />
        </Row>
      </div>

      <h2 className="group-title">Événements</h2>
      <div className="card">
        {EVENTS.map((e) => (
          <Row key={e.k} title={e.title} desc={e.desc}>
            {e.k === "alertSummary" && settings.alertSummary && (<><span className="sub">toutes les</span><NumInput value={settings.summaryEveryMin} onChange={(n) => store.updateSettings({ summaryEveryMin: n })} min={1} max={1440} width={70} /><span className="sub">min</span></>)}
            <Toggle on={settings[e.k] as boolean} label={e.title} onChange={(v) => store.updateSettings({ [e.k]: v } as Partial<Settings>)} />
          </Row>
        ))}
      </div>
    </div>
  );
}

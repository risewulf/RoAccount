import { useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../store";
import type { Settings } from "../lib/types";
import { NumInput, Row, Toggle } from "../components/Controls";

const EVENTS: { k: keyof Settings; title: string; desc: string }[] = [
  { k: "alertLaunch", title: "Launches", desc: "A client got in game (not a rejoin or restart)." },
  { k: "alertCrash", title: "Crashes", desc: "A client closed without RoAccount closing it." },
  { k: "alertFreeze", title: "Not responding", desc: "A client's window hasn't responded for 30 s." },
  { k: "alertDisconnect", title: "Disconnections", desc: "Roblox kicked a client, its server closed or the connection was lost." },
  { k: "alertRestart", title: "Rejoins and restarts", desc: "Auto-rejoin or auto-restart relaunched an account." },
  { k: "alertMemRestart", title: "Memory restarts", desc: "A client was restarted because it used too much memory." },
  { k: "alertGiveUp", title: "Give up", desc: "RoAccount stopped relaunching an account after too many tries." },
  { k: "alertBatch", title: "Batch finished", desc: "How many accounts of a batch got in game." },
  { k: "alertSummary", title: "Status summary", desc: "How many clients are running, with their RAM and CPU." },
];

export function DiscordView() {
  const store = useStore();
  const { settings } = store;
  const [hook, setHook] = useState(settings.discordWebhook);
  const [busy, setBusy] = useState(false);
  const saved = hook.trim() === settings.discordWebhook.trim();

  async function test() {
    setBusy(true);
    try { await api.testDiscord(hook.trim()); store.toast("Test message sent to Discord."); }
    catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="page narrow">
      <div className="set-head"><div><h1>Discord</h1><p className="sub" style={{ marginTop: 4 }}>Alerts in a channel of your server, with a mention if you want.</p></div></div>

      <div className="card">
        <Row title="Webhook" desc={settings.discordWebhook ? "Set. Alerts go to this channel." : "Not set. Paste the webhook URL shown by Discord (Copy Webhook URL)."} col>
          <div className="inline" style={{ width: "100%", flexWrap: "nowrap" }}>
            <input className="txt mono" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" spellCheck={false} aria-label="Webhook Discord" />
            <button className="btn" disabled={saved} onClick={() => { store.updateSettings({ discordWebhook: hook.trim() }); store.toast("Webhook saved."); }}>Save</button>
            <button className="btn" disabled={busy || !hook.trim()} onClick={() => void test()}>{busy ? "Sending…" : "Test"}</button>
          </div>
        </Row>
        <Row title="Mention" desc="Your Discord ID, or a role as <@&id>. Crashes, disconnects and freezes mention you.">
          <input className="txt mono" style={{ width: 230 }} value={settings.discordUserId} onChange={(e) => store.updateSettings({ discordUserId: e.target.value })} placeholder="off" aria-label="Mention Discord" />
        </Row>
      </div>

      <h2 className="group-title">Events</h2>
      <div className="card">
        {EVENTS.map((e) => (
          <Row key={e.k} title={e.title} desc={e.desc}>
            {e.k === "alertSummary" && settings.alertSummary && (<><span className="sub">every</span><NumInput value={settings.summaryEveryMin} onChange={(n) => store.updateSettings({ summaryEveryMin: n })} min={1} max={1440} width={70} /><span className="sub">min</span></>)}
            <Toggle on={settings[e.k] as boolean} label={e.title} onChange={(v) => store.updateSettings({ [e.k]: v } as Partial<Settings>)} />
          </Row>
        ))}
      </div>
    </div>
  );
}

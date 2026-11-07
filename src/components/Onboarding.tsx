import { useEffect, useState } from "react";
import { useStore } from "../store";
import { IconCheck, IconKey, IconPlay, IconBell } from "./icons";

/** First launch: vault → first account → first launch, in three short steps. */
export function Onboarding() {
  const store = useStore();
  const { settings, accounts } = store;
  const [step, setStep] = useState(0);
  const show = !settings.onboarded && accounts.length === 0;

  // someone who already has accounts never sees the guide
  useEffect(() => {
    if (!settings.onboarded && accounts.length > 0) store.updateSettings({ onboarded: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  useEffect(() => { if (show && step === 1 && accounts.length > 0) setStep(2); }, [accounts.length]); // eslint-disable-line

  if (!show) return null;
  const done = () => store.updateSettings({ onboarded: true });
  const steps = [
    { icon: <IconKey />, title: "Your vault is ready", body: "Every account you add is encrypted on this PC behind your master password. Nothing is sent anywhere except to Roblox.", cta: "Next", run: () => setStep(1) },
    { icon: <IconCheck />, title: "Add your first account", body: "Sign in with Roblox in a small window, or paste a cookie. Only add accounts you own.", cta: "Add an account", run: () => store.setAddOpen(true) },
    { icon: <IconPlay />, title: "Launch it", body: "Pick the account on the Play page, paste a game link and press Launch. Add more accounts later and launch them all at once.", cta: "Go to Play", run: () => { store.setView("jouer"); setStep(3); } },
    { icon: <IconBell />, title: "Stay in the game", body: "Turn on Auto-rejoin in Settings → Launch, and add a Discord webhook in Discord to get an alert when a client crashes.", cta: "Got it", run: done },
  ];
  const s = steps[step];

  return (
    <div className="overlay" style={{ zIndex: 80 }}>
      <div className="dialog onboard" onClick={(e) => e.stopPropagation()}>
        <div className="ob-ico">{s.icon}</div>
        <h3>{s.title}</h3>
        <p className="sub" style={{ margin: "0 0 18px" }}>{s.body}</p>
        <div className="ob-dots" aria-hidden="true">{steps.map((_, i) => <i key={i} className={i === step ? "on" : i < step ? "done" : ""} />)}</div>
        <div className="dialog-actions">
          <button className="btn" onClick={done}>Skip</button>
          <button className="btn solid" onClick={s.run}>{s.cta}</button>
        </div>
      </div>
    </div>
  );
}

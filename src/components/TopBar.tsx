import { Wordmark } from "./Brand";
import { api } from "../lib/api";
import { IconDiscord, IconLock, IconSun, IconX } from "./icons";

export function TopBar({
  unlocked,
  onToggleTheme,
  onKillAll,
}: {
  unlocked: boolean;
  onToggleTheme: () => void;
  onKillAll: () => void;
}) {
  return (
    <header className="topbar">
      <Wordmark />
      {unlocked && (
        <span className="vault" title="Coffre déverrouillé">
          <IconLock style={{ color: "var(--ok)" }} />
          <span>Coffre ouvert</span>
        </span>
      )}
      <span className="spacer" />
      <button
        className="btn discord-btn"
        onClick={() => { void api.openUrl("https://discord.gg/u6wWWSUz3G").catch(() => { /* ignore */ }); }}
        title="Rejoindre le Discord RoAccount"
      >
        <IconDiscord />Discord
      </button>
      <button className="icon-btn" onClick={onToggleTheme} title="Thème clair / sombre" aria-label="Thème">
        <IconSun />
      </button>
      <button className="kill" onClick={onKillAll}>
        <IconX />
        Tout arrêter
      </button>
    </header>
  );
}

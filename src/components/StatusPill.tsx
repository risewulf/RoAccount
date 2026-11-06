import type { AccountMeta } from "../lib/types";

export function StatusPill({ account }: { account: AccountMeta }) {
  if (account.health === "cookie_expired") {
    return <span className="pill cookie"><span className="dot" style={{ background: "var(--crit)" }} />Cookie expiré</span>;
  }
  if (account.presence === "InGame") {
    return <span className="pill ingame"><span className="dot" style={{ background: "var(--ok)" }} />En jeu</span>;
  }
  if (account.presence === "Online" || account.presence === "Studio") {
    return <span className="pill online"><span className="dot" style={{ background: "var(--info)" }} />En ligne</span>;
  }
  if (account.presence === "Offline") {
    return <span className="pill offline"><span className="dot" style={{ background: "var(--faint)" }} />Hors ligne</span>;
  }
  return <span className="pill unknown"><span className="dot" style={{ background: "var(--muted)" }} />Inconnu</span>;
}

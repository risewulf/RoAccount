import type { AccountMeta } from "../lib/types";

export function StatusPill({ account }: { account: AccountMeta }) {
  if (account.health === "banned") {
    return <span className="pill cookie"><span className="dot" style={{ background: "var(--crit)" }} />Banned</span>;
  }
  if (account.health === "cookie_expired") {
    return <span className="pill cookie"><span className="dot" style={{ background: "var(--crit)" }} />Cookie expired</span>;
  }
  if (account.presence === "InGame") {
    return <span className="pill ingame"><span className="dot" style={{ background: "var(--ok)" }} />In game</span>;
  }
  if (account.presence === "Online" || account.presence === "Studio") {
    return <span className="pill online"><span className="dot" style={{ background: "var(--info)" }} />Online</span>;
  }
  if (account.presence === "Offline") {
    return <span className="pill offline"><span className="dot" style={{ background: "var(--faint)" }} />Offline</span>;
  }
  return <span className="pill unknown"><span className="dot" style={{ background: "var(--muted)" }} />Unknown</span>;
}

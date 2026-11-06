import type { AccountMeta } from "../lib/types";

const HUES = [8, 210, 150, 45, 280, 340, 190, 110];

function presenceColor(p: string | null): string {
  switch (p) {
    case "InGame": return "var(--ok)";
    case "Online": return "var(--info)";
    case "Studio": return "var(--warn)";
    default: return "var(--faint)";
  }
}

function initials(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
}

export function Avatar({ account, size = 42 }: { account: AccountMeta; size?: number }) {
  const hue = HUES[Math.abs(hash(account.username)) % HUES.length];
  return (
    <div
      className="ava"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.33,
        background: account.avatar_url
          ? "var(--surface-2)"
          : `linear-gradient(145deg, hsl(${hue} 60% 48%), hsl(${hue + 20} 55% 36%))`,
      }}
    >
      {account.avatar_url ? (
        <img src={account.avatar_url} alt="" className="ava-img" loading="lazy" />
      ) : (
        initials(account.username)
      )}
      <span className="pres" style={{ background: presenceColor(account.presence) }} />
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

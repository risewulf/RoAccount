import { api } from "./api";
import type { AccountMeta, LaunchProfile } from "./types";

export type TargetKind = "game" | "private" | "user" | "none";

/** Ce que l'utilisateur a collé : jeu, serveur privé, joueur à suivre… */
export function detect(t: string): { kind: TargetKind; label: string } {
  const s = t.trim();
  if (!s) return { kind: "none", label: "Paste a game link, a private server, a place ID or an @username." };
  if (s.includes("privateServerLinkCode") || s.includes("share?code=")) return { kind: "private", label: "Private server detected" };
  if (s.startsWith("@") || s.includes("/users/")) return { kind: "user", label: `Join ${s.startsWith("@") ? s : "this player"}` };
  const m = s.match(/games\/(\d+)/) ?? s.match(/^(\d+)$/);
  if (m) return { kind: "game", label: `Game · place ${m[1]}` };
  return { kind: "none", label: "Target not recognised." };
}

/** Un compte peut-il être lancé maintenant ? (un compte MAIN choisi à la main l'est toujours) */
export function launchable(a: AccountMeta): boolean {
  return a.health !== "cookie_expired" && a.presence !== "InGame" && !a.running;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Lance un profil enregistré. Renvoie les comptes réellement lancés. */
export async function runProfile(p: LaunchProfile, accounts: AccountMeta[]): Promise<{ launched: string[]; skipped: number }> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const ids = p.accountIds.filter((id) => { const a = byId.get(id); return !!a && launchable(a); });
  const skipped = p.accountIds.length - ids.length;
  const det = detect(p.target);
  if (!ids.length || det.kind === "none") return { launched: [], skipped };
  let launched: string[];
  if (det.kind === "user") {
    launched = await api.followUser(ids, p.target.trim(), p.cooldownMs);
  } else {
    const link = det.kind === "private" ? p.target.trim() : p.privateLink;
    const mode = det.kind === "private" ? "private" : p.serverMode;
    if (mode === "private" && !link.trim()) throw "This profile has no private server link.";
    launched = await api.launchBatchServers(ids, p.target, mode, link, p.cooldownMs);
  }
  return { launched, skipped };
}

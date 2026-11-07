import { api } from "./api";
import type { AccountMeta, LaunchProfile } from "./types";

export type TargetKind = "game" | "private" | "user" | "none";

/** Ce que l'utilisateur a collé : jeu, serveur privé, joueur à suivre… */
export function detect(t: string): { kind: TargetKind; label: string } {
  const s = t.trim();
  if (!s) return { kind: "none", label: "Colle un lien de jeu, un serveur privé, un ID de place ou un @pseudo." };
  if (s.includes("privateServerLinkCode") || s.includes("share?code=")) return { kind: "private", label: "Serveur privé détecté" };
  if (s.startsWith("@") || s.includes("/users/")) return { kind: "user", label: `Rejoindre ${s.startsWith("@") ? s : "ce joueur"}` };
  const m = s.match(/games\/(\d+)/) ?? s.match(/^(\d+)$/);
  if (m) return { kind: "game", label: `Jeu · place ${m[1]}` };
  return { kind: "none", label: "Cible non reconnue." };
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
    if (mode === "private" && !link.trim()) throw "Ce profil n'a pas de lien de serveur privé.";
    launched = await api.launchBatchServers(ids, p.target, mode, link, p.cooldownMs);
  }
  return { launched, skipped };
}

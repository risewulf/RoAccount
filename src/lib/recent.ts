/** Games launched from the Launcher, newest first (kept on this PC). */
export interface RecentGame { name: string; placeId: number; icon: string | null; t: number; }
const KEY = "roaccount.recentGames";
export function loadRecent(): RecentGame[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as RecentGame[]; } catch { /* ignore */ }
  return [];
}
export function pushRecent(g: Omit<RecentGame, "t">) {
  const list = [{ ...g, t: Date.now() }, ...loadRecent().filter((x) => x.placeId !== g.placeId)].slice(0, 8);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

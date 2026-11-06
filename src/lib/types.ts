export interface AccountMeta {
  id: string;
  roblox_id: number;
  username: string;
  display_name: string;
  group: string;
  alias: string;
  note: string;
  favorite: boolean;
  color: string;
  main: boolean;
  robux: number | null;
  premium: boolean | null;
  friends: number | null;
  presence: string | null; // "InGame" | "Online" | "Offline" | "Studio"
  game: string | null;
  place_id: number | null;
  game_icon: string | null;
  avatar_url: string | null;
  health: string; // "ok" | "cookie_expired" | "unknown"
  running: boolean;
}

export interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
  count: number;
}

export interface ServerInfo {
  id: string;
  playing: number;
  max_players: number;
  ping: number | null;
  fps: number | null;
}

export interface ProcInfo {
  pid: number;
  name: string;
  memory_mb: number;
}

export interface BackupInfo {
  name: string;
  path: string;
}

export interface LogEntry {
  time: number;
  kind: string;
  message: string;
}

export interface Settings {
  target: string;
  sameServer: boolean;
  cooldownMs: number;
  autoRejoin: boolean;
  discordWebhook: string;
  alertCrash: boolean;
  alertDisconnect: boolean;
  alertBatch: boolean;
  alertFreeze: boolean;
  discordUserId: string;
  muteOnLaunch: boolean;
  windowLayout: "fit" | "tiny";
  serverMode: "same" | "random" | "closest" | "private";
  privateLink: string;
  ahkPath: string;
}

export const DEFAULT_SETTINGS: Settings = {
  target: "roblox.com/games/920587237/Adopt-Me",
  sameServer: true,
  cooldownMs: 6000,
  autoRejoin: true,
  discordWebhook: "",
  alertCrash: true,
  alertDisconnect: true,
  alertBatch: true,
  alertFreeze: true,
  discordUserId: "",
  muteOnLaunch: false,
  windowLayout: "fit",
  serverMode: "same",
  privateLink: "",
  ahkPath: "",
};

export interface MacroInfo { name: string; code: string; }
export interface RunningMacro { name: string; pid: number; }

export interface PcInfo {
  cpu_name: string;
  cpu_threads: number;
  ram_total_mb: number;
  ram_free_mb: number;
  os: string;
}

export interface NewsItem { date: string; title: string; body: string; url?: string | null; }

export interface FriendReport { pairs: number; sent: number; accepted: number; already: number; failed: string[]; }
export interface ImportReport { found: number; added: number; failed: string[]; }

export interface PrivateServer {
  id: number;
  name: string;
  game: string;
  place_id: number | null;
  link: string | null;
  active: boolean | null;
}

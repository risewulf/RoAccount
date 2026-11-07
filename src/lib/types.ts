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

export type ThemeMode = "dark" | "light" | "system";

export interface Settings {
  // lancement
  multiInstance: boolean;
  target: string;
  sameServer: boolean;
  cooldownMs: number;
  serverMode: "same" | "random" | "closest" | "private";
  privateLink: string;
  launchArgs: string;
  excludeMainFromAll: boolean;
  muteOnLaunch: boolean;
  minimizeOnLaunch: boolean;
  tinyOnLaunch: boolean;
  windowLayout: "fit" | "tiny";
  ahkPath: string;

  // récupération
  autoRejoin: boolean;
  autoRestart: boolean;
  giveUpTries: number;
  giveUpMinutes: number;
  antiAfk: boolean;
  closeDelaySecs: number;
  emergencyHotkey: string;
  closeToTray: boolean;

  // discord
  discordWebhook: string;
  discordUserId: string;
  alertLaunch: boolean;
  alertCrash: boolean;
  alertFreeze: boolean;
  alertDisconnect: boolean;
  alertRestart: boolean;
  alertMemRestart: boolean;
  alertGiveUp: boolean;
  alertBatch: boolean;
  alertSummary: boolean;
  summaryEveryMin: number;

  // performances (moteur Rust)
  adaptiveLimits: boolean;
  spreadCores: boolean;
  trimMemory: boolean;
  trimEveryMin: number;
  throttleMem: boolean;
  throttleMemMb: number;
  restartMem: boolean;
  restartMemMb: number;

  // graphismes (écrits dans ClientAppSettings.json)
  gfxEnabled: boolean;
  fpsCap: number;
  lowestGraphics: boolean;
  msaa: number;
  textures: "default" | "min" | "low" | "med";
  render: "default" | "d3d11" | "vulkan" | "opengl";
  graySky: boolean;
  noGrass: boolean;
  preset: "max" | "balanced" | "defaults" | "custom";
  previewFps: 5 | 15 | 30 | 60;

  // apparence (front uniquement)
  theme: ThemeMode;
  accent: string;
  density: "detailed" | "compact";
  tabLayout: "top" | "side";
  animations: "on" | "reduced" | "off";
  sounds: boolean;
  skipSplash: boolean;
  homeView: "detailed" | "compact";

  // sécurité (front uniquement)
  autoLockMin: number;
  clipboardClearSecs: number;

  // données
  accountCacheMin: number;
  cleanRobloxLogs: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  multiInstance: true,
  target: "roblox.com/games/920587237/Adopt-Me",
  sameServer: true,
  cooldownMs: 6000,
  serverMode: "same",
  privateLink: "",
  launchArgs: "",
  excludeMainFromAll: true,
  muteOnLaunch: false,
  minimizeOnLaunch: false,
  tinyOnLaunch: false,
  windowLayout: "fit",
  ahkPath: "",

  autoRejoin: false,
  autoRestart: false,
  giveUpTries: 3,
  giveUpMinutes: 10,
  antiAfk: false,
  closeDelaySecs: 5,
  emergencyHotkey: "",
  closeToTray: true,

  discordWebhook: "",
  discordUserId: "",
  alertLaunch: false,
  alertCrash: true,
  alertFreeze: true,
  alertDisconnect: true,
  alertRestart: true,
  alertMemRestart: true,
  alertGiveUp: true,
  alertBatch: true,
  alertSummary: false,
  summaryEveryMin: 30,

  adaptiveLimits: false,
  spreadCores: false,
  trimMemory: false,
  trimEveryMin: 10,
  throttleMem: false,
  throttleMemMb: 2500,
  restartMem: false,
  restartMemMb: 3500,

  gfxEnabled: false,
  fpsCap: 0,
  lowestGraphics: false,
  msaa: 0,
  textures: "default",
  render: "default",
  graySky: false,
  noGrass: false,
  preset: "defaults",
  previewFps: 15,

  theme: "dark",
  accent: "#ff2d46",
  density: "detailed",
  tabLayout: "top",
  animations: "on",
  sounds: false,
  skipSplash: false,
  homeView: "detailed",

  autoLockMin: 15,
  clipboardClearSecs: 30,

  accountCacheMin: 10,
  cleanRobloxLogs: false,
};

export interface ClientMetric {
  pid: number;
  account_id: string | null;
  cpu: number;
  memory_mb: number;
  commit_mb: number;
  read_kbps: number;
  write_kbps: number;
  uptime_s: number;
}

export interface Metrics {
  cpu: number;
  mem_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
  gpu_pct: number | null;
  clients: ClientMetric[];
}

export interface RobloxVersion { installed: string | null; latest: string | null; }

export type ViewId =
  | "accueil" | "jouer" | "comptes" | "perf"
  | "serveurs" | "moniteur" | "discord" | "debug" | "macros" | "outils"
  | "s-lancement" | "s-apparence" | "s-securite" | "s-donnees" | "s-apropos" | "s-raccourcis";

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

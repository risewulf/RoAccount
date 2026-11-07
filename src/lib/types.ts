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
  health: string; // "ok" | "cookie_expired" | "banned" | "unknown"
  tags?: string[];
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
  homeView: "detailed" | "compact" | "mosaic";

  // sécurité (front uniquement)
  autoLockMin: number;
  clipboardClearSecs: number;

  // données
  accountCacheMin: number;
  cleanRobloxLogs: boolean;

  // profils, planification, démarrage
  profiles: LaunchProfile[];
  schedules: Schedule[];
  autoLaunchProfile: string;
  startWithWindows: boolean;
  startMinimized: boolean;
  robloxAlert: boolean;
  reminders: Record<string, string>;

  // alerts, backup, rotation, shortcuts
  alertAfterMin: number;
  notifyWindows: boolean;
  richPresence: boolean;
  ownRoblox: boolean;
  ownRobloxPin: string;
  ownRobloxKeep: number;
  ownRobloxAutoUpdate: boolean;
  ownRobloxMods: boolean;
  robloxChannel: string;
  alertDeadCookie: boolean;
  dailySummary: boolean;
  dailySummaryHour: number;
  lastDailySummary?: string;
  queueMinFreeMb: number;
  autoBackup: boolean;
  autoBackupKeep: number;
  rotation: RotationConfig;
  accountDelays: Record<string, number>;
  shortcuts: Record<string, string>;
  onboarded: boolean;
}

/** Keeps `keep` accounts of a profile running and swaps one every `everyMin` minutes. */
export interface RotationConfig { enabled: boolean; profileId: string; keep: number; everyMin: number; }

/** An account in the trash (recoverable for 7 days). */
export interface TrashItem { id: string; username: string; display_name: string; deleted_at: number; }

/** Un lancement enregistré : qui joue, où, comment. */
export interface LaunchProfile {
  id: string;
  name: string;
  accountIds: string[];
  target: string;
  serverMode: "same" | "random" | "closest" | "private";
  privateLink: string;
  cooldownMs: number;
}

/** Démarre ou arrête un profil à une heure donnée (RoAccount doit être ouvert, même réduit). */
export interface Schedule {
  id: string;
  profileId: string;
  time: string; // "HH:MM"
  days: number[]; // 0 = dimanche … 6 = samedi ; vide = tous les jours
  action: "start" | "stop";
  enabled: boolean;
  last?: string; // dernière exécution, "AAAA-MM-JJ HH:MM"
}

export interface SessionEvent { t: number; accountId: string; kind: "launch" | "end" | "fail" | "restart"; note?: string; }
export interface SessionDay { day: string; secs: Record<string, number>; launches: Record<string, number>; ends: Record<string, number>; }

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

  profiles: [],
  schedules: [],
  autoLaunchProfile: "",
  startWithWindows: false,
  startMinimized: true,
  robloxAlert: true,
  reminders: {},

  alertAfterMin: 0,
  notifyWindows: false,
  richPresence: false,
  ownRoblox: false,
  ownRobloxPin: "",
  ownRobloxKeep: 2,
  ownRobloxAutoUpdate: true,
  ownRobloxMods: true,
  robloxChannel: "",
  alertDeadCookie: true,
  dailySummary: false,
  dailySummaryHour: 21,
  queueMinFreeMb: 0,
  autoBackup: true,
  autoBackupKeep: 5,
  rotation: { enabled: false, profileId: "", keep: 2, everyMin: 30 },
  accountDelays: {},
  shortcuts: {},
  onboarded: false,
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
  | "launcher" | "accueil" | "jouer" | "comptes" | "perf"
  | "serveurs" | "moniteur" | "historique" | "discord" | "debug" | "macros" | "outils"
  | "s-lancement" | "s-apparence" | "s-securite" | "s-donnees" | "s-roblox" | "s-apropos" | "s-raccourcis";

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

/** RoAccount bootstrapper: Roblox installed and kept up to date by RoAccount itself. */
export interface BootVersion { name: string; size_mb: number; installed_at: number; }
export interface BootStatus {
  enabled: boolean;
  root: string;
  mods: string;
  installed: BootVersion[];
  current: string | null;
  latest: string | null;
  latest_number: string | null;
  busy: boolean;
}
export interface BootProgress { stage: "download" | "extract" | "finish"; done: number; total: number; item: string; }

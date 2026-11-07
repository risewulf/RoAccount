import {
  DEFAULT_SETTINGS, type AccountMeta, type BackupInfo, type FriendReport, type ImportReport, type LogEntry,
  type MacroInfo, type Metrics, type NewsItem, type PcInfo, type PrivateServer, type ProcInfo, type RobloxVersion,
  type RunningMacro, type ServerInfo, type Settings, type VaultStatus,
} from "./types";

/**
 * Couche d'accès au backend.
 *
 * Sous Tauri, on appelle les commandes Rust via `invoke`.
 * Dans un navigateur (`npm run dev` seul), `window.__TAURI_INTERNALS__` est
 * absent : on bascule alors sur un mock en mémoire pour développer l'UI.
 */

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

// Résolution paresseuse : on ne charge `@tauri-apps/api/core` que si on est
// réellement sous Tauri, et seulement au premier appel.
let realInvoke: InvokeFn | null = null;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) return mockInvoke<T>(cmd, args);
  if (!realInvoke) {
    const core = await import("@tauri-apps/api/core");
    realInvoke = core.invoke as InvokeFn;
  }
  return realInvoke<T>(cmd, args);
}

export const api = {
  vaultStatus: () => invoke<VaultStatus>("vault_status"),
  createVault: (password: string) =>
    invoke<VaultStatus>("create_vault", { password }),
  unlockVault: (password: string) =>
    invoke<VaultStatus>("unlock_vault", { password }),
  lockVault: () => invoke<VaultStatus>("lock_vault"),

  listAccounts: () => invoke<AccountMeta[]>("list_accounts"),
  addAccount: (cookie: string, group?: string) =>
    invoke<AccountMeta>("add_account", { cookie, group }),
  removeAccount: (id: string) => invoke<void>("remove_account", { id }),
  updateAccount: (
    id: string,
    patch: Partial<Pick<AccountMeta, "group" | "alias" | "note" | "favorite" | "color" | "main">>
  ) => invoke<AccountMeta>("update_account", { id, ...patch }),
  refreshAccount: (id: string) =>
    invoke<AccountMeta>("refresh_account", { id }),

  launchAccount: (id: string, target: string) =>
    invoke<void>("launch_account", { id, target }),
  launchBatch: (ids: string[], target: string, cooldownMs?: number) =>
    invoke<string[]>("launch_batch", { ids, target, cooldownMs }),
  launchBatchServers: (
    ids: string[], target: string, mode: Settings["serverMode"], privateLink: string, cooldownMs?: number
  ) => invoke<string[]>("launch_batch_servers", { ids, target, mode, privateLink, cooldownMs }),
  killAll: () => invoke<void>("kill_all"),

  // connexion intégrée : récupère le cookie toute seule
  loginRoblox: (group?: string) =>
    invoke<AccountMeta>("login_roblox", { group }),

  listServers: (target: string) =>
    invoke<ServerInfo[]>("list_servers", { target }),
  sendToServer: (id: string, target: string, jobId: string) =>
    invoke<void>("send_to_server", { id, target, jobId }),
  followUser: (ids: string[], target: string, cooldownMs?: number) =>
    invoke<string[]>("follow_user", { ids, target, cooldownMs }),

  monitorProcesses: () => invoke<ProcInfo[]>("monitor_processes"),
  testDiscord: (webhook: string) => invoke<void>("test_discord", { webhook }),
  captureWindow: (pid: number) => invoke<string>("capture_window", { pid }),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),

  revealCookie: (id: string) => invoke<string>("reveal_cookie", { id }),
  changePassword: (oldPw: string, newPw: string) =>
    invoke<void>("change_password", { old: oldPw, new: newPw }),
  exportBackup: () => invoke<string>("export_backup"),
  listBackups: () => invoke<BackupInfo[]>("list_backups"),
  importBackup: (path: string) => invoke<void>("import_backup", { path }),

  getLog: () => invoke<LogEntry[]>("get_log"),
  clearLog: () => invoke<void>("clear_log"),
  exportCsv: () => invoke<string>("export_csv"),

  arrangeWindows: (layout?: "fit" | "tiny") => invoke<void>("arrange_windows", { layout }),
  setMute: (pid: number | null, mute: boolean) => invoke<number>("set_mute", { pid, mute }),
  pcInfo: () => invoke<PcInfo>("pc_info"),
  getNews: () => invoke<NewsItem[]>("get_news"),
  openUrl: (url: string) => invoke<void>("open_url", { url }),

  friendAccounts: (ids: string[]) => invoke<FriendReport>("friend_accounts", { ids }),

  listPrivateServers: (id: string) => invoke<PrivateServer[]>("list_private_servers", { id }),
  buyPrivateServer: (id: string, target: string, name: string, expectedPrice: number) =>
    invoke<number>("buy_private_server", { id, target, name, expectedPrice }),
  updatePrivateServer: (id: string, serverId: number, p: { name?: string; newLink?: boolean; active?: boolean }) =>
    invoke<void>("update_private_server", { id, serverId, ...p }),

  listMacros: () => invoke<MacroInfo[]>("list_macros"),
  saveMacro: (name: string, code: string) => invoke<void>("save_macro", { name, code }),
  deleteMacro: (name: string) => invoke<void>("delete_macro", { name }),
  ahkStatus: () => invoke<string | null>("ahk_status"),
  runMacro: (name: string, pid?: number) => invoke<number>("run_macro", { name, pid }),
  runningMacros: () => invoke<RunningMacro[]>("running_macros"),
  stopMacros: (name?: string) => invoke<number>("stop_macros", { name }),

  exportCookies: (ids: string[], format: "json" | "cookies") => invoke<string>("export_cookies", { ids, format }),
  importAccounts: (input: string, group?: string) => invoke<ImportReport>("import_accounts", { input, group }),
  setPriority: (pid: number, level: string) => invoke<void>("set_priority", { pid, level }),

  clientMetrics: () => invoke<Metrics>("client_metrics"),
  windowAction: (pid: number | null, action: "show" | "minimize") => invoke<number>("window_action", { pid, action }),
  applyGraphics: (enabled: boolean, opts: Record<string, unknown>) => invoke<string>("apply_graphics", { enabled, opts }),
  robloxVersion: () => invoke<RobloxVersion>("roblox_version"),
  openPath: (kind: "data" | "exports" | "roblox-logs") => invoke<void>("open_path", { kind }),
  saveExport: (name: string, content: string) => invoke<string>("save_export", { name, content }),
  cleanRobloxLogs: () => invoke<number>("clean_roblox_logs"),
  cleanRobloxCache: (dryRun: boolean) => invoke<number>("clean_roblox_cache", { dryRun }),
  setAutostart: (enabled: boolean, minimized: boolean) => invoke<void>("set_autostart", { enabled, minimized }),
  scheduleShutdown: (minutes: number) => invoke<void>("schedule_shutdown", { minutes }),

  cancelBatch: () => invoke<void>("cancel_batch"),
  multiStatus: () => invoke<{ enabled: boolean; state: number; foreign: number }>("multi_status"),
  stopAccounts: (ids: string[]) => invoke<number>("stop_accounts", { ids }),

  /** Écoute la progression d'un lot (ticket → run → join). Renvoie la fonction pour se désabonner. */
  onBatch: async (cb: (e: { id: string; stage: string; error: string | null }) => void): Promise<() => void> => {
    if (!inTauri) {
      const h = (ev: Event) => cb((ev as CustomEvent).detail);
      window.addEventListener("roa-mock-batch", h);
      return () => window.removeEventListener("roa-mock-batch", h);
    }
    const { listen } = await import("@tauri-apps/api/event");
    return listen<{ id: string; stage: string; error: string | null }>("batch", (e) => cb(e.payload));
  },

  /** Raccourci clavier global (arrêt d'urgence). `null` retire l'ancien. */
  setGlobalHotkey: async (combo: string | null, onFire: () => void) => {
    if (!inTauri) return;
    const gs = await import("@tauri-apps/plugin-global-shortcut");
    await gs.unregisterAll();
    if (combo) await gs.register(combo, (e) => { if (e.state === "Pressed") onFire(); });
  },

  winControl: async (action: "minimize" | "maximize" | "close") => {
    if (!inTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "maximize") await w.toggleMaximize();
    else await w.close();
  },

  isMock: !inTauri,
};

/* ------------------------------------------------------------------ */
/* Mock en mémoire — uniquement pour le dev navigateur.                */
/* ------------------------------------------------------------------ */

const mockAccounts: AccountMeta[] = [
  demo("ZephyrBlox", "Zeph", "Main", { fav: true, prem: true, pres: "InGame", robux: 14250, friends: 182 }),
  demo("NovaStorm", "Nova", "Alts", { prem: true, pres: "Online", robux: 860, friends: 44 }),
  demo("mintchoco77", "Mint", "Alts", { pres: "Offline", robux: 0, friends: 9 }),
  demo("GrimPixel42", "Grim", "Farm", { pres: "InGame", robux: 120, friends: 2 }),
  demo("LunaBuilds", "Luna", "Main", { fav: true, pres: "Online", robux: 5320, friends: 311 }),
  demo("RocketReal", "Rocket", "Alts", { pres: "Offline", robux: 40, friends: 18, health: "cookie_expired" }),
];

let mockUnlocked = false;
const mockMacros: MacroInfo[] = [
  { name: "anti-afk", code: '#Requires AutoHotkey v2.0\n; Receives the Roblox client PID (A_Args[1]).\npid := A_Args[1]\nLoop {\n    ControlSend "{Space}", , "ahk_pid " pid\n    Sleep 60000\n}\n' },
];
const mockRunning: RunningMacro[] = [];

function demo(
  username: string,
  display: string,
  group: string,
  o: Partial<AccountMeta> & { fav?: boolean; prem?: boolean; pres?: string } = {}
): AccountMeta {
  return {
    id: crypto.randomUUID(),
    roblox_id: Math.floor(Math.random() * 9e8),
    username,
    display_name: display,
    group,
    alias: "",
    note: "",
    favorite: o.fav ?? false,
    color: o.color ?? "",
    main: false,
    robux: o.robux ?? null,
    premium: o.prem ?? false,
    friends: o.friends ?? null,
    presence: o.pres ?? "Offline",
    game: o.pres === "InGame" ? (o.game ?? "Adopt Me!") : null,
    place_id: null,
    game_icon: null,
    avatar_url: null,
    health: o.health ?? "ok",
    running: o.pres === "InGame",
  };
}

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, 120));
  switch (cmd) {
    case "vault_status":
      return { exists: true, unlocked: mockUnlocked, count: mockAccounts.length } as T;
    case "unlock_vault":
    case "create_vault":
      if ((args?.password as string)?.length < 1) throw "empty password";
      mockUnlocked = true;
      return { exists: true, unlocked: true, count: mockAccounts.length } as T;
    case "lock_vault":
      mockUnlocked = false;
      return { exists: true, unlocked: false, count: mockAccounts.length } as T;
    case "list_accounts":
      return mockAccounts.map((a) => ({ ...a })) as T;
    case "add_account":
    case "login_roblox": {
      const base = cmd === "login_roblox" ? "LoggedIn" : "NewAccount";
      const a = demo(base + (mockAccounts.length + 1), "New", (args?.group as string) || "No group", { pres: "Online", robux: 250 });
      mockAccounts.push(a);
      return a as T;
    }
    case "list_servers": {
      const servers = Array.from({ length: 8 }, (_, i) => ({
        id: "mock-job-" + i,
        playing: 5 + Math.floor(Math.random() * 45),
        max_players: 50,
        ping: 20 + Math.floor(Math.random() * 180),
        fps: 55 + Math.random() * 5,
      }));
      return servers as T;
    }
    case "send_to_server": {
      const a = mockAccounts.find((x) => x.id === args?.id);
      if (a) { a.presence = "InGame"; a.running = true; }
      return undefined as T;
    }
    case "follow_user": {
      (args?.ids as string[])?.forEach((id) => {
        const a = mockAccounts.find((x) => x.id === id);
        if (a) { a.presence = "InGame"; a.running = true; }
      });
      return (args?.ids ?? []) as T;
    }
    case "monitor_processes": {
      const running = mockAccounts.filter((a) => a.running);
      return running.map((_, i) => ({ pid: 10000 + i, name: "RobloxPlayerBeta.exe", memory_mb: 900 + Math.floor(Math.random() * 700) })) as T;
    }
    case "test_discord":
      if (!String(args?.webhook).startsWith("https://discord.com/api/webhooks/")) throw "Invalid Discord webhook URL.";
      return undefined as T;
    case "capture_window":
      throw "Capture unavailable in browser demo mode.";
    case "get_settings":
      return { ...DEFAULT_SETTINGS } as T;
    case "save_settings":
      return (args?.settings ?? DEFAULT_SETTINGS) as T;
    case "reveal_cookie":
      return "_|DEMO-COOKIE-non-reel-mode-navigateur|_0123456789ABCDEF" as T;
    case "change_password":
      if (!args?.new) throw "The new password is empty.";
      return undefined as T;
    case "export_backup":
      return "C:/…/RoAccount/backups/RoAccount-demo.roavault" as T;
    case "list_backups":
      return [] as T;
    case "import_backup":
      return undefined as T;
    case "get_log":
      return [
        { time: Math.floor(Date.now() / 1000) - 60, kind: "launch", message: "Batch launched — 3 account(s)" },
        { time: Math.floor(Date.now() / 1000) - 20, kind: "rejoin", message: "ZephyrBlox disconnected — relaunched" },
      ] as T;
    case "clear_log":
      return undefined as T;
    case "export_csv":
      return "C:/…/RoAccount/exports/comptes-demo.csv" as T;
    case "arrange_windows":
      return undefined as T;
    case "set_mute":
      return 2 as T;
    case "pc_info":
      return { cpu_name: "AMD Ryzen 5 5600 (demo)", cpu_threads: 12, ram_total_mb: 16384, ram_free_mb: 7900, os: "Windows 11 (demo)" } as T;
    case "get_news":
      return [
        { date: "2026-11-06", title: "New features", body: "AutoHotkey macros, a different server per account, MAIN account, alerts with a ping, Tiny layout…", url: "https://roaccount.xyz" },
        { date: "2026-11-01", title: "RoAccount 0.1", body: "First version: encrypted vault, multi-instance, auto-rejoin." },
      ] as T;
    case "open_url":
      return undefined as T;
    case "launch_batch_servers": {
      const emit = (id: string, stage: string, error: string | null = null) =>
        window.dispatchEvent(new CustomEvent("roa-mock-batch", { detail: { id, stage, error } }));
      ((args?.ids as string[]) ?? []).forEach((id, i) => {
        emit(id, "queued");
        window.setTimeout(() => emit(id, "ticket"), 300 + i * 900);
        window.setTimeout(() => emit(id, "run"), 700 + i * 900);
        window.setTimeout(() => emit(id, "join"), 1100 + i * 900);
      });
      (args?.ids as string[])?.forEach((id) => {
        const a = mockAccounts.find((x) => x.id === id);
        if (a && !a.main) { a.presence = "InGame"; a.running = true; }
      });
      return ((args?.ids as string[]) ?? []).filter((id) => !mockAccounts.find((x) => x.id === id)?.main) as T;
    }
    case "friend_accounts": {
      const n = ((args?.ids as string[]) ?? []).filter((id) => !mockAccounts.find((x) => x.id === id)?.main).length;
      if (n < 2) throw "Select at least 2 accounts (the MAIN account is excluded).";
      const pairs = (n * (n - 1)) / 2;
      return { pairs, sent: pairs, accepted: pairs, already: 0, failed: [] } as T;
    }
    case "list_private_servers":
      return [
        { id: 111, name: "My Adopt Me server", game: "Adopt Me!", place_id: 920587237, link: "https://www.roblox.com/games/920587237/Adopt-Me?privateServerLinkCode=000000000000000000000000000000", active: true },
        { id: 222, name: "Private farm", game: "Pet Simulator 99", place_id: 8737899170, link: null, active: false },
      ] as T;
    case "buy_private_server":
      return 333 as T;
    case "update_private_server":
      return undefined as T;
    case "list_macros":
      return mockMacros.map((m) => ({ ...m })) as T;
    case "save_macro": {
      const m = mockMacros.find((x) => x.name === args?.name);
      if (m) m.code = String(args?.code); else mockMacros.push({ name: String(args?.name), code: String(args?.code) });
      return undefined as T;
    }
    case "delete_macro": {
      const i = mockMacros.findIndex((x) => x.name === args?.name);
      if (i >= 0) mockMacros.splice(i, 1);
      return undefined as T;
    }
    case "ahk_status":
      return "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe" as T;
    case "run_macro":
      mockRunning.push({ name: String(args?.name), pid: (args?.pid as number) ?? 10000 });
      return 1 as T;
    case "running_macros":
      return mockRunning.map((m) => ({ ...m })) as T;
    case "stop_macros":
      mockRunning.length = 0;
      return 1 as T;
    case "export_cookies":
      return "C:/…/RoAccount/exports/comptes-cookies-demo.json" as T;
    case "import_accounts": {
      if (!String(args?.input).includes("WARNING")) throw "No .ROBLOSECURITY cookie found. Paste a JSON export or cookies (one per line).";
      return { found: 2, added: 1, failed: ["…ABCDEF: invalid or expired .ROBLOSECURITY cookie"] } as T;
    }
    case "set_priority":
      return undefined as T;
    case "cancel_batch":
      return undefined as T;
    case "client_metrics": {
      const running = mockAccounts.filter((a) => a.running);
      const clients = running.map((a, i) => ({
        pid: 10000 + i, account_id: a.id, cpu: 3 + Math.random() * 10, memory_mb: 600 + Math.floor(Math.random() * 500),
        commit_mb: 900 + Math.floor(Math.random() * 600), read_kbps: Math.floor(Math.random() * 250), write_kbps: Math.floor(Math.random() * 60),
        uptime_s: 90 + i * 40,
      }));
      return { cpu: 20 + Math.random() * 15, mem_pct: 38 + Math.random() * 4, mem_used_mb: 6200, mem_total_mb: 16384, gpu_pct: null, clients } as T;
    }
    case "window_action":
      return 1 as T;
    case "apply_graphics":
      return "C:/…/Roblox/Versions/version-demo/ClientSettings/ClientAppSettings.json" as T;
    case "roblox_version":
      return { installed: "version-5e1f0c9a7d3b4e21", latest: "version-9ac8595712b447a7" } as T;
    case "open_path":
      return undefined as T;
    case "save_export":
      return ("C:/…/RoAccount/exports/" + String(args?.name)) as T;
    case "clean_roblox_logs":
      return 12 as T;
    case "clean_roblox_cache":
      return (args?.dryRun ? 842_000_000 : 842_000_000) as T;
    case "multi_status":
      return { enabled: true, state: (window as unknown as { __multi?: number }).__multi ?? 1, foreign: (window as unknown as { __multi?: number }).__multi === 2 ? 2 : 0 } as T;
    case "stop_accounts":
      return ((args?.ids as string[]) ?? []).length as T;
    case "set_autostart":
      return undefined as T;
    case "schedule_shutdown":
      return undefined as T;
    case "remove_account": {
      const i = mockAccounts.findIndex((a) => a.id === args?.id);
      if (i >= 0) mockAccounts.splice(i, 1);
      return undefined as T;
    }
    case "update_account": {
      const a = mockAccounts.find((x) => x.id === args?.id)!;
      Object.assign(a, args);
      return { ...a } as T;
    }
    case "refresh_account": {
      const a = mockAccounts.find((x) => x.id === args?.id)!;
      return { ...a } as T;
    }
    case "launch_account": {
      const a = mockAccounts.find((x) => x.id === args?.id);
      if (a) { a.presence = "InGame"; a.running = true; }
      return undefined as T;
    }
    case "launch_batch": {
      (args?.ids as string[])?.forEach((id) => {
        const a = mockAccounts.find((x) => x.id === id);
        if (a) { a.presence = "InGame"; a.running = true; }
      });
      return (args?.ids ?? []) as T;
    }
    case "kill_all":
      mockAccounts.forEach((a) => { a.presence = "Offline"; a.running = false; });
      return undefined as T;
    default:
      throw `commande inconnue : ${cmd}`;
  }
}

import type { ViewId } from "./types";

export interface ShortcutAction {
  id: string;
  label: string;
  def: string;
  /** false = ignored while typing in a field (so Ctrl+A still selects text in inputs) */
  typing: boolean;
  view?: ViewId;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: "go:launcher", label: "Go to Launcher", def: "Ctrl+0", typing: true, view: "launcher" },
  { id: "go:accueil", label: "Go to Home", def: "Ctrl+1", typing: true, view: "accueil" },
  { id: "go:comptes", label: "Go to Accounts", def: "Ctrl+2", typing: true, view: "comptes" },
  { id: "go:jouer", label: "Go to Play", def: "Ctrl+3", typing: true, view: "jouer" },
  { id: "go:serveurs", label: "Go to Servers", def: "Ctrl+4", typing: true, view: "serveurs" },
  { id: "go:settings", label: "Go to Settings", def: "Ctrl+5", typing: true, view: "s-lancement" },
  { id: "go:moniteur", label: "Go to Monitor", def: "Ctrl+6", typing: true, view: "moniteur" },
  { id: "go:discord", label: "Go to Discord", def: "Ctrl+7", typing: true, view: "discord" },
  { id: "go:debug", label: "Go to Debug", def: "Ctrl+8", typing: true, view: "debug" },
  { id: "go:perf", label: "Go to Performance", def: "Ctrl+9", typing: true, view: "perf" },
  { id: "palette", label: "Command palette", def: "Ctrl+K", typing: true },
  { id: "add", label: "Add account", def: "Ctrl+N", typing: true },
  { id: "search", label: "Search", def: "Ctrl+F", typing: true },
  { id: "lock", label: "Lock the vault (master password)", def: "Ctrl+L", typing: true },
  { id: "play", label: "Press Play", def: "Ctrl+Enter", typing: true },
  { id: "refresh", label: "Refresh the display", def: "F5", typing: true },
  { id: "selectall", label: "Select all (shown)", def: "Ctrl+A", typing: false },
  { id: "verify", label: "Check the selection, or everything", def: "Ctrl+R", typing: false },
];

/** "Ctrl+Shift+K", "F5", "Ctrl+Enter"… or null for a lone modifier key. */
export function comboFromEvent(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const mods = [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : ""].filter(Boolean);
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [...mods, k].join("+");
}

/** A binding needs a modifier, or to be a function key. */
export function validCombo(c: string): boolean {
  return c.includes("+") || /^F\d{1,2}$/.test(c);
}

export function comboOf(custom: Record<string, string> | undefined, a: ShortcutAction): string {
  return custom?.[a.id] || a.def;
}

/** combo -> action */
export function bindingsOf(custom: Record<string, string> | undefined): Map<string, ShortcutAction> {
  const m = new Map<string, ShortcutAction>();
  SHORTCUT_ACTIONS.forEach((a) => m.set(comboOf(custom, a), a));
  return m;
}

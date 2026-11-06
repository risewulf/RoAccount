import type { ReactNode } from "react";
import {
  IconUsers, IconRocket, IconServer, IconChart, IconDiscord, IconGear, IconList, IconCode, IconTool, IconNews, IconLock,
} from "./icons";

export type ViewId =
  | "comptes" | "lancement" | "serveurs" | "prives" | "monitor" | "macros" | "journal"
  | "outils" | "news" | "discord" | "reglages";

const ITEMS: { id: ViewId; label: string; icon: ReactNode; section?: string }[] = [
  { id: "comptes", label: "Comptes", icon: <IconUsers />, section: "Pilotage" },
  { id: "lancement", label: "Lancement", icon: <IconRocket /> },
  { id: "serveurs", label: "Serveurs", icon: <IconServer /> },
  { id: "prives", label: "Serveurs privés", icon: <IconLock /> },
  { id: "monitor", label: "Monitor", icon: <IconChart /> },
  { id: "macros", label: "Macros", icon: <IconCode /> },
  { id: "journal", label: "Journal", icon: <IconList /> },
  { id: "outils", label: "Outils", icon: <IconTool />, section: "Plus" },
  { id: "news", label: "Actualités", icon: <IconNews /> },
  { id: "discord", label: "Alertes Discord", icon: <IconDiscord />, section: "Réglages" },
  { id: "reglages", label: "Réglages", icon: <IconGear /> },
];

export function Sidebar({
  current,
  onSelect,
  counts,
}: {
  current: ViewId;
  onSelect: (v: ViewId) => void;
  counts: Partial<Record<ViewId, number>>;
}) {
  return (
    <nav className="sidebar">
      {ITEMS.map((it) => (
        <div key={it.id} style={{ display: "contents" }}>
          {it.section && <div className="nav-label">{it.section}</div>}
          <button
            className={"nav-item" + (current === it.id ? " on" : "")}
            onClick={() => onSelect(it.id)}
          >
            {it.icon}
            <span>{it.label}</span>
            {counts[it.id] != null && <span className="nav-count">{counts[it.id]}</span>}
          </button>
        </div>
      ))}
    </nav>
  );
}

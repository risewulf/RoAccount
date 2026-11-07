import { createContext, useContext, useState, type ReactNode } from "react";
import { IconChevDown } from "./icons";
import { useStore } from "../store";
import { tick } from "../lib/ui";

export const SearchCtx = createContext("");

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { settings } = useStore();
  return (
    <button
      className={"tg" + (on ? " on" : "")}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => { tick(settings.sounds, on ? 520 : 820); onChange(!on); }}
    />
  );
}

export function Seg<T extends string | number>({
  value, options, onChange, mono,
}: { value: T; options: { v: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; mono?: boolean }) {
  return (
    <div className={"seg" + (mono ? " mono" : "")} role="group">
      {options.map((o) => (
        <button key={String(o.v)} className={value === o.v ? "on" : ""} disabled={o.disabled} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

export function NumInput({ value, onChange, min = 0, max = 99999, width }: { value: number; onChange: (n: number) => void; min?: number; max?: number; width?: number }) {
  return (
    <input
      className="num"
      type="number"
      style={width ? { width } : undefined}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
    />
  );
}

/** Ligne de réglage : titre, description, contrôle à droite, explication dépliable. */
export function Row({
  title, desc, children, explain, mono, col, badge,
}: { title: string; desc?: ReactNode; children?: ReactNode; explain?: ReactNode; mono?: boolean; col?: boolean; badge?: ReactNode }) {
  const q = useContext(SearchCtx).trim().toLowerCase();
  const [open, setOpen] = useState(false);
  if (q && !(`${title} ${typeof desc === "string" ? desc : ""}`.toLowerCase().includes(q))) return null;
  return (
    <div className={"srow" + (col ? " col" : "")}>
      <div className="l">
        <b>
          {title}{badge}
          {explain && (
            <button className={"chev-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)} aria-label="Plus d'infos" aria-expanded={open}>
              <IconChevDown />
            </button>
          )}
        </b>
        {desc && <small className={mono ? "mono" : ""}>{desc}</small>}
        {open && explain && <small style={{ marginTop: 6 }}>{explain}</small>}
      </div>
      {children && <div className="r">{children}</div>}
    </div>
  );
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title && <h2 className="group-title">{title}</h2>}
      <div className="card">{children}</div>
    </>
  );
}

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const [q, setQ] = useState("");
  return (
    <div className="page narrow">
      <div className="set-head">
        <h1>{title}</h1>
        <label className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un paramètre…" aria-label="Rechercher un paramètre" />
        </label>
      </div>
      <SearchCtx.Provider value={q}>{children}</SearchCtx.Provider>
    </div>
  );
}

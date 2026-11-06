import { useState } from "react";
import type { AccountMeta } from "../lib/types";
import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";
import { RevealCookieModal } from "./RevealCookieModal";
import { IconKey, IconPlay, IconRefresh, IconTrash } from "./icons";

export const TAG_COLORS = ["", "#ff2d46", "#f2b541", "#37d08a", "#4aa3ff", "#a06cff", "#ff8a3d"];

export function AccountDetail({
  account,
  busy,
  onLaunch,
  onRefresh,
  onRemove,
  onUpdate,
}: {
  account: AccountMeta | null;
  busy: boolean;
  onLaunch: (id: string) => void;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<AccountMeta>) => void;
}) {
  const [revealing, setRevealing] = useState(false);

  if (!account) {
    return <aside className="panel"><div className="empty">Sélectionne un compte.</div></aside>;
  }

  const fmt = (n: number | null) => (n != null ? n.toLocaleString("fr-FR") : "—");
  const acc = account;

  return (
    <aside className="panel">
      <div className="phead">
        <Avatar account={account} size={56} />
        <div className="ptitle">
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <b>{account.username}</b>
            <button
              className={"fav-btn" + (account.favorite ? " on" : "")}
              onClick={() => onUpdate(acc.id, { favorite: !acc.favorite })}
              title={account.favorite ? "Retirer des favoris" : "Mettre en favori"}
              aria-label="Favori"
            >★</button>
          </div>
          <div>@{account.display_name} · {account.group}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StatusPill account={account} />
        <div className="swatches">
          {TAG_COLORS.map((c) => (
            <button
              key={c || "none"}
              className={"swatch" + (acc.color === c ? " on" : "") + (c ? "" : " none")}
              style={c ? { background: c } : undefined}
              onClick={() => onUpdate(acc.id, { color: c })}
              title={c ? "Tag couleur" : "Aucune couleur"}
              aria-label="Couleur"
            />
          ))}
        </div>
      </div>

      {account.presence === "InGame" && (
        <div className="game-preview">
          {account.game_icon ? (
            <img src={account.game_icon} alt="" className="game-ico" loading="lazy" />
          ) : (
            <div className="game-ico placeholder-ico" />
          )}
          <div className="game-meta">
            <div className="k">Aperçu — en jeu</div>
            <b>{account.game ?? "Partie en cours"}</b>
          </div>
        </div>
      )}

      <div className="stats">
        <div className="stat"><div className="k">Robux</div><div className="v">{fmt(account.robux)}</div></div>
        <div className="stat">
          <div className="k">Premium</div>
          <div className="v" style={{ color: account.premium ? "var(--warn)" : "var(--faint)" }}>
            {account.premium == null ? "—" : account.premium ? "Oui" : "Non"}
          </div>
        </div>
        <div className="stat"><div className="k">Amis</div><div className="v">{fmt(account.friends)}</div></div>
        <div className="stat"><div className="k">ID</div><div className="v" style={{ fontSize: 13 }}>{account.roblox_id}</div></div>
      </div>

      {account.note && (
        <div className="note-box">
          <div className="k">Note</div>
          {account.note}
        </div>
      )}

      <div className="prow">
        <button className="btn primary" disabled={busy} onClick={() => onLaunch(account.id)}>
          <IconPlay />Lancer
        </button>
        <button className="btn" disabled={busy} onClick={() => onRefresh(account.id)}>
          <IconRefresh />Vérifier
        </button>
        <button className="btn" disabled={busy} onClick={() => onRemove(account.id)} title="Retirer" aria-label="Retirer">
          <IconTrash />
        </button>
      </div>

      <button
        className={"btn main-btn" + (account.main ? " on" : "")}
        style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
        aria-pressed={account.main}
        onClick={() => onUpdate(acc.id, { main: !acc.main })}
        title="Le compte MAIN est ignoré par les lancements en lot, « Rendre amis », l'auto-rejoin…"
      >
        {account.main ? "★ Compte MAIN (exclu des actions en masse)" : "Marquer comme compte MAIN"}
      </button>

      <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => setRevealing(true)}>
        <IconKey />Révéler le cookie
      </button>

      {revealing && <RevealCookieModal account={acc} onClose={() => setRevealing(false)} />}
    </aside>
  );
}

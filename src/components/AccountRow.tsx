import type { AccountMeta } from "../lib/types";
import { Avatar } from "./Avatar";
import { StatusPill } from "./StatusPill";
import { IconCheck, IconRobux } from "./icons";

export function AccountRow({
  account,
  selected,
  current,
  onToggle,
  onOpen,
}: {
  account: AccountMeta;
  selected: boolean;
  current: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <button className={"acct" + (current ? " sel" : "")} onClick={() => onOpen(account.id)}>
      {account.color && <span className="acct-stripe" style={{ background: account.color }} />}
      <span
        className={"cbx" + (selected ? " on" : "")}
        onClick={(e) => { e.stopPropagation(); onToggle(account.id); }}
        role="checkbox"
        aria-checked={selected}
      >
        <IconCheck />
      </span>
      <Avatar account={account} />
      <span className="who">
        <span className="u">
          <span>{account.username}</span>
          {account.main && <span className="badge main" title="Compte MAIN : exclu des actions en masse">MAIN</span>}
          {account.favorite && <span className="badge fav">★</span>}
          {account.premium && <span className="badge prem">PREMIUM</span>}
        </span>
        <span className="d">
          @{account.display_name} · {account.group}
          {account.presence === "InGame" && account.game ? ` · ${account.game}` : ""}
        </span>
      </span>
      <span className="meta">
        <StatusPill account={account} />
        <span className="rbx">
          <IconRobux />
          {account.robux != null ? account.robux.toLocaleString("fr-FR") : "—"}
        </span>
      </span>
    </button>
  );
}

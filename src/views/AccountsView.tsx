import { useMemo, useState } from "react";
import type { AccountMeta } from "../lib/types";
import { api } from "../lib/api";
import { useStore } from "../store";
import { AccountRow } from "../components/AccountRow";
import { AccountDetail } from "../components/AccountDetail";
import { AddAccountDialog } from "../components/AddAccountDialog";
import { IconCheck, IconPlus, IconRefresh, IconSearch } from "../components/icons";

export function AccountsView() {
  const store = useStore();
  const { accounts, selected } = store;
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Tous");
  const [sort, setSort] = useState<"favoris" | "pseudo" | "robux" | "presence">("favoris");
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const s = new Set<string>(["Tous"]);
    accounts.forEach((a) => s.add(a.group));
    return Array.from(s);
  }, [accounts]);

  const presenceRank = (p: string | null) => (p === "InGame" ? 0 : p === "Online" || p === "Studio" ? 1 : 2);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = accounts.filter((a) => {
      if (group !== "Tous" && a.group !== group) return false;
      if (q && !(a.username + " " + a.display_name + " " + a.alias).toLowerCase().includes(q)) return false;
      return true;
    });
    const by = [...list];
    by.sort((a, b) => {
      switch (sort) {
        case "pseudo": return a.username.localeCompare(b.username);
        case "robux": return (b.robux ?? -1) - (a.robux ?? -1);
        case "presence": return presenceRank(a.presence) - presenceRank(b.presence);
        case "favoris":
        default:
          return (Number(b.favorite) - Number(a.favorite)) || a.username.localeCompare(b.username);
      }
    });
    return by;
  }, [accounts, query, group, sort]);

  const currentAccount = accounts.find((a) => a.id === current) ?? accounts[0] ?? null;

  function selectAllFiltered() {
    // le compte MAIN reste volontairement hors de « Tout sélectionner »
    const pool = filtered.filter((a) => !a.main);
    const allOn = pool.length > 0 && pool.every((a) => selected.has(a.id));
    store.setSelection(pool.map((a) => a.id), !allOn);
  }

  async function launch(id: string) {
    setBusy(true);
    try {
      await api.launchAccount(id, store.settings.target);
      store.patch(id, { running: true, presence: "InGame" });
      store.toast("Client lancé.");
      // Roblox met quelques secondes à publier la présence : on recharge ensuite
      window.setTimeout(() => { void refresh(id); }, 8000);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function refresh(id: string) {
    setBusy(true);
    try { store.replace(await api.refreshAccount(id)); }
    catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function refreshSelection() {
    setBusy(true);
    try {
      for (const id of selected) store.replace(await api.refreshAccount(id));
      store.toast("Sélection vérifiée.");
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.removeAccount(id);
      store.dropAccount(id);
      if (current === id) setCurrent(null);
    } catch (e) { store.toast(String(e)); } finally { setBusy(false); }
  }

  async function update(id: string, patch: Partial<AccountMeta>) {
    try { store.replace(await api.updateAccount(id, patch)); }
    catch (e) { store.toast(String(e)); }
  }

  const totalRobux = accounts.reduce((s, a) => s + (a.robux ?? 0), 0);
  const inGame = accounts.filter((a) => a.presence === "InGame").length;
  const expired = accounts.filter((a) => a.health === "cookie_expired").length;

  async function exportCsv() {
    try { await api.exportCsv(); store.toast("CSV exporté dans le dossier exports."); }
    catch (e) { store.toast(String(e)); }
  }

  return (
    <section>
      <div className="vhead">
        <div>
          <h1>Comptes</h1>
          <p>Sélectionne, vérifie et lance tes comptes.{api.isMock ? " (mode démo navigateur)" : ""}</p>
        </div>
        <button className="btn" onClick={exportCsv}>Exporter CSV</button>
      </div>

      <div className="totals">
        <div className="tot"><div className="k">Comptes</div><div className="v">{accounts.length}</div></div>
        <div className="tot"><div className="k">Total Robux</div><div className="v">{totalRobux.toLocaleString("fr-FR")}</div></div>
        <div className="tot"><div className="k">En jeu</div><div className="v" style={{ color: inGame ? "var(--ok)" : undefined }}>{inGame}</div></div>
        <div className="tot"><div className="k">Cookies expirés</div><div className="v" style={{ color: expired ? "var(--crit)" : undefined }}>{expired}</div></div>
      </div>

      <div className="toolbar">
        <label className="field">
          <IconSearch />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un pseudo, un alias…" />
        </label>
        {groups.map((g) => (
          <button key={g} className={"chip" + (group === g ? " on" : "")} onClick={() => setGroup(g)}>{g}</button>
        ))}
        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Trier">
          <option value="favoris">Favoris</option>
          <option value="pseudo">Pseudo A→Z</option>
          <option value="robux">Robux</option>
          <option value="presence">Présence</option>
        </select>
        <button className="btn primary" onClick={() => setAdding(true)}><IconPlus />Ajouter</button>
      </div>

      <div className="toolbar" style={{ marginTop: -6 }}>
        <button className="btn" onClick={selectAllFiltered}><IconCheck />Tout sélectionner</button>
        <button className="btn" disabled={!selected.size || busy} onClick={refreshSelection}>
          <IconRefresh />Vérifier la sélection ({selected.size})
        </button>
        <button className="btn" onClick={() => store.refreshAll()}>
          <IconRefresh />Rafraîchir tout
        </button>
      </div>

      <div className="cols">
        <div className="acct-list">
          {filtered.length === 0 ? (
            <div className="empty">Aucun compte. Ajoute-en un avec le bouton « Ajouter ».</div>
          ) : (
            filtered.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                selected={selected.has(a.id)}
                current={currentAccount?.id === a.id}
                onToggle={store.toggle}
                onOpen={setCurrent}
              />
            ))
          )}
        </div>
        <AccountDetail account={currentAccount} busy={busy} onLaunch={launch} onRefresh={refresh} onRemove={remove} onUpdate={update} />
      </div>

      {adding && (
        <AddAccountDialog
          onClose={() => setAdding(false)}
          onAdded={(meta) => { store.addAccount(meta); setCurrent(meta.id); store.toast(`Compte ${meta.username} ajouté.`); }}
        />
      )}
    </section>
  );
}

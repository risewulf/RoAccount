import { useState } from "react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { IconHome, IconNews, IconPlus, IconSearch } from "./icons";

/** Liste des comptes sur le côté (disposition « Comptes sur le côté »). */
export function AccountSide() {
  const store = useStore();
  const { accounts, view, current } = store;
  const [q, setQ] = useState("");
  const playing = accounts.filter((a) => a.running || a.presence === "InGame").length;
  const list = accounts.filter((a) => !q || (a.username + " " + a.alias + " " + a.display_name).toLowerCase().includes(q.toLowerCase().replace(/^@/, "")));

  const goHome = (tab: "news" | "overview") => {
    try { localStorage.setItem("roaccount.hometab", tab); } catch { /* ignore */ }
    window.dispatchEvent(new Event("roa-hometab"));
    store.setView("accueil");
  };
  const home = localStorage.getItem("roaccount.hometab") || "overview";

  return (
    <aside className="acctside" aria-label="Comptes">
      <label className="field">
        <IconSearch />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom, @pseudo" aria-label="Filtrer les comptes" />
      </label>
      <button className={"as-item" + (view === "accueil" && home === "news" ? " on" : "")} onClick={() => goHome("news")}>
        <span className="ic"><IconNews /></span><span className="t"><b>Actualités</b></span>
      </button>
      <button className={"as-item" + (view === "accueil" && home === "overview" ? " on" : "")} onClick={() => goHome("overview")}>
        <span className="ic"><IconHome /></span><span className="t"><b>Vue d'ensemble</b></span>
        {playing > 0 && <span className="cnt">{playing}</span>}
      </button>
      <div className="as-list">
        {list.map((a) => {
          const sub = a.health === "cookie_expired" ? "À vérifier" : a.presence === "InGame" ? "En jeu" : a.running ? "Connexion…" : `@${a.username}`;
          return (
            <button key={a.id} className={"as-item" + (view === "comptes" && current === a.id ? " on" : "")} onClick={() => { store.setCurrent(a.id); store.setView("comptes"); }}>
              <Avatar account={a} size={38} />
              <span className="t"><b>{a.alias || a.display_name || a.username}</b><span>{sub}</span></span>
            </button>
          );
        })}
      </div>
      <button className="as-item" onClick={() => store.setAddOpen(true)}>
        <span className="ic"><IconPlus /></span><span className="t"><b>Ajouter un compte</b></span>
      </button>
    </aside>
  );
}

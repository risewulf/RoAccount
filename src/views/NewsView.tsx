import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { NewsItem } from "../lib/types";

export function NewsView() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getNews().then(setItems).catch((e) => { setErr(String(e)); setItems([]); });
  }, []);

  return (
    <section>
      <div className="vhead"><div><h1>Actualités</h1><p>Les nouveautés de RoAccount, publiées sur roaccount.xyz.</p></div></div>
      <div className="card">
        {items === null && <div className="placeholder">Chargement…</div>}
        {err && <div className="placeholder">Impossible de charger les actualités ({err}).</div>}
        {items && items.length === 0 && !err && <div className="placeholder">Rien pour l'instant.</div>}
        {items?.map((n) => (
          <div className="news-item" key={n.date + n.title}>
            <div className="d">{n.date}</div>
            <b>{n.title}</b>
            {n.body && <p>{n.body}</p>}
            {n.url && <button className="btn" onClick={() => void api.openUrl(n.url!).catch(() => { /* ignore */ })}>En savoir plus</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

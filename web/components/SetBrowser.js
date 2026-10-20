"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function SetBrowser({ sets }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const w = q.toLowerCase().trim();
    return w ? sets.filter((s) => `${s.name} ${s.series || ""}`.toLowerCase().includes(w)) : sets;
  }, [sets, q]);
  const started = shown.filter((s) => s.have > 0).sort((a, b) => b.have / (b.total || 1) - a.have / (a.total || 1));
  const rest = shown.filter((s) => !s.have);

  const card = (s) => {
    const total = s.total || s.printedTotal;
    const pct = total ? Math.min(1, s.have / total) : 0;
    return (
      <Link key={s.id} href={`/app/collection/sets/${encodeURIComponent(s.name)}`} className="set-card">
        {s.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={s.image} alt="" className="set-logo" loading="lazy" />
          : <span className="set-logo ph">{s.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
        <span className="set-info">
          <b>{s.name}</b>
          <span className="small muted">{[s.series, s.releaseDate ? new Date(`${s.releaseDate.slice(0, 10)}T12:00:00`).getFullYear() : null].filter(Boolean).join(" · ")}</span>
          {s.have > 0 ? (
            <>
              <span className="bar"><i style={{ width: `${Math.max(2, pct * 100)}%` }} /></span>
              <span className="small">{s.have}{total ? ` / ${total}` : ""} owned{total ? ` · ${Math.round(pct * 100)}%` : ""}</span>
            </>
          ) : <span className="small muted">{total ? `${total} ${total === 1 ? "card" : "cards"}` : "Browse"}</span>}
        </span>
      </Link>
    );
  };

  return (
    <>
      <div className="search-box" style={{ marginBottom: 18 }}>
        <span aria-hidden="true">⌕</span>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a set: Evolving Skies, 151, Base Set..." aria-label="Find a set" />
      </div>
      {started.length > 0 && (
        <>
          <h2 className="section-label">Sets you&apos;ve started</h2>
          <div className="set-grid">{started.map(card)}</div>
        </>
      )}
      <h2 className="section-label">{started.length ? "All other sets" : "All sets"}</h2>
      {rest.length ? <div className="set-grid">{rest.map(card)}</div> : <p className="muted">No sets match.</p>}
    </>
  );
}

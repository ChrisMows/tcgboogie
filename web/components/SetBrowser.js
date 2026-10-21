"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ERA_NAMES, eraOf, setLabel } from "@/lib/sets";

const OPEN_ERAS = 2; // newest eras open by default; older ones one tap away

export default function SetBrowser({ sets }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const w = q.toLowerCase().trim();
    return w ? sets.filter((s) => `${s.name} ${s.series || ""} ${eraOf(s)}`.toLowerCase().includes(w)) : sets;
  }, [sets, q]);
  const started = shown.filter((s) => s.have > 0).sort((a, b) => b.have / (b.total || 1) - a.have / (a.total || 1));
  const byEra = useMemo(() => {
    const m = {};
    for (const s of shown) if (!s.have) (m[eraOf(s)] ||= []).push(s); // started sets are listed at the top
    return ERA_NAMES.filter((e) => m[e]?.length).map((e) => [e, m[e]]);
  }, [shown]);

  const card = (s) => {
    const total = s.total || s.printedTotal;
    const pct = total ? Math.min(1, s.have / total) : 0;
    const { name, code } = setLabel(s.name);
    const year = s.releaseDate ? new Date(`${s.releaseDate.slice(0, 10)}T12:00:00`).getFullYear() : null;
    return (
      <Link key={s.id} href={`/app/collection/sets/${encodeURIComponent(s.name)}`} className="set-card" title={s.name}>
        {s.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={s.image} alt="" className="set-logo" loading="lazy" />
          : <span className="set-logo ph">{name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
        <span className="set-info">
          <b>{name}</b>
          <span className="small muted">{[code, year].filter(Boolean).join(" · ")}</span>
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
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a set or era: Evolving Skies, 151, Base Set, XY..." aria-label="Find a set" />
      </div>
      {started.length > 0 && (
        <>
          <h2 className="section-label">Sets you&apos;ve started</h2>
          <div className="set-grid">{started.map(card)}</div>
        </>
      )}
      {byEra.length === 0 && started.length === 0 && <p className="muted">No sets match.</p>}
      {byEra.map(([era, list], i) => (
        <details key={`${era}-${q ? "q" : ""}`} className="era" open={Boolean(q) || i < OPEN_ERAS}>
          <summary>
            <h2 className="section-label">{era}</h2>
            <span className="small muted">{list.length} set{list.length === 1 ? "" : "s"}</span>
          </summary>
          <div className="set-grid">{list.map(card)}</div>
        </details>
      ))}
    </>
  );
}

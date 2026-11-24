"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ERA_NAMES, eraOf, eraSlug, setLabel } from "@/lib/sets";

// Every set, one game at a time (/sets and Collection → Sets). Instead of one long page of eras:
// - a game switch (Pokémon / Star Wars: Unlimited), remembered on this device;
// - "Your sets" (sets you've started), folding away, and those sets still listed under their era;
// - a row of era chips that shows one era at a time (the newest to start), or All;
// - a search that looks across every game.
// openEra (from /sets?era=, the header's Sets menu) picks that era and its game.

const GAMES = [["pokemon", "Pokémon"], ["swu", "Star Wars: Unlimited"]];
const SWU = "Star Wars: Unlimited";
const gameOf = (s) => (s.series === SWU ? "swu" : "pokemon");
// Star Wars has no eras: its main sets, then promos and event cards.
const SWU_GROUPS = ["Main sets", "Promos & events"];
const swuGroup = (s) => (/promo|exclusive|championship|gift box|convention/i.test(s.name) ? "Promos & events" : "Main sets");
const groupOf = (s) => (gameOf(s) === "swu" ? swuGroup(s) : eraOf(s));
const GROUPS = { pokemon: ERA_NAMES.filter((e) => e !== SWU), swu: SWU_GROUPS };
// Star Wars set names carry "Star Wars: " so they never clash with a Pokémon set; the page already says which game.
const shownName = (s) => (gameOf(s) === "swu" ? s.name.replace(/^Star Wars:\s*/, "") : setLabel(s.name).name);
const codeOf = (s) => (gameOf(s) === "swu" ? s.code || null : setLabel(s.name).code);
const newestFirst = (a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
const STORE = "tcgb-sets-game";

export default function SetBrowser({ sets, openEra = null, hrefBase = "/app/collection/sets/" }) {
  const startGame = openEra === eraSlug(SWU) ? "swu" : openEra ? "pokemon" : null;
  const [game, setGame] = useState(startGame || "pokemon");
  const [era, setEra] = useState(openEra && openEra !== eraSlug(SWU) ? openEra : null); // a slug, or null = the newest
  const [q, setQ] = useState("");
  const [mineOpen, setMineOpen] = useState(true);

  // The game picked last time on this device (unless the link asked for one).
  useEffect(() => {
    if (startGame) return;
    try { const g = localStorage.getItem(STORE); if (GAMES.some(([k]) => k === g)) setGame(g); } catch { /* private mode */ }
  }, [startGame]);
  const pickGame = (g) => {
    setGame(g);
    setEra(null);
    try { localStorage.setItem(STORE, g); } catch { /* private mode */ }
  };

  const counts = useMemo(() => Object.fromEntries(GAMES.map(([g]) => [g, sets.filter((s) => gameOf(s) === g).length])), [sets]);
  const inGame = useMemo(() => sets.filter((s) => gameOf(s) === game), [sets, game]);
  const groups = useMemo(() => {
    const m = {};
    for (const s of inGame) (m[groupOf(s)] ||= []).push(s);
    return GROUPS[game].filter((g) => m[g]?.length).map((g) => [g, m[g].sort(newestFirst)]);
  }, [inGame, game]);
  const mine = inGame.filter((s) => s.have > 0).sort((a, b) => b.have / (b.total || 1) - a.have / (a.total || 1));
  const current = era === "all" ? "all" : groups.find(([g]) => eraSlug(g) === era)?.[0] || groups[0]?.[0] || null;

  const found = useMemo(() => {
    const w = q.toLowerCase().trim();
    if (!w) return null;
    return sets.filter((s) => `${s.name} ${codeOf(s) || ""} ${s.series || ""} ${groupOf(s)}`.toLowerCase().includes(w)).sort(newestFirst);
  }, [sets, q]);

  const tile = (s, showGame = false) => {
    const total = s.total || s.printedTotal;
    const pct = total ? Math.min(1, (s.have || 0) / total) : 0;
    const name = shownName(s);
    const year = s.releaseDate ? new Date(`${s.releaseDate.slice(0, 10)}T12:00:00`).getFullYear() : null;
    const code = codeOf(s);
    return (
      <Link key={`${s.id}-${s.name}`} href={`${hrefBase}${encodeURIComponent(s.name)}`} className={`sb-set ${s.have > 0 ? "started" : ""}`} title={s.name}>
        <span className="sb-logo">
          {s.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={s.image} alt="" loading="lazy" />
            : <span className="sb-ph">{code || name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
        </span>
        <b className="sb-name">{name}</b>
        <span className="sb-meta">{[showGame ? (gameOf(s) === "swu" ? "Star Wars" : "Pokémon") : null, s.image ? code : null, year, total ? `${total} cards` : null].filter(Boolean).join(" · ")}</span>
        {s.have > 0 && (
          <span className="sb-progress" title={`${s.have}${total ? ` of ${total}` : ""} cards owned`}>
            <span className="bar"><i style={{ width: `${Math.max(3, pct * 100)}%` }} /></span>
            <span>{total ? `${Math.round(pct * 100)}%` : `${s.have}`}</span>
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="sb">
      <div className="sb-top">
        <div className="seg sb-games" role="tablist" aria-label="Game">
          {GAMES.map(([g, label]) => (
            <button key={g} type="button" role="tab" aria-selected={game === g} className={game === g && !found ? "on" : ""} onClick={() => { pickGame(g); setQ(""); }}>
              {label} <span className="sb-count">{counts[g]}</span>
            </button>
          ))}
        </div>
        <div className="search-box sb-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a set: Evolving Skies, 151, TWI…" aria-label="Find a set" />
        </div>
      </div>

      {found ? (
        <section>
          <h2 className="section-label">{found.length} {found.length === 1 ? "set matches" : "sets match"} “{q.trim()}”</h2>
          {found.length ? <div className="sb-grid">{found.map((s) => tile(s, true))}</div> : <p className="muted">No sets match. Try fewer letters, or the set code.</p>}
        </section>
      ) : (
        <>
          {mine.length > 0 && (
            <section className="sb-mine">
              <button type="button" className="sb-fold" aria-expanded={mineOpen} onClick={() => setMineOpen((o) => !o)}>
                <span className="sb-caret" aria-hidden="true">▸</span>
                <h2 className="section-label">Your sets</h2>
                <span className="small muted">{mine.length} started</span>
              </button>
              {mineOpen && <div className="sb-grid">{mine.map((s) => tile(s))}</div>}
            </section>
          )}

          <nav className="sb-eras" aria-label={game === "swu" ? "Set groups" : "Eras"}>
            {groups.map(([g, list]) => (
              <button key={g} type="button" className={`chip ${current === g ? "on" : ""}`} aria-pressed={current === g} onClick={() => setEra(eraSlug(g))}>
                {g} <span className="sb-count">{list.length}</span>
              </button>
            ))}
            {groups.length > 1 && (
              <button type="button" className={`chip ${current === "all" ? "on" : ""}`} aria-pressed={current === "all"} onClick={() => setEra("all")}>
                All <span className="sb-count">{inGame.length}</span>
              </button>
            )}
          </nav>

          {groups.length === 0 && <p className="muted">No sets yet. They appear after the next price update.</p>}
          {groups.filter(([g]) => current === "all" || g === current).map(([g, list]) => (
            <section key={g} id={`era-${eraSlug(g)}`}>
              {current === "all" && <h2 className="section-label">{g}</h2>}
              <div className="sb-grid">{list.map((s) => tile(s))}</div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

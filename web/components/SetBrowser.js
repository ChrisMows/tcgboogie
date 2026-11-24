"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ERA_NAMES, eraOf, eraSlug, setLabel } from "@/lib/sets";

// Every set, one game and one era at a time (/sets and Collection → Sets):
// - a game switch (Pokémon / Star Wars: Unlimited, remembered on this device) and a search across both games;
// - eras down a left sidebar with their set counts (older eras one tap away); on phones, a menu instead;
// - the era's sets four to a row with their artwork, sortable;
// - with progress (Collection → Sets), a "My sets" switch narrows any game to the sets you've started, by era or all.
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
const cardsIn = (s) => s.total || s.printedTotal || 0;
const SORTS = {
  newest: ["Newest first", (a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""))],
  oldest: ["Oldest first", (a, b) => String(a.releaseDate || "9").localeCompare(String(b.releaseDate || "9"))],
  name: ["Name A to Z", (a, b) => shownName(a).localeCompare(shownName(b))],
  cards: ["Most cards", (a, b) => cardsIn(b) - cardsIn(a)],
};
const SHOWN_ERAS = 8; // the rest behind "Show older eras"
const STORE = "tcgb-sets-game";

export default function SetBrowser({ sets, openEra = null, hrefBase = "/app/collection/sets/" }) {
  const startGame = openEra === eraSlug(SWU) ? "swu" : openEra ? "pokemon" : null;
  const [game, setGame] = useState(startGame || "pokemon");
  const [era, setEra] = useState(openEra && openEra !== eraSlug(SWU) ? openEra : null); // a slug, or null = the newest
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [older, setOlder] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const hasProgress = sets.some((s) => s.have !== undefined); // Collection → Sets; the public pages don't know yours

  // The game picked last time on this device (unless the link asked for one).
  useEffect(() => {
    if (startGame) return;
    try { const g = localStorage.getItem(STORE); if (GAMES.some(([k]) => k === g)) setGame(g); } catch { /* private mode */ }
  }, [startGame]);
  const pickGame = (g) => {
    setGame(g);
    setEra(null);
    setQ("");
    try { localStorage.setItem(STORE, g); } catch { /* private mode */ }
  };

  const pool = useMemo(() => (mineOnly ? sets.filter((s) => s.have > 0) : sets), [sets, mineOnly]);
  const counts = useMemo(() => Object.fromEntries(GAMES.map(([g]) => [g, pool.filter((s) => gameOf(s) === g).length])), [pool]);
  const mineCount = sets.filter((s) => s.have > 0).length;
  const inGame = useMemo(() => pool.filter((s) => gameOf(s) === game), [pool, game]);
  const groups = useMemo(() => {
    const m = {};
    for (const s of inGame) (m[groupOf(s)] ||= []).push(s);
    const list = GROUPS[game].filter((g) => m[g]?.length).map((g) => [g, m[g]]);
    // My sets: every era's sets at once to start, then any one era.
    return mineOnly && list.length ? [["All eras", inGame], ...list] : list;
  }, [inGame, game, mineOnly]);
  const current = groups.find(([g]) => eraSlug(g) === era) || groups[0] || null;
  const currentIndex = current ? groups.indexOf(current) : -1;
  const showAll = older || currentIndex >= SHOWN_ERAS;
  const sideEras = showAll ? groups : groups.slice(0, SHOWN_ERAS);

  const found = useMemo(() => {
    const w = q.toLowerCase().trim();
    if (!w) return null;
    return pool.filter((s) => `${s.name} ${codeOf(s) || ""} ${s.series || ""} ${groupOf(s)}`.toLowerCase().includes(w));
  }, [pool, q]);
  const list = [...(found || current?.[1] || [])].sort(SORTS[sort][1]);

  const tile = (s, showGame = false) => {
    const total = cardsIn(s);
    const pct = total ? Math.min(1, (s.have || 0) / total) : 0;
    const name = shownName(s);
    const year = s.releaseDate ? new Date(`${s.releaseDate.slice(0, 10)}T12:00:00`).getFullYear() : null;
    const code = codeOf(s);
    return (
      <Link key={`${s.id}-${s.name}`} href={`${hrefBase}${encodeURIComponent(s.name)}`} className={`sb-set ${s.have > 0 ? "started" : ""}`} title={s.name}>
        <span className={`sb-art ${gameOf(s) === "swu" ? "pack" : "cover"}`} style={s.image ? { "--art": `url("${s.image}")` } : undefined}>
          {s.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={s.image} alt="" loading="lazy" />
            : <span className="sb-ph">{code || name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
        </span>
        <span className="sb-body">
          <span className="sb-text">
            <b className="sb-name">{name}</b>
            <span className="sb-meta">{[showGame ? (gameOf(s) === "swu" ? "Star Wars" : "Pokémon") : null, code, year, total ? `${total} ${total === 1 ? "card" : "cards"}` : null].filter(Boolean).join(" · ")}</span>
            {s.have > 0 && (
              <span className="sb-progress" title={`${s.have}${total ? ` of ${total}` : ""} cards owned`}>
                <span className="bar"><i style={{ width: `${Math.max(3, pct * 100)}%` }} /></span>
                <span>{total ? `${Math.round(pct * 100)}%` : s.have}</span>
              </span>
            )}
          </span>
          <span className="sb-go" aria-hidden="true">›</span>
        </span>
      </Link>
    );
  };

  const sortMenu = (
    <select className="sb-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort sets">
      {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );

  return (
    <div className="sb">
      <div className="sb-top">
        <div className="seg sb-games" role="tablist" aria-label="Game">
          {GAMES.map(([g, label]) => (
            <button key={g} type="button" role="tab" aria-selected={game === g} className={game === g && !found ? "on" : ""} onClick={() => pickGame(g)}>
              {label} <span className="sb-count">{counts[g]}</span>
            </button>
          ))}
        </div>
        {hasProgress && (
          <button type="button" className={`sb-mine-toggle ${mineOnly ? "on" : ""}`} aria-pressed={mineOnly}
            onClick={() => { setMineOnly((m) => !m); setEra(null); }} title="Show only the sets you've started">
            <span className="sb-switch" aria-hidden="true"><i /></span> My sets <span className="sb-count">{mineCount}</span>
          </button>
        )}
        <div className="search-box sb-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by set name or code" aria-label="Search sets by name or code" />
        </div>
      </div>

      <div className="sb-layout">
        {!found && groups.length > 0 && (
          <aside className="sb-side" aria-label={game === "swu" ? "Set groups" : "Eras"}>
            <h2 className="sb-side-head">{mineOnly ? "My sets" : game === "swu" ? "Groups" : "Eras"}</h2>
            <ul>
              {sideEras.map(([g, l]) => (
                <li key={g}>
                  <button type="button" className={current?.[0] === g ? "on" : ""} aria-current={current?.[0] === g ? "true" : undefined} onClick={() => setEra(eraSlug(g))}>
                    <span>{g}</span><span className="sb-count">{l.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!showAll && groups.length > SHOWN_ERAS && (
              <button type="button" className="sb-older" onClick={() => setOlder(true)}>Show older eras ↓</button>
            )}
            {/* Phones: the eras as a menu */}
            <label className="sb-era-pick">
              <span className="sr-only">{game === "swu" ? "Group" : "Era"}</span>
              <select value={current ? eraSlug(current[0]) : ""} onChange={(e) => setEra(e.target.value)}>
                {groups.map(([g, l]) => <option key={g} value={eraSlug(g)}>{g} ({l.length})</option>)}
              </select>
            </label>
          </aside>
        )}

        <div className="sb-main">
          <div className="sb-head">
            <h2>{found ? `Results for “${q.trim()}”` : current?.[0] || "Sets"}</h2>
            <span className="sb-count">{list.length} {list.length === 1 ? "set" : "sets"}</span>
            {list.length > 1 && sortMenu}
          </div>
          {list.length ? <div className="sb-grid">{list.map((s) => tile(s, Boolean(found)))}</div>
            : <p className="muted">{found ? "No sets match. Try fewer letters, or the set code."
              : mineOnly ? `You haven't started any ${GAMES.find(([g]) => g === game)[1]} sets yet. Turn off My sets to browse them all, then open a set and tap the cards you own.`
                : "No sets yet. They appear after the next price update."}</p>}
        </div>
      </div>
    </div>
  );
}

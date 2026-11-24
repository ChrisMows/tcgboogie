"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ERA_COLORS, ERA_NAMES, eraOf, eraSlug, setCategory, setLabel } from "@/lib/sets";

// Every set, one game and one era at a time (/sets and Collection → Sets):
// - a game switch (Pokémon / Star Wars: Unlimited / Disney Lorcana, remembered on this device) and a search across them;
// - eras down a left sidebar with their set counts (older eras one tap away); on phones, a menu instead;
// - the era's sets four to a row with their artwork, sortable;
// - with progress (Collection → Sets), a "My sets" switch narrows any game to the sets you've started, by era or all.
// openEra (from /sets?era=, the header's Sets menu) picks that era and its game.

const GAMES = [["pokemon", "Pokémon"], ["swu", "Star Wars: Unlimited"], ["lorcana", "Disney Lorcana"]];
// The other games (lib/tcgcsv.js): their series, the short name tiles show in search results, and the prefix their set
// names carry so they never clash with a Pokémon set (the page already says which game).
const OTHER = {
  swu: { series: "Star Wars: Unlimited", short: "Star Wars", prefix: /^Star Wars:\s*/ },
  lorcana: { series: "Disney Lorcana", short: "Lorcana", prefix: /^Lorcana:\s*/ },
};
const SERIES_GAME = Object.fromEntries(Object.entries(OTHER).map(([k, o]) => [o.series, k]));
const gameOf = (s) => SERIES_GAME[s.series] || "pokemon";
// Star Wars and Lorcana have no eras: their main sets, then promos and event cards (and Lorcana's Illumineer's Quests).
const swuGroup = (s) => (/promo|exclusive|championship|gift box|convention/i.test(s.name) ? "Promos & events" : "Main sets");
const lorcanaGroup = (s) => (/promo/i.test(s.name) ? "Promos" : /illumineer/i.test(s.name) ? "Illumineer's Quest" : "Main sets");
const groupOf = (s) => ({ swu: swuGroup, lorcana: lorcanaGroup }[gameOf(s)] || eraOf)(s);
const GROUPS = {
  pokemon: ERA_NAMES.filter((e) => !SERIES_GAME[e]),
  swu: ["Main sets", "Promos & events"],
  lorcana: ["Main sets", "Illumineer's Quest", "Promos"],
};
const ERA_GAME = Object.fromEntries(Object.entries(OTHER).map(([k, o]) => [eraSlug(o.series), k])); // ?era=disney-lorcana
const shownName = (s) => (OTHER[gameOf(s)] ? s.name.replace(OTHER[gameOf(s)].prefix, "") : setLabel(s.name).name);
const codeOf = (s) => (OTHER[gameOf(s)] ? s.code || null : setLabel(s.name).code);
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
  const startGame = ERA_GAME[openEra] || (openEra ? "pokemon" : null);
  const [game, setGame] = useState(startGame || "pokemon");
  const [era, setEra] = useState(openEra && !ERA_GAME[openEra] ? openEra : null); // a slug, or null = the newest
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
        {/* Pokémon: the set's artwork, except promos, energies and small collections, whose TCGplayer picture is only the
            Pokémon logo: those get a drawn tile in the era's colours. Star Wars and Lorcana: the set's most valuable card as
            a cover, else its booster pack. */}
        {!OTHER[gameOf(s)] && setCategory(s.name) ? (() => {
          const [a, b] = ERA_COLORS[eraOf(s)] || ["#2b9d8f", "#284b63"];
          return (
            <span className="sb-art drawn" style={{ "--c1": a, "--c2": b }}>
              <span className="sb-drawn-code">{code || name.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).map((w) => w[0]).join("").slice(0, 4)}</span>
              <span className="sb-drawn-label">{setCategory(s.name)}</span>
            </span>
          );
        })() : <span className={`sb-art ${!OTHER[gameOf(s)] ? "cover" : s.cover ? "cover card-art" : "pack"}`} style={(s.cover || s.image) ? { "--art": `url("${s.cover || s.image}")` } : undefined}>
          {(OTHER[gameOf(s)] && s.cover) || s.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={OTHER[gameOf(s)] && s.cover ? s.cover : s.image} alt="" loading="lazy" />
            : <span className="sb-ph">{code || name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
        </span>}
        <span className="sb-body">
          <span className="sb-text">
            <b className="sb-name">{name}</b>
            <span className="sb-meta">{[showGame ? (OTHER[gameOf(s)]?.short || "Pokémon") : null, code, year, total ? `${total} ${total === 1 ? "card" : "cards"}` : null].filter(Boolean).join(" · ")}</span>
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
          <aside className="sb-side" aria-label={OTHER[game] ? "Set groups" : "Eras"}>
            <h2 className="sb-side-head">{mineOnly ? "My sets" : OTHER[game] ? "Groups" : "Eras"}</h2>
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
              <span className="sr-only">{OTHER[game] ? "Group" : "Era"}</span>
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

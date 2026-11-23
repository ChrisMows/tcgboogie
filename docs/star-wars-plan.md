# Star Wars: Unlimited on TCG Boogie — plan

Written 2026-11-21. Research and planning only: no code was changed. The owner decides whether to build.

## Summary

- **It can be done without touching PokemonPriceTracker.** That service is Pokémon only, so Star Wars needs its own price source.
- **Best fit: TCGCSV to start** (free, daily TCGplayer prices, all 34 Star Wars sets and promo groups, sealed included). **JustTCG Starter ($19/mo) is the paid fallback**, with clear commercial terms and price history.
- **The Topps cards are the model to copy.** `web/lib/topps.js` already adds a non-PPT catalog behind an ID prefix (`t-…`), with its own price table, and `findProduct`, the set pages and eras already switch on it. Star Wars would be a second catalog done the same way (`swu-…`).
- **First release: collection tracking, set pages, search and daily prices** (about 1–1.5 weeks of work). Deals and price alerts come next. Grade & Flip waits: there's no good graded-price source for Star Wars.
- **Demand is low right now.** No one has asked for Star Wars yet (Admin → Requests → Games). It's worth deciding whether to build before anyone asks, or to wait for sign-ups.

## 1. Price sources

| | **TCGCSV** (tcgcsv.com) | **JustTCG** (justtcg.com) |
|---|---|---|
| Cost | Free (a hobby project; optional Patreon) | Free tier is non-commercial. Starter $19/mo, Pro $49, Enterprise $149 |
| Commercial use | FAQ: no attribution needed, "Permission is implicit." But it re-publishes TCGplayer API data, and TCGplayer's own terms weren't checked. Images are called a grey area | Paid tiers allow showing prices, trends and % changes in a consumer app. No reselling the raw feed or building a rival pricing API. Attribution optional. Terms updated 2026-11-17; 30 days' notice on price changes |
| Star Wars coverage | Category 79: **34 groups** (all main sets SOR → Icons 2027 Edition, weekly play, judge, convention and championship promos). Checked one set (Twilight of the Republic): 548 products, sealed included (boxes, packs, cases, starters, prerelease kits) | Listed: 10K+ cards, 60K+ variants. No sealed products found in their docs |
| Printings | Hyperspace and Showcase are **separate products** ("Obi-Wan Kenobi - Patient Mentor (Hyperspace)": 258 Hyperspace, 18 Showcase in TWI). Foil is a price row (`subTypeName` Normal / Foil), so Hyperspace Foil = the Hyperspace product's Foil row | `printing` per variant (Normal / Foil seen). Docs don't mention Hyperspace or Showcase by name |
| Conditions | Near Mint market only (market, low, mid, high, direct low) | Every condition priced separately |
| Update frequency | Once a day, around 20:00 UTC | About every 6 hours |
| History | Current day only; daily archive files back to 2024-02-08 (2–4 MB each, 7-Zip) | 7d / 30d / 90d / 1y history and stats in the API (tracking began March 2025) |
| Limits | Custom User-Agent, ~100 ms between requests, over 10,000 requests a day may be banned; server-side only. A full Star Wars sync is about **70 requests a day** (products + prices per group) | Starter: 10,000 requests/mo, 1,000/day, 50/min, 100 cards per request. Refreshing ~15,000 Star Wars variants daily ≈ 150 requests a day ≈ 4,500 a month — fits Starter |
| Price source | TCGplayer (via its API) | "Our own market data" (marketplace sales plus partner stores); IDs are TCGplayer IDs |

**Other sources checked:**

- **swu-db.com API** (api.swu-db.com): free, no key. Full card data with TCGplayer prices (`MarketPrice`, `FoilPrice`, `tcgplayerId`), and with `variants=true` every printing is its own row: Normal, Foil, Hyperspace, Hyperspace Foil, Showcase, Prestige, Prestige Foil, Prestige Serialized. No sealed products. **No published terms, rate limits or update schedule.** It's the best source for printing labels and card facts (aspect, cost, arena), and a good cross-check, but don't build on it commercially without asking its owner.
- **tcgapi.dev**: 9,888 Star Wars products in 33 sets, sealed included, daily prices (per-condition every 3 days), history from March 2025. Commercial use only on **Pro ($49.99/mo)** or Business ($99.99). Hyperspace/Prestige split unconfirmed.
- **TCGplayer API**: closed to new developers ("no longer granting new API access"), and existing keys can be revoked at any time.
- **Cardmarket API**: closed to new applications; EU prices in EUR anyway.
- **PriceCharting**: has Star Wars pages on its site (eBay sales), but its API license is internal use only; showing prices to members needs a separate written commercial license.
- tcgpricelookup.com: has Star Wars, $14.99 tier; terms unverified.

**Recommendation.** Start on TCGCSV: free, the whole category in ~70 requests a day, TCGplayer product IDs and pictures (the same CDN the Pokémon pages use), sealed included. Its weak point is terms: it's one person's mirror of TCGplayer data, with no contract, and TCGplayer no longer licenses its API to new developers, so there's no way to get that blessing directly. Before charging for Star Wars features (or before launch, if the owner wants to be safe), move to JustTCG Starter ($19/mo), whose paid terms plainly allow showing prices to members — the cheapest licensed option found (tcgapi.dev's commercial tier is $49.99). Check before buying that JustTCG has sealed Star Wars products and splits Hyperspace/Showcase/Prestige; if it doesn't cover sealed, sealed could stay on TCGCSV or be left out. Prestige printings (from A Lawless Time on) weren't checked in TCGCSV; swu-db shows they exist. Both use TCGplayer product IDs, so switching later only changes the importer, not members' collections. Settle this alongside the open PokemonPriceTracker commercial-terms question (see memory: price service terms), since it's the same kind of risk.

## 2. What's Pokémon-specific today

The Topps integration (`web/lib/topps.js`, `topps_price` table) already shows the pattern: a separate catalog file returning products in `lib/catalog.js`'s shape, an ID prefix that `findProduct` checks first, and set pages that branch on it.

| Area | What's Pokémon-only | What Star Wars needs |
|---|---|---|
| `web/lib/catalog.js` | Every live lookup calls `pokemonpricetracker.com`. `findProduct` falls through to PPT for any plain number, so a bare TCGplayer ID for a Star Wars card would spend PPT credits and miss. `fromCard` / `fromSealed` read PPT's JSON. `searchProducts`, `splitQuery`, `spellVariants` and `cardMatches` know Pokémon naming (numbers like `020/027`, "Poke Ball"). `listSets` / `getSetCards` / `getSetSealed` are PPT only | New `web/lib/swu.js` like `topps.js`: `isSwuId` (`swu-<productId>`), `swuCard`, `swuSets`, `swuSetCards`, `searchSwu`. `findProduct` checks `isSwuId` first; `prefetchProducts` skips them. Search merges Star Wars results when the member picks that game (or always, ranked) |
| Storage | `catalog_cache` holds ~85 KB PPT answers (the Neon transfer lesson) | Small tables filled by a daily import: `swu_product` (id, group, name, subtitle, number, rarity, aspect, type, image, printing kind) and `swu_price` (product, subtype, day, market, low). A few hundred bytes a row, ~15K products |
| `web/lib/sets.js` | Pokémon eras, set-code parsing, `SIDE_SET` rules | Star Wars has no eras worth naming yet: group by year, or "Main sets" / "Promos". `setLabel` gets the code from TCGCSV's `abbreviation` instead of parsing |
| `web/lib/collection.js` | Conditions, printings and grades are generic. `pokemonName()` (deal filtering) is Pokémon only | Printing list for Star Wars: Normal, Foil, Hyperspace, Hyperspace Foil, Showcase (plus serialized/prestige where they exist). Collection items keep `product_id = "swu-…"`; no schema change needed. A `game` column is optional later, for filters and per-game totals |
| Card pages (`/app/...` card view) | Pokémon facts, PPT history chart, graded table, "Worth grading" | Show what we have: picture, set, number, rarity, aspect, Near Mint price per printing, history from our own daily `swu_price` rows. Hide graded sections |
| Header Sets menu (`web/components/SetsMenu.js`, `app/layout.js`) | Hard-coded Pokémon era list; newest sets from PPT | A game switch at the top of the menu (Pokémon / Star Wars), or a second column with the newest Star Wars sets |
| Public set pages (`web/app/sets/`) | `/sets/[set]` copy says "Pokémon"; Topps already branches | Same branch for Star Wars: `/sets/swu-<code>` (e.g. `swu-twi`), its own titles and descriptions, a Star Wars section on `/sets`. Free to serve (our own table), so no `savedOnly` rationing |
| `web/lib/grading-gap.js` / Grade & Flip | Built on PPT's graded (PSA/CGC/BGS) prices in `grading_gap` | **Leave out.** No graded Star Wars prices from TCGCSV or JustTCG v1 (JustTCG's v2 beta mentions graded cards — unchecked) |
| Deal bot (`pokemon-deal-finder/`) | eBay filter `Game:{Pokémon TCG}` in `config.yaml`; `parse.py` matches Pokémon names and numbers; values from PPT (`ppt.py`); sealed search `q: "pokemon"` | **Leave out of v1.** Later: a second search with `Game:{Star Wars: Unlimited}` in the same eBay category 183454, a parser for "Name - Subtitle (Hyperspace)" and `SOR 123` numbers, and values read from `swu_price`. Watch the eBay daily call cap (5,000) |
| Price alerts, recaps, snapshots | Read values via `getProduct` | Work once `getProduct` returns Star Wars products with prices; the daily job refreshes `unit_value` from `swu_price` |
| Copy and SEO | "Pokémon" across ~15 app/component files, homepage, FAQ, terms | Homepage and FAQ mention Star Wars; legal pages name the new data source if the terms ask for it |
| `web/lib/feature-map.js` | — | New feature, vendor and limits go here (house rule) |

**Can launch without:** deals (bot), Grade & Flip / Worth Grading, graded values, card scanner (check whether its recognizer handles Star Wars art before turning it on), Japanese cards, CSV import from other apps (add later; TCGplayer exports carry product IDs, which map straight to `swu-<id>`).

## 3. Phases

| Phase | What ships | Effort | Monthly cost |
|---|---|---|
| 0. Decide | Check demand; settle the data source and its terms | an hour | $0 |
| 1. Collection + sets + prices | Daily import job (VPS cron or the existing price-alert cron) of all 34 groups into `swu_product` / `swu_price`; `lib/swu.js`; search; add to collection (raw + sealed); card page with price history from our own rows; public set pages and Sets menu; feature map | 6–8 working days | $0 on TCGCSV (DB growth: ~15K price rows a day ≈ a few MB a month on the VPS) — or $19 on JustTCG |
| 2. Alerts and history backfill | Price alerts and daily recaps for Star Wars cards; backfill history from TCGCSV archives (download each day's file once, never again) | 2–3 days | $0 |
| 3. Deals | Bot searches eBay for Star Wars listings and values them from `swu_price`; deal tiles and Discord alerts | 5–7 days | $0, but shares the eBay call cap with Pokémon |
| 4. Grading | Only if a graded-price source turns up (JustTCG v2, or our own eBay sales once the bot has collected enough) | unknown | likely the $49 JustTCG Pro or none |

Phase 1 is the smallest useful release: a Star Wars collector can track their cards and sealed product, see what it's worth, and browse sets.

## 4. Demand

The `game_interest` table records members who tapped "notify me" for a game (`starwars` is an option; see `web/lib/game-interest.js`). As of this writing: Star Wars 0, Lorcana 1, Yu-Gi-Oh! 1.

To check it read-only:

- **Easiest:** Admin → Requests → **Games** (`/app/admin?tab=requests&kind=games`). It lists votes and emails per game, most wanted first.
- **SQL (read-only, on the VPS database):**
  ```sql
  SELECT game, count(*) AS votes, max(created_at) AS latest FROM game_interest GROUP BY game ORDER BY votes DESC;
  ```

When Star Wars launches, the same table gives the list of members to email (and `notified_at` marks who's been told).

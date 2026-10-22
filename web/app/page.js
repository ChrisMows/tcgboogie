import Link from "next/link";
import CardArt from "@/components/CardArt";
import DealTabs from "@/components/DealTabs";
import PlanCards from "@/components/PlanCards";
import Source from "@/components/Source";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { GAMES, myGames } from "@/lib/game-interest";
import { homeShowcase } from "@/lib/deals";
import "./home.css";

// Shown until the deal bot has caught enough real deals (see homeShowcase), clearly labeled as examples.
const EXAMPLES = [
  { name: "Umbreon VMAX", art: "umbreon", meta: "Evolving Skies · Alternate Art", price: "2,180.00", market: "3,750.00", off: 42, tag: "GRADED · PSA 10", left: "4m 32s" },
  { name: "Charizard ex", art: "charizard", meta: "Pokémon 151 · Special Illustration Rare", price: "259.00", market: "325.00", off: 20, tag: "RAW · NEAR MINT", left: "8m 14s" },
  { name: "Rayquaza Gold Star", art: "rayquaza-star", meta: "EX Deoxys · 107/107", price: "1,075.00", market: "1,450.00", off: 26, tag: "RAW · NEAR MINT", left: "12m 06s" },
];

// Everything the site does, one line each. Grouped: find deals, know your collection, buy/sell/trade.
const TOOLS = [
  { icon: "⚡", title: "Deal finder", body: "eBay auctions priced well below what the card really sells for, before they end." },
  { icon: "🔔", title: "Price alerts", body: "Pick a card and a price. We tell you when it drops or climbs." },
  { icon: "▦", title: "Collection tracker", body: "What every card is worth, updated daily. Import from any app." },
  { icon: "📷", title: "Photo appraiser", body: "Snap a binder page. We find each card and its value." },
  { icon: "⇄", title: "Trade Analyzer", body: "Both sides priced, and the trade graded out of 10 for fairness." },
  { icon: "💎", title: "Worth Grading?", body: "Which of your raw cards pay off at PSA, CGC, BGS and more." },
  { icon: "🏷", title: "Sell on eBay", body: "List a card from your collection in a minute, priced from real sales." },
  { icon: "🌏", title: "Every language", body: "English and Japanese built in. Korean, Chinese and more on request." },
];

const COMPARE = [
  { source: "tcgplayer", label: "Market price", price: "$325.00" },
  { source: "tcgplayer", label: "Lowest listing", price: "$298.00" },
  { source: "ebay", label: "Sold, last 30 days", price: "$318.00" },
  { source: "ebay", label: "Auction ending soon", price: "$259.00", best: true },
];

const usd = (v, d = 2) => Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const daysAgo = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d < 1 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const dealTag = (d) => (d.kind === "sealed" ? "SEALED" : d.kind === "raw" ? `RAW · ${String(d.condition || "NM").toUpperCase()}` : `GRADED · ${d.grader} ${d.grade}`);

/** The homepage Trade Analyzer, in miniature: a static example. */
function TradeDemo() {
  const r = 46, c = 2 * Math.PI * r, score = 8.7;
  return (
    <div className="trade-demo" aria-label="Example trade graded 8.7 out of 10">
      <div className="td-sides">
        <div><small>YOU GIVE</small><b>$420</b><span>Charizard ex · PSA 9</span></div>
        <span className="td-swap" aria-hidden="true">⇄</span>
        <div><small>YOU GET</small><b>$385</b><span>Umbreon V · Raw NM</span></div>
      </div>
      <div className="td-result">
        <svg viewBox="0 0 110 110" className="td-ring" aria-hidden="true">
          <circle cx="55" cy="55" r={r} className="track" />
          <circle cx="55" cy="55" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - score / 10)} transform="rotate(-90 55 55)" />
          <text x="55" y="57" className="score">{score}</text>
          <text x="55" y="77" className="of">/ 10</text>
        </svg>
        <div>
          <b className="td-verdict">Close</b>
          <div className="td-scale"><i className="even" /><i className="dot" style={{ left: "47.8%" }} /></div>
          <small>$35 apart</small>
        </div>
      </div>
    </div>
  );
}

export default async function Home({ searchParams }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const deleted = sp?.deleted;
  // Signed-in members go straight to their collection. Links to the homepage's own sections (Explore deals,
  // Pricing) carry ?home=1 so members can still read them.
  if (user && sp?.home !== "1" && !deleted) redirect("/app/collection");
  const voted = GAMES[sp?.voted] ? sp.voted : null;
  const [mine, caught] = await Promise.all([user ? myGames(user.id) : [], homeShowcase()]);
  const cards = Object.fromEntries(
    EXAMPLES.map((d) => [d.name, <CardArt key={d.name} name={d.art} className="art-img" alt={`${d.name} card`} />]),
  );

  return (
    <div className="home">
      {deleted && (
        <div className="wrap"><div className="notice good" style={{ marginTop: 20 }}>Your account and its data were deleted.</div></div>
      )}

      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">FOR POKÉMON CARD COLLECTORS</div>
            <h1>Your next grail.<br />Your kind of price.<br /><span>That&apos;s Boogie.</span></h1>
            <p className="intro">
              Catch underpriced cards on eBay before the auction ends, know what your collection is worth,
              and check any trade in seconds.
            </p>
            <div className="hero-actions">
              <Link className="btn primary" href="/login?mode=signup">Start free <span>↗</span></Link>
              <a className="btn" href="#tools">See what it does</a>
            </div>
            <p className="micro">✓ &nbsp; Free forever. No card needed.</p>
          </div>

          <div className="stage" aria-label="Collectible cards with an illustrative deal alert">
            <div className="orbit" />
            <CardArt name="charizard" className="tcg left" alt="Charizard ex card" />
            <CardArt name="rayquaza-star" className="tcg right" alt="Rayquaza Gold Star card, EX Deoxys" />
            <div className="slab">
              <div className="slab-label">
                <span>2021 EVOLVING SKIES<br />UMBREON VMAX · #215<br />ILLUSTRATIVE GRADED CARD</span>
                <b>10</b>
              </div>
              <CardArt name="umbreon" alt="Umbreon VMAX alternate art card in a graded slab" />
            </div>
            <div className="float deal-float">
              <div className="frow"><small>YOUR NEXT GREAT FIND</small><small className="sample-tag">SAMPLE</small></div>
              <div className="frow" style={{ marginTop: 12 }}><strong>$2,180.00</strong><span className="discount">↓ 42% below market</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="games" id="games">
        <div className="wrap">
          <small>ONE HOBBY.<br />EVERY UNIVERSE.</small>
          <span className="game">Pokémon</span>
          {/* Coming soon: each is a "Notify me" vote (plain links, so they're never prefetched). */}
          {[["magic", "MAGIC", "magic"], ["lorcana", "LORCANA", "lorcana"], ["onepiece", "ONE PIECE", "italic"], ["yugioh", "Yu-Gi-Oh!", ""]].map(([key, label, cls]) => (
            <a key={key} href={`/app/notify?game=${key}`} className={`game soon game-vote ${cls}`} title={`Tell me when ${GAMES[key]} is live`}>
              {label}
              <span className="game-vote-tag">{mine.includes(key) || voted === key ? "✓ On the list" : "🔔 Notify me"}</span>
            </a>
          ))}
          <span className="more"><b className="lime">Live: Pokémon.</b><br />Tap a game to vote for it next.</span>
        </div>
        <p className="games-mobile-note">Live: Pokémon. Tap a game to vote for it next.</p>
        {voted && <div className="wrap game-voted">Thanks! We&apos;ll email you when {GAMES[voted]} is live. The games with the most votes come first.</div>}
      </div>

      <section className="content wrap" id="tools">
        <div className="eyebrow">EVERYTHING IN ONE PLACE</div>
        <h2>Find it. Track it. Trade it.</h2>
        <div className="toolkit">
          {TOOLS.map((t) => (
            <article key={t.title} className="kit">
              <span className="tool-icon" aria-hidden="true">{t.icon}</span>
              <div><h3>{t.title}</h3><p>{t.body}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="content wrap" id="deals">
        <div className="section-heading">
          <div>
            <div className="eyebrow">{caught ? "REAL DEALS, ALREADY ENDED" : "LESS SCROLLING. MORE SCORING."}</div>
            <h2>{caught ? "Deals we caught this month." : "Deals like these."}</h2>
          </div>
          {caught ? (
            <div className="deal-stats">
              <div><b>{caught.found.toLocaleString("en-US")}</b><span>deals found</span></div>
              <div><b>{caught.avgOff}%</b><span>below market, on average</span></div>
              <div><b>${caught.saved.toLocaleString("en-US")}</b><span>under market in total</span></div>
            </div>
          ) : <span className="label">◉ &nbsp; EXAMPLE DEAL FEED</span>}
        </div>
        {caught ? (
          <div className="deal-grid">
            {caught.deals.map((d) => (
              <article className="deal-card" key={d.id}>
                <div className="art">
                  <span className="art-tag">{dealTag(d)}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="art-img real" src={d.image.replace("_in_200x200", "_in_400x400")} alt={`${d.name} card`} loading="lazy" />
                </div>
                <div className="info">
                  <span className="category">POKÉMON{d.language === "japanese" ? " · JAPANESE" : ""}</span>
                  <h3>{d.name}</h3>
                  <div className="meta">{[d.setName, d.number].filter(Boolean).join(" · ")}</div>
                  <div className="prices">
                    <div><span className="price">${usd(d.total)}</span><span className="old">${usd(d.marketValue)}</span></div>
                    <span className="discount">↓ {d.discountPct}%</span>
                  </div>
                  <div className="bottom">
                    <span>Ended {daysAgo(d.endsAt)}</span>
                    <Link href="/login?mode=signup">Catch the next one ↗</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <DealTabs deals={EXAMPLES} cards={cards} />}
        <p className="note">
          {caught ? "Real eBay listings our deal finder caught, shown after they ended. Premium members get them live." : "Illustrative listings and prices, not live offers."}
        </p>
      </section>

      <section className="content wrap edge" id="trade">
        <div>
          <div className="eyebrow">TRADE ANALYZER</div>
          <h2>Is it a fair trade?<br />Know in seconds.</h2>
          <p className="desc">Add what you&apos;d give and what you&apos;d get, in any condition or grade. We price both sides at today&apos;s market and grade the trade out of 10.</p>
          <Link className="btn" href="/login?mode=signup">Try it free ↗</Link>
        </div>
        <TradeDemo />
      </section>

      <section className="content wrap edge" id="compare">
        <div className="compare" aria-label="Example price comparison">
          <div className="compare-head">
            <CardArt name="charizard" className="compare-card" alt="Charizard ex card" />
            <div>
              <b>Charizard ex</b>
              <div className="small muted">151 · 199/165 · Near Mint</div>
            </div>
          </div>
          {COMPARE.map((r) => (
            <div key={r.label} className={`compare-row ${r.best ? "best" : ""}`}>
              <Source name={r.source} />
              <span className="compare-label">{r.label}</span>
              <b>{r.price}</b>
            </div>
          ))}
          <div className="compare-foot">↘ Ending in 6 minutes · 20% below what it sells for</div>
        </div>
        <div>
          <div className="eyebrow">PRICES YOU CAN TRUST</div>
          <h2>Real sales, not guesses.</h2>
          <ul className="checks">
            <li>Raw cards and sealed: TCGplayer market prices, updated daily</li>
            <li>Graded cards: real sales of that exact grade in the last 90 days</li>
            <li>Thin data is marked &quot;Few sales&quot;, so you know when to double-check</li>
            <li>Saw a sale we missed? Report it and the value updates</li>
          </ul>
        </div>
      </section>

      <section className="content wrap" id="pricing">
        <div className="eyebrow">SIMPLE PRICING</div>
        <h2>Start free. Upgrade when it pays for itself.</h2>
        <p className="sub">One good flip covers the month.</p>
        <PlanCards signedIn={Boolean(user)} />
      </section>

      <section className="wrap cta">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-full" src="/brand/logo.webp" alt="TCG Boogie" width={900} height={569} loading="lazy" />
        <h2>The right card.<br />The right price. <span className="lime">Your move.</span></h2>
        <p>Set up takes about a minute.</p>
        <Link className="btn primary" href="/login?mode=signup">Let&apos;s Boogie ↗</Link>
      </section>
    </div>
  );
}

import Link from "next/link";
import CardArt from "@/components/CardArt";
import DealTabs from "@/components/DealTabs";
import PlanCards from "@/components/PlanCards";
import Source from "@/components/Source";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import "./home.css";

const EXAMPLES = [
  { name: "Umbreon VMAX", art: "umbreon", meta: "Evolving Skies · Alternate Art", price: "2,180.00", market: "3,750.00", off: 42, tag: "GRADED · PSA 10", left: "4m 32s" },
  { name: "Charizard ex", art: "charizard", meta: "Pokémon 151 · Special Illustration Rare", price: "259.00", market: "325.00", off: 20, tag: "RAW · NEAR MINT", left: "8m 14s" },
  { name: "Rayquaza Gold Star", art: "rayquaza-star", meta: "EX Deoxys · 107/107", price: "1,075.00", market: "1,450.00", off: 26, tag: "RAW · NEAR MINT", left: "12m 06s" },
];

const TOOLS = [
  { icon: "⚡", title: "Catch underpriced auctions", body: "We flag eBay listings priced well below what the card really sells for, before they end." },
  { icon: "🔔", title: "Get price alerts", body: "Buying or selling? Pick a card and your price. We tell you when it drops or climbs." },
  { icon: "▦", title: "Track your collection", body: "See what every card is worth, updated daily, and historical trends for your collection." },
];

const STEPS = [
  ["Tell us what you want", "The cards, grades and budget you care about."],
  ["We keep watch", "Around the clock, across eBay and TCGplayer."],
  ["You make the move", "Get the alert with the price and the time left."],
];

const COMPARE = [
  { source: "tcgplayer", label: "Market price", price: "$325.00" },
  { source: "tcgplayer", label: "Lowest listing", price: "$298.00" },
  { source: "ebay", label: "Sold, last 30 days", price: "$318.00" },
  { source: "ebay", label: "Auction ending soon", price: "$259.00", best: true },
];

export default async function Home({ searchParams }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const deleted = sp?.deleted;
  // Signed-in members go straight to their collection. Links to the homepage's own sections (Explore deals,
  // Pricing) carry ?home=1 so members can still read them.
  if (user && sp?.home !== "1" && !deleted) redirect("/app/collection");
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
            <div className="eyebrow">BIG FINDS. BETTER TIMING.</div>
            <h1>Your next grail.<br />Your kind of price.<br /><span>That&apos;s Boogie.</span></h1>
            <p className="intro">
              The hunt is half the fun. Missing the deal isn&apos;t.<br />
              Find underpriced cards, follow market moves, and get alerts for the collectibles you actually care about.
            </p>
            <div className="hero-actions">
              <Link className="btn primary" href="/login?mode=signup">Find my next deal <span>↗</span></Link>
              <a className="btn" href="#how">▷ &nbsp; See how it works</a>
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

      <div className="games">
        <div className="wrap">
          <small>ONE HOBBY.<br />EVERY UNIVERSE.</small>
          <span className="game">Pokémon</span>
          <span className="game magic soon">MAGIC</span>
          <span className="game lorcana soon">LORCANA</span>
          <span className="game soon" style={{ fontStyle: "italic" }}>ONE PIECE</span>
          <span className="game soon">Yu-Gi-Oh!</span>
          <span className="more"><b className="lime">Live: Pokémon.</b><br />The rest are coming soon.</span>
        </div>
      </div>

      <section className="content wrap" id="tools">
        <div className="eyebrow">THREE WAYS TO BOOGIE</div>
        <h2>One place for the cards you love.</h2>
        <div className="tools">
          {TOOLS.map((t) => (
            <article key={t.title} className="tool">
              <span className="tool-icon" aria-hidden="true">{t.icon}</span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content workflow" id="how">
        <div className="wrap flow">
          <div>
            <div className="eyebrow">UP AND RUNNING IN 3 STEPS</div>
            <h2>You collect.<br />We&apos;ll keep watch.</h2>
            <p className="desc">Set it up once. Takes about a minute.</p>
            <Link className="btn primary" href="/login?mode=signup">Start free ↗</Link>
          </div>
          <div className="steps">
            {STEPS.map(([title, body], i) => (
              <article key={title}><span className="num">0{i + 1}</span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
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
          <div className="eyebrow">EVERY PRICE. ONE PLACE.</div>
          <h2>See where the deal is.</h2>
          <p className="desc">We line up prices from the places you buy, so the best one jumps out.</p>
          <ul className="checks">
            <li>Real sales from the last 30 days, not asking prices</li>
            <li>Matched to the exact card, printing and grade</li>
            <li>Shady sellers and listings flagged for you</li>
          </ul>
        </div>
      </section>

      <section className="content wrap" id="deals">
        <div className="section-heading">
          <div>
            <div className="eyebrow">LESS SCROLLING. MORE SCORING.</div>
            <h2>Deals like these.</h2>
          </div>
          <span className="label">◉ &nbsp; EXAMPLE DEAL FEED</span>
        </div>
        <DealTabs deals={EXAMPLES} cards={cards} />
        <p className="note">Illustrative listings and prices, not live offers.</p>
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
        <div className="eyebrow">YOUR COLLECTION&apos;S NEXT CHAPTER</div>
        <h2>The right card.<br />The right price. <span className="lime">Your move.</span></h2>
        <p>Free forever. No card needed.</p>
        <Link className="btn primary" href="/login?mode=signup">Let&apos;s Boogie ↗</Link>
      </section>
    </div>
  );
}

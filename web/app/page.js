import Link from "next/link";
import CardArt from "@/components/CardArt";
import DealTabs from "@/components/DealTabs";
import DealCarousel from "@/components/DealCarousel";
import PlanCards from "@/components/PlanCards";
import Source from "@/components/Source";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { GAMES, myGames } from "@/lib/game-interest";
import { homeShowcase } from "@/lib/deals";
import { billingLive } from "@/lib/billing";
import { effectivePlans, trialDays } from "@/lib/plan-copy";
import { dealSoldSearch } from "@/lib/ebay-link";
import { saleLine } from "@/lib/deal-outcome";
import "./home.css";

// Shown until the deal bot has caught enough real deals (see homeShowcase), clearly labeled as examples.
const EXAMPLES = [
  { name: "Umbreon VMAX", art: "umbreon", meta: "Evolving Skies · Alternate Art", price: "2,180.00", market: "3,750.00", off: 42, tag: "GRADED · PSA 10", left: "4m 32s" },
  { name: "Charizard ex", art: "charizard", meta: "Pokémon 151 · Special Illustration Rare", price: "259.00", market: "325.00", off: 20, tag: "RAW · NEAR MINT", left: "8m 14s" },
  { name: "Rayquaza Gold Star", art: "rayquaza-star", meta: "EX Deoxys · 107/107", price: "1,075.00", market: "1,450.00", off: 26, tag: "RAW · NEAR MINT", left: "12m 06s" },
];

// Everything the site does, one line each. `tag` says what part is Premium, worked out from the plans as
// Admin → Features set them (no tag when Free has it all).
const TOOLS = [
  { icon: "⚡", title: "Deal finder", body: "eBay auctions priced well below what the card really sells for, before they end.",
    tag: (f) => (f.liveFeed ? null : "Live on Premium") },
  { icon: "🔔", title: "Price alerts", body: "Pick a card and a price. We tell you when it drops or climbs.",
    tag: (f) => (f.maxPriceWatches === null ? null : "Unlimited on Premium") },
  { icon: "▦", title: "Collection tracker", body: "What every card is worth, updated daily. Import from any app." },
  { icon: "🖼", title: "Photo appraiser", body: "Snap a binder page. We find each card and its value.",
    tag: (f) => (!f.photoAppraiser || f.appraisePerMonth === 0 ? "Premium" : f.appraisePerMonth === null ? null : "Unlimited on Premium") },
  { icon: "⇄", title: "Trade Analyzer", body: "Both sides priced, and the trade graded out of 10 for fairness.",
    tag: (f) => (f.tradeAnalyzer ? null : "Premium") },
  { icon: "💎", title: "Worth Grading?", body: "Which of your raw cards pay off at PSA, CGC, BGS and more.",
    tag: (f) => (f.gradingCheck ? null : "Full list on Premium") },
  { icon: "🏷", title: "Sell on eBay", body: "List a card from your collection in a minute, priced from real sales.",
    tag: (f) => (!f.sellOnEbay || f.sellPerMonth === 0 ? "Premium" : f.sellPerMonth === null ? null : `${f.sellPerMonth} a month free`) },
  { icon: "🌏", title: "Every language", body: "English and Japanese built in. Korean, Chinese and more on request." },
];

// The same card in three languages (Every language showcase): same artwork, different sets and numbers.
const LANGS = [
  { lang: "English", flag: "EN", set: "Cosmic Eclipse", number: "158/236", image: "https://tcgplayer-cdn.tcgplayer.com/product/201208_in_400x400.jpg" },
  { lang: "Japanese", flag: "JP", set: "Alter Genesis", number: "066/095", image: "https://tcgplayer-cdn.tcgplayer.com/product/572203_in_400x400.jpg" },
  { lang: "Chinese", flag: "CN", set: "Striking Competition", number: "037/061", image: "/cards/naganadel-guzzlord-gx-037-061-cn.jpg" },
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
  const [mine, caught, plans] = await Promise.all([user ? myGames(user.id) : [], homeShowcase(), effectivePlans()]);
  const free = plans.free;
  const photoSearchTag = !plans.free.photoSearch || plans.free.photoSearchPerMonth === 0 ? "Premium"
    : plans.free.photoSearchPerMonth === null ? null : `${plans.free.photoSearchPerMonth} a month free`;
  const trial = billingLive() ? trialDays(plans) : 0;
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
          <span className="game game-live">Pokémon<span className="game-vote-tag live">● Live now</span></span>
          {/* Coming soon: each is a "Notify me" vote (plain links, so they're never prefetched). */}
          {[["magic", "MAGIC", "magic"], ["lorcana", "LORCANA", "lorcana"], ["onepiece", "ONE PIECE", "italic"], ["yugioh", "Yu-Gi-Oh!", ""]].map(([key, label, cls]) => (
            <a key={key} href={`/app/notify?game=${key}`} className={`game soon game-vote ${cls}`}
              title={mine.includes(key) || voted === key ? `You're signed up: we'll email you when ${GAMES[key]} is live` : `Tell me when ${GAMES[key]} is live`}>
              {label}
              <span className="game-vote-tag">{mine.includes(key) || voted === key ? "✓ We'll notify you" : "🔔 Notify Me When Available"}</span>
            </a>
          ))}
          <span className="more"><b className="lime">Live: Pokémon.</b><br />Tap a game to vote for it next.</span>
        </div>
        <p className="games-mobile-note">Tap a game to vote for it next.</p>
        {voted && <div className="wrap game-voted">Thanks! We&apos;ll email you when {GAMES[voted]} is live. The games with the most votes come first.</div>}
      </div>

      <section className="content wrap" id="tools">
        <div className="eyebrow">EVERYTHING IN ONE PLACE</div>
        <h2>Find it. Track it. Trade it.</h2>
        <div className="toolkit">
          {TOOLS.map((t) => {
            const tag = t.tag ? t.tag(free) : null;
            return (
              <article key={t.title} className="kit">
                <span className="tool-icon" aria-hidden="true">{t.icon}</span>
                <div><h3>{t.title}{tag && <span className="kit-tag">{tag}</span>}</h3><p>{t.body}</p></div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="content wrap" id="deals">
        <div className="section-heading">
          <div>
            <div className="eyebrow">{caught ? "REAL SALES, BELOW MARKET" : "LESS SCROLLING. MORE SCORING."}</div>
            <h2>{caught ? "Deals we caught this month." : "Deals like these."}</h2>
          </div>
          {caught ? (
            <div className="deal-stats">
              <div><b>{caught.soldBelow.toLocaleString("en-US")}</b><span>sold below market</span></div>
              <div><b>{caught.avgOff}%</b><span>below market, on average</span></div>
              <div><b>{caught.bestOff}%</b><span>biggest saving</span></div>
            </div>
          ) : <span className="label">◉ &nbsp; EXAMPLE DEAL FEED</span>}
        </div>
        {caught ? (
          <DealCarousel>
            {caught.deals.map((d) => {
              // The card opens its page with this deal's details (members; visitors sign in first). On eBay the sale shows
              // in sold listings for that card and grade (an ended listing's own link goes to a general product page).
              const page = d.productId ? `/app/cards/${encodeURIComponent(d.productId)}?deal=${encodeURIComponent(d.id)}${d.language === "japanese" ? "&lang=japanese" : ""}` : null;
              const listing = dealSoldSearch(d, "home-caught");
              const Card = page ? Link : "div";
              return (
                <article className="deal-card" key={d.id}>
                  <Card {...(page ? { href: page } : {})} className="deal-card-link" title={page ? "See the deal and the card's prices" : undefined}>
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
                        <div><span className="price">${usd(d.soldFor)}</span><span className="old">${usd(d.marketValue)}</span></div>
                        <span className="discount">↓ {d.realOff}%</span>
                      </div>
                      <div className="price-note">{saleLine(d) || "Sold for, with shipping"} · vs. what it usually sells for</div>
                    </div>
                  </Card>
                  <div className="bottom deal-card-foot">
                    <span>Sold {daysAgo(d.endsAt)}</span>
                    <a href={listing.href} target="_blank" rel={`noopener noreferrer${listing.affiliate ? " sponsored" : ""}`}
                      title="This exact sale on eBay (sold listings, found by its item number)">See this sale on eBay ↗</a>
                  </div>
                </article>
              );
            })}
          </DealCarousel>
        ) : <DealTabs deals={EXAMPLES} cards={cards} />}
        <p className="note">
          {caught ? "Real eBay auctions our deal finder caught that sold below market. Prices are what each one finally sold for, including shipping. Premium members get deals while they're live." : "Illustrative listings and prices, not live offers."}
        </p>
      </section>

      {/* Finding cards: search by picture, and every language (the same card in three printings). */}
      <section className="content wrap" id="find">
        <div className="eyebrow">ANY CARD. ANY LANGUAGE.</div>
        <h2>Snap it, and we find it.</h2>
        <div className="find-grid">
          <div className="find-panel">
            <div className="find-head"><b>📷 Search by picture</b>{photoSearchTag && <span className="kit-tag">{photoSearchTag}</span>}</div>
            <p>Point your phone at a card, or upload a photo. We read the name and number and pull up the exact card.</p>
            <div className="snap-demo" aria-hidden="true">
              <div className="snap-phone"><span className="snap-frame"><CardArt name="charizard" className="snap-card" alt="" /></span></div>
              <span className="snap-arrow">→</span>
              <div className="snap-result">
                <CardArt name="charizard" className="snap-thumb" alt="" />
                <div><b>Charizard ex</b><small>151 · 199/165</small><span className="snap-found">✓ Found</span></div>
              </div>
            </div>
          </div>
          <div className="find-panel">
            <div className="find-head"><b>🌏 Every language</b></div>
            <p>English and Japanese are built in, and Korean, Chinese and more are added on request. Same art, different sets and numbers, all told apart.</p>
            <div className="lang-strip">
              {LANGS.map((l) => (
                <figure key={l.flag}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image ? <img src={l.image} alt={`Naganadel & Guzzlord GX, ${l.lang}`} loading="lazy" /> : <span className="lang-ph">中文</span>}
                  <figcaption><b>{l.flag}</b> {l.number}<small>{l.set}</small></figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
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
        <p className="sub">One good flip covers the month.{trial > 0 ? ` New members get ${trial} days of Premium free.` : ""}</p>
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

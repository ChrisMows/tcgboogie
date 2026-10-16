import Link from "next/link";
import CardArt from "@/components/CardArt";
import DealTabs from "@/components/DealTabs";
import "./home.css";

const EXAMPLES = [
  { name: "Umbreon VMAX", art: "umbreon", meta: "Evolving Skies · Alternate Art", price: "240.00", market: "335.00", off: 28, tag: "GRADED · PSA 10", left: "4m 32s" },
  { name: "Charizard ex", art: "charizard", meta: "Pokémon 151 · Special Illustration Rare", price: "112.00", market: "150.00", off: 25, tag: "RAW · NEAR MINT", left: "8m 14s" },
  { name: "Arceus VSTAR", art: "arceus", meta: "Crown Zenith · Galarian Gallery", price: "58.00", market: "78.00", off: 26, tag: "RAW · NEAR MINT", left: "12m 06s" },
];

export default async function Home({ searchParams }) {
  const deleted = (await searchParams)?.deleted;
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
            <p className="micro">✓ &nbsp; Your cards. Your budget. Your edge.</p>
          </div>

          <div className="stage" aria-label="Collectible cards with an illustrative deal alert">
            <div className="orbit" />
            <CardArt name="charizard" className="tcg left" alt="Charizard ex card" />
            <CardArt name="card-back" className="tcg right" alt="Trading card back" />
            <div className="slab">
              <div className="slab-label">
                <span>2021 EVOLVING SKIES<br />UMBREON VMAX · #215<br />ILLUSTRATIVE GRADED CARD</span>
                <b>10</b>
              </div>
              <CardArt name="umbreon" alt="Umbreon VMAX alternate art card in a graded slab" />
            </div>
            <div className="float alert">
              <small>♧ &nbsp; IT&apos;S TIME TO BOOGIE</small>
              <strong>Your grail. Below your target.</strong>
              <p>A new deal matches your filters.</p>
            </div>
            <div className="float deal-float">
              <div className="frow"><small>YOUR NEXT GREAT FIND</small><small style={{ fontSize: 8 }}>SAMPLE ALERT</small></div>
              <div className="frow" style={{ marginTop: 12 }}><strong>$240.00</strong><span className="discount">↓ 28% below market</span></div>
            </div>
            <span className="spark">✦</span>
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
          <span className="more">Live today: Pokémon.<br />The rest are on the radar ↗</span>
        </div>
      </div>

      <section className="content wrap" id="deals">
        <div className="section-heading">
          <div>
            <div className="eyebrow">LESS SCROLLING. MORE SCORING.</div>
            <h2>Good cards. Better opportunities.</h2>
            <p className="desc">A look at the deals your next alert could uncover.</p>
          </div>
          <span className="label">◉ &nbsp; EXAMPLE DEAL FEED</span>
        </div>
        <DealTabs deals={EXAMPLES} cards={cards} />
        <p className="note">Illustrative listings and prices, not live offers.</p>
      </section>

      <section className="content workflow" id="how">
        <div className="wrap flow">
          <div>
            <div className="eyebrow">THE HUNT, ON AUTOPILOT.</div>
            <h2>You collect.<br />We&apos;ll keep watch.</h2>
            <p className="desc">The checks a careful collector would make.<br />Without another evening of endless tabs.</p>
            <Link className="lime-link" href="/how-it-works">Go behind the alerts &nbsp; ↗</Link>
          </div>
          <div className="steps">
            <article><span className="num">01</span><h3>Set your sights</h3><p>Choose your cards, sets, grades, budget, and the discount worth your attention.</p></article>
            <article><span className="num">02</span><h3>We do the digging</h3><p>Listings matched to the exact card. Recent sold comps checked. Seller red flags surfaced.</p></article>
            <article><span className="num">03</span><h3>Make your move</h3><p>Get the listing, the context, and the time left. You decide when a deal is your deal.</p></article>
          </div>
        </div>
      </section>

      <section className="content wrap edge" id="edge">
        <div className="console">
          <div className="console-top"><span>◈ &nbsp; Your collector radar</span><span className="lime">● Preview</span></div>
          <div className="pills">
            <span className="pill">Pokémon</span><span className="pill">PSA 10</span><span className="pill">Under $300</span><span className="pill">20%+ below market</span>
          </div>
          <div className="chart">
            <svg viewBox="0 0 450 140" preserveAspectRatio="none" aria-label="Illustrative market trend">
              <defs>
                <linearGradient id="f" x2="0" y2="1">
                  <stop stopColor="#d3ff66" stopOpacity=".2" />
                  <stop offset="1" stopColor="#d3ff66" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 100 35 92 65 105 95 70 125 82 160 55 190 61 220 43 255 58 290 30 320 42 355 25 390 35 420 16 450 23 V140 H0Z" fill="url(#f)" />
              <path d="M0 100 35 92 65 105 95 70 125 82 160 55 190 61 220 43 255 58 290 30 320 42 355 25 390 35 420 16 450 23" fill="none" stroke="#d3ff66" strokeWidth="2" />
            </svg>
          </div>
          <div className="axis"><span>30 DAYS AGO</span><span>ILLUSTRATIVE SOLD PRICES</span><span>TODAY</span></div>
          <div className="console-alert"><span>↘ &nbsp; A listing just hit your target price.</span><b>Your move. ↗</b></div>
        </div>
        <div>
          <div className="eyebrow">SIGNAL OVER NOISE.</div>
          <h2>Built for the way<br />you collect.</h2>
          <div className="feature"><span>◎</span><div><h3>Only your kind of cards</h3><p>Dial in your filter profiles. Let the deals come to you.</p></div></div>
          <div className="feature"><span>⌁</span><div><h3>Real sales. Real context.</h3><p>Recent sold comps for the exact card help you judge each opportunity with confidence.</p></div></div>
          <div className="feature"><span>♧</span><div><h3>A heads-up that matters</h3><p>From ending auctions to TCGplayer price drops on your watch list, keep your next find within reach.</p></div></div>
        </div>
      </section>

      <section className="wrap cta">
        <div className="eyebrow">YOUR COLLECTION&apos;S NEXT CHAPTER</div>
        <h2>The right card.<br />The right price. <span className="lime">Your move.</span></h2>
        <p>Spend less time searching. More time loving the hobby.</p>
        <Link className="btn primary" href="/login?mode=signup">Let&apos;s Boogie ↗</Link>
      </section>
    </div>
  );
}

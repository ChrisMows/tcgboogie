import Link from "next/link";
import CardThumb from "@/components/CardThumb";
import { money } from "@/lib/collection";
import { ebayLink } from "@/lib/ebay-link";
import { marketFeed } from "@/lib/market";
import { getCurrentUser } from "@/lib/session";

// The public market feed: deals our members caught under market (first), new record highs and the week's biggest sales, from
// sales the deal bot watched end on eBay (lib/market.js). Each one has a share image (app/sales/image/[id]).
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const TITLE = "Market Movers: Pokémon card deals and record sales";
const DESCRIPTION = "Graded Pokémon cards hitting new highs, the week's biggest eBay sales, and deals our members caught under market value.";

export async function generateMetadata() {
  const f = await marketFeed();
  const top = f.deals[0] || f.highs[0] || f.big[0];
  const image = top ? `${SITE}/sales/image/${top.id}.png` : undefined;
  return {
    title: TITLE, description: DESCRIPTION, alternates: { canonical: "/sales" },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE}/sales`, ...(image ? { images: [{ url: image, width: 1080, height: 1080 }] } : {}) },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, ...(image ? { images: [image] } : {}) },
  };
}

const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Tile({ x }) {
  const link = x.url ? ebayLink(x.url, `sales-${x.kind}`) : null;
  const thumb = x.grader ? { kind: "graded", grader: x.grader, grade: x.grade, image: x.image, name: x.name, number: x.number } : { image: x.image, name: x.name, number: x.number };
  return (
    <li className="sale-tile">
      <div className="sale-art"><CardThumb item={thumb} width={170} /></div>
      <span className={`sale-kicker ${x.kind}`}>{x.kind === "high" ? "📈 New high" : x.kind === "deal" ? `⚡ ${x.off}% under market` : "💰 Big sale"}</span>
      <b className="sale-price">{money(x.price, 0)}</b>
      <span className="sale-name">{[x.grader ? `${x.grader} ${x.grade}` : x.condition, x.name].filter(Boolean).join(" · ")}</span>
      <span className="small muted">
        {[x.set, x.kind === "high" ? `last high ${money(x.prevHigh, 0)}` : x.kind === "deal" ? `market ${money(x.market, 0)}` : null, x.soldAt ? day(x.soldAt) : null].filter(Boolean).join(" · ")}
      </span>
      <span className="sale-links">
        {link && <a href={link.href} target="_blank" rel={`noopener noreferrer${link.affiliate ? " sponsored" : ""}`}>eBay ↗</a>}
        <a href={`/sales/image/${x.id}.png`} target="_blank" rel="noopener noreferrer">Share image</a>
      </span>
    </li>
  );
}

function Section({ id, title, intro, list, empty }) {
  return (
    <section className="sales-section" id={id}>
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      {list.length ? <ul className="sales-grid">{list.map((x) => <Tile key={x.id} x={x} />)}</ul> : <p className="small muted">{empty}</p>}
    </section>
  );
}

export default async function Sales() {
  const [f, user] = await Promise.all([marketFeed(), getCurrentUser()]);
  return (
    <div className="wrap sales-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">POKÉMON CARD MARKET</div>
          <h1>Market Movers</h1>
          <p>Deals our members caught under market, new record highs and the week&apos;s biggest eBay sales. Updated all day from sales our deal bot watches end.</p>
        </div>
      </div>
      <Section id="deals" title="⚡ Deals our members caught" intro="Auctions we alerted members to that really sold well under market value, by their final price." list={f.deals}
        empty="No caught deals in the last two weeks yet." />
      <Section id="highs" title="📈 New highs" intro="Graded cards that just sold for more than any sale of that card and grade we know of." list={f.highs}
        empty="No new highs in the last two weeks. They show up here the moment one sells." />
      <Section id="big" title="💰 Biggest sales this week" intro="The priciest graded Pokémon cards that sold on eBay in the last 7 days." list={f.big}
        empty="No big sales recorded this week yet." />
      <div className="panel sales-cta">
        <b>Get deals like these before the auction ends.</b>
        <span className="muted">TCG Boogie watches eBay all day and alerts you the moment a card you want is listed under market value.</span>
        <Link href={user ? "/app/deals" : "/login?mode=signup&from=sales"} className="btn primary">{user ? "Open your deals" : "Start free"}</Link>
      </div>
      <p className="hint">Sales are eBay listings our bot identified and watched end; values are automated estimates and can be wrong. Not affiliated with eBay.</p>
    </div>
  );
}

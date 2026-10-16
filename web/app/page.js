import Link from "next/link";
import DealCard from "@/components/DealCard";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { PLANS } from "@/lib/plans";

const features = [
  { title: "Watches every auction", body: "Graded slabs and raw cards on eBay, checked around the clock as auctions approach their end." },
  { title: "Real market value", body: "Each card is priced from what the same card, grade, or condition actually sold for in the last 30 days." },
  { title: "Your filters, your deals", body: "Pick the cards, sets, grades, conditions, and discounts you care about. Only those reach you." },
  { title: "Alerts in seconds", body: "Instant notifications on Discord or your phone, with the listing, the comps, and the time left." },
];

export default async function Home({ searchParams }) {
  const deleted = (await searchParams)?.deleted;
  return (
    <div className="wrap">
      {deleted && <div className="notice good" style={{ marginTop: 20 }}>Your account and its data were deleted.</div>}
      <section className="hero">
        <h1>
          Find underpriced cards <em>before the auction ends</em>
        </h1>
        <p className="lead">
          TCG Boogie scans eBay for graded and raw trading cards listed well below what they really sell for, and tells
          you in time to act.
        </p>
        <div className="cta">
          <Link href="/login?mode=signup" className="btn primary lg">Start free</Link>
          <Link href="/how-it-works" className="btn lg">See how it works</Link>
        </div>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <DealCard deal={SAMPLE_DEALS[0]} mode="preview" />
        </div>
      </section>

      <section className="section">
        <div className="grid">
          {features.map((f) => (
            <div className="card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Deals like these, every day</h2>
        <p className="sub">Examples of what TCG Boogie flags: cards listed far below their recent sales.</p>
        <div className="grid">
          {SAMPLE_DEALS.slice(1, 4).map((d) => (
            <DealCard key={d.id} deal={d} mode="preview" />
          ))}
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <h2>Start free, upgrade when it pays for itself</h2>
        <p className="sub">
          Free shows you the deals you missed. Premium gets them to you live, for ${PLANS.premium.price}/month.
        </p>
        <Link href="/pricing" className="btn primary lg">Compare plans</Link>
      </section>
    </div>
  );
}

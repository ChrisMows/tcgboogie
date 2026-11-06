import Link from "next/link";
import { redirect } from "next/navigation";
import FlipDetail from "@/components/FlipDetail";
import { cardSearchQuery, ebaySearch } from "@/lib/ebay-link";
import { DEFAULT_SHIPPING, GRADE_TARGETS, GRADING_COMPANIES, targetId, targetName } from "@/lib/grading";
import { gradingGapCard } from "@/lib/grading-gap";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Grade & Flip" };

const num = (v, d, lo, hi) => { const n = Number(v); return v === undefined || v === "" || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };

/**
 * One card on Grade & Flip. The search's choices arrive in the link (t, tier, ship) so the numbers start the same as the
 * tile; from is that search's query, for the way back. jp=1: the Japanese printing.
 */
export default async function FlipCardPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/app/grade-and-flip/${encodeURIComponent(id)}`);
  if (!user.plan.gradingFinder) redirect("/app/grade-and-flip"); // shows what Ultra is
  const language = sp?.jp === "1" ? "japanese" : "english";
  const cardHref = `/app/cards/${encodeURIComponent(id)}${language === "japanese" ? "?lang=japanese" : ""}`;
  const back = `/app/grade-and-flip${typeof sp?.from === "string" && sp.from ? `?${sp.from}` : ""}`;
  const card = await gradingGapCard(id, language);

  const crumbs = <div className="crumbs"><Link href={back} prefetch={false}>← Back to Grade &amp; Flip</Link></div>;
  if (!card) {
    return (
      <>
        {crumbs}
        <div className="panel empty-state">
          <h2>No flip numbers for this card yet</h2>
          <p className="muted">It needs a raw price and recent graded sales first.</p>
          <Link href={cardHref} className="btn">Open the card page</Link>
        </div>
      </>
    );
  }

  const target = targetId(sp?.t);
  const { grader } = GRADE_TARGETS[target];
  const start = {
    target,
    tier: Math.round(num(sp?.tier, 0, 0, GRADING_COMPANIES[grader].tiers.length - 1)),
    shipping: num(sp?.ship, DEFAULT_SHIPPING, 0, 999),
  };
  // Worked out here: eBay's tracking settings are only on the server.
  const query = cardSearchQuery({ name: card.name, number: card.number, setName: card.setName, language });
  const links = {
    card: cardHref,
    raw: ebaySearch(query, { source: "grade-flip-raw" }),
    sold: Object.fromEntries(Object.keys(GRADE_TARGETS).map((t) => [t, ebaySearch(`${query} ${targetName(t)}`, { sold: true, source: "grade-flip-sold" })])),
  };

  return (
    <>
      {crumbs}
      <FlipDetail card={card} start={start} links={links} />
    </>
  );
}

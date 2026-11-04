import Link from "next/link";
import GradingCheck, { GradingTile } from "@/components/GradingCheck";
import { gradingCandidates } from "@/lib/grading";
import { findGradingGaps } from "@/lib/grading-gap";
import { PLANS } from "@/lib/plans";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Worth grading?" };

const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;

export default async function GradingPage() {
  const user = await requireUser("/app/collection/grading");
  const [c, finder] = await Promise.all([
    loadCollection(user),
    // Grade & Flip's default search (PSA, cheapest level, safe bets, modern), for the prompt below: what's out there now.
    findGradingGaps({ safeOnly: true, limit: 1 }).catch(() => ({ cards: [], total: 0 })),
  ]);
  const candidates = gradingCandidates(c.owned, c.products);
  const rawCards = new Set(c.owned.filter((it) => it.kind === "raw" && it.productType === "card" && it.condition === "Near Mint").map((it) => `${it.productId}:${it.printing || ""}`)).size;
  const ultra = Boolean(user.plan.gradingFinder);
  const best = finder.cards[0];
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Worth grading?</div>
      <div className="page-head">
        <div>
          <h1>Worth grading?</h1>
          <p>Which of your raw cards would make money if you got them graded.</p>
        </div>
      </div>
      <GradingCheck candidates={candidates} rawCards={rawCards} ownedCards={c.owned.length} full={Boolean(user.plan.gradingCheck)} />

      {finder.total > 0 && (ultra ? (
        <Link href="/app/grade-and-flip" className="panel gf-promo gf-promo-link">
          <span className="gf-promo-icon" aria-hidden="true">💎</span>
          <span><b>Find cards worth buying to grade</b><span className="muted small"> · Grade & Flip has {finder.total.toLocaleString("en-US")} modern cards where a PSA 9 still pays right now, beyond your own cards.</span></span>
          <span className="gf-promo-go" aria-hidden="true">→</span>
        </Link>
      ) : (
        <section className="panel gf-promo">
          <div className="gf-promo-text">
            <span className="badge accent">Ultra</span>
            <h2>Grade & Flip: cards worth buying raw to grade</h2>
            <p className="muted">
              Beyond your own collection, we&apos;re tracking <b>{finder.total.toLocaleString("en-US")} modern cards</b> right now that would make money
              bought raw and graded with PSA, even as a 9. Filter by grading company, budget and profit, English or Japanese.
              {best && <> Today&apos;s top pick: <b>{best.name.replace(/\s*\(.*\)$/, "")}</b>, raw {money(best.raw)}, PSA 10 {money(best.top)}, about <b className="up">{money(best.profit10)}</b> profit.</>}
            </p>
            <div className="gf-promo-actions">
              <Link href="/app/ultra?from=grading-finder" className="btn primary">See Ultra · ${PLANS.ultra.price}/mo</Link>
            </div>
          </div>
          {best && <div className="gf-promo-card"><GradingTile c={best} /></div>}
        </section>
      ))}
    </>
  );
}

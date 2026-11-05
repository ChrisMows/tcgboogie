import Link from "next/link";
import { GradingTile } from "@/components/GradingCheck";
import { gradeLabel } from "@/lib/collection";
import { DEFAULT_SHIPPING, FLIP_POINTS, FLIP_TIERS, GRADE_TARGETS, GRADING_COMPANIES, MIN_PROFIT, targetId, targetName } from "@/lib/grading";
import { ERAS, NEW_DAYS, findGradingGaps, gradingGapCount } from "@/lib/grading-gap";
import { PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Grade & Flip" };

const num = (v, d, lo, hi) => { const n = Number(v); return v === undefined || v === "" || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
const fee = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
const PAGE = 60; // cards shown at first, and how many Load more adds

/** What members on other plans see: no cards, just what Ultra is. */
function UltraOnly() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grade &amp; Flip</h1>
          <p>Raw cards selling far below their graded price, anywhere in the catalog: buy raw, grade, flip for a profit.</p>
        </div>
      </div>
      <div className="panel empty-state">
        <h2>🔒 Grade &amp; Flip is part of Ultra</h2>
        <p className="muted">Every card gets a Flip Score from 1 to 10 for its profit after fees, its return, what a lower grade would still pay and how often it sells, with filters for grading company, budget and era.</p>
        <Link href="/app/ultra?from=grading-finder" className="btn primary">See Ultra · ${PLANS.ultra.price}/mo</Link>
      </div>
    </>
  );
}

/** Grade & Flip: cards anywhere in our catalog that would make money bought raw and graded. Filters are a GET form. */
export default async function GradingFinderPage({ searchParams }) {
  const user = await requireUser("/app/grade-and-flip");
  if (!user.plan.gradingFinder) return <UltraOnly />;
  const sp = await searchParams;
  const target = targetId(sp?.grader);
  const t = GRADE_TARGETS[target];
  const { grader } = t;
  const co = GRADING_COMPANIES[grader];
  const name = targetName(target);
  const topShort = gradeLabel(grader, t.top), nextShort = gradeLabel(grader, t.next);
  const tier = num(sp?.tier, 0, 0, co.tiers.length - 1);
  const opts = {
    target, tier,
    shipping: num(sp?.ship, DEFAULT_SHIPPING, 0, 999),
    minRaw: num(sp?.min, 0, 0, 100000),
    maxRaw: sp?.max ? num(sp.max, null, 0, 100000) : null,
    minProfit: num(sp?.profit, MIN_PROFIT, 0, 100000),
    safeOnly: sp?.safe !== "0", // on unless switched off: a card that only pays at a 10 is a gamble
    language: ["english", "japanese", "all"].includes(sp?.lang) ? sp.lang : "english",
    era: ERAS[sp?.era] ? sp.era : "modern", // vintage rarely grades a 10, so modern comes first
    sort: ["profit", "return"].includes(sp?.sort) ? sp.sort : "score",
    limit: Math.round(num(sp?.show, PAGE, PAGE, 600)),
  };
  const [{ cards, fresh, total, remaining }, checked] = await Promise.all([findGradingGaps(opts), gradingGapCount()]);
  // Load more: the same search with room for another page of cards.
  const moreParams = new URLSearchParams(Object.entries(sp || {}).filter(([k, v]) => k !== "show" && typeof v === "string"));
  moreParams.set("show", String(opts.limit + PAGE));
  // What the folded filters are set to, shown on their bar so the cards come first without hiding the search.
  const chosen = [
    name, co.tiers[tier].name,
    { english: "English", japanese: "Japanese", all: "English and Japanese" }[opts.language],
    ERAS[opts.era].label.split(/[:,]/)[0],
    opts.minRaw || opts.maxRaw !== null ? `Raw ${money(opts.minRaw)}${opts.maxRaw !== null ? ` to ${money(opts.maxRaw)}` : " and up"}` : null,
    `${money(opts.minProfit)}+ profit`,
    opts.safeOnly ? null : `Includes cards that need a ${topShort}`,
    { score: "Best Flip Score", profit: "Most profit", return: "Best return" }[opts.sort],
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grade & Flip</h1>
          <p>Raw cards selling far below their graded price, anywhere in the catalog: buy raw, grade, flip for a profit.</p>
        </div>
      </div>

      <details className="panel gf-filter-box">
        <summary>
          <span className="gf-filter-sum"><b>Filters</b><span className="small muted">{chosen}</span></span>
          <span className="more-grades-icon" aria-hidden="true" />
        </summary>
      <form className="gf-filters" method="get">
        <label className="gr-field">
          <span className="small muted">Grading company and grade</span>
          <select name="grader" defaultValue={target}>{Object.keys(GRADE_TARGETS).map((g) => <option key={g} value={g}>{targetName(g)}</option>)}</select>
        </label>
        <label className="gr-field">
          <span className="small muted">{grader} service level</span>
          <select name="tier" defaultValue={String(tier)}>
            {co.tiers.map((t, i) => <option key={t.name} value={i}>{t.name} · {fee(t.fee)}{t.days ? ` · ~${t.days} days` : ""}</option>)}
          </select>
        </label>
        <label className="gr-field gr-small">
          <span className="small muted">Raw price from</span>
          <span className="gr-money"><span className="muted">$</span><input type="number" name="min" min="0" step="1" defaultValue={opts.minRaw || ""} placeholder="0" /></span>
        </label>
        <label className="gr-field gr-small">
          <span className="small muted">up to</span>
          <span className="gr-money"><span className="muted">$</span><input type="number" name="max" min="0" step="1" defaultValue={opts.maxRaw ?? ""} placeholder="Any" /></span>
        </label>
        <label className="gr-field gr-small">
          <span className="small muted">Profit at least</span>
          <span className="gr-money"><span className="muted">$</span><input type="number" name="profit" min="0" step="5" defaultValue={opts.minProfit} /></span>
        </label>
        <label className="gr-field gr-small">
          <span className="small muted">Shipping per card</span>
          <span className="gr-money"><span className="muted">$</span><input type="number" name="ship" min="0" step="1" defaultValue={opts.shipping} /></span>
        </label>
        <label className="gr-field">
          <span className="small muted">Cards</span>
          <select name="lang" defaultValue={opts.language}>
            <option value="english">English</option><option value="japanese">Japanese</option><option value="all">English and Japanese</option>
          </select>
        </label>
        <label className="gr-field">
          <span className="small muted">Era</span>
          <select name="era" defaultValue={opts.era}>
            {Object.entries(ERAS).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
          </select>
        </label>
        <label className="gr-field">
          <span className="small muted">Sort by</span>
          <select name="sort" defaultValue={opts.sort}>
            <option value="score">Best Flip Score</option><option value="profit">Most profit</option><option value="return">Best return on what you spend</option>
          </select>
        </label>
        <label className="gr-field">
          <span className="small muted">Risk</span>
          <select name="safe" defaultValue={opts.safeOnly ? "1" : "0"}>
            <option value="1">Only cards where a {nextShort} still pays</option><option value="0">Include cards that need a {topShort}</option>
          </select>
        </label>
        <button type="submit" className="btn primary">Find cards</button>
      </form>
      </details>

      <div className="gr-legend small muted">
        <span className="gr-eq">
          {total ? <><b>{total.toLocaleString("en-US")} {total === 1 ? "card" : "cards"}</b> found</> : "No cards found"} · profit = <b>{name} price</b> − <b>raw price</b> − <b>{fee(co.tiers[tier].fee)} grading + {money(opts.shipping)} shipping</b>
        </span>
      </div>
      <details className="gr-score-key small muted">
        <summary><span className="more-grades-icon" aria-hidden="true" />What&apos;s a Flip Score?</summary>
        <span>A score from 1 to 10: profit (up to {FLIP_POINTS.profit} points), return on what you spend ({FLIP_POINTS.return}), what a {nextShort} would still pay ({FLIP_POINTS.safety}) and how often the {topShort} sells ({FLIP_POINTS.demand}).</span>
        <span className="gr-score-tiers">
          {FLIP_TIERS.map((t, i) => <span key={t.key} className={`gr-score-chip ${t.key}`}><i aria-hidden="true" />{t.label} {i === 0 ? `${t.min}+` : i === FLIP_TIERS.length - 1 ? `under ${FLIP_TIERS[i - 1].min}` : `${t.min}–${(FLIP_TIERS[i - 1].min - 0.1).toFixed(1)}`}</span>)}
        </span>
      </details>

      {fresh.length > 0 && (
        <section className="gf-new">
          <h2>✨ New to your list</h2>
          <p className="small muted">Cards that pass your filters now but didn&apos;t {NEW_DAYS} days ago.</p>
          <div className="gr-grid">{fresh.map((c) => <GradingTile key={`${c.productId}:${c.language}`} c={c} />)}</div>
          {cards.length > 0 && <h2 className="gf-all-head">All matches</h2>}
        </section>
      )}

      {cards.length > 0 ? (
        <div className="gr-grid">{cards.map((c) => <GradingTile key={`${c.productId}:${c.language}`} c={c} />)}</div>
      ) : fresh.length > 0 ? null : (
        <div className="panel gr-empty">
          <div className="gr-empty-icon" aria-hidden="true">🔎</div>
          <div className="gr-empty-text">
            <b>Nothing matches yet</b>
            <span className="muted">Try a lower profit, a higher raw price limit, including cards that need a {topShort}, or another grading company or grade.</span>
            {t.sales && <span className="muted small">{name} prices come from our own tracked eBay sales (2 or more in the last 90 days), so this list is short by nature.</span>}
          </div>
        </div>
      )}
      {remaining > 0 && opts.limit < 600 && (
        <div className="gf-more">
          <Link href={`?${moreParams}`} scroll={false} prefetch={false} className="btn">Load {Math.min(PAGE, remaining)} more</Link>
          <span className="small muted">{remaining.toLocaleString("en-US")} more {remaining === 1 ? "card matches" : "cards match"}</span>
        </div>
      )}

      <p className="hint">
        We check {checked.toLocaleString("en-US")} cards: every card members own, watch or have opened, with prices updated regularly.
        Graded prices are recent sales with enough data to trust; raw prices are TCGplayer Near Mint market. Grading fees are
        the graders&apos; published prices as of October 2026, and a card worth more than a level allows is priced at the level it
        needs. Older cards rarely come back a 10 (decades of handling, older printing), which is why we start on modern. No grade is guaranteed: check centering, corners, edges and surface before you buy, and raw copies sold as
        &quot;Near Mint&quot; aren&apos;t always.
      </p>
    </>
  );
}

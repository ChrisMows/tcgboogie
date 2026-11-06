import Link from "next/link";
import GradeFlipFilters from "@/components/GradeFlipFilters";
import { GradingTile } from "@/components/GradingCheck";
import { gradeLabel } from "@/lib/collection";
import { DEFAULT_SHIPPING, FLIP_CHECK, FLIP_FILTER_FIELDS, FLIP_FILTER_LIMIT, FLIP_TIERS, GRADE_TARGETS, GRADING_COMPANIES, MIN_PROFIT, targetId, targetName } from "@/lib/grading";
import { ERAS, NEW_DAYS, findGradingGaps, gradingGapCount } from "@/lib/grading-gap";
import { PLANS } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { getFlipFilters } from "@/lib/store";

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
  const query = await searchParams;
  const saved = await getFlipFilters(user.id);
  // A saved filter's tab uses its saved choices, until the member changes them and presses Find cards.
  const current = saved.find((f) => f.id === query?.f) || null;
  const creating = !current && query?.new === "1";
  const sp = current ? { ...current.params, ...query } : query;
  const target = targetId(sp?.grader);
  const t = GRADE_TARGETS[target];
  const { grader } = t;
  const co = GRADING_COMPANIES[grader];
  const name = targetName(target);
  const topShort = gradeLabel(grader, t.top);
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
  // + New filter starts from the search on screen.
  const newParams = new URLSearchParams(FLIP_FILTER_FIELDS.filter((k) => typeof sp?.[k] === "string" && sp[k]).map((k) => [k, sp[k]]));
  newParams.set("new", "1");
  // A card opens its own page, starting from this search's choices and able to come back to it.
  const backTo = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => typeof v === "string"));
  const flipLink = (c) => `/app/grade-and-flip/${encodeURIComponent(c.productId)}?${new URLSearchParams({
    t: target, tier: String(tier), ship: String(opts.shipping), ...(c.language === "japanese" ? { jp: "1" } : {}), from: backTo.toString() })}`;
  // What the filters are set to, including anything folded under More options.
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

      <nav className="tabs-row gf-tabs" aria-label="Saved filters">
        <Link href="/app/grade-and-flip" prefetch={false} className={!current && !creating ? "on" : ""}>Search</Link>
        {saved.map((f) => <Link key={f.id} href={`?f=${f.id}`} prefetch={false} className={current?.id === f.id ? "on" : ""}>{f.name}</Link>)}
        {saved.length < FLIP_FILTER_LIMIT && <Link href={`?${newParams}`} prefetch={false} className={creating ? "on" : ""}>+ New filter</Link>}
      </nav>

      <div className="panel gf-filter-box">
        <div className="gf-filter-sum"><b>{current ? current.name : creating ? "New filter" : "Filters"}</b><span className="small muted">{chosen}</span></div>
        <GradeFlipFilters key={JSON.stringify([opts, current?.id, current?.name, creating])} opts={opts} eras={Object.fromEntries(Object.entries(ERAS).map(([k, e]) => [k, e.label]))}
          filter={current ? { id: current.id, name: current.name } : null} creating={creating} />
      </div>

      <div className="gr-legend small muted">
        <span className="gr-eq">
          {total ? <><b>{total.toLocaleString("en-US")} {total === 1 ? "card" : "cards"}</b> found</> : "No cards found"} · profit = <b>{name} price</b> − <b>raw price</b> − <b>{fee(co.tiers[tier].fee)} grading + {money(opts.shipping)} shipping</b>
        </span>
        <span className="gr-score-tiers" aria-label="Flip Score colors">
          {FLIP_TIERS.map((t, i) => <span key={t.key} className={`gr-score-chip ${t.key}`} title={`Flip Score ${i === 0 ? `${t.min}+` : i === FLIP_TIERS.length - 1 ? `under ${FLIP_TIERS[i - 1].min}` : `${t.min}–${(FLIP_TIERS[i - 1].min - 0.1).toFixed(1)}`}`}><i aria-hidden="true" />{t.label}</span>)}
        </span>
      </div>

      <div className="notice small fd-check"><b>Double-check before you buy.</b> {FLIP_CHECK}</div>

      {fresh.length > 0 && (
        <section className="gf-new">
          <h2>✨ New to your list</h2>
          <p className="small muted">Cards that pass your filters now but didn&apos;t {NEW_DAYS} days ago.</p>
          <div className="gr-grid">{fresh.map((c) => <GradingTile key={`${c.productId}:${c.language}`} c={c} href={flipLink(c)} />)}</div>
          {cards.length > 0 && <h2 className="gf-all-head">All matches</h2>}
        </section>
      )}

      {cards.length > 0 ? (
        <div className="gr-grid">{cards.map((c) => <GradingTile key={`${c.productId}:${c.language}`} c={c} href={flipLink(c)} />)}</div>
      ) : fresh.length > 0 ? null : (
        <div className="panel gr-empty">
          <div className="gr-empty-icon" aria-hidden="true">🔎</div>
          <div className="gr-empty-text">
            <b>Nothing matches yet</b>
            <span className="muted">Try a lower profit, a higher raw price limit, including cards that need a {topShort}, or another grading company or grade.</span>
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

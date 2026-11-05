import RecentSales from "@/components/RecentSales";
import CopyButton from "@/components/CopyButton";
import ReportSale from "@/components/ReportSale";
import MissingPicture from "@/components/MissingPicture";
import SignatureButton from "@/components/SignatureButton";
import { setLabel } from "@/lib/sets";
import { GRADE_TARGETS, gradingCandidates, gradingMath } from "@/lib/grading";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardActions, { AddCardButton, CardAlertIcons } from "@/components/CardActions";
import Source from "@/components/Source";
import DealQuickCheck from "@/components/DealQuickCheck";
import CardThumb from "@/components/CardThumb";
import ValueChart from "@/components/ValueChart";
import { creditsLow, getProduct } from "@/lib/catalog";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { COND_SHORT, GRADERS, change, gradeLabel, gradeName, marketValue, money, nmPrice, pct, pokemonName } from "@/lib/collection";
import { slim } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { targetPrice } from "@/lib/watches";
import { cardSearchQuery, dealSoldSearch, ebayLink, ebaySearch } from "@/lib/ebay-link";
import { getDeal } from "@/lib/deals";
import { saleLine } from "@/lib/deal-outcome";

export async function generateMetadata({ params, searchParams }) {
  // Title from the cache only: this runs before the sign-in check, so it must never spend price-service credits.
  const language = (await searchParams)?.lang === "japanese" ? "japanese" : "english";
  const p = await getProduct((await params).id, { cachedOnly: true, language }).catch(() => null);
  return { title: p ? p.name : "Card" };
}

/** A grade key ("psa10", "bgs9_5", "cgc10_pristine", "bgs10_black", "cgc10_mixed") in parts: { grader, grade: "10 Gem Mint", rank: 10 }. */
const gradeParts = (key) => {
  const m = key.match(/^([a-z]+)(\d+)(?:[_ ](\d|pristine|black|mixed))?$/i);
  if (!m) return { grader: key.toUpperCase(), grade: key, rank: 0 };
  const grader = GRADERS.find((g) => g.toLowerCase() === m[1].toLowerCase()) || m[1].toUpperCase();
  if (/mixed/i.test(m[3] || "")) return { grader, grade: `${m[2]} (either label)`, rank: Number(m[2]) };
  const label = /pristine/i.test(m[3] || "") ? ["Pristine", 0.25] : /black/i.test(m[3] || "") ? ["Black Label", 0.5] : null;
  return { grader, grade: gradeLabel(grader, label ? `${m[2]} ${label[0]}` : `${m[2]}${m[3] ? `.${m[3]}` : ""}`), rank: Number(m[2]) + (label ? label[1] : m[3] ? Number(m[3]) / 10 : 0) };
};
const GRADE_LABEL = (key) => { const g = gradeParts(key); return g.rank ? `${g.grader} ${g.grade}` : key; };
const MAIN_GRADERS = ["PSA", "CGC", "BGS"];
const GRADER_ORDER = ["PSA", "CGC", "BGS", "SGC", "TAG", "ACE"]; // then any others, A-Z
const graderRank = (g) => { const i = GRADER_ORDER.indexOf(g); return i < 0 ? GRADER_ORDER.length : i; };

const LANGUAGE = { japanese: "Japanese", korean: "Korean", chinese: "Chinese", other: "Other language" };

// Best to worst: Near Mint first, Damaged last.
const COND_ORDER = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const condRank = (c) => (COND_ORDER.indexOf(c) + 1) || 99;

const saleNote = (g) => {
  const n = g.sales ? `${g.approx ? "About " : ""}${g.sales} sale${g.sales === 1 ? "" : "s"} in 90 days` : "";
  const last = g.lastSale ? `last ${new Date(`${g.lastSale}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: new Date(g.lastSale).getFullYear() === new Date().getFullYear() ? undefined : "numeric", day: new Date(g.lastSale).getFullYear() === new Date().getFullYear() ? "numeric" : undefined })}` : "";
  const range = g.low && g.high && g.low !== g.high ? `$${Math.round(g.low).toLocaleString()}–$${Math.round(g.high).toLocaleString()}` : "";
  return [n, range, last].filter(Boolean).join(" · ");
};

/** The eBay listing this page was opened from: price, time left, warnings, and the way to the listing. */
function DealBox({ deal: d, premium }) {
  // A live listing opens itself; an ended one opens eBay's sold listings for this card and grade, because eBay sends
  // an ended listing's own link to a general product page showing other listings.
  const link = d.ended ? dealSoldSearch(d, "card-page-deal-sold") : ebayLink(d.url, "card-page-deal");
  const grade = d.kind === "sealed" ? "Sealed" : d.kind === "raw" ? `Raw ${d.condition}` : gradeName(d.grader, d.gradeText || d.grade);
  const live = !d.ended;
  return (
    <div className={`deal-box ${live ? "live" : "ended"}`}>
      <div className="deal-box-head">
        <span className="badge accent">{live ? "⚡ Live deal" : "Deal ended"}</span>
        {d.photoCheck === "match" && <span className="badge good" title="We compared the listing photos with this card">✓ Photo checked</span>}
        <span className="small muted">{grade}{d.language === "japanese" ? " · Japanese" : ""}</span>
      </div>
      <div className="deal-box-price">
        <b>{money(live ? d.total : d.soldFor ?? d.lastBid)}</b>
        <span className="muted">{live ? "with shipping" : d.soldFor ? "sold for, with shipping" : d.sold === false ? "last bid · didn't sell" : "last bid we saw"}</span>
        <span className="deal-box-off">
          {Math.round(!live && d.soldFor && d.marketValue ? (1 - d.soldFor / d.marketValue) * 100 : d.discountPct)}% below {money(d.marketValue)}
        </span>
      </div>
      <div className="small muted">
        {live ? `About ${d.minutesLeft} min left` : saleLine(d) || `Ended ${new Date(d.endsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
        {d.comps ? ` · value from ${d.comps} recent sales` : ""}
      </div>
      {d.flags?.length > 0 && <ul className="deal-box-flags">{d.flags.map((f) => <li key={f}>⚠ {f}</li>)}</ul>}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <a className="btn primary" style={{ flex: "none" }} href={link.href} target="_blank" rel={`noopener noreferrer${link.affiliate ? " sponsored" : ""}`}>
          {live ? "Open listing on eBay ↗" : "See this sale on eBay ↗"}
        </a>
        {!premium && live && <span className="small muted" style={{ flex: "1 1 200px" }}>Premium members get deals like this the moment we find them.</span>}
      </div>
    </div>
  );
}

export default async function CardPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  let language = sp?.lang === "japanese" ? "japanese" : "english";
  // Signed out (e.g. tapped a deal alert): sign in, then come straight back to this deal.
  const back = `/app/cards/${encodeURIComponent(id)}${sp?.deal ? `?deal=${encodeURIComponent(sp.deal)}${language === "japanese" ? "&lang=japanese" : ""}${sp?.from === "alert" ? "&from=alert" : ""}` : ""}`;
  const user = await requireUser(back);
  let product = await getProduct(id, { cachedOnly: true, language }).catch(() => null);
  let savedOnly = false; // showing the last saved prices instead of buying a fresh lookup (a limit was reached)
  // A card page is one lookup at most (never a burst), so a stale saved price is refreshed here; members' own cards are
  // usually fresh already (the deal bot refreshes them in the background, dealfinder/refresh.py).
  if (product === undefined) {
    if (!await allow("cardPage", user.id)) return <div className="notice warn">{SLOW_DOWN}</div>;
    // A member's daily allowance, the website's own daily budget and today's credits left, so no one (or many
    // accounts together) can spend the price credits deal-finding needs.
    if (await allow("cardPageDay", user.id) && await allow("siteLookups", "site") && !await creditsLow()) {
      try { product = await getProduct(id, { language }); } catch { product = null; }
    } else {
      savedOnly = true;
      product = await getProduct(id, { cachedOnly: true, anyAge: true, language }).catch(() => null);
      if (product === undefined) return <div className="notice warn">We can&apos;t look up new card prices right now. Please try this card again tomorrow.</div>;
    }
  }
  if (product === null) notFound();
  const p = slim(product);
  // "Charizard ex 199/165 · Scarlet & Violet 151" (the number isn't repeated when the name already has it).
  const copyText = [p.number && !p.name.includes(p.number) ? `${p.name} ${p.number}` : p.name, p.setName && setLabel(p.setName).name]
    .filter(Boolean).join(" · ");
  if (p.language === "japanese") language = "japanese"; // found in the Japanese catalog without ?lang=
  // Opened from a deal: show that listing on top (only if it's this card).
  const dealId = (await searchParams)?.deal;
  const found = dealId ? await getDeal(dealId).catch(() => null) : null;
  const deal = found && String(found.productId) === String(p.id) ? found : null;
  const [items, binders, watches, profiles, showcase] = await Promise.all([store.listItems(user.id), store.listBinders(user.id), store.listWatches(user.id), store.listProfiles(user.id), store.getShowcase(user.id)]);
  // A deal filter that already picks this card: the lightning then links to it instead of opening the quick setup.
  const dealFilter = profiles.some((pr) => (pr.filters?.cards || []).some((c) => String(c.productId) === String(p.id)));
  // Value your copies from today's prices (the saved value can lag behind).
  const mine = items.filter((it) => it.productId === p.id).map((it) => ({
    ...it, unitValue: marketValue(p, it) ?? it.unitValue, createdAt: String(it.createdAt), valueUpdatedAt: null,
  }));
  const watch = watches.find((w) => w.productId === p.id);
  const now = p.type === "sealed" ? p.prices?.market : nmPrice(p);
  const printings = p.type === "card" ? Object.entries(p.prices || {}) : [];
  // Graded: PSA, then CGC, BGS, SGC, TAG, ACE; highest grade first ("CGC 10 Pristine" just above "CGC 10"). Thin/stale
  // data goes in its own, clearly marked group.
  const gradeSort = ([a], [b]) => {
    const [pa, pb] = [gradeParts(a), gradeParts(b)];
    return graderRank(pa.grader) - graderRank(pb.grader) || pa.grader.localeCompare(pb.grader) || pb.rank - pa.rank;
  };
  const allGraded = Object.entries(p.graded || {}).sort(gradeSort);
  const graded = allGraded.filter(([, g]) => g.reliable !== false);
  const thinGraded = allGraded.filter(([, g]) => g.reliable === false);
  // One row per grading company, for the Graded section (already in order).
  const gradedRows = [];
  for (const entry of graded) {
    const { grader } = gradeParts(entry[0]);
    if (gradedRows.at(-1)?.grader === grader) gradedRows.at(-1).cells.push(entry);
    else gradedRows.push({ grader, cells: [entry] });
  }
  const isSealed = p.type === "sealed";
  const filterHref = `/app/deals?${new URLSearchParams({ pokemon: pokemonName(p.name), ...(p.setName ? { set: p.setName } : {}) })}`;
  // Special prints (Prize Pack, prerelease stamps...) add their words, so eBay doesn't show the regular card instead.
  const ebayQuery = p.topps ? p.topps.query : cardSearchQuery({ name: p.name, number: p.number, setName: p.setName, language });
  const ebay = ebaySearch(ebayQuery, { sealed: isSealed, source: "card-page" });
  const ebaySold = ebaySearch(ebayQuery, { sold: true, sealed: isSealed, source: "card-page-sold" });
  // Sold searches per grade ("… PSA 10"), for the graded cells.
  const gradeSold = (key) => ebaySearch(`${ebayQuery} ${GRADE_LABEL(key)}`, { sold: true, source: "card-page-sold-graded" });
  // Arrived from a deal alert and the auction is still open: the quick-check pop-up (listing + recent sales).
  const quick = deal && !deal.ended && sp?.from === "alert" ? {
    listing: ebayLink(deal.url, "deal-quick-listing"),
    sold: ebaySearch(`${ebayQuery}${deal.kind === "graded" ? ` ${deal.grader} ${deal.gradeText || deal.grade}` : ""}`, { sold: true, source: "deal-quick-sold" }),
  } : null;

  // Raw condition prices link to that condition's live listings on TCGplayer (Topps cards: the eBay listings).
  const tcgListings = (printing, cond) => {
    if (p.topps) return ebay.href;
    const u = new URL(p.tcgplayerUrl);
    u.searchParams.set("Language", "English");
    if (printing) u.searchParams.set("Printing", printing);
    u.searchParams.set("Condition", cond);
    return u.toString();
  };
  const owned = mine.filter((it) => it.list === "owned").reduce((n, it) => n + it.quantity, 0);
  const wished = mine.some((it) => it.list === "wishlist");
  // Signature card (Profile): the copy already picked, else the most valuable copy you own.
  const ownedCopies = mine.filter((it) => it.list === "owned").sort((a, b) => (b.unitValue ?? -1) - (a.unitValue ?? -1));
  const ownedIds = new Set(items.filter((it) => it.list === "owned").map((it) => it.id));
  const signatureIds = showcase.items.filter((id) => ownedIds.has(id));
  const sigCopy = ownedCopies.find((it) => signatureIds.includes(it.id)) || ownedCopies[0] || null;
  const gradeIdea = (() => {
    // The grader that pays best at its cheapest tier.
    const [c] = gradingCandidates(mine.filter((it) => it.list === "owned"), { [p.id]: p });
    if (!c) return null;
    const options = Object.keys(GRADE_TARGETS).map((id) => gradingMath(c, id, 0))
      .filter(Boolean).sort((a, b) => b.profit10 - a.profit10);
    return options[0] || null;
  })();
  // Sell on eBay (Premium, English cards you own): with the other eBay buttons on the prices panel, for your first copy.
  const sellItem = user.plan.sellOnEbay && p.type === "card" && language !== "japanese" ? mine.find((it) => it.list === "owned" && it.kind !== "sealed") : null;

  // Live listings and sold listings on eBay, under the sales.
  const ebayLinks = (
    <div className="ebay-links">
      {sellItem && (
        <Link href={`/app/collection/sell/${sellItem.id}`} className="btn ebay-btn sell" data-tour="sell-open" title="List your copy on eBay with the details filled in">
          <Source name="ebay" className="src-sm" /> Sell on eBay
        </Link>
      )}
      {ebay && <a href={ebay.href} target="_blank" rel={`noopener noreferrer${ebay.affiliate ? " sponsored" : ""}`} className="btn ebay-btn live"
        title="Live eBay listings and auctions for this card">
        <Source name="ebay" className="src-sm" /> <span className="live-dot" aria-hidden="true" />Live listings ↗
      </a>}
      {ebaySold && <a href={ebaySold.href} target="_blank" rel={`noopener noreferrer${ebaySold.affiliate ? " sponsored" : ""}`} className="btn ebay-btn sold"
        title="eBay sold and completed listings for this card, most recent first">
        <Source name="ebay" className="src-sm" /> Recent sales ↗
      </a>}
    </div>
  );

  const commission = ebay?.affiliate || ebaySold?.affiliate ? " eBay links may earn us a commission." : "";

  // The top of the page: the name without the " - 151/128" our price data adds (the number sits beside it), and the
  // add button, which sits to the right of the price (or under the note when there's no price).
  const shownName = p.number ? p.name.split(` - ${p.number}`).join("") : p.name;
  const addButton = wished ? null : <AddCardButton label={owned ? "+ Another Card" : "+ Add to collection"} />;
  const addRow = addButton && <div className="hero-add-row">{addButton}</div>;
  const details = [p.rarity && p.rarity !== "None" ? p.rarity : null, isSealed ? "Sealed product" : null, LANGUAGE[p.language || language]].filter(Boolean);

  // Graded: PSA, CGC and BGS always show; the smaller grading companies stay folded behind a plus.
  const mainGradeRows = gradedRows.filter((r) => MAIN_GRADERS.includes(r.grader));
  const moreGradeRows = gradedRows.filter((r) => !MAIN_GRADERS.includes(r.grader));
  const gradeRow = ({ grader, cells }) => (
    <div key={grader} className="grade-row">
      <span className="grade-row-name">{grader}</span>
      <div className="cond-grid">
        {cells.map(([key, g]) => (
          <a key={key} className={`cond-cell cond-link ${g.few ? "few" : ""}`} href={gradeSold(key).href} target="_blank"
            rel={`noopener noreferrer${gradeSold(key).affiliate ? " sponsored" : ""}`} title={`${saleNote(g)}. See ${GRADE_LABEL(key)} sold listings on eBay`}
            aria-label={`${GRADE_LABEL(key)}: ${money(g.price, 0)}`}>
            <span className="small muted">{gradeParts(key).rank ? gradeParts(key).grade : GRADE_LABEL(key)}</span><b>{money(g.price, 0)}</b>
            <span className={g.few ? "few-tag" : "grade-sales"}>{g.few ? "Few sales" : g.sales ? `${g.approx ? "~" : ""}${g.sales} sale${g.sales === 1 ? "" : "s"}` : ""}</span>
          </a>
        ))}
      </div>
    </div>
  );

  // Under the chart. With a chart this is its own row, so the chart can end level with the buttons under the picture.
  const hasChart = !p.topps && !p.memberAdded;
  const belowChart = (
    <>
      {deal && <DealBox deal={deal} premium={Boolean(user.plan.liveFeed)} />}
      {quick && <DealQuickCheck deal={deal} listingHref={quick.listing.href} soldHref={quick.sold.href} affiliate={quick.listing.affiliate || quick.sold.affiliate} />}
      {gradeIdea && gradeIdea.verdict !== "skip" && (
        <Link href="/app/collection/grading" className="grade-idea">
          💎 Worth grading? A {gradeIdea.topName} sells for about {money(gradeIdea.top, 0)}: roughly {money(gradeIdea.profit10, 0)} profit on your raw copy after {money(gradeIdea.cost, 0)} grading and shipping.
          {gradeIdea.verdict === "safe" ? " Even a grade lower would cover it." : ` Only pays if it gets a ${gradeIdea.topShort}.`} →
        </Link>
      )}
      <div className="card-hero-side">
        {sigCopy && <SignatureButton itemId={sigCopy.id} on={signatureIds.includes(sigCopy.id)} full={signatureIds.length >= store.SIGNATURE_MAX} />}
        <CardActions product={p} mine={mine} binders={binders} watch={watch ? { id: watch.id, mode: watch.mode, target: targetPrice(watch), status: watch.status } : null}
          plan={user.plan} price={now} dealFilter={dealFilter} filterHref={filterHref} />
      </div>
    </>
  );

  return (
    <>
      <div className="crumbs">
        <Link href="/app/collection">Collection</Link> /{" "}
        {p.setName && language !== "japanese" ? <><Link href={`/app/collection/sets/${encodeURIComponent(p.setName)}`}>{setLabel(p.setName).name}</Link> / </> : null}
        {p.name.replace(/\s*\(.*\)$/, "")}
      </div>

      {savedOnly && <div className="notice">Showing the last prices we saved for this card. Fresh prices will be back shortly.</div>}
      <div className="card-hero">
        <div className="card-hero-left">
          <div className="card-hero-art"><CardThumb item={p} width={260} /></div>
          <div className="card-report-row">
            <MissingPicture productId={p.id} language={p.language || language} />
            {!isSealed && (
              <span className="price-wrong">
                <a href="#report-sale" className="btn price-wrong-btn" title="Seen it sell for more or less? Show us the sale and we'll update the value.">🏷️ Price wrong?</a>
              </span>
            )}
          </div>
        </div>
        <div className="card-hero-info">
          <div className="card-name-row">
            <h1>{shownName}{p.number ? <span className="card-title-no"> #{p.number}</span> : null} <CopyButton text={copyText} label="Copy card name, number and set" /></h1>
            <CardAlertIcons watch={watch ? { mode: watch.mode, target: targetPrice(watch), status: watch.status } : null} deals={p.type === "card"} dealFilter={dealFilter} wished={wished} canWish={owned === 0} />
          </div>
          <div className="card-sub">
            {p.setName && <span className="card-sub-set">{language === "japanese" ? p.setName : <Link href={`/app/collection/sets/${encodeURIComponent(p.setName)}`}>{setLabel(p.setName).name}</Link>}</span>}
            {details.map((d) => <span key={d} className="muted">{d}</span>)}
          </div>
          {p.topps && !now ? (
            <>
              <div className="notice no-price">
                <b>No eBay price yet</b> for this Topps card. We check eBay&apos;s current listings every few days{p.topps.checkedAt ? " and didn't find enough of this card last time" : ""}, so you
                can add it to your collection with your own value in the meantime.
              </div>
              {addRow}
            </>
          ) : p.topps ? (
            <div className="chart-lead">
              <div className="hero-price">
                <span className="small muted">Typical eBay asking price · raw Near Mint</span>
                <b>{money(now)}</b>
                <span className="small muted">From {p.topps.listings} current listings{p.topps.low && p.topps.high ? ` (${money(p.topps.low)} to ${money(p.topps.high)})` : ""}</span>
              </div>
              {addButton}
            </div>
          ) : p.memberAdded ? (
            <>
              <div className="notice no-price">
                <b>No pricing data available</b> for this card yet. A member added it and our price service doesn&apos;t cover it,
                so you can still add it to your collection with your own value, set price alerts and report sales you see.
              </div>
              {addRow}
            </>
          ) : (
            <div className="hero-chart">
              <ValueChart points={(p.history || []).map((h) => ({ day: h.date, value: h.price }))} historyDays={null} current={now}
                label={isSealed ? "Market price" : "Raw Near Mint market price"} height={270} shared detailed action={addButton} />
            </div>
          )}
          {!hasChart && belowChart}
        </div>
        {hasChart && <div className="card-hero-below">{belowChart}</div>}
      </div>

      <div className="panel card-prices">
        <div className="prices-head">
          <h2>Prices and Sales</h2>
          {ebayLinks}
        </div>
        {isSealed ? (
          <div className="price-col">
            <p className="muted" style={{ margin: 0 }}>Sealed product. Prices from TCGplayer, updated daily.</p>
          </div>
        ) : (
          <>
            <div className="price-col price-main">
              <h3>Raw</h3>
              {printings.length === 0 && <p className="small muted" style={{ margin: 0 }}>No pricing data available for this card.</p>}
              {printings.map(([printing, byCond]) => (
                <div key={printing} className="price-group">
                  {printings.length > 1 && <div className="small muted">{printing}</div>}
                  <div className="cond-grid">
                    {Object.entries(byCond).sort(([a], [b]) => condRank(a) - condRank(b)).map(([cond, v]) => (
                      <a key={cond} className="cond-cell cond-link" href={tcgListings(printing, cond)} target="_blank" rel="noopener noreferrer"
                        title={`See ${cond} listings on ${p.topps ? "eBay" : "TCGplayer"}`}>
                        <span className="small muted">{COND_SHORT[cond] || cond}</span><b>{money(v.market)}</b>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              <h3 className="price-sub">Graded</h3>
              {graded.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Not enough recent graded sales to price this card.</p> : (
                <div className="grade-rows">
                  {mainGradeRows.map(gradeRow)}
                  {moreGradeRows.length > 0 && (
                    <details className="more-grades" open={mainGradeRows.length === 0}>
                      <summary><span className="more-grades-icon" aria-hidden="true" />{moreGradeRows.map((r) => r.grader).join(", ")}</summary>
                      <div className="grade-rows">{moreGradeRows.map(gradeRow)}</div>
                    </details>
                  )}
                </div>
              )}
              {thinGraded.length > 0 && (
                <details className="thin-grades">
                  <summary>No recent sales: {thinGraded.map(([k]) => GRADE_LABEL(k)).join(", ")}</summary>
                  <p className="small muted" style={{ margin: "6px 0 8px" }}>These grades haven&apos;t sold in 90 days, so their old figures are shown for reference only and aren&apos;t used for your collection value.</p>
                  <div className="cond-grid">
                    {thinGraded.map(([key, g]) => (
                      <div key={key} className="cond-cell thin" title={saleNote(g)}>
                        <span className="small muted">{GRADE_LABEL(key)}</span><b>{money(g.price, 0)}</b>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="price-col">
              <h3>Recent graded sales</h3>
              {(p.recentSales || []).length > 0 ? (
                <RecentSales label={null}
                  sales={p.recentSales.map((s) => ({
                    key: `${s.grade}-${s.date}-${s.price}`, date: s.date, grade: GRADE_LABEL(s.grade), price: s.price, count: s.count,
                    href: s.source === "ebay" && s.url ? ebayLink(s.url, "card-page-sale").href : null,
                  }))} />
              ) : <p className="small muted" style={{ margin: 0 }}>No individual sales to list yet.</p>}
              {user.plan.reportSales && <ReportSale productId={p.id} language={language} />}
            </div>
          </>
        )}
        <div className="price-foot">
          {p.topps ? (
            <p className="hint">
              A Topps Pokémon card ({p.topps.year}), not a Pokémon TCG card. Its value is the typical asking price of current eBay Buy It Now
              listings for a raw copy{p.topps.checkedAt ? `, checked ${new Date(p.topps.checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}.
              Asking prices, not sold prices: check sold listings before you buy or sell. Graded copies keep the value you enter.{commission}
            </p>
          ) : p.memberAdded ? (
            <p className="hint">
              Added by a member from <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">this page ↗</a>. Graded values appear once sales are reported.{commission}
            </p>
          ) : <p className="hint">
            Raw prices from TCGplayer. Graded values are the median of the last 90 days of sales (eBay and Fanatics Collect, plus eBay sales we verify ourselves), newer sales counting more.{" "}
            <a href={p.tcgplayerUrl} target="_blank" rel="noopener noreferrer sponsored">View on TCGplayer ↗</a>{commission}
          </p>}
        </div>
      </div>
    </>
  );
}

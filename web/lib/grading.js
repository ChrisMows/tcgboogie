// "Is this card worth grading?" Raw Near Mint copies you own, compared with what the same card sells for graded
// (recent sales, reliable data only) at the grader and service level you pick. Shared by the server (finding
// candidates) and the page (re-working the numbers when the member changes grader, service level or shipping).

export const MIN_PROFIT = 25; // below this a top grade isn't worth the wait and the risk
export const DEFAULT_SHIPPING = 5; // rough per-card share of insured shipping both ways and supplies

// Each grader's top everyday grade and the one below it (BGS's usual top is a 9.5 Gem Mint; its 10s are rare), and
// its open service levels for trading cards, cheapest first: fee per card, rough turnaround (business days), the
// highest card value the level accepts (null = no cap or not published; TAG's fee doesn't depend on value) and any
// minimum card count. Prices as published in October
// 2026; graders change them often (PSA's Value levels and SGC's old $15 level are paused or gone), so members can
// also type their own price.
export const GRADING_COMPANIES = {
  PSA: { top: "10", next: "9", tiers: [
    { name: "Standard", fee: 59.99, days: "90–100", max: 1000 },
    { name: "Priority", fee: 79.99, days: "70–80", max: 1500 },
    { name: "Express", fee: 199, days: "20–30", max: 2500 },
    { name: "Super Express", fee: 349, days: null, max: 5000 },
    { name: "Premier", fee: 599, days: "7–10", max: 10000 },
  ] },
  BGS: { top: "9.5", next: "9", tiers: [
    { name: "Base", fee: 17.95, days: "75+", max: 250 },
    { name: "Standard", fee: 34.95, days: "45", max: 1000 },
    { name: "Express", fee: 79.95, days: "15", max: 2500 },
    { name: "Priority", fee: 124.95, days: "5", max: 5000 },
  ] },
  CGC: { top: "10", next: "9", tiers: [
    { name: "Bulk", fee: 17, days: "120–150", max: 500, min: 25 },
    { name: "Economy", fee: 20, days: "65–90", max: null },
    { name: "Standard", fee: 55, days: "10", max: null },
    { name: "Express", fee: 100, days: "5", max: null },
    { name: "WalkThrough", fee: 300, days: "2", max: null },
  ] },
  SGC: { top: "10", next: "9", tiers: [
    { name: "Standard", fee: 50, days: "40+", max: 1500 },
    { name: "Standard (up to $3,500)", fee: 85, days: "40+", max: 3500 },
    { name: "Expedited", fee: 150, days: "2–3", max: 3500 },
  ] },
  TAG: { top: "10", next: "9", tiers: [
    { name: "Base", fee: 39.95, days: "60", max: null, min: 5 },
    { name: "Standard", fee: 59.95, days: null, max: null },
    { name: "Priority", fee: 79.95, days: null, max: null },
    { name: "Express", fee: 149.95, days: null, max: null },
    { name: "Premier", fee: 299.95, days: "3–5", max: null },
  ] },
};

// Grade & Flip's Flip Score, 0 to 100: how good an opportunity a card is, out of these points.
export const FLIP_POINTS = { profit: 30, return: 20, safety: 30, demand: 20 };
export const FLIP_TIERS = [
  { key: "excellent", label: "Excellent", min: 80 },
  { key: "strong", label: "Strong", min: 65 },
  { key: "good", label: "Good", min: 50 },
  { key: "fair", label: "Fair", min: 35 },
  { key: "long", label: "Long shot", min: 0 },
];
const THIN_SALES = 5; // fewer top-grade sales than this in 90 days can't score Excellent: the price rests on too little
const scale = (v, lo, hi) => Math.max(0, Math.min(1, Math.log(Math.max(v, 1e-9) / lo) / Math.log(hi / lo))); // on a log scale, so $100 to $200 counts as much as $1,000 to $2,000

/**
 * The Flip Score for gradingMath's numbers. Profit runs from $25 to $2,000, return (profit / raw price + grading) from 25%
 * to 800%, demand from 3 to 100 top-grade sales in 90 days. Safety is what the grade below the top leaves on the money
 * spent: losing it all scores 0, breaking even half, doubling it full marks, and no recent sales of that grade a low 15%.
 * Ranges checked on the live data, Nov 2026. Returns { score, tier, parts } (parts: the points each one earned).
 */
export function flipScore({ raw, cost, profit10, profit9 }, topSales) {
  const spend = raw + cost;
  const left = profit9 === null ? null : profit9 / spend;
  const safety = left === null ? 0.15 : left < 0 ? 0.5 * (1 + left) : 0.5 + 0.5 * Math.min(1, left);
  const parts = {
    profit: Math.round(FLIP_POINTS.profit * scale(profit10, 25, 2000)),
    return: Math.round(FLIP_POINTS.return * scale(profit10 / spend, 0.25, 8)),
    safety: Math.round(FLIP_POINTS.safety * Math.max(0, safety)),
    demand: Math.round(FLIP_POINTS.demand * scale(topSales ?? 0, 3, 100)),
  };
  const total = parts.profit + parts.return + parts.safety + parts.demand;
  const score = (topSales ?? 0) < THIN_SALES ? Math.min(total, FLIP_TIERS[0].min - 1) : total;
  return { score, tier: FLIP_TIERS.find((t) => score >= t.min), parts };
}

const keyOf = (grader, grade) => `${grader.toLowerCase()}${grade.replace(".", "_")}`;
const reliable = (g) => (g && g.reliable !== false && g.price ? g.price : null);

/**
 * What grading one card costs: the chosen service level, moved up to the cheapest level that accepts the card's
 * graded value if it's over the cap, plus shipping. own: the member's own fee instead (no cap check).
 * Returns { cost, tier, bumped } (tier is null when the member typed their own fee).
 */
export function gradingCost(grader, tierIndex, value, { own = null, shipping = DEFAULT_SHIPPING } = {}) {
  if (own !== null) return { cost: own + shipping, tier: null, bumped: false };
  const tiers = GRADING_COMPANIES[grader].tiers;
  let i = Math.min(tierIndex, tiers.length - 1);
  while (i < tiers.length - 1 && tiers[i].max !== null && value > tiers[i].max) i++;
  return { cost: tiers[i].fee + shipping, tier: tiers[i], bumped: i !== tierIndex };
}

/** Every raw Near Mint card a member owns with a raw price: [{ ..., raw, grades: { PSA: { top, next }, ... } }]. */
export function gradingCandidates(owned, products) {
  const out = [];
  const seen = new Set();
  for (const it of owned) {
    if (it.kind !== "raw" || it.productType !== "card" || it.condition !== "Near Mint") continue;
    const key = `${it.productId}:${it.printing || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = products[it.productId];
    const raw = p?.prices?.[it.printing]?.["Near Mint"]?.market ?? p?.prices?.[Object.keys(p?.prices || {})[0]]?.["Near Mint"]?.market;
    if (!raw) continue;
    const grades = {};
    for (const [g, co] of Object.entries(GRADING_COMPANIES)) {
      grades[g] = { top: reliable(p?.graded?.[keyOf(g, co.top)]), next: reliable(p?.graded?.[keyOf(g, co.next)]) };
    }
    const copies = owned.filter((x) => x.productId === it.productId && x.kind === "raw" && x.condition === "Near Mint").reduce((n, x) => n + x.quantity, 0);
    out.push({ productId: it.productId, name: it.name, setName: it.setName, number: it.number, image: it.image, printing: it.printing, copies, raw, grades });
  }
  return out;
}

/**
 * The numbers for one card at a grader and service level, or null when that grader has no reliable top-grade sales
 * for it. verdict: "safe" (the next grade down still pays), "needs10" (only the top grade pays), or "skip".
 */
export function gradingMath(c, grader = "PSA", tierIndex = 0, opts = {}) {
  const g = c.grades?.[grader];
  if (!g?.top) return null;
  const { cost, tier, bumped } = gradingCost(grader, tierIndex, g.top, opts);
  const profit10 = g.top - c.raw - cost;
  const profit9 = g.next !== null ? g.next - c.raw - cost : null;
  const verdict = profit10 < MIN_PROFIT ? "skip" : profit9 !== null && profit9 >= 0 ? "safe" : "needs10";
  return { grader, top: g.top, next: g.next, cost, tier, bumped, profit10, profit9, verdict };
}

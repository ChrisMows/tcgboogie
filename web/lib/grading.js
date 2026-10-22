// "Is this card worth grading?" Raw Near Mint copies you own, compared with what the same card sells for graded
// (recent sales, reliable data only) at the grader you pick. Shared by the server (finding candidates) and the page
// (re-working the numbers when the member changes grader or cost).

export const DEFAULT_GRADING_COST = 30; // PSA's cheapest tier plus shipping both ways, per card
export const MIN_PROFIT = 25; // below this a top grade isn't worth the wait and the risk

// Each grader's top everyday grade and the one below it (BGS's usual top is a 9.5 Gem Mint; its 10s are rare), with
// rough per-card costs including shipping both ways. Members can type their own cost.
export const GRADING_COMPANIES = {
  PSA: { top: "10", next: "9", tiers: [["Value", 30], ["Regular", 85], ["Express", 160]] },
  BGS: { top: "9.5", next: "9", tiers: [["Base", 35], ["Standard", 65], ["Express", 135]] },
  CGC: { top: "10", next: "9", tiers: [["Bulk", 25], ["Standard", 40], ["Express", 90]] },
  SGC: { top: "10", next: "9", tiers: [["Bulk", 25], ["Standard", 45], ["Express", 110]] },
  TAG: { top: "10", next: "9", tiers: [["Basic", 25], ["Standard", 50], ["Express", 100]] },
};

const keyOf = (grader, grade) => `${grader.toLowerCase()}${grade.replace(".", "_")}`;
const reliable = (g) => (g && g.reliable !== false && g.price ? g.price : null);

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
 * The numbers for one card at a grader and cost, or null when that grader has no reliable top-grade sales for it.
 * verdict: "safe" (the next grade down still pays), "needs10" (only the top grade pays), or "skip".
 */
export function gradingMath(c, cost = DEFAULT_GRADING_COST, grader = "PSA") {
  const g = c.grades?.[grader];
  if (!g?.top) return null;
  const profit10 = g.top - c.raw - cost;
  const profit9 = g.next !== null ? g.next - c.raw - cost : null;
  const verdict = profit10 < MIN_PROFIT ? "skip" : profit9 !== null && profit9 >= 0 ? "safe" : "needs10";
  return { grader, top: g.top, next: g.next, profit10, profit9, verdict };
}

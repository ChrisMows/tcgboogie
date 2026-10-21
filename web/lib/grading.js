// "Is this card worth grading?" Raw Near Mint copies you own, compared with what the same card sells for as a PSA 10
// and PSA 9 (recent sales, reliable data only). Shared by the server (finding candidates) and the page (re-working
// the numbers when the member changes the grading cost).

export const DEFAULT_GRADING_COST = 30; // PSA's cheapest tier plus shipping both ways, per card
export const MIN_PROFIT = 25; // below this a PSA 10 isn't worth the wait and the risk

/** Candidates from a member's owned items and their products: [{ item, raw, psa10, psa9, sales10 }]. */
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
    const g10 = p?.graded?.psa10, g9 = p?.graded?.psa9;
    if (!raw || !g10 || g10.reliable === false) continue;
    const copies = owned.filter((x) => x.productId === it.productId && x.kind === "raw" && x.condition === "Near Mint").reduce((n, x) => n + x.quantity, 0);
    out.push({
      productId: it.productId, name: it.name, setName: it.setName, number: it.number, image: it.image, printing: it.printing, copies,
      raw, psa10: g10.price, sales10: g10.sales ?? null, psa9: g9 && g9.reliable !== false ? g9.price : null,
    });
  }
  return out;
}

/** The numbers for one card at a given grading cost. verdict: "safe" (a 9 still pays), "needs10", or "skip". */
export function gradingMath(c, cost = DEFAULT_GRADING_COST) {
  const profit10 = c.psa10 - c.raw - cost;
  const profit9 = c.psa9 !== null ? c.psa9 - c.raw - cost : null;
  const verdict = profit10 < MIN_PROFIT ? "skip" : profit9 !== null && profit9 >= 0 ? "safe" : "needs10";
  return { profit10, profit9, verdict };
}

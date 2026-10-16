// Price watches: a member picks a TCGplayer card or sealed product and a target price. We check its TCGplayer price
// a few times a day (prices update about daily) and, for cards, also watch eBay live for listings at or under the target.

export const PRICE_TYPES = {
  market: { label: "Market price", hint: "TCGplayer's price based on recent sales. Best for tracking the trend." },
  low: { label: "Lowest listing", hint: "The cheapest copy listed on TCGplayer right now. Closest to what you'd pay." },
};
export const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

/** "https://www.tcgplayer.com/product/246723/pokemon-..." or "246723" -> "246723" (null if not recognised). */
export function parseTcgplayerInput(text) {
  const s = String(text || "").trim();
  if (/^\d{3,9}$/.test(s)) return s;
  const m = s.match(/tcgplayer\.com\/(?:[a-z-]+\/)?product\/(\d{3,9})/i);
  return m ? m[1] : null;
}

export const watchLimit = (plan) => plan.maxPriceWatches; // null = unlimited
export const atWatchLimit = (plan, count) => plan.maxPriceWatches !== null && count >= plan.maxPriceWatches;

/** The current price this watch tracks, from a product's price table. */
export function currentPrice(product, watch) {
  if (!product) return null;
  if (product.type === "sealed") return product.prices?.[watch.priceType] ?? null;
  return product.prices?.[watch.printing]?.[watch.condition]?.[watch.priceType] ?? null;
}

/** The price at which a watch fires. */
export function targetPrice(watch) {
  if (watch.mode === "drop") return Math.round(watch.basePrice * (1 - watch.dropPct / 100) * 100) / 100;
  return watch.targetPrice;
}

export function isTriggered(watch, price) {
  return price !== null && price !== undefined && price <= targetPrice(watch);
}

/** Validate a new or edited watch for a product. Returns { watch, errors }. */
export function validateWatch(input, product) {
  const errors = {};
  const w = {
    priceType: PRICE_TYPES[input.priceType] ? input.priceType : "market",
    mode: input.mode === "drop" ? "drop" : "below",
    printing: null,
    condition: null,
    targetPrice: null,
    dropPct: null,
    alsoEbay: Boolean(input.alsoEbay),
  };
  if (product.type === "card") {
    const printings = Object.keys(product.prices || {});
    w.printing = printings.includes(input.printing) ? input.printing : printings[0] || null;
    const conds = Object.keys(product.prices?.[w.printing] || {});
    w.condition = conds.includes(input.condition) ? input.condition : conds.includes("Near Mint") ? "Near Mint" : conds[0] || null;
    if (!w.printing || !w.condition) errors.printing = "Pick a printing and condition.";
  } else {
    w.alsoEbay = false; // eBay matching covers single cards for now
  }
  const base = currentPrice(product, w);
  w.basePrice = base;
  if (w.mode === "below") {
    const t = Number(String(input.targetPrice ?? "").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(t) || t <= 0 || t > 1_000_000) errors.targetPrice = "Enter a target price in dollars.";
    else w.targetPrice = Math.round(t * 100) / 100;
  } else {
    const p = Number(input.dropPct);
    if (!Number.isFinite(p) || p < 5 || p > 90) errors.dropPct = "Pick a drop between 5% and 90%.";
    else if (!base) errors.dropPct = "There's no current price to measure a drop from. Use a target price instead.";
    else w.dropPct = Math.round(p);
  }
  return { watch: w, errors };
}

export function trackingLabel(product, watch) {
  const what = product.type === "card" ? `${watch.printing}, ${watch.condition}` : "Sealed";
  return `${what} · ${PRICE_TYPES[watch.priceType].label.toLowerCase()}`;
}

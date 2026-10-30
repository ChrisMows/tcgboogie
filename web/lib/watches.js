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
/** "1 price alert" / "5 price alerts" */
export const alertsWord = (n) => `${n} price alert${n === 1 ? "" : "s"}`;

/** The current price this watch tracks, from a product's price table. */
export function currentPrice(product, watch) {
  if (!product) return null;
  if (product.type === "sealed") return product.prices?.[watch.priceType] ?? null;
  return product.prices?.[watch.printing]?.[watch.condition]?.[watch.priceType] ?? null;
}

// Alert modes. Buying: "below" (at or below a price) / "drop" (falls by a percent).
// Selling: "above" (at or above a price) / "rise" (climbs by a percent). dropPct holds the percent for both.
// Records: "high" / "low" alert each time the price beats the highest / lowest we've recorded (kept in basePrice,
// which moves to the new record after every alert, so they never need re-arming).
export const MODES = ["below", "drop", "above", "rise", "high", "low"];
export const isRising = (watch) => watch.mode === "above" || watch.mode === "rise" || watch.mode === "high";
export const isRecord = (watch) => watch.mode === "high" || watch.mode === "low";
const RECORD_STEP = 0.01; // a new record must beat the old one by 1%, so a price wobbling at its high isn't an alert a day

/** The price at which a watch fires (for a record alert: the record to beat). */
export function targetPrice(watch) {
  if (watch.mode === "drop") return Math.round(watch.basePrice * (1 - watch.dropPct / 100) * 100) / 100;
  if (watch.mode === "rise") return Math.round(watch.basePrice * (1 + watch.dropPct / 100) * 100) / 100;
  if (isRecord(watch)) return watch.basePrice;
  return watch.targetPrice;
}

export function isTriggered(watch, price) {
  if (price === null || price === undefined) return false;
  if (watch.mode === "high") return Boolean(watch.basePrice) && price >= watch.basePrice * (1 + RECORD_STEP);
  if (watch.mode === "low") return Boolean(watch.basePrice) && price <= watch.basePrice * (1 - RECORD_STEP);
  return isRising(watch) ? price >= targetPrice(watch) : price <= targetPrice(watch);
}

/** The record a new "high" / "low" alert starts from: today's price and, when the card's 90-day history is for this
 * same price (market, Near Mint, main printing), the highest / lowest in it. */
export function startingRecord(product, w, now) {
  if (!now) return null;
  const sameSeries = w.priceType === "market"
    && (product.type === "sealed" || (w.condition === "Near Mint" && w.printing === Object.keys(product.prices || {})[0]));
  const past = sameSeries ? (product.history || []).map((h) => Number(h.price)).filter((v) => v > 0) : [];
  return w.mode === "high" ? Math.max(now, ...past) : Math.min(now, ...past);
}

/** Validate a new or edited watch for a product. Returns { watch, errors }. */
export function validateWatch(input, product) {
  const errors = {};
  const w = {
    priceType: PRICE_TYPES[input.priceType] ? input.priceType : "market",
    mode: MODES.includes(input.mode) ? input.mode : "below",
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
  if (isRising(w) || isRecord(w)) w.alsoEbay = false; // eBay listing alerts are for buying (listed at or under your price)
  const base = currentPrice(product, w);
  w.basePrice = base;
  if (isRecord(w)) {
    w.basePrice = startingRecord(product, w, base);
    if (!w.basePrice) errors._ = "There's no current price for this yet, so a new high or low can't be measured. Use a target price instead.";
  } else if (w.mode === "below" || w.mode === "above") {
    const t = Number(String(input.targetPrice ?? "").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(t) || t <= 0 || t > 1_000_000) errors.targetPrice = "Enter a target price in dollars.";
    else w.targetPrice = Math.round(t * 100) / 100;
  } else {
    const p = Number(input.dropPct);
    const max = w.mode === "rise" ? 500 : 90;
    if (!Number.isFinite(p) || p < 5 || p > max) errors.dropPct = `Pick between 5% and ${max}%.`;
    else if (!base) errors.dropPct = "There's no current price to measure from. Use a target price instead.";
    else w.dropPct = Math.round(p);
  }
  return { watch: w, errors };
}

export function trackingLabel(product, watch) {
  const what = product.type === "card" ? `${watch.printing}, ${watch.condition}` : "Sealed";
  return `${what} · ${PRICE_TYPES[watch.priceType].label.toLowerCase()}`;
}

// Collection tracker: what a member owns (or wants), what each copy is worth, and how the whole collection is doing.
// Pure functions, shared by server pages, server actions and client components.
import { GRADERS } from "@/lib/filters";

export { GRADERS };
export const KINDS = { raw: "Raw", graded: "Graded", sealed: "Sealed" };
export const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
export const COND_SHORT = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "DMG" };
// Every grade any grader gives, 10 down to 1 in half steps.
export const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"];
// The top grade comes in two labels that sell very differently: CGC Pristine 10 above Gem Mint 10, and Beckett's
// Black Label 10 (every subgrade a 10) above its regular Pristine 10.
export const PRISTINE = "10 Pristine";
export const BLACK_LABEL = "10 Black Label";
// Each grader's own scale. PSA gives half grades only from 1.5 to 8.5 (no PSA 9.5); CGC, Beckett, SGC and TAG give
// them all the way up to 9.5.
const PSA_GRADES = GRADES.filter((g) => g !== "9.5");
export const gradesFor = (grader) => (grader === "PSA" ? PSA_GRADES : grader === "CGC" ? [PRISTINE, ...GRADES]
  : grader === "BGS" ? [BLACK_LABEL, ...GRADES] : GRADES);
/** The grade to keep when the grader changes: the same one if that grader gives it, else the next one down ("10
 * Pristine" becomes "10", PSA has no 9.5 so it becomes 9). */
export function fitGrade(grader, grade) {
  const list = gradesFor(grader);
  if (list.includes(String(grade))) return String(grade);
  const n = parseFloat(grade);
  return list.find((g) => parseFloat(g) <= n && !/\D{2,}/.test(g)) || list[list.length - 1];
}
/** How a grade reads in a menu: "10 Gem Mint" for CGC, "10 Pristine" for BGS. */
export const gradeOption = (grader, g) => (g === "10" && grader === "CGC" ? "10 Gem Mint" : g === "10" && grader === "BGS" ? "10 Pristine" : g);
export const SORTS = { value: "Value (high to low)", gain: "Gain (best first)", change: "7-day change", name: "Name", added: "Recently added" };

/**
 * One grade however it was written ("10 PRISTINE" from the bot, "10 Pristine" from a member): CGC's two 10s are "10" (Gem
 * Mint) and "10 Pristine", BGS's are "10" (Pristine, the label its plain 10 always carries) and "10 Black Label". CGC's
 * Pristine slab is black, so a listing saying "black label" there means Pristine.
 */
export function normGrade(grader, grade) {
  const s = String(grade ?? "").trim();
  if (/black\s*label/i.test(s)) return grader === "CGC" ? PRISTINE : BLACK_LABEL;
  if (/pristine/i.test(s)) return grader === "BGS" ? "10" : PRISTINE;
  return s;
}
/** How a grade reads everywhere: says which 10 it is, "10 Gem Mint" for CGC, "10 Pristine" for BGS. */
export const gradeLabel = (grader, grade) => gradeOption(grader, normGrade(grader, grade));
/** "CGC 10 Gem Mint", "BGS 10 Black Label", "PSA 10". */
export const gradeName = (grader, grade) => `${grader} ${gradeLabel(grader, grade)}`;

// The price service's one "10" for CGC and BGS is a blend: its labels part splits the totals and price by slab label, but
// not the day-by-day sales. So each label gets its own key, and the days are kept apart as "<key>_mixed" (either label).
// CGC's few Perfect 10s are left out. Sales with no label go with the everyday 10, only when that has no sales of its own.
const TEN_LABELS = {
  cgc10: [["cgc10", ["gemMint", "unlabeled"]], ["cgc10_pristine", ["pristine"]]],
  bgs10: [["bgs10", ["pristine", "unlabeled"]], ["bgs10_black", ["blackLabel"]]],
};
export const mixedKey = (key) => `${key.replace(/_(pristine|black)$/, "")}_mixed`;
/**
 * One label's price. The service's estimate, except when it's low confidence, or rests on a 7 or 14 day window with only
 * a handful of sales: there it swings on a sale or two (a CGC Pristine read $59 from 3 sales when its 67 sales' median was
 * $72), so the label's own median of all its sales stands in.
 */
export function labelPrice(l) {
  const smart = l?.smartMarketPrice?.price ?? null;
  const thin = l?.smartMarketPrice?.confidence === "low" || (/^(7|14)day/.test(String(l?.smartMarketPrice?.method || "")) && (l?.dailyVolume7Day || 0) * 7 <= 5);
  return (thin ? l?.medianPrice : null) ?? smart ?? l?.medianPrice ?? l?.averagePrice ?? null;
}
/**
 * A grade's labels as separate prices: [{ key, price, median, low, high, sales, allSales, lastSale, confidence }], or null when it isn't split.
 * recent: its sales in the last 90 days, of either label. A label's share of those is an estimate, from its share of all
 * sales (sales); allSales is the real count.
 */
export function splitTen(key, g, recent = null) {
  const labels = g?.labels;
  if (!TEN_LABELS[key] || !labels || typeof labels !== "object") return null;
  const out = [];
  for (const [outKey, names] of TEN_LABELS[key]) {
    const l = names.map((n) => labels[n]).find((x) => x?.count > 0);
    const price = labelPrice(l);
    if (!price) continue;
    const share = g.count > 0 ? l.count / g.count : 0;
    const lastSale = l.lastSaleDate ? String(l.lastSaleDate).slice(0, 10) : null;
    out.push({ key: outKey, price, median: l.medianPrice ?? null, low: l.minPrice ?? null, high: l.maxPrice ?? null, allSales: l.count, sales: recent === null ? l.count : Math.round(recent * share), lastSale, confidence: l.smartMarketPrice?.confidence || null });
  }
  return out;
}

/** ('PSA', '9.5') -> 'psa9_5', the key slab prices are stored under (same as the bot's grade_key). */
export const gradeKey = (grader, grade) => (grader && grade
  ? `${grader.toLowerCase()}${normGrade(grader, grade).replace(" Pristine", "_pristine").replace(" Black Label", "_black").replace(".", "_")}` : null);

export const money = (v, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? "—"
    : `${v < 0 ? "-" : ""}$${Math.abs(Number(v)).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
/** A card's amount, easy to read at a glance: $100 and up in whole dollars, $10 and up to one decimal, under $10 to two. */
export function cardMoney(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const a = Math.abs(Number(v));
  // Decided on the rounded amount, so $99.97 reads $100, not $100.0.
  return money(v, Number(a.toFixed(1)) >= 100 ? 0 : Number(a.toFixed(2)) >= 10 ? 1 : 2);
}
export const pct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

/** "Holofoil · NM", "PSA 10", "Sealed" */
export function itemLabel(item) {
  if (item.kind === "graded") return gradeName(item.grader, item.grade);
  if (item.kind === "sealed") return "Sealed";
  return [item.printing, COND_SHORT[item.condition] || item.condition].filter(Boolean).join(" · ");
}

/** Market value of one copy, from a product's price table. null when there's no reliable price. */
export function marketValue(product, item) {
  if (!product) return null;
  if (item.kind === "sealed") return product.prices?.market ?? product.prices?.low ?? null;
  if (item.kind === "graded") {
    // Thin or stale graded data isn't a value: keep the member's own figure instead.
    const g = product.graded?.[gradeKey(item.grader, item.grade)];
    return g && g.reliable !== false ? g.price : null;
  }
  const byPrinting = product.prices?.[item.printing] || {};
  return byPrinting[item.condition]?.market ?? null;
}

/**
 * What one copy counts for in totals: the market value whenever there is one; the member's own value only while
 * there's no market price for it (a card the price service doesn't cover, a graded copy without recent sales...).
 * Once a market price turns up it takes over; the member's figure stays saved underneath in case the price goes away.
 */
export const unitValue = (item) => (item.unitValue ?? item.customValue ?? null);
/** The value shown is one the member typed in (no market price yet): shown in amber with "Your value". */
export const isOwnValue = (item) => (item.unitValue === null || item.unitValue === undefined) && item.customValue !== null && item.customValue !== undefined;

/** Price change over the last `days` from a product's history (raw Near Mint / sealed only). */
export function change(product, days = 7) {
  const h = (product?.history || []).filter((p) => Number.isFinite(p.price));
  if (h.length < 2) return null;
  const now = h[h.length - 1].price;
  const then = h[Math.max(0, h.length - 1 - days)].price;
  return then ? (now - then) / then : null;
}

/**
 * How far one collection line moved in price over `days` (0 = all the history we have): { pct, dollars }, dollars for
 * `quantity` copies. null without a value or with no history that far back.
 */
export function itemMove(item, days, quantity = item.quantity || 1) {
  const p = item.changes?.[days] ?? (days === 7 ? item.change7 : null);
  const v = unitValue(item);
  if (p === null || p === undefined || v === null || p <= -1) return null;
  return { pct: p, dollars: (v - v / (1 + p)) * quantity };
}

/**
 * The email recap's biggest movers over `days`, by dollars for all copies, like Home's movers: raw and sealed from the
 * product's price history, graded from the copy's own saved daily values. With less history than `days`, against the
 * oldest day we have (as change() does). histories: { itemId: [{ day, value }] } oldest first.
 */
export function recapMovers(owned, products, histories, days, now = new Date(), limit = 3) {
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now - days * 86400000).toISOString().slice(0, 10);
  const pctFor = (it) => {
    if (it.kind !== "graded") return change(products[it.productId], days);
    const past = (histories[it.id] || []).filter((h) => h.day < today && h.value > 0);
    const base = [...past].reverse().find((h) => h.day <= cutoff) || past[0];
    const v = unitValue(it);
    return base && v !== null ? (v - base.value) / base.value : null;
  };
  return owned.map((it) => {
    const v = unitValue(it);
    const p = v ? pctFor(it) : null;
    if (p === null || p <= -1 || Math.abs(p) < 0.005) return null;
    const quantity = it.quantity || 1;
    return { it, pct: p, dollars: (v - v / (1 + p)) * quantity, held: v * quantity };
  }).filter(Boolean).sort((a, b) => Math.abs(b.dollars) - Math.abs(a.dollars)).slice(0, limit);
}

/** Totals for a list of owned items. */
export function summarize(items) {
  let value = 0, cost = 0, costed = 0, copies = 0, unpriced = 0;
  for (const it of items) {
    const q = it.quantity || 1;
    copies += q;
    const v = unitValue(it);
    if (v === null) unpriced += q; else value += v * q;
    if (it.purchasePrice !== null && it.purchasePrice !== undefined) { cost += it.purchasePrice * q; costed += v === null ? 0 : v * q; }
  }
  const gain = cost ? costed - cost : null;
  return { value, cost, gain, gainPct: cost ? gain / cost : null, copies, lines: items.length, unpriced };
}

/** Owned copies of each product, e.g. { "517045": 2 }. */
export function ownedCounts(items) {
  const out = {};
  for (const it of items) if (it.list === "owned") out[it.productId] = (out[it.productId] || 0) + (it.quantity || 1);
  return out;
}

/** Set completion: how many distinct cards of a set the member owns. */
export function completion(setCards, owned) {
  const have = setCards.filter((c) => owned[c.id]).length;
  return { have, total: setCards.length, pct: setCards.length ? have / setCards.length : 0 };
}

/** The cheapest sensible price to pick up a card raw (Near Mint market in its first printing). */
export function nmPrice(product) {
  const printing = Object.keys(product?.prices || {})[0];
  return product?.prices?.[printing]?.["Near Mint"]?.market ?? null;
}

/** "Charizard ex" / "Umbreon VMAX (Alternate Art Secret)" / "Dark Charizard" -> the Pokémon to filter deals by. */
export function pokemonName(name) {
  return String(name || "").replace(/\(.*?\)/g, " ")
    .replace(/\b(ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.?X|Prime|LEGEND|δ|Star|☆)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Validate a new or edited collection line for a product. Returns { item, errors }. */
export function validateItem(input, product) {
  const errors = {};
  const kind = product.type === "sealed" ? "sealed" : input.kind === "graded" ? "graded" : "raw";
  const item = {
    list: input.list === "wishlist" ? "wishlist" : "owned", kind,
    printing: null, condition: null, grader: null, grade: null, certNumber: null,
    quantity: 1, purchasePrice: null, purchaseDate: null, customValue: null,
    binderId: input.binderId ? Number(input.binderId) || null : null,
    notes: String(input.notes || "").trim().slice(0, 300) || null,
  };
  if (product.type === "card") {
    const printings = Object.keys(product.prices || {});
    item.printing = printings.includes(input.printing) ? input.printing : printings[0] || null;
  }
  if (kind === "raw") item.condition = CONDITIONS.includes(input.condition) ? input.condition : "Near Mint";
  if (kind === "graded") {
    item.grader = GRADERS.includes(input.grader) ? input.grader : null;
    item.grade = gradesFor(item.grader).includes(String(input.grade)) ? String(input.grade) : null;
    if (!item.grader || !item.grade) errors.grade = "Pick the grading company and grade.";
    item.certNumber = String(input.certNumber || "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 20) || null;
  }
  const q = Math.round(Number(input.quantity ?? 1));
  if (!Number.isFinite(q) || q < 1 || q > 9999) errors.quantity = "Quantity must be between 1 and 9,999.";
  else item.quantity = q;
  const money_ = (v, field, label) => {
    const s = String(v ?? "").replace(/[$,\s]/g, "");
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) { errors[field] = `Enter ${label} in dollars.`; return null; }
    return Math.round(n * 100) / 100;
  };
  if (item.list === "owned") {
    item.purchasePrice = money_(input.purchasePrice, "purchasePrice", "what you paid per copy");
    item.customValue = money_(input.customValue, "customValue", "your value per copy");
    const d = String(input.purchaseDate || "");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= new Date().toISOString().slice(0, 10)) item.purchaseDate = d;
    else if (d) errors.purchaseDate = "Pick a date that isn't in the future.";
  }
  return { item, errors };
}

/** Fill in a daily series of collection values for the chart, limited to the member's plan. */
/**
 * How much the collection moved in price over the last `days` (null = since the first day we have), leaving out cards
 * added since then: today's value of the cards already owned on that day, against that day's saved total. Days are
 * saved when the member opens their collection, so "1 day" means since the last saved day before today. Returns
 * { change, pct, since: "YYYY-MM-DD" } or null with no earlier day to compare with. (A card removed since then reads
 * as a drop, and a quantity raised as a gain: we keep totals per day, not per card.)
 */
export function marketChange(owned, snapshots, days, now = new Date(), sinceDay = null) {
  const today = now.toISOString().slice(0, 10);
  // Days with a value only (a day saved before any card had a price is no base to compare with).
  const pts = [...snapshots].filter((p) => String(p.day) < today && p.value > 0).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  if (!pts.length) return null;
  // sinceDay ("YYYY-MM-DD", e.g. the member's last visit) instead of a number of days.
  const cutoff = sinceDay || (days ? new Date(now - days * 86400000).toISOString().slice(0, 10) : null);
  // The last saved day on or before the cutoff; with no history that far back, the earliest one (like the chart).
  const then = (cutoff && [...pts].reverse().find((p) => String(p.day) <= cutoff)) || pts[0];
  if (!then?.value || then.value <= 0) return null;
  const dayEnd = new Date(`${String(then.day).slice(0, 10)}T23:59:59.999Z`);
  const held = owned.reduce((t, it) => {
    if (new Date(it.createdAt) > dayEnd) return t; // added after that day: not part of the comparison
    const v = unitValue(it);
    return v === null ? t : t + v * (it.quantity || 1);
  }, 0);
  if (held <= 0) return null;
  const change = held - then.value;
  return { change, pct: change / then.value, since: String(then.day).slice(0, 10) };
}

export function chartSeries(snapshots, historyDays) {
  const pts = [...snapshots].sort((a, b) => String(a.day).localeCompare(String(b.day)));
  if (!historyDays) return pts;
  const cutoff = new Date(Date.now() - historyDays * 86400000).toISOString().slice(0, 10);
  return pts.filter((p) => String(p.day) >= cutoff);
}

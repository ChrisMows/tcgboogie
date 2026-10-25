// Subscription plans. Keep in sync with the bot's config.yaml (plans:). What the site says each plan includes is
// worked out from these fields (and Admin → Features) in lib/plan-copy.js.
export const PLANS = {
  free: {
    key: "free",
    label: "Free",
    price: 0,
    tagline: "Free forever. No card needed.",
    maxProfiles: 1,
    maxCardsPerFilter: 3, // cards a deal filter may pick ("any card named …" counts as one)
    instantAlerts: false,
    liveFeed: false, // free members see deals only after the auction ends
    minDiscountFloor: 30,
    maxWindowMinutes: 10,
    minValueFloor: 0, // no minimum card value (Admin → Plans can set one)
    japanese: false,
    emailRecap: "weekly",
    maxPriceWatches: 1, // always active; removing one frees a slot
    watchAlertChannels: ["email"],
    // Collection tracker: the core is free for everyone.
    collectionHistoryDays: 30, // how far back the value chart goes
    collectionExport: false,
    collectionAlerts: false, // "missing from your set" deals and sell-high nudges
    gradingCheck: false, // full "worth grading?" list (Free sees the top 3)
    photoAppraiser: false, // snap a photo of cards: identify, price, add
    photoSearch: true, // Add cards: search by picture (camera or upload)
    photoSearchPerMonth: 5, // search-by-picture photos a month (null = unlimited)
    appraisePerMonth: 0, // photo appraiser photos a month
    collectionImport: true, // CSV import from other apps
    tradeAnalyzer: true,
    sellOnEbay: true,
    sellPerMonth: 3, // eBay listings a month through Sell on eBay
    trialDays: 0,
    cardRequests: true, // "Request a card or sealed product"
    ebayListingAlerts: true, // price alerts that also watch eBay listings at or under the target
    reportSales: true, // "Report a sale we're missing" on card pages
  },
  premium: {
    key: "premium",
    label: "Premium",
    price: 9.99,
    tagline: "Every deal, while there's still time.",
    maxProfiles: 15,
    maxCardsPerFilter: null, // unlimited (the filter itself stops at 100)
    instantAlerts: true,
    liveFeed: true,
    minDiscountFloor: 15,
    maxWindowMinutes: 60,
    minValueFloor: 0,
    japanese: true,
    emailRecap: "daily",
    maxPriceWatches: null, // unlimited
    watchAlertChannels: ["email", "push", "discord", "sms"],
    collectionHistoryDays: null, // all time
    collectionExport: true,
    collectionAlerts: true,
    gradingCheck: true,
    photoAppraiser: true,
    photoSearch: true,
    photoSearchPerMonth: null,
    appraisePerMonth: null,
    collectionImport: true,
    tradeAnalyzer: true,
    sellOnEbay: true,
    sellPerMonth: null,
    trialDays: 7, // free trial for a member's first subscription (card required; 0 = no trial)
    cardRequests: true,
    ebayListingAlerts: true,
    reportSales: true,
  },
};

// Admin → Plans: the number limits, editable without code changes (app_setting "plan_limits":
// { free: { key: number|null }, premium: {…} }; null = unlimited). Loaded by lib/features.js with the features.
export const LIMITS = [
  { key: "maxProfiles", group: "Deals", label: "Deal filters", min: 1, max: 50, unlimited: false },
  { key: "maxCardsPerFilter", group: "Deals", label: "Cards per deal filter", help: "\"Any card named …\" counts as one card.", min: 1, max: 100, unlimited: true },
  { key: "minDiscountFloor", group: "Deals", label: "Smallest discount alerted", unit: "% below market", min: 5, max: 80, unlimited: false },
  { key: "minValueFloor", group: "Deals", label: "Cheapest card value covered", unit: "$", min: 0, max: 1000, unlimited: false },
  { key: "maxWindowMinutes", group: "Deals", label: "Earliest warning before an auction ends", unit: "minutes", min: 1, max: 60, unlimited: false },
  { key: "maxPriceWatches", group: "Alerts", label: "Price alerts", min: 0, max: 500, unlimited: true },
  { key: "photoSearchPerMonth", group: "Collection", label: "Search by picture photos a month", min: 0, max: 1000, unlimited: true },
  { key: "appraisePerMonth", group: "Collection", label: "Photo appraiser photos a month", min: 0, max: 1000, unlimited: true },
  { key: "sellPerMonth", group: "Collection", label: "Sell on eBay listings a month", min: 0, max: 1000, unlimited: true },
  { key: "trialDays", group: "Billing", label: "Free trial before the first charge", unit: "days", help: "Card required, first subscription only. 0 = no trial.", min: 0, max: 30, unlimited: false, premiumOnly: true },
];

/** Default limits (no admin choice): { free: {…}, premium: {…} }. */
export const defaultLimits = () => Object.fromEntries(["free", "premium"].map((t) => [t, Object.fromEntries(LIMITS.map((l) => [l.key, PLANS[t][l.key] ?? null]))]));

/** Clean up an admin's limits: known keys, whole numbers in range, null only where "unlimited" is allowed. */
export function normalizeLimits(raw) {
  const out = {};
  for (const tier of ["free", "premium"]) {
    const r = raw?.[tier] || {};
    const t = {};
    for (const l of LIMITS) {
      if (!(l.key in r) || (l.premiumOnly && tier === "free")) continue;
      const v = r[l.key];
      if (v === null && l.unlimited) { t[l.key] = null; continue; }
      const n = Math.round(Number(v));
      if (Number.isFinite(n)) t[l.key] = Math.min(l.max, Math.max(l.min, n));
    }
    out[tier] = t;
  }
  return out;
}

export const PLAN_ORDER = ["free", "premium"];

// Admin → Features: which plan gets each feature, without code changes. Each feature switches one or more plan
// fields. The admin's choices live in the database (app_setting "plan_features": { key: { free, premium } }) and
// are loaded on the server by lib/features.js; anything not chosen there keeps the defaults above. A feature on for
// Free is always on for Premium too.
const hasChannel = (p, c) => p.watchAlertChannels.includes(c);
const withChannel = (p, c, on) => ({ watchAlertChannels: on ? [...new Set([...p.watchAlertChannels, c])] : p.watchAlertChannels.filter((x) => x !== c) });
export const FEATURES = [
  { key: "liveDeals", group: "Deals", label: "Live deals and instant deal alerts", help: "Deals while the auction is still running. Without it, members see deals after they end.",
    get: (p) => p.liveFeed, set: (p, on) => ({ liveFeed: on, instantAlerts: on }) },
  { key: "japaneseDeals", group: "Deals", label: "Japanese cards in deal filters", get: (p) => p.japanese, set: (p, on) => ({ japanese: on }) },
  { key: "pushAlerts", group: "Alerts", label: "Push notifications", help: "Instant alerts on members' phones and computers (Settings → Push notifications).",
    get: (p) => hasChannel(p, "push"), set: (p, on) => withChannel(p, "push", on) },
  { key: "discordAlerts", group: "Alerts", label: "Discord alerts", get: (p) => hasChannel(p, "discord"), set: (p, on) => withChannel(p, "discord", on) },
  { key: "textAlerts", group: "Alerts", label: "Text message alerts", get: (p) => hasChannel(p, "sms"), set: (p, on) => withChannel(p, "sms", on) },
  { key: "dailyRecap", group: "Alerts", label: "Daily email recap", help: "Without it, the recap is weekly.",
    get: (p) => p.emailRecap === "daily", set: (p, on) => ({ emailRecap: on ? "daily" : "weekly" }) },
  { key: "collectionAlerts", group: "Alerts", label: "Sell-high alerts and set-completion deals", get: (p) => p.collectionAlerts, set: (p, on) => ({ collectionAlerts: on }) },
  { key: "ebayListingAlerts", group: "Alerts", label: "Price alerts that also watch eBay listings", help: "Alerts when a watched card is listed on eBay at or under the target price.",
    get: (p) => p.ebayListingAlerts, set: (p, on) => ({ ebayListingAlerts: on }) },
  { key: "fullHistory", group: "Collection", label: "All-time collection value chart", help: "Without it, the chart shows the last 30 days.",
    get: (p) => p.collectionHistoryDays === null, set: (p, on) => ({ collectionHistoryDays: on ? null : 30 }) },
  { key: "csvExport", group: "Collection", label: "Export collection as CSV", get: (p) => p.collectionExport, set: (p, on) => ({ collectionExport: on }) },
  { key: "csvImport", group: "Collection", label: "Import a CSV from another app", get: (p) => p.collectionImport, set: (p, on) => ({ collectionImport: on }) },
  { key: "gradingCheck", group: "Collection", label: "Full Worth Grading? list", help: "Without it, members see the top 3 cards.",
    get: (p) => p.gradingCheck, set: (p, on) => ({ gradingCheck: on }) },
  { key: "photoAppraiser", group: "Collection", label: "Photo appraiser", get: (p) => p.photoAppraiser, set: (p, on) => ({ photoAppraiser: on }) },
  { key: "photoSearch", group: "Collection", label: "Search by picture", help: "Camera or photo upload in the Add cards search: we read the card and find it.",
    get: (p) => p.photoSearch, set: (p, on) => ({ photoSearch: on }) },
  { key: "tradeAnalyzer", group: "Collection", label: "Trade analyzer", get: (p) => p.tradeAnalyzer, set: (p, on) => ({ tradeAnalyzer: on }) },
  { key: "sellOnEbay", group: "Collection", label: "Sell on eBay", get: (p) => p.sellOnEbay, set: (p, on) => ({ sellOnEbay: on }) },
  { key: "cardRequests", group: "Collection", label: "Request a card or sealed product", help: "Members add cards our catalog doesn't have.",
    get: (p) => p.cardRequests, set: (p, on) => ({ cardRequests: on }) },
  { key: "reportSales", group: "Collection", label: "Report a sale we're missing", get: (p) => p.reportSales, set: (p, on) => ({ reportSales: on }) },
];

/** Who gets each feature by default (no admin choice): { key: { free, premium } }. */
export const defaultFeatures = () => Object.fromEntries(FEATURES.map((f) => [f.key, { free: Boolean(f.get(PLANS.free)), premium: Boolean(f.get(PLANS.premium)) }]));

/** Clean up an admin's choices: known features only, true/false, and on-for-Free means on-for-Premium. */
export function normalizeFeatures(raw) {
  const out = {};
  for (const f of FEATURES) {
    const r = raw?.[f.key];
    if (!r) continue;
    const free = Boolean(r.free);
    out[f.key] = { free, premium: free || Boolean(r.premium) };
  }
  return out;
}

const g = globalThis;
/** Server only (lib/features.js): the admin's current choices (features, and number limits). */
export function setFeatureOverrides(map, limits) {
  g.__tcgbFeatures = normalizeFeatures(map);
  if (limits !== undefined) g.__tcgbLimits = normalizeLimits(limits);
  g.__tcgbPlans = {};
}

export function planFor(tier) {
  const base = PLANS[tier] || PLANS.free;
  const overrides = g.__tcgbFeatures || {};
  const limits = g.__tcgbLimits?.[base.key] || {};
  if (!Object.keys(overrides).length && !Object.keys(limits).length) return base;
  const memo = (g.__tcgbPlans ||= {});
  if (memo[base.key]) return memo[base.key];
  let plan = { ...base, ...limits };
  for (const f of FEATURES) {
    const o = overrides[f.key];
    if (o && Boolean(f.get(plan)) !== o[base.key]) plan = { ...plan, ...f.set(plan, o[base.key]) };
  }
  return (memo[base.key] = plan);
}

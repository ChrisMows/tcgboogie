// Subscription plans. Keep in sync with the bot's config.yaml (plans:).
export const PLANS = {
  free: {
    key: "free",
    label: "Free",
    price: 0,
    tagline: "Free forever. No card needed.",
    maxProfiles: 1,
    instantAlerts: false,
    liveFeed: false, // free members see deals only after the auction ends
    minDiscountFloor: 30,
    maxWindowMinutes: 10,
    minValueFloor: 30,
    japanese: false,
    emailRecap: "weekly",
    maxPriceWatches: 5, // always active; removing one frees a slot
    watchAlertChannels: ["email"],
    // Collection tracker: the core is free for everyone.
    collectionHistoryDays: 30, // how far back the value chart goes
    collectionExport: false,
    collectionAlerts: false, // "missing from your set" deals and sell-high nudges
    gradingCheck: false, // full "worth grading?" list (Free sees the top 3)
    photoAppraiser: false, // snap a photo of cards: identify, price, add
    collectionImport: true, // CSV import from other apps
    tradeAnalyzer: true,
    sellOnEbay: true,
    features: [
      "Collection tracker, unlimited cards",
      "5 price alerts",
      "See the deals you missed, after they end",
      "1 deal filter",
      "Sell your cards on eBay in a minute",
    ],
  },
  premium: {
    key: "premium",
    label: "Premium",
    price: 9.99,
    tagline: "Every deal, while there's still time.",
    maxProfiles: 15,
    instantAlerts: true,
    liveFeed: true,
    minDiscountFloor: 15,
    maxWindowMinutes: 60,
    minValueFloor: 10,
    japanese: true,
    emailRecap: "daily",
    maxPriceWatches: null, // unlimited
    watchAlertChannels: ["email", "discord", "sms"],
    collectionHistoryDays: null, // all time
    collectionExport: true,
    collectionAlerts: true,
    gradingCheck: true,
    photoAppraiser: true,
    collectionImport: true,
    tradeAnalyzer: true,
    sellOnEbay: true,
    features: [
      "Every deal live, before the auction ends",
      "Instant alerts by text, Discord and email",
      "Unlimited price alerts",
      "15 deal filters, Japanese cards, earlier and deeper deals",
      "Full collection history and CSV export",
    ],
  },
};

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
  { key: "discordAlerts", group: "Alerts", label: "Discord alerts", get: (p) => hasChannel(p, "discord"), set: (p, on) => withChannel(p, "discord", on) },
  { key: "textAlerts", group: "Alerts", label: "Text message alerts", get: (p) => hasChannel(p, "sms"), set: (p, on) => withChannel(p, "sms", on) },
  { key: "dailyRecap", group: "Alerts", label: "Daily email recap", help: "Without it, the recap is weekly.",
    get: (p) => p.emailRecap === "daily", set: (p, on) => ({ emailRecap: on ? "daily" : "weekly" }) },
  { key: "collectionAlerts", group: "Alerts", label: "Sell-high alerts and set-completion deals", get: (p) => p.collectionAlerts, set: (p, on) => ({ collectionAlerts: on }) },
  { key: "fullHistory", group: "Collection", label: "All-time collection value chart", help: "Without it, the chart shows the last 30 days.",
    get: (p) => p.collectionHistoryDays === null, set: (p, on) => ({ collectionHistoryDays: on ? null : 30 }) },
  { key: "csvExport", group: "Collection", label: "Export collection as CSV", get: (p) => p.collectionExport, set: (p, on) => ({ collectionExport: on }) },
  { key: "csvImport", group: "Collection", label: "Import a CSV from another app", get: (p) => p.collectionImport, set: (p, on) => ({ collectionImport: on }) },
  { key: "gradingCheck", group: "Collection", label: "Full Worth Grading? list", help: "Without it, members see the top 3 cards.",
    get: (p) => p.gradingCheck, set: (p, on) => ({ gradingCheck: on }) },
  { key: "photoAppraiser", group: "Collection", label: "Photo appraiser", get: (p) => p.photoAppraiser, set: (p, on) => ({ photoAppraiser: on }) },
  { key: "tradeAnalyzer", group: "Collection", label: "Trade analyzer", get: (p) => p.tradeAnalyzer, set: (p, on) => ({ tradeAnalyzer: on }) },
  { key: "sellOnEbay", group: "Collection", label: "Sell on eBay", get: (p) => p.sellOnEbay, set: (p, on) => ({ sellOnEbay: on }) },
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
/** Server only (lib/features.js): the admin's current choices. */
export function setFeatureOverrides(map) {
  g.__tcgbFeatures = normalizeFeatures(map);
  g.__tcgbPlans = {};
}

export function planFor(tier) {
  const base = PLANS[tier] || PLANS.free;
  const overrides = g.__tcgbFeatures;
  if (!overrides || !Object.keys(overrides).length) return base;
  const memo = (g.__tcgbPlans ||= {});
  if (memo[base.key]) return memo[base.key];
  let plan = { ...base };
  for (const f of FEATURES) {
    const o = overrides[f.key];
    if (o && Boolean(f.get(plan)) !== o[base.key]) plan = { ...plan, ...f.set(plan, o[base.key]) };
  }
  return (memo[base.key] = plan);
}

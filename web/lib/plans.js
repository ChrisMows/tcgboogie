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

export function planFor(tier) {
  return PLANS[tier] || PLANS.free;
}

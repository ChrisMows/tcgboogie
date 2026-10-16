// Subscription plans. Keep in sync with the bot's config.yaml (plans:).
export const PLANS = {
  free: {
    key: "free",
    label: "Free",
    price: 0,
    tagline: "See what you're missing",
    maxProfiles: 1,
    instantAlerts: false,
    liveFeed: false, // free members see deals only after the auction ends
    minDiscountFloor: 30,
    maxWindowMinutes: 10,
    minValueFloor: 30,
    japanese: false,
    emailRecap: "weekly",
    features: [
      "Deals you missed, with what they actually sold for",
      "1 filter profile",
      "Weekly email recap",
      "Community Discord",
    ],
  },
  premium: {
    key: "premium",
    label: "Premium",
    price: 19.99,
    tagline: "Get every deal while there's still time",
    maxProfiles: 15,
    instantAlerts: true,
    liveFeed: true,
    minDiscountFloor: 15,
    maxWindowMinutes: 60,
    minValueFloor: 10,
    japanese: true,
    emailRecap: "daily",
    features: [
      "Live deal feed while auctions are still open",
      "Instant alerts on Discord and your phone",
      "15 filter profiles with every filter",
      "Deals from 15% below market, up to 60 minutes before the end",
      "Japanese cards",
      "Daily email recap",
    ],
  },
};

export const PLAN_ORDER = ["free", "premium"];

export function planFor(tier) {
  return PLANS[tier] || PLANS.free;
}

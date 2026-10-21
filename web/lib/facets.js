// The filter bar: each facet knows whether it's switched on (differs from the defaults), a short label for its
// pill when it is, and how to reset just that part. Pure functions, used by the filter page.
import { ALERT_CHANNEL_LABELS, ALERT_CHANNELS, GRADERS, RAW_CONDITION_LABELS } from "@/lib/filters";

const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
const firstFew = (a) => (a.length <= 2 ? a.join(", ") : `${a.slice(0, 2).join(", ")} +${a.length - 2}`);
const usd = (v) => `$${Number(v).toLocaleString()}`;
export const hasCards = (f) => f.cardTypes.includes("graded") || f.cardTypes.includes("raw");

// Groups the filter bar shows, in order (each facet says which it belongs to).
export const FACET_GROUPS = ["What", "Grade & condition", "Price & timing", "Seller & alerts"];

export const FACETS = [
  {
    key: "product", group: "What", label: "Product type",
    active: (f) => !(hasCards(f) && f.cardTypes.includes("sealed")),
    summary: (f) => (hasCards(f) ? "Cards only" : "Sealed only"),
    reset: () => ({ cardTypes: ["graded", "raw", "sealed"] }),
  },
  {
    key: "type", group: "What", label: "Card type",
    active: (f) => hasCards(f) && !(f.cardTypes.includes("graded") && f.cardTypes.includes("raw")),
    summary: (f) => (f.cardTypes.includes("graded") ? "Graded only" : "Raw only"),
    // Back to graded + raw, leaving the sealed choice (Product type) as it was.
    reset: (d, f) => ({ cardTypes: ["graded", "raw", ...(f?.cardTypes.includes("sealed") ? ["sealed"] : [])] }),
    disabled: (f) => !hasCards(f),
  },
  {
    key: "sets", group: "What", label: "Set",
    active: (f) => f.sets.length > 0,
    summary: (f) => firstFew(f.sets),
    reset: () => ({ sets: [] }),
  },
  {
    key: "cards", group: "What", label: "Cards",
    active: (f) => f.pokemon.length > 0 || (f.cards || []).length > 0,
    summary: (f) => firstFew([...f.pokemon.map((p) => `any ${p}`), ...(f.cards || []).map((c) => c.name.replace(/\s*\(.*\)$/, ""))]),
    reset: () => ({ pokemon: [], cards: [] }),
  },
  {
    key: "grade", group: "Grade & condition", label: "Grading Company",
    active: (f, d) => !same(f.graders, d.graders),
    summary: (f) => (f.graders.length === GRADERS.length ? "Any" : firstFew(f.graders)),
    reset: (d) => ({ graders: d.graders }),
    disabled: (f) => !f.cardTypes.includes("graded"),
  },
  {
    key: "gradeRange", group: "Grade & condition", label: "Grade",
    active: (f, d) => f.minGrade !== d.minGrade || f.maxGrade !== d.maxGrade,
    summary: (f) => (f.minGrade === f.maxGrade ? `${f.minGrade} only` : `${f.minGrade}${f.maxGrade < 10 ? `–${f.maxGrade}` : "+"}`),
    reset: (d) => ({ minGrade: d.minGrade, maxGrade: d.maxGrade }),
    disabled: (f) => !f.cardTypes.includes("graded"),
  },
  {
    key: "condition", group: "Grade & condition", label: "Condition",
    active: (f, d) => f.minRawCondition !== d.minRawCondition,
    summary: (f) => RAW_CONDITION_LABELS[f.minRawCondition].replace(" or better", "+"),
    reset: (d) => ({ minRawCondition: d.minRawCondition }),
    disabled: (f) => !f.cardTypes.includes("raw"),
  },
  {
    key: "value", group: "Price & timing", label: "Value",
    active: (f, d) => Number(f.minMarketValue) !== d.minMarketValue || f.maxMarketValue !== null || f.maxPrice !== null,
    summary: (f) => [
      `${usd(f.minMarketValue)}${f.maxMarketValue ? `–${usd(f.maxMarketValue)}` : "+"}`,
      f.maxPrice ? `pay ≤ ${usd(f.maxPrice)}` : null,
    ].filter(Boolean).join(" · "),
    reset: (d) => ({ minMarketValue: d.minMarketValue, maxMarketValue: null, maxPrice: null }),
  },
  {
    key: "discount", group: "Price & timing", label: "% below market",
    active: (f, d) => f.minDiscountPct !== d.minDiscountPct,
    summary: (f) => `${f.minDiscountPct}%+`,
    reset: (d) => ({ minDiscountPct: d.minDiscountPct }),
  },
  {
    key: "time", group: "Price & timing", label: "Ends within",
    active: (f, d) => f.maxMinutesLeft !== d.maxMinutesLeft,
    summary: (f) => `${f.maxMinutesLeft} min`,
    reset: (d) => ({ maxMinutesLeft: d.maxMinutesLeft }),
  },
  {
    key: "language", group: "Seller & alerts", label: "Language",
    active: (f, d) => !same(f.languages, d.languages),
    summary: (f) => f.languages.map((l) => (l === "english" ? "English" : "Japanese")).join(" + "),
    reset: (d) => ({ languages: d.languages }),
  },
  {
    key: "seller", group: "Seller & alerts", label: "Seller",
    active: (f, d) => f.usOnly || f.hideFlagged || f.minSellerFeedback > 0 || f.minComps !== d.minComps,
    summary: (f) => [f.usOnly ? "US only" : null, f.hideFlagged ? "no red flags" : null,
      f.minSellerFeedback > 0 ? `${f.minSellerFeedback}+ feedback` : null].filter(Boolean).join(" · ") || "Custom",
    reset: (d) => ({ usOnly: false, hideFlagged: false, minSellerFeedback: 0, minComps: d.minComps }),
  },
  {
    key: "channels", group: "Seller & alerts", label: "Notification type",
    active: (f) => !same(f.channels || ALERT_CHANNELS, ALERT_CHANNELS),
    summary: (f) => (f.channels || ALERT_CHANNELS).map((c) => ALERT_CHANNEL_LABELS[c]).join(" + "),
    reset: () => ({ channels: [...ALERT_CHANNELS] }),
  },
];

export const activeFacets = (f, d) => FACETS.filter((x) => !x.disabled?.(f) && x.active(f, d));

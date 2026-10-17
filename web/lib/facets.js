// The filter bar: each facet knows whether it's switched on (differs from the defaults), a short label for its
// pill when it is, and how to reset just that part. Pure functions, used by the filter page.
import { GRADERS, RAW_CONDITION_LABELS } from "@/lib/filters";

const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
const firstFew = (a) => (a.length <= 2 ? a.join(", ") : `${a.slice(0, 2).join(", ")} +${a.length - 2}`);
const usd = (v) => `$${Number(v).toLocaleString()}`;

export const FACETS = [
  {
    key: "sets", label: "Set",
    active: (f) => f.sets.length > 0,
    summary: (f) => firstFew(f.sets),
    reset: () => ({ sets: [] }),
  },
  {
    key: "cards", label: "Cards",
    active: (f) => f.pokemon.length > 0 || (f.cards || []).length > 0,
    summary: (f) => firstFew([...f.pokemon.map((p) => `any ${p}`), ...(f.cards || []).map((c) => c.name.replace(/\s*\(.*\)$/, ""))]),
    reset: () => ({ pokemon: [], cards: [] }),
  },
  {
    key: "type", label: "Type",
    active: (f) => f.cardTypes.length === 1,
    summary: (f) => (f.cardTypes[0] === "graded" ? "Graded only" : "Raw only"),
    reset: () => ({ cardTypes: ["graded", "raw"] }),
  },
  {
    key: "grade", label: "Grade",
    active: (f, d) => !same(f.graders, d.graders) || f.minGrade !== d.minGrade || f.maxGrade !== d.maxGrade,
    summary: (f) => `${f.graders.length === GRADERS.length ? "Any grader" : f.graders.join(", ")} ${f.minGrade}${f.maxGrade < 10 ? `–${f.maxGrade}` : "+"}`,
    reset: (d) => ({ graders: d.graders, minGrade: d.minGrade, maxGrade: d.maxGrade }),
    disabled: (f) => !f.cardTypes.includes("graded"),
  },
  {
    key: "condition", label: "Condition",
    active: (f, d) => f.minRawCondition !== d.minRawCondition,
    summary: (f) => RAW_CONDITION_LABELS[f.minRawCondition].replace(" or better", "+"),
    reset: (d) => ({ minRawCondition: d.minRawCondition }),
    disabled: (f) => !f.cardTypes.includes("raw"),
  },
  {
    key: "value", label: "Value",
    active: (f, d) => Number(f.minMarketValue) !== d.minMarketValue || f.maxMarketValue !== null || f.maxPrice !== null,
    summary: (f) => [
      `${usd(f.minMarketValue)}${f.maxMarketValue ? `–${usd(f.maxMarketValue)}` : "+"}`,
      f.maxPrice ? `pay ≤ ${usd(f.maxPrice)}` : null,
    ].filter(Boolean).join(" · "),
    reset: (d) => ({ minMarketValue: d.minMarketValue, maxMarketValue: null, maxPrice: null }),
  },
  {
    key: "discount", label: "Discount",
    active: (f, d) => f.minDiscountPct !== d.minDiscountPct,
    summary: (f) => `${f.minDiscountPct}%+ below`,
    reset: (d) => ({ minDiscountPct: d.minDiscountPct }),
  },
  {
    key: "time", label: "Ends within",
    active: (f, d) => f.maxMinutesLeft !== d.maxMinutesLeft,
    summary: (f) => `${f.maxMinutesLeft} min`,
    reset: (d) => ({ maxMinutesLeft: d.maxMinutesLeft }),
  },
  {
    key: "language", label: "Language",
    active: (f, d) => !same(f.languages, d.languages),
    summary: (f) => f.languages.map((l) => (l === "english" ? "English" : "Japanese")).join(" + "),
    reset: (d) => ({ languages: d.languages }),
  },
  {
    key: "seller", label: "Seller",
    active: (f, d) => f.usOnly || f.hideFlagged || f.minSellerFeedback > 0 || f.minComps !== d.minComps,
    summary: (f) => [f.usOnly ? "US only" : null, f.hideFlagged ? "no red flags" : null,
      f.minSellerFeedback > 0 ? `${f.minSellerFeedback}+ feedback` : null].filter(Boolean).join(" · ") || "Custom",
    reset: (d) => ({ usOnly: false, hideFlagged: false, minSellerFeedback: 0, minComps: d.minComps }),
  },
];

export const activeFacets = (f, d) => FACETS.filter((x) => !x.disabled?.(f) && x.active(f, d));

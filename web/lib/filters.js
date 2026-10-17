// Filter profiles: defaults, validation against a plan, plain-English summary, and deal matching.
// Mirrors pokemon-deal-finder/dealfinder/members.py so the website and the bot agree.

export const GRADERS = ["PSA", "BGS", "CGC", "SGC", "TAG"];
export const LANGUAGES = ["english", "japanese"];
export const CARD_TYPES = ["graded", "raw"];
export const RAW_CONDITIONS = ["NM", "LP", "MP", "HP"];
export const RAW_CONDITION_LABELS = {
  NM: "Near Mint only",
  LP: "Lightly Played or better",
  MP: "Moderately Played or better",
  HP: "Heavily Played or better",
};
export const GRADE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 8.5, 9, 9.5, 10];

export function defaultFilters(plan) {
  return {
    minDiscountPct: Math.max(30, plan.minDiscountFloor),
    maxMinutesLeft: Math.min(10, plan.maxWindowMinutes),
    minMarketValue: Math.max(30, plan.minValueFloor),
    maxMarketValue: null,
    maxPrice: null,
    cardTypes: ["graded", "raw"],
    minRawCondition: "LP",
    graders: [...GRADERS],
    minGrade: 7,
    maxGrade: 10,
    languages: plan.japanese ? ["english", "japanese"] : ["english"],
    pokemon: [], // "any card named …" (e.g. every Charizard)
    cards: [], // specific cards picked from the list: { name, setName, number }
    excludePokemon: [],
    sets: [],
    excludeSets: [],
    minComps: 3,
    minSellerFeedback: 0,
    usOnly: false,
    hideFlagged: false,
  };
}

const num = (v, fallback) => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const words = (v) =>
  (Array.isArray(v) ? v : String(v || "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((s) => s.slice(0, 60));

/** Validate a submitted profile against the member's plan. Returns { filters, errors }. */
export function validateFilters(input, plan) {
  const base = defaultFilters(plan);
  const errors = {};
  const f = { ...base };

  const d = num(input.minDiscountPct, base.minDiscountPct);
  if (Number.isNaN(d) || d > 95) errors.minDiscountPct = "Use a number up to 95%.";
  else if (d < plan.minDiscountFloor)
    errors.minDiscountPct = `Your ${plan.label} plan starts at ${plan.minDiscountFloor}%. Upgrade for lower thresholds.`;
  else f.minDiscountPct = d;

  const m = num(input.maxMinutesLeft, base.maxMinutesLeft);
  if (Number.isNaN(m) || m < 1) errors.maxMinutesLeft = "Use at least 1 minute.";
  else if (m > plan.maxWindowMinutes)
    errors.maxMinutesLeft = `Your ${plan.label} plan allows up to ${plan.maxWindowMinutes} minutes. Upgrade for earlier alerts.`;
  else f.maxMinutesLeft = m;

  const v = num(input.minMarketValue, base.minMarketValue);
  if (Number.isNaN(v) || v < 0) errors.minMarketValue = "Enter a dollar amount.";
  else if (v < plan.minValueFloor) errors.minMarketValue = `Your plan covers cards worth $${plan.minValueFloor}+.`;
  else f.minMarketValue = v;

  for (const key of ["maxMarketValue", "maxPrice"]) {
    const x = num(input[key], null);
    if (x === null) f[key] = null;
    else if (Number.isNaN(x) || x < 0) errors[key] = "Enter a dollar amount or leave it empty.";
    else f[key] = x;
  }
  if (f.maxMarketValue !== null && f.maxMarketValue < f.minMarketValue)
    errors.maxMarketValue = "Max card value can't be below the minimum.";

  const types = words(input.cardTypes).filter((t) => CARD_TYPES.includes(t));
  if (!types.length) errors.cardTypes = "Pick graded, raw, or both.";
  else f.cardTypes = types;
  f.minRawCondition = RAW_CONDITIONS.includes(input.minRawCondition) ? input.minRawCondition : base.minRawCondition;

  const graders = words(input.graders).map((g) => g.toUpperCase()).filter((g) => GRADERS.includes(g));
  if (f.cardTypes.includes("graded") && !graders.length) errors.graders = "Pick at least one grader.";
  else f.graders = graders.length ? graders : base.graders;

  const gmin = num(input.minGrade, base.minGrade);
  const gmax = num(input.maxGrade, base.maxGrade);
  if (!GRADE_STEPS.includes(gmin) || !GRADE_STEPS.includes(gmax)) errors.minGrade = "Pick grades from the list.";
  else if (gmin > gmax) errors.minGrade = "Lowest grade can't be above the highest.";
  else Object.assign(f, { minGrade: gmin, maxGrade: gmax });

  const langs = words(input.languages).map((l) => l.toLowerCase()).filter((l) => LANGUAGES.includes(l));
  if (!langs.length) errors.languages = "Pick at least one language.";
  else if (langs.some((l) => l !== "english") && !plan.japanese) errors.languages = "Japanese cards are a Premium feature.";
  else f.languages = langs;

  for (const key of ["pokemon", "excludePokemon", "sets", "excludeSets"]) f[key] = words(input[key]);
  const text = (v, n) => String(v || "").trim().slice(0, n);
  f.cards = (Array.isArray(input.cards) ? input.cards : [])
    .map((c) => ({ name: text(c?.name, 80), setName: text(c?.setName, 80) || null, number: text(c?.number, 20) || null }))
    .filter((c) => c.name)
    .slice(0, 100);

  const comps = num(input.minComps, base.minComps);
  if (!Number.isInteger(comps) || comps < 3 || comps > 200) errors.minComps = "Use a whole number from 3 to 200.";
  else f.minComps = comps;
  const fb = num(input.minSellerFeedback, 0);
  if (!Number.isInteger(fb) || fb < 0) errors.minSellerFeedback = "Use a whole number.";
  else f.minSellerFeedback = fb;

  f.usOnly = Boolean(input.usOnly);
  f.hideFlagged = Boolean(input.hideFlagged);
  return { filters: f, errors };
}

/** After a downgrade, pull a saved profile back inside the plan's limits (never throws). */
export function clampToPlan(filters, plan) {
  const f = { ...defaultFilters(plan), ...(filters || {}) };
  f.minDiscountPct = Math.max(f.minDiscountPct, plan.minDiscountFloor);
  f.maxMinutesLeft = Math.min(f.maxMinutesLeft, plan.maxWindowMinutes);
  f.minMarketValue = Math.max(f.minMarketValue, plan.minValueFloor);
  if (!plan.japanese) f.languages = ["english"];
  // "Never these" lists were retired from the filter page: you pick what you want, and get just that.
  f.excludePokemon = [];
  f.excludeSets = [];
  return f;
}

const money = (v) => (v === null || v === undefined ? null : `$${Number(v).toLocaleString()}`);
const list = (a) => (a.length <= 2 ? a.join(" or ") : `${a.slice(0, -1).join(", ")} or ${a[a.length - 1]}`);

/** One plain-English sentence describing what a profile looks for. */
export function describe(f) {
  const picked = [...f.pokemon, ...(f.cards || []).map((c) => `${c.name}${c.number ? ` #${cardNo(c.number)}` : ""}`)];
  const what = picked.length ? list(picked) : "Any Pokémon";
  const parts = [];
  if (f.cardTypes.includes("graded")) parts.push(`slabs graded ${f.graders.join("/")} ${f.minGrade}${f.maxGrade < 10 ? `–${f.maxGrade}` : "+"}`);
  if (f.cardTypes.includes("raw")) parts.push(`raw cards in ${RAW_CONDITION_LABELS[f.minRawCondition].toLowerCase()} condition`);
  let s = `${what}${f.sets.length ? ` from ${list(f.sets)}` : ""}: ${parts.join(" and ")}`;
  s += `, worth ${money(f.minMarketValue)}${f.maxMarketValue ? ` to ${money(f.maxMarketValue)}` : "+"}`;
  if (f.maxPrice) s += `, costing up to ${money(f.maxPrice)}`;
  s += `, at least ${f.minDiscountPct}% below market, ending within ${f.maxMinutesLeft} minutes.`;
  const extras = [f.languages.map((l) => l[0].toUpperCase() + l.slice(1)).join(" and ")];
  if (f.usOnly) extras.push("US sellers only");
  if (f.hideFlagged) extras.push("no red flags");
  if (f.excludePokemon.length) extras.push(`never ${list(f.excludePokemon)}`);
  if (f.excludeSets.length) extras.push(`skipping ${list(f.excludeSets)}`);
  return `${s} ${extras.join(", ")}.`;
}

const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hasPhrase = (text, phrase) => {
  const p = norm(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return p && new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(norm(text));
};

/** "006/165" -> "6", "TG05/TG30" -> "TG5": the part of a card number that identifies it within its set. */
const cardNo = (n) => String(n || "").split("/")[0].toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, "$1");

/** Set names are written differently in places ("SV: Scarlet & Violet 151" vs "Scarlet & Violet 151"): compare loosely. */
const setKey = (s) => norm(s).replace(/^[a-z0-9]+:\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
const sameSet = (a, b) => !a || !b || setKey(a) === setKey(b) || setKey(a).includes(setKey(b)) || setKey(b).includes(setKey(a));

/** Does a deal pass a profile? deal = { kind, name, setName, grader, grade, condition, language, discountPct,
 *  marketValue, total, minutesLeft, comps, sellerFeedback, country, flags, title } */
export function matches(f, deal) {
  if (deal.discountPct < f.minDiscountPct) return false;
  if (deal.minutesLeft !== undefined && deal.minutesLeft !== null && deal.minutesLeft > f.maxMinutesLeft) return false;
  if (deal.marketValue < f.minMarketValue || (f.maxMarketValue && deal.marketValue > f.maxMarketValue)) return false;
  if (f.maxPrice && deal.total > f.maxPrice) return false;
  if (!f.cardTypes.includes(deal.kind)) return false;
  if (deal.kind === "raw") {
    if (RAW_CONDITIONS.indexOf(deal.condition) > RAW_CONDITIONS.indexOf(f.minRawCondition)) return false;
  } else {
    if (!f.graders.includes(deal.grader)) return false;
    if (deal.grade < f.minGrade || deal.grade > f.maxGrade) return false;
  }
  if (!f.languages.includes(deal.language)) return false;
  const nameText = `${deal.name} ${deal.title || ""}`;
  const setText = `${deal.setName} ${deal.title || ""}`;
  // Cards: a deal passes if it's one of the picked cards (same name and number) or matches an "any card named" entry.
  const cards = f.cards || [];
  if (cards.length || f.pokemon.length) {
    const byCard = cards.some((c) => hasPhrase(nameText, c.name.replace(/\s*\(.*\)$/, ""))
      && (!c.number || cardNo(c.number) === cardNo(deal.number))
      && sameSet(c.setName, deal.setName));
    if (!byCard && !f.pokemon.some((p) => hasPhrase(nameText, p))) return false;
  }
  if (f.excludePokemon.some((p) => hasPhrase(nameText, p))) return false;
  if (f.sets.length && !f.sets.some((p) => hasPhrase(setText, p))) return false;
  if (f.excludeSets.some((p) => hasPhrase(setText, p))) return false;
  if (deal.comps < f.minComps) return false;
  if (deal.sellerFeedback < f.minSellerFeedback) return false;
  if (f.usOnly && deal.country && deal.country !== "US") return false;
  if (f.hideFlagged && deal.flags?.length) return false;
  return true;
}

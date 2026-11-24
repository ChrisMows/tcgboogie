// Set names and eras for display. The catalog's names carry codes ("SWSH09: Brilliant Stars", "SM - Cosmic Eclipse")
// and many sets have a vague series ("Other", "Promo"), so eras come from release dates. The full catalog name stays
// the key everywhere else (URLs, collection items, deal matching).

const ERAS = [ // newest first: name, first release date
  ["Mega Evolution", "2025-09-01"],
  ["Scarlet & Violet", "2023-01-01"],
  ["Sword & Shield", "2019-11-15"],
  ["Sun & Moon", "2016-11-18"],
  ["XY", "2013-11-08"],
  ["Black & White", "2011-04-25"],
  ["HeartGold & SoulSilver", "2010-02-10"],
  ["Platinum", "2009-02-11"],
  ["Diamond & Pearl", "2007-05-23"],
  ["EX", "2003-06-18"],
  ["e-Card", "2001-09-15"],
  ["Neo", "2000-12-16"],
  ["Classic (Base to Gym)", "1999-01-01"],
];
export const ERA_NAMES = [...ERAS.map(([n]) => n), "Promos & extras", "Topps", "Star Wars: Unlimited", "Disney Lorcana"];

// Series names the catalog uses, for sets without a release date.
const SERIES_ERA = {
  "Mega Evolutions": "Mega Evolution", "Scarlet & Violet": "Scarlet & Violet", "Sword & Shield": "Sword & Shield", "Sun & Moon": "Sun & Moon",
  XY: "XY", "Black & White": "Black & White", "HeartGold & SoulSilver": "HeartGold & SoulSilver", Platinum: "Platinum",
  "Diamond & Pearl": "Diamond & Pearl", EX: "EX", "E-Card": "e-Card", Neo: "Neo", "Base Set": "Classic (Base to Gym)",
  Topps: "Topps", // Topps Pokémon cards (lib/topps.js): not TCG cards, listed after everything else
  "Star Wars: Unlimited": "Star Wars: Unlimited", // other games (lib/swu.js, lib/lorcana.js), listed last
  "Disney Lorcana": "Disney Lorcana",
};

/** "SWSH09: Brilliant Stars" -> { name: "Brilliant Stars", code: "SWSH09" }; "XY - Fates Collide" -> { "Fates Collide", "XY" }. */
export function setLabel(full) {
  const s = String(full || "");
  const m = s.match(/^([A-Z]{1,5}[0-9]{0,3}[a-z]?(?:\.\d)?)\s*(?::|\s-\s)\s*(.+)$/);
  if (m && m[2].length > 2) return { name: m[2], code: m[1] };
  return { name: s, code: null };
}

/** "Scarlet & Violet" -> "scarlet-violet", for /sets?era= links and anchors. */
export const eraSlug = (era) => String(era).toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Not main sets: left out of the header's "newest sets" (they're still under All sets).
const SIDE_SET = /promo|jumbo|trainer kit|mcdonald|league|deck|box|tin|blister|black star|energ|topps/i;
/** The newest released main sets, newest first, for the header's Sets menu. */
export function newestSets(sets, n = 8) {
  const today = new Date().toISOString().slice(0, 10);
  return (sets || []).filter((s) => s.releaseDate && String(s.releaseDate).slice(0, 10) <= today && !SIDE_SET.test(s.name) && (s.total || s.printedTotal || 0) >= 30)
    .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate))).slice(0, n);
}

/**
 * Pokémon sets whose TCGplayer picture is only the plain Pokémon logo (promos, energies, small collections): the set
 * tiles draw their own instead, in the era's colours with the set code and this label. null for every other set.
 */
export function setCategory(name) {
  const s = String(name || "");
  if (/energ(y|ies)\b/i.test(s)) return "Energies";
  if (/trainer kit/i.test(s)) return "Trainer kit";
  if (/first partner|collection 20\d\d/i.test(s)) return "Collection";
  if (/\bpromos?\b|placement|mcdonald|black star/i.test(s)) return "Promos";
  return null;
}

// Each era's two colours, for drawn set tiles.
export const ERA_COLORS = {
  "Mega Evolution": ["#7b2ff7", "#f72f8a"], "Scarlet & Violet": ["#d7263d", "#7a2bd6"], "Sword & Shield": ["#2b6cd6", "#c0263d"],
  "Sun & Moon": ["#f08a24", "#1f8fd6"], XY: ["#1b5fd6", "#d62b4b"], "Black & White": ["#3a3f4a", "#9aa3b2"],
  "HeartGold & SoulSilver": ["#c9a227", "#9aa3b2"], Platinum: ["#7d8597", "#3a4150"], "Diamond & Pearl": ["#3a7bd5", "#e86fa6"],
  EX: ["#d62b2b", "#2b7bd6"], "e-Card": ["#2b9d8f", "#284b63"], Neo: ["#e0a100", "#3a3a3a"], "Classic (Base to Gym)": ["#d62b2b", "#2b5fd6"],
};

/** Which era a set belongs to: its series when that names an era, else its release date ("Other", "Promo"). */
export function eraOf(set) {
  if (SERIES_ERA[set.series]) return SERIES_ERA[set.series];
  const d = String(set.releaseDate || "").slice(0, 10);
  if (d) return (ERAS.find(([, start]) => d >= start) || ERAS[ERAS.length - 1])[0];
  return "Promos & extras";
}

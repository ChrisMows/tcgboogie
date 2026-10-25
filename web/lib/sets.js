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
export const ERA_NAMES = [...ERAS.map(([n]) => n), "Promos & extras", "Topps"];

// Series names the catalog uses, for sets without a release date.
const SERIES_ERA = {
  "Mega Evolutions": "Mega Evolution", "Scarlet & Violet": "Scarlet & Violet", "Sword & Shield": "Sword & Shield", "Sun & Moon": "Sun & Moon",
  XY: "XY", "Black & White": "Black & White", "HeartGold & SoulSilver": "HeartGold & SoulSilver", Platinum: "Platinum",
  "Diamond & Pearl": "Diamond & Pearl", EX: "EX", "E-Card": "e-Card", Neo: "Neo", "Base Set": "Classic (Base to Gym)",
  Topps: "Topps", // Topps Pokémon cards (lib/topps.js): not TCG cards, listed after everything else
};

/** "SWSH09: Brilliant Stars" -> { name: "Brilliant Stars", code: "SWSH09" }; "XY - Fates Collide" -> { "Fates Collide", "XY" }. */
export function setLabel(full) {
  const s = String(full || "");
  const m = s.match(/^([A-Z]{1,5}[0-9]{0,3}[a-z]?(?:\.\d)?)\s*(?::|\s-\s)\s*(.+)$/);
  if (m && m[2].length > 2) return { name: m[2], code: m[1] };
  return { name: s, code: null };
}

/** Which era a set belongs to: its series when that names an era, else its release date ("Other", "Promo"). */
export function eraOf(set) {
  if (SERIES_ERA[set.series]) return SERIES_ERA[set.series];
  const d = String(set.releaseDate || "").slice(0, 10);
  if (d) return (ERAS.find(([, start]) => d >= start) || ERAS[ERAS.length - 1])[0];
  return "Promos & extras";
}

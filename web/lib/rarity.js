// Rarity short codes collectors type ("SIR", "RR", "SAR"…) and the rarity names our price service uses, so the
// collection search finds "umbreon sir" or just "sar". English and Japanese names for the same tier share codes
// (SIR and SAR both find Special Illustration Rare and Special Art Rare). Used in the browser too: no server imports.
const CODES = {
  c: ["Common"],
  u: ["Uncommon"],
  r: ["Rare"],
  h: ["Holo Rare"],
  holo: ["Holo Rare", "Super Rare Holo", "Rare Holo LEGEND", "Rare Holo LV.X"],
  rr: ["Double Rare"],
  rrr: ["Triple Rare"],
  ar: ["Art Rare", "Illustration Rare"],
  ir: ["Illustration Rare", "Art Rare"],
  sar: ["Special Art Rare", "Special Illustration Rare"],
  sir: ["Special Illustration Rare", "Special Art Rare"],
  sr: ["Super Rare", "Secret Rare"],
  ur: ["Ultra Rare"],
  hr: ["Hyper Rare"],
  ssr: ["Shiny Ultra Rare", "Shiny Secret Rare"],
  s: ["Shiny Rare"],
  shr: ["Shiny Holo Rare"],
  chr: ["Character Rare"],
  csr: ["Character Super Rare"],
  ace: ["ACE SPEC Rare", "ACE Rare", "Rare Ace"],
  k: ["Kagayaku", "Radiant Rare"],
  rad: ["Radiant Rare", "Kagayaku"],
  pr: ["Promo"],
  promo: ["Promo"],
  cc: ["Classic Collection"],
  mur: ["Mega Ultra Rare"],
  mhr: ["Mega Hyper Rare"],
  ma: ["Mega Attack Rare"],
  bwr: ["Black White Rare"],
  rb: ["Rainbow Rare"],
  ab: ["Amazing Rare"],
  pt: ["Prism Rare"],
};

const BY_NAME = Object.entries(CODES).reduce((m, [code, names]) => {
  for (const n of names) (m[n.toLowerCase()] ||= []).push(code);
  return m;
}, {});

/** The codes for a rarity name: "Special Illustration Rare" -> ["sar", "sir"]. */
export const rarityCodes = (rarity) => BY_NAME[String(rarity || "").toLowerCase()] || [];

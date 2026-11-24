// Sorting a set's cards (the public set pages and Collection → Sets): by number, price, name or rarity, either way.
// Used in the browser too: no server imports.
import { nmPrice } from "@/lib/collection";

// [key, label, the direction it starts in]
export const SET_SORTS = [["number", "Card number", "asc"], ["price", "Price", "desc"], ["name", "Name", "asc"], ["rarity", "Rarity", "desc"]];
export const DIR_LABEL = {
  number: { asc: "Low to high", desc: "High to low" },
  price: { asc: "Low to high", desc: "High to low" },
  name: { asc: "A to Z", desc: "Z to A" },
  rarity: { asc: "Common first", desc: "Rarest first" },
};

/** { field, dir } from a page's ?sort= and ?dir= (older links said sort=price-high / price-low). */
export function readSort(sort, dir) {
  let field = String(sort || "number");
  let d = String(dir || "");
  if (field === "price-high") [field, d] = ["price", "desc"];
  if (field === "price-low") [field, d] = ["price", "asc"];
  const known = SET_SORTS.find(([k]) => k === field) || SET_SORTS[0];
  return { field: known[0], dir: d === "asc" || d === "desc" ? d : known[2] };
}

// Rarity from most common to rarest (Pokémon, then Star Wars: Unlimited's). Unlisted ones sit in the middle, by name.
const RARITY_ORDER = ["common", "uncommon", "special", "rare", "rare holo", "holo rare", "double rare", "legendary", "ultra rare",
  "illustration rare", "art rare", "shiny rare", "shiny ultra rare", "ace spec rare", "super rare", "secret rare", "special art rare",
  "special illustration rare", "shiny secret rare", "hyper rare"];
// Disney Lorcana's own ladder (its Legendary sits above Super Rare, unlike Pokémon's).
const LORCANA_ORDER = ["common", "uncommon", "rare", "super rare", "legendary", "epic", "enchanted", "iconic"];
const rarityRank = (r, lorcana = false) => {
  const i = (lorcana ? LORCANA_ORDER : RARITY_ORDER).indexOf(String(r || "").toLowerCase());
  return i >= 0 ? i : r ? 9.5 : -1; // no rarity: most common end
};

// "4/102", "SV047", "TG05": letters first as a group, then the number in order.
const numParts = (c) => {
  const n = String(c.number || "").split("/")[0];
  const d = parseInt(n.replace(/\D/g, ""), 10);
  return [n.replace(/\d/g, ""), Number.isFinite(d) ? d : 1e9];
};
const byNumber = (a, b) => { const [pa, na] = numParts(a), [pb, nb] = numParts(b); return pa.localeCompare(pb) || na - nb; };
// Pokémon names end in " - 025/165" (left out); Star Wars names keep their subtitle ("Darth Vader - Commanding").
export const shortName = (n) => String(n || "").replace(/\s+-\s+\S*\d\S*$/, "");

/** A sorted copy. Cards with no price (or no number) go last whichever way the list runs. */
export function sortSetCards(cards, field, dir) {
  const sign = dir === "desc" ? -1 : 1;
  const cmp = {
    number: (a, b) => sign * byNumber(a, b),
    price: (a, b) => {
      const pa = nmPrice(a), pb = nmPrice(b);
      if (pa == null || pb == null) return (pa == null) - (pb == null) || byNumber(a, b);
      return sign * (pa - pb) || byNumber(a, b);
    },
    name: (a, b) => sign * shortName(a.name).localeCompare(shortName(b.name)) || byNumber(a, b),
    rarity: (a, b) => sign * (rarityRank(a.rarity, Boolean(a.lorcana)) - rarityRank(b.rarity, Boolean(b.lorcana)) || String(a.rarity || "").localeCompare(String(b.rarity || ""))) || byNumber(a, b),
  }[field] || ((a, b) => byNumber(a, b));
  return [...cards].sort(cmp);
}

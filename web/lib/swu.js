import "server-only";
import { makeTcgcsvGame } from "@/lib/tcgcsv";

// Star Wars: Unlimited cards and sealed product, priced from TCGCSV (lib/tcgcsv.js): category 79, about 70 requests
// a day. IDs "swu-<productId>". Hyperspace, Showcase and Prestige cards are their own products ("Obi-Wan Kenobi -
// Patient Mentor (Hyperspace)"); Normal and Foil are a product's printings.

export const SWU_SERIES = "Star Wars: Unlimited";

export const swu = makeTcgcsvGame({
  key: "swu", category: 79, prefix: "swu-", series: SWU_SERIES, short: "Star Wars",
  setPrefix: "Star Wars: ", // set names carry it, so they never collide with a Pokémon set ("Judge Promos")
  foils: ["Foil"],
  facts: (x) => ({ aspect: x("Aspect")?.split(/\s*;\s*/).join(" · ") ?? null, cardType: x("CardType"), cost: x("Cost"), power: x("Power"), hp: x("HP"), arena: x("Arena Type"), traits: x("Traits") }),
  // "star wars vader", "swu boba", "hyperspace luke"
  asks: /\b(star\s*wars|swu|hyperspace|showcase|prestige|spark of rebellion|jump to lightspeed|twilight of the republic|shadows of the galaxy|legends of the force|secrets of power|a lawless time|ashes of the empire|homeworlds)\b/i,
  stop: ["star", "wars", "swu", "unlimited"],
});

export const isSwuId = swu.isId;
export const refreshSwu = swu.refresh;
export const prefetchSwu = swu.prefetch;
export const swuProduct = swu.product;
export const swuSets = swu.sets;
export const swuSetByName = swu.setByName;
export const swuSetCards = swu.setCards;
export const asksForSwu = swu.asks;
export const searchSwu = swu.search;
export const swuImportStatus = swu.importStatus;

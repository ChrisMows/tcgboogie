import "server-only";
import { makeTcgcsvGame } from "@/lib/tcgcsv";

// Disney Lorcana cards and sealed product, priced from TCGCSV (lib/tcgcsv.js): category 71, about 45 requests a day.
// IDs "lcr-<productId>". Enchanted, Epic and Iconic cards are their own products ("Elsa - Snow Queen (Epic)", foil
// only: Holofoil); Normal and Cold Foil are a regular card's printings.

export const LORCANA_SERIES = "Disney Lorcana";

export const lorcana = makeTcgcsvGame({
  key: "lorcana", category: 71, prefix: "lcr-", series: LORCANA_SERIES, short: "Lorcana",
  setPrefix: "Lorcana: ", // set names carry it, so they never collide with a Pokémon set
  foils: ["Cold Foil", "Holofoil"],
  facts: (x) => ({
    ink: x("InkType"), cardType: x("CardType"), classification: x("Classification"), cost: x("Cost Ink"), lore: x("Lore Value"),
    strength: x("Strength"), willpower: x("Willpower"), franchise: x("Property"), inkable: x("InkwellIcononCard"),
  }),
  // "lorcana elsa", "enchanted stitch", "fabled mickey"
  asks: /\b(lorcana|enchanted|cold foil|the first chapter|rise of the floodborn|into the inklands|ursula'?s return|shimmering skies|azurite sea|archazia'?s island|reign of jafar|fabled|whispers in the well|winterspell|wilds unknown|attack of the vine|hyperia city|into the inkdark|illumineer'?s quest)\b/i,
  stop: ["disney", "lorcana"],
});

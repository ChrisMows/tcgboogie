import "server-only";
import { lorcana } from "@/lib/lorcana";
import { swu } from "@/lib/swu";

// Every game priced from TCGCSV (lib/tcgcsv.js), for pages that treat them alike: Star Wars: Unlimited, Disney Lorcana.
export const TCG_GAMES = [swu, lorcana];

export const tcgGameOfId = (id) => TCG_GAMES.find((gm) => gm.isId(id)) || null;
export const isTcgId = (id) => Boolean(tcgGameOfId(id));
export const tcgGameOfSet = (name) => TCG_GAMES.find((gm) => String(name || "").startsWith(gm.setPrefix)) || null;

/** One product of any TCGCSV game by ID, or null. */
export const tcgProduct = (id) => tcgGameOfId(id)?.product(id) ?? null;
export const prefetchTcg = (ids) => Promise.all(TCG_GAMES.map((gm) => gm.prefetch(ids)));
/** Every set of every TCGCSV game (failures leave that game out). */
export const allTcgSets = async () => (await Promise.all(TCG_GAMES.map((gm) => gm.sets().catch(() => [])))).flat();
/** The set by its full name ("Lorcana: Fabled") and its game, or null. */
export async function tcgSetByName(name) {
  const gm = tcgGameOfSet(name);
  const set = gm ? await gm.setByName(name) : null;
  return set ? { ...set, game: gm } : null;
}

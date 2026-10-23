import "server-only";
import { getProduct, getSetCards } from "@/lib/catalog";
import { nmPrice } from "@/lib/collection";

// Pictures and values for the cards picked in deal filters (Deals page: the collapsed row's picture strip and the
// "Cards in this filter" grid). Cards picked since the picker saved product IDs carry one (and their picture); older
// picks only have name, set and number, so they're matched in their set's card list (cached and shared, as on
// set pages). At most a few sets per page load.

/** The key a filter card is looked up by: name | number | set. */
export const filterCardKey = (c) => `${c?.name || ""}|${c?.number || ""}|${c?.setName || ""}`;

const bare = (n) => String(n || "").toUpperCase().replace(/\s/g, "").split("/")[0].replace(/^0+(?=\w)/, "");
const MAX_SETS = 4;

/** { [filterCardKey]: { productId, image, value, language } } for every card in these filters. */
export async function filterCardInfo(filtersList) {
  const cards = filtersList.flatMap((f) => f?.cards || []);
  const out = {};
  const byId = cards.filter((c) => c.productId);
  await Promise.all(byId.map(async (c) => {
    const p = await getProduct(c.productId, { cachedOnly: true }).catch(() => null); // never spends credits here
    out[filterCardKey(c)] = { productId: c.productId, image: c.image || p?.image || null, value: p ? nmPrice(p) : null };
  }));
  const older = cards.filter((c) => !c.productId && c.setName && !out[filterCardKey(c)]);
  const sets = [...new Set(older.map((c) => c.setName))].slice(0, MAX_SETS);
  await Promise.all(sets.map(async (setName) => {
    const list = await getSetCards(setName).catch(() => []);
    for (const c of older.filter((x) => x.setName === setName)) {
      const p = list.find((x) => bare(x.number) === bare(c.number) && x.name === c.name)
        || list.find((x) => bare(x.number) === bare(c.number));
      if (p) out[filterCardKey(c)] = { productId: p.id, image: p.image || null, value: nmPrice(p) };
    }
  }));
  return out;
}

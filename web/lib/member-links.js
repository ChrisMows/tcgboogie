import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getProduct, searchProducts } from "@/lib/catalog";
import { marketValue } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

/*
 * Member-added cards that the price service has since added (lib/member-cards.js). A card added from a TCGplayer link
 * keeps TCGplayer's number, so its prices appear by themselves. One added from an eBay listing or another page has an
 * "m-" number instead, and nothing would ever connect it to the real card. Once a day (the price-alert cron) each such
 * card is looked up by name and number; when exactly one priced card matches, every copy, price alert and reported
 * sale moves over to it, and the member-added card is hidden. Several matches (a regular promo and a Pokémon Center
 * version, say) are left alone and logged, since we can't tell which one members have.
 * Seen Nov 2026: Kyogre #117 (Mega Evolution Promos), added from eBay before release, stayed on a member's own value.
 */
const { memberCards, collectionItems, priceWatches, sales } = schema;
const GENERIC = new Set(["promo", "promos", "pokemon", "card", "cards", "the", "and", "black", "star", "collection"]);

const baseName = (n) => String(n || "").replace(/\s*\(.*?\)/g, "").replace(/\s+-\s+\S+$/, "").trim().toLowerCase();
const cardNumber = (n) => String(n || "").split("/")[0].trim().toLowerCase().replace(/^0+(?=\d)/, ""); // "017/165" -> "17"
const versionOf = (n) => (String(n || "").match(/\((.*?)\)/g) || []).map((v) => v.replace(/[()]/g, "").trim().toLowerCase()).sort().join("|");
const setWords = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w)));

/** The priced cards that are this member-added card. */
export function matchesFor(card, results) {
  const wantSet = setWords(card.setName);
  return results.filter((p) => {
    if (p.type !== "card" || !/^\d+$/.test(String(p.id))) return false;
    if ((p.language || "english") !== (card.language || "english")) return false;
    if (cardNumber(p.number) !== cardNumber(card.number)) return false;
    if (baseName(p.name) !== baseName(card.name)) return false;
    // A special version ("(Pokemon Center Exclusive)", "(Prerelease)") only matches a card named that way too, both ways.
    if (versionOf(p.name) !== versionOf(card.name)) return false;
    if (!wantSet.size) return true;
    const have = setWords(p.setName);
    return [...wantSet].some((w) => have.has(w));
  });
}

/** Moves every copy, price alert and reported sale of member-added card `from` to the priced product `to`. */
export async function moveMemberCard(from, to) {
  const printings = Object.keys(to.prices || {});
  const items = await db.select().from(collectionItems).where(eq(collectionItems.productId, from.productId));
  for (const it of items) {
    // A raw copy keeps its printing when the card has it; otherwise it takes the card's main printing.
    const printing = it.kind === "raw" && !printings.includes(it.printing) ? printings[0] || it.printing : it.printing;
    const moved = { ...it, printing };
    await db.update(collectionItems).set({
      productId: to.id, productType: to.type, name: to.name, setName: to.setName, number: to.number, image: to.image, tcgplayerUrl: to.tcgplayerUrl,
      printing, unitValue: marketValue(to, moved), valueUpdatedAt: new Date(),
    }).where(and(eq(collectionItems.id, it.id), eq(collectionItems.productId, from.productId)));
  }
  const watches = await db.update(priceWatches).set({
    productId: to.id, productType: to.type, name: to.name, setName: to.setName, number: to.number, image: to.image, tcgplayerUrl: to.tcgplayerUrl,
  }).where(eq(priceWatches.productId, from.productId)).returning({ id: priceWatches.id });
  const sold = await db.update(sales).set({ productId: to.id }).where(eq(sales.productId, from.productId)).returning({ id: sales.id });
  await db.update(memberCards).set({ hidden: true }).where(eq(memberCards.productId, from.productId));
  await log("prices", "info", `Member-added card ${from.name} #${from.number || "?"} (${from.productId}) is now priced: moved ${items.length} copies, ${watches.length} price alerts and ${sold.length} sales to ${to.name} (${to.id})`,
    { from: from.productId, to: to.id });
  return { copies: items.length, watches: watches.length, sales: sold.length };
}

/** The daily check. Returns { checked, moved, several, severalMatches } (the last for lib/stuck-values.js). */
export async function linkPricedMemberCards() {
  if (!db) return { checked: 0, moved: 0, several: 0, severalMatches: [] };
  const cards = await db.select().from(memberCards).where(and(eq(memberCards.hidden, false), eq(memberCards.type, "card"),
    sql`${memberCards.productId} like 'm-%'`, sql`${memberCards.language} in ('english', 'japanese')`, sql`coalesce(${memberCards.number}, '') <> ''`));
  let moved = 0, several = 0;
  const severalMatches = [];
  for (const card of cards) {
    try {
      const results = await searchProducts(`${card.name} ${card.number}${card.language === "japanese" ? " japanese" : " english"}`);
      const found = matchesFor(card, results);
      if (found.length > 1) {
        several++;
        severalMatches.push({ productId: card.productId, name: card.name, number: card.number, matches: found.map((p) => `${p.name} (${p.id})`) });
        await log("prices", "info", `Member-added card ${card.name} #${card.number} (${card.productId}) matches ${found.length} priced cards; left as it is`,
          { from: card.productId, matches: found.map((p) => `${p.name} (${p.id})`) });
        continue;
      }
      if (found.length !== 1) continue;
      const to = await getProduct(found[0].id); // the full card, with every printing's prices
      if (!to) continue;
      await moveMemberCard(card, to);
      moved++;
    } catch (e) {
      await log("prices", "warn", `Checking member-added card ${card.productId} failed: ${e.message}`);
    }
  }
  return { checked: cards.length, moved, several, severalMatches };
}

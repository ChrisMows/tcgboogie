import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { appToken } from "@/lib/ebay-sell";
import { log } from "@/lib/log";

// "Report a sale": a member pastes an eBay listing we missed. We read it through eBay's official Browse API (which
// still returns a listing for a while after it ends), check it really sold and is this card at a readable grade,
// then save it to our own sales history, where it counts toward the card's graded value.
const GRADERS = { psa: "PSA", cgc: "CGC", bgs: "BGS", beckett: "BGS", sgc: "SGC", tag: "TAG" };
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();

export const itemIdFrom = (input) => (String(input || "").match(/(?:itm\/(?:[^/?#]+\/)?|item=|^)(\d{10,14})(?!\d)/) || [])[1] || null;

function gradeOf(item) {
  const aspect = (name) => (item.localizedAspects || []).find((a) => a.name?.toLowerCase() === name)?.value || "";
  const graderText = norm(aspect("professional grader"));
  const grader = Object.entries(GRADERS).find(([k]) => graderText.includes(k))?.[1];
  const grade = aspect("grade").match(/\d+(?:\.5)?/)?.[0];
  if (grader && grade) return { grader, grade };
  const m = String(item.title || "").match(/\b(PSA|CGC|BGS|SGC|TAG)\s*(?:GEM\s*(?:MINT|MT)\s*)?(\d{1,2}(?:\.5)?)\b/i);
  return m ? { grader: m[1].toUpperCase(), grade: m[2] } : null;
}

/** Check and save a reported sale. Returns { ok, message }. */
export async function reportSale(user, product, input) {
  const id = itemIdFrom(input);
  if (!id) return { ok: false, message: "Paste the eBay listing link (it has a long item number in it)." };
  if (!db) return { ok: false, message: "Not available in the preview." };
  const [dupe] = await db.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.itemId, id)).limit(1);
  if (dupe) return { ok: true, message: "We already have that sale. Thanks!" };

  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`, {
    headers: { Authorization: `Bearer ${await appToken()}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" }, cache: "no-store",
  });
  if (r.status === 404) return { ok: false, message: "eBay doesn't return that listing any more (older sales drop off). Thanks anyway!" };
  if (!r.ok) return { ok: false, message: "eBay didn't answer just now. Please try again in a minute." };
  const item = await r.json();

  if (!item.itemEndDate || new Date(item.itemEndDate) > new Date()) return { ok: false, message: "That listing hasn't ended yet. Report it once it sells." };
  const sold = (item.estimatedAvailabilities || [])[0]?.estimatedSoldQuantity || 0;
  if (sold < 1) return { ok: false, message: "That listing ended without selling, so it isn't a sale." };
  const options = item.buyingOptions || [];
  if (options.includes("BEST_OFFER") && !options.includes("AUCTION")) {
    return { ok: false, message: "That sold through Best Offer, and eBay doesn't show the price actually paid, so we can't use it." };
  }
  const title = norm(item.title);
  const number = norm(String(product.number || "").split("/")[0]).replace(/^0+(?=\d)/, "");
  const nameWord = norm(product.name).split(" ").find((w) => w.length > 2);
  if ((number && !new RegExp(`(^|[^0-9])0*${number}([^0-9]|$)`).test(title)) || (nameWord && !title.includes(nameWord))) {
    return { ok: false, message: "That listing's title doesn't match this card (name and number), so we didn't add it." };
  }
  const japaneseListing = /\bjapanese\b|\bjapan\b|\bjpn?\b/.test(title);
  if (japaneseListing !== (product.language === "japanese")) {
    return { ok: false, message: `That listing looks like the ${japaneseListing ? "Japanese" : "English"} version, not this card.` };
  }
  const g = gradeOf(item);
  if (!g) return { ok: false, message: "We only add graded sales for now (raw card prices come from TCGplayer). We couldn't read a grade on that listing." };

  const price = Number(item.currentBidPrice?.value || item.price?.value);
  if (!price) return { ok: false, message: "We couldn't read the sale price on that listing." };
  const ship = Number((item.shippingOptions || [])[0]?.shippingCost?.value);
  await db.insert(schema.sales).values({
    itemId: id, productId: String(product.id), kind: "graded", grader: g.grader, grade: g.grade, language: product.language || "english",
    price, shipping: Number.isFinite(ship) ? ship : null, soldAt: new Date(item.itemEndDate), title: String(item.title || "").slice(0, 300),
    url: item.itemWebUrl || `https://www.ebay.com/itm/${id}`, source: "member", reportedBy: user.id,
  }).onConflictDoNothing();
  await log("prices", "info", `Sale reported: ${g.grader} ${g.grade} ${product.name} $${price}`, { item: id, product: product.id }, user.id);
  return { ok: true, message: `Added: ${g.grader} ${g.grade} sold for $${price.toLocaleString("en-US")} on ${new Date(item.itemEndDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. It now counts toward this card's value.` };
}

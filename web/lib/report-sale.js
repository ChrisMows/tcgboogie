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

// Only eBay's own sites (ebay.com, ebay.co.uk, ebay.ca, ...), and eBay app share links (ebay.us), are accepted.
const EBAY_HOST = /(^|\.)ebay\.(com|ca|co\.uk|com\.au|de|fr|it|es|ie|at|ch|nl|be|pl|com\.sg|com\.my|ph|com\.hk)$/i;

/** The item number from an eBay listing link, or null if it isn't one. Share links (ebay.us) are followed to eBay. */
export async function itemIdFromLink(input) {
  let url;
  try { url = new URL(String(input || "").trim()); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (/^(www\.)?ebay\.us$/i.test(url.hostname)) {
    try { // follow the share link one hop, only to an eBay site
      const r = await fetch(url, { redirect: "manual", cache: "no-store" });
      const to = r.headers.get("location");
      url = to ? new URL(to, url) : url;
    } catch { return null; }
  }
  if (!EBAY_HOST.test(url.hostname)) return null;
  const m = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,14})(?!\d)/) || url.search.match(/[?&]item=(\d{9,14})(?!\d)/);
  return m ? m[1] : null;
}

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
export async function reportSale(user, product, input, soldOn = null) {
  const id = await itemIdFromLink(input);
  if (!id) return { ok: false, message: "That doesn't look like an eBay listing link. Open the sold listing on eBay and copy its link (it looks like ebay.com/itm/…)." };
  if (!db) return { ok: false, message: "Not available in the preview." };
  const [dupe] = await db.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.itemId, id)).limit(1);
  if (dupe) return { ok: true, message: "We already have that sale. Thanks!" };

  const r = await fetch(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`, {
    headers: { Authorization: `Bearer ${await appToken()}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" }, cache: "no-store",
  });
  if (r.status === 404) return { ok: false, message: "eBay doesn't return that listing any more (older sales drop off). Thanks anyway!" };
  if (!r.ok) return { ok: false, message: "eBay didn't answer just now. Please try again in a minute." };
  const item = await r.json();

  // Sold and completed: eBay counts a sale, and the listing is over (its end date has passed, or nothing is left to
  // buy - a sold Buy It Now doesn't always carry an end date the way auctions do).
  const avail = (item.estimatedAvailabilities || [])[0] || {};
  const sold = Number(avail.estimatedSoldQuantity || 0);
  const left = Number(avail.estimatedAvailableQuantity ?? avail.estimatedRemainingQuantity ?? 0);
  const ended = (item.itemEndDate && new Date(item.itemEndDate) <= new Date()) || (avail.estimatedAvailabilityStatus === "OUT_OF_STOCK" && left === 0);
  const why = { item: id, endDate: item.itemEndDate || null, status: avail.estimatedAvailabilityStatus || null, sold, left, options: item.buyingOptions };
  if (!ended) {
    await log("prices", "info", "Sale report turned down: listing still active", why, user.id);
    return { ok: false, message: left > 0 && sold > 0
      ? "That listing is still selling more copies, so it isn't a completed sale. Report a listing once it has ended."
      : "That listing is still active. Report it once it has sold and ended." };
  }
  if (sold < 1) {
    await log("prices", "info", "Sale report turned down: ended without a sale", why, user.id);
    return { ok: false, message: "That listing ended without selling, so it isn't a sale." };
  }
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
  // A sold-out Buy It Now often has no end date in eBay's data, so the member gives the "Sold" date eBay shows.
  let soldAt = item.itemEndDate ? new Date(item.itemEndDate) : null;
  if (!soldAt) {
    const listed = item.itemCreationDate ? new Date(item.itemCreationDate) : null;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(soldOn || "")) ? new Date(`${soldOn}T12:00:00Z`) : null;
    if (!day) return { ok: false, needDate: true, message: "eBay doesn't give this sale's date. Enter the date eBay shows next to “Sold” on the listing, then press Add sale again." };
    if (day > new Date() || (listed && day < new Date(listed.toISOString().slice(0, 10) + "T00:00:00Z"))) {
      return { ok: false, needDate: true, message: `That date doesn't fit: the listing went up ${listed ? listed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "later"} and it can't be in the future.` };
    }
    soldAt = day;
  }
  await db.insert(schema.sales).values({
    itemId: id, productId: String(product.id), kind: "graded", grader: g.grader, grade: g.grade, language: product.language || "english",
    price, shipping: Number.isFinite(ship) ? ship : null, soldAt: soldAt, title: String(item.title || "").slice(0, 300),
    url: item.itemWebUrl || `https://www.ebay.com/itm/${id}`, source: "member", reportedBy: user.id,
  }).onConflictDoNothing();
  await log("prices", "info", `Sale reported: ${g.grader} ${g.grade} ${product.name} $${price}`, { item: id, product: product.id }, user.id);
  return { ok: true, message: `Added: ${g.grader} ${g.grade} sold for $${price.toLocaleString("en-US")} on ${soldAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. It now counts toward this card's value.` };
}

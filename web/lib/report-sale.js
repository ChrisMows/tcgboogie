import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { gradeName } from "@/lib/collection";
import { db, schema } from "@/lib/db";
import { appToken } from "@/lib/ebay-sell";
import { log } from "@/lib/log";

// "Report a sale": a member pastes an eBay listing we missed. We read it through eBay's official Browse API (which
// still returns a listing for a while after it ends), check it really sold and is this card at a readable grade,
// then save it to our own sales history. Graded sales count toward the card's graded value. Raw sales only list on the card
// page: a raw card's value stays TCGplayer's, since one eBay sale can be any condition.
const GRADERS = { psa: "PSA", cgc: "CGC", bgs: "BGS", beckett: "BGS", sgc: "SGC", tag: "TAG" };
const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();

// Only eBay's own sites (ebay.com, ebay.co.uk, ebay.ca, ...), and eBay app share links (ebay.us), are accepted.
const EBAY_HOST = /(^|\.)ebay\.(com|ca|co\.uk|com\.au|de|fr|it|es|ie|at|ch|nl|be|pl|com\.sg|com\.my|ph|com\.hk)$/i;

const SHARE_HOST = /^(www\.)?ebay\.us$/i;
const idIn = (url) => (url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,14})(?!\d)/) || url.search.match(/[?&](?:item|itemId)=(\d{9,14})(?!\d)/i))?.[1] || null;

/**
 * The first web link in what a member pasted, or null. The eBay app's Share → Copy puts words around the link
 * ("Check out this listing on eBay! https://ebay.us/m/…"), so the link is picked out of the text.
 */
export function linkIn(input) {
  const m = String(input || "").match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  try { return new URL(m[0].replace(/[).,!?;:]+$/, "")); } catch { return null; }
}

/**
 * The item number from an eBay listing link, or null if it isn't one. App share links (ebay.us/m/…) are followed
 * through their redirects (eBay sites only, up to 5), and if eBay lands on a page instead, the page names the item.
 */
export async function itemIdFromLink(input) {
  let url = linkIn(input);
  if (!url || !(SHARE_HOST.test(url.hostname) || EBAY_HOST.test(url.hostname))) return null;
  if (idIn(url) && EBAY_HOST.test(url.hostname)) return idIn(url);
  const headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", Accept: "text/html,*/*" };
  try {
    for (let hop = 0; hop < 5; hop++) {
      const r = await fetch(url, { redirect: "manual", cache: "no-store", headers, signal: AbortSignal.timeout(8000) });
      const to = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (to) {
        url = new URL(to, url);
        if (!(SHARE_HOST.test(url.hostname) || EBAY_HOST.test(url.hostname))) return null;
        if (idIn(url) && EBAY_HOST.test(url.hostname)) return idIn(url);
        continue;
      }
      if (!r.ok) return null;
      const html = (await r.text()).slice(0, 300000); // a landing page: its canonical link or item id names the listing
      return html.match(/ebay\.[a-z.]+\/itm\/(?:[^/"'?\s]+\/)?(\d{9,14})(?!\d)/i)?.[1] || html.match(/"(?:itemId|legacyItemId)"\s*:\s*"?(\d{9,14})(?!\d)/)?.[1] || null;
    }
  } catch { /* eBay didn't answer */ }
  return null;
}

/**
 * Which language a listing is: "japanese", "english", "korean", ... or null when it doesn't say. The title naming Japan
 * settles it, since sellers often leave eBay's Language field on its default. Otherwise that field: many Japanese cards are
 * listed with Japanese only there. Other languages come from the field too, and from the title as a last resort.
 */
export function listingLanguage(item) {
  const title = norm(item.title);
  if (/\bjapanese\b|\bjapan\b|\bjpn?\b/.test(title)) return "japanese";
  const field = norm((item.localizedAspects || []).find((a) => a.name?.toLowerCase() === "language")?.value);
  const known = (text) => ["japanese", "english", "korean", "chinese"].find((l) => text.includes(l)) || null;
  return known(field) || known(title);
}

/** The grader and grade a listing was sold at, or null. Exported for its tests. */
export function gradeOf(item) {
  const aspect = (name) => (item.localizedAspects || []).find((a) => a.name?.toLowerCase() === name)?.value || "";
  const graderText = norm(aspect("professional grader"));
  const grader = Object.entries(GRADERS).find(([k]) => graderText.includes(k))?.[1];
  const grade = aspect("grade").match(/\d+(?:\.5)?/)?.[0];
  // CGC and BGS 10s sell by slab label: keep them apart. "Pristine" counts next to the number only, so "CGC 10, pristine
  // condition" stays an everyday 10. (BGS's plain 10 is its Pristine.)
  const text = `${item.title} ${aspect("grade")}`.toLowerCase();
  const label = (g) => {
    if (g.grade !== "10") return g;
    if (g.grader === "BGS" && /black\s*label/.test(text)) return { ...g, grade: "10 Black Label" };
    if (g.grader === "CGC" && /pristine[\s-]*10\b|\b10[\s-]*pristine\b(?!\s+(?:condition|corners?|edges?|centering|surface|shape|card|copy|slab|case|look\w*))/.test(text)) return { ...g, grade: "10 Pristine" };
    return g;
  };
  if (grader && grade) return label({ grader, grade });
  const m = String(item.title || "").match(/\b(PSA|CGC|BGS|SGC|TAG)\s*(?:GEM\s*(?:MINT|MT)\s*|PRISTINE\s*|BLACK\s*LABEL\s*)?(\d{1,2}(?:\.5)?)\b/i);
  return m ? label({ grader: m[1].toUpperCase(), grade: m[2] }) : null;
}

// Ways a slab or something other than one card shows in a title, for listings without a grade we can read.
const SLAB_WORDS = /\b(?:psa|cgc|bgs|bvg|beckett|sgc|tag|ace|ars|pca|hga|gma|mnt|ksa|aura|cga|bccg)\s*(?:gem\s*(?:mint|mt)\s*|pristine\s*|mint\s*)?\d|(?<!un)(?<!not\s)\bgraded\b|\bslab(?:bed)?\b/i;
const NOT_ONE_CARD = /\blots?\b|\bbundle\b|\bplayset\b|\bset of\b|\bproxy\b|\bcustom\b|\bfan\s*art\b|\bcode\s*card\b|\bdigital\b|\bsealed\b|\bbooster\b|\b[2-9]\s*x\b|\bx\s*[2-9]\b/i;
const CONDITIONS = [[/near\s*mint|\bnm\b/i, "Near Mint"], [/lightly|excellent/i, "Lightly Played"], [/moderately|very\s*good/i, "Moderately Played"], [/heavily|poor/i, "Heavily Played"], [/damaged/i, "Damaged"]];

/**
 * Whether a listing with no readable grade is one raw card, and in what condition. Returns { raw: true, condition } or
 * { raw: false, why }. eBay marks ungraded cards with condition 4000 and a "Card Condition" (seen on real listings, Nov 2026).
 * Exported for its tests.
 */
export function rawOf(item) {
  const title = String(item.title || "");
  if (String(item.conditionId) === "2750" || SLAB_WORDS.test(title)) return { raw: false, why: "That listing looks graded, but we couldn't read its grader and grade." };
  if (String(item.conditionId) !== "4000") return { raw: false, why: "eBay doesn't list that as an ungraded card, and we couldn't read a grade on it." };
  if (NOT_ONE_CARD.test(title) || Number(item.lotSize) > 1) return { raw: false, why: "That looks like more than one card, so it doesn't tell us this card's price." };
  const said = (item.conditionDescriptors || []).find((d) => d.name?.toLowerCase() === "card condition")?.values?.[0]?.content || "";
  return { raw: true, condition: CONDITIONS.find(([re]) => re.test(said))?.[1] || null };
}

/** A card's raw sales that members reported in the last 90 days, newest first, for its page. */
export async function rawSales(productId, language = "english") {
  if (!db) return [];
  try {
    return await db.select().from(schema.sales).where(and(eq(schema.sales.productId, String(productId)), eq(schema.sales.kind, "raw"), eq(schema.sales.language, language),
      gte(schema.sales.soldAt, new Date(Date.now() - 90 * 86400000)))).orderBy(desc(schema.sales.soldAt)).limit(40);
  } catch { return []; }
}

/** Check and save a reported sale. Returns { ok, message }. */
export async function reportSale(user, product, input, soldOn = null) {
  const id = await itemIdFromLink(input);
  if (!id) return { ok: false, message: "That doesn't look like an eBay listing link. Open the sold listing on eBay and copy its link (it looks like ebay.com/itm/…)." };
  if (!db) return { ok: false, message: "Not available in the preview." };
  const [dupe] = await db.select({ id: schema.sales.id }).from(schema.sales).where(eq(schema.sales.itemId, id)).limit(1);
  if (dupe) return { ok: true, already: true, message: "We already have that sale. Thanks!" };

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
  // Only when the listing clearly says otherwise: it has already matched this card's name and number.
  const language = listingLanguage(item);
  if (language && language !== (product.language || "english")) {
    return { ok: false, message: `That listing is the ${language[0].toUpperCase()}${language.slice(1)} version, not this card.` };
  }
  const g = gradeOf(item);
  const raw = g ? null : rawOf(item);
  if (raw && !raw.raw) return { ok: false, message: raw.why };

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
    itemId: id, productId: String(product.id), language: product.language || "english",
    ...(g ? { kind: "graded", grader: g.grader, grade: g.grade } : { kind: "raw", condition: raw.condition }),
    price, shipping: Number.isFinite(ship) ? ship : null, soldAt: soldAt, title: String(item.title || "").slice(0, 300),
    url: item.itemWebUrl || `https://www.ebay.com/itm/${id}`, source: "member", reportedBy: user.id,
  }).onConflictDoNothing();
  await log("prices", "info", `Sale reported: ${g ? `${g.grader} ${g.grade}` : `raw${raw.condition ? ` ${raw.condition}` : ""}`} ${product.name} $${price}`, { item: id, product: product.id }, user.id);
  const when = soldAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!g) return { ok: true, message: `Added: raw${raw.condition ? ` (${raw.condition})` : ""} sold for $${price.toLocaleString("en-US")} on ${when}. It now shows in this card's recent sales. The raw value still comes from TCGplayer.` };
  // CGC and BGS 10s take their value from the service's price for that label; the sale shows in this card's recent sales.
  const labelled = (g.grader === "CGC" || g.grader === "BGS") && String(g.grade).startsWith("10");
  return { ok: true, message: `Added: ${gradeName(g.grader, g.grade)} sold for $${price.toLocaleString("en-US")} on ${when}. ${labelled ? "It now shows in this card's recent sales." : "It now counts toward this card's value."}` };
}

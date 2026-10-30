// eBay Partner Network (EPN) tracking for every eBay link on the site.
//   EBAY_CAMPAIGN_ID  your EPN campaign ID (EPN dashboard -> Campaigns). Without it, links are plain eBay links.
// EPN rules: affiliate links must be disclosed next to the link (we show "Ad"), and must not be cloaked or shortened.

const EPN = { mkcid: "1", mkrid: "711-53200-19255-0", siteid: "0", toolid: "10001", mkevt: "1" }; // ebay.com (US)

export const epnLive = () => /^\d{10}$/.test(String(process.env.EBAY_CAMPAIGN_ID || "").trim());

/**
 * Add EPN tracking to an ebay.com link. `source` says where on the site the click came from (shows up as the
 * "custom ID" in EPN reports, e.g. card-page, deal-feed). Returns { href, affiliate }.
 */
export function ebayLink(url, source = "site") {
  let u;
  try { u = new URL(url); } catch { return { href: url, affiliate: false }; }
  if (u.searchParams.has("campid")) return { href: url, affiliate: true }; // already tracked (e.g. by the bot)
  if (!epnLive() || !/(^|\.)ebay\.com$/i.test(u.hostname)) return { href: url, affiliate: false };
  for (const [k, v] of Object.entries(EPN)) u.searchParams.set(k, v);
  u.searchParams.set("campid", String(process.env.EBAY_CAMPAIGN_ID).trim());
  u.searchParams.set("customid", String(source).replace(/[^\w-]/g, "").slice(0, 64));
  return { href: u.toString(), affiliate: true };
}

/**
 * An eBay search, tracked. Cards search the Pokémon singles category; sealed products search all of eBay.
 * sold: Sold + Completed listings only, most recently ended first.
 */
export function ebaySearch(query, { sold = false, sealed = false, source = "search", highest = false } = {}) {
  const q = new URLSearchParams({ _nkw: query, ...(sealed ? {} : { _sacat: "183454" }) });
  if (sold) { q.set("LH_Sold", "1"); q.set("LH_Complete", "1"); q.set("_sop", highest ? "16" : "13"); } // 16: highest price first
  return ebayLink(`https://www.ebay.com/sch/i.html?${q}`, source);
}

/**
 * A deal that has ended, on eBay. eBay sends an ended listing's own link to a general product page showing whatever is
 * for sale now (another grader, another grade), so the sale is only visible in sold listings: searched by the
 * listing's item number, that's just this sale. Without an item number, sold listings for that exact card and grade,
 * newest first. Returns { href, affiliate }.
 */
export function dealSoldSearch(d, source = "deal-sold") {
  const itemNumber = String(d.id || "").split("|")[1] || (/^\d{9,14}$/.test(String(d.id || "")) ? String(d.id) : "");
  if (itemNumber) return ebaySearch(itemNumber, { sold: true, sealed: true, source });
  const grade = d.kind === "graded" && d.grader && d.grade ? ` ${d.grader} ${String(d.grade).replace(/\.0$/, "")}` : "";
  const query = `${String(d.name || "").replace(/\s*\(.*\)$/, "")} ${d.number || ""}${grade}${d.language === "japanese" ? " Japanese" : ""}`
    .replace(/\s+/g, " ").trim();
  return ebaySearch(query, { sold: true, sealed: d.kind === "sealed", source });
}


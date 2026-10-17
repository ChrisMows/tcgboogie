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

/** An eBay search for a card (Pokémon singles category), tracked. */
export function ebaySearch(query, { sold = false, source = "search" } = {}) {
  const q = new URLSearchParams({ _nkw: query, _sacat: "183454" });
  if (sold) { q.set("LH_Sold", "1"); q.set("LH_Complete", "1"); }
  return ebayLink(`https://www.ebay.com/sch/i.html?${q}`, source);
}

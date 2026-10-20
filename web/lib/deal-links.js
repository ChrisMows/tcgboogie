import "server-only";
import { ebayLink } from "@/lib/ebay-link";

/** Deals to show as tiles, with their (affiliate-tracked) eBay links worked out on the server. */
export const withLinks = (deals, source) => deals.map((d) => {
  const l = ebayLink(d.url || `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: d.title || d.name, _sacat: "183454" })}`, source);
  // Real deals open the card's page (prices by condition and grade, recent sales) with the listing on top.
  const cardHref = d.productId && !d.sample
    ? `/app/cards/${encodeURIComponent(d.productId)}?deal=${encodeURIComponent(d.id)}${d.language === "japanese" ? "&lang=japanese" : ""}` : null;
  return { ...d, href: l.href, affiliate: l.affiliate, cardHref };
});

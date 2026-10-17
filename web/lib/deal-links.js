import "server-only";
import { ebayLink } from "@/lib/ebay-link";

/** Deals to show as tiles, with their (affiliate-tracked) eBay links worked out on the server. */
export const withLinks = (deals, source) => deals.map((d) => {
  const l = ebayLink(d.url || `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: d.title || d.name, _sacat: "183454" })}`, source);
  return { ...d, href: l.href, affiliate: l.affiliate };
});

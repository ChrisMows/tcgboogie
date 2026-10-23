// How an ended deal sold, the way eBay shows it in sold listings, so the sale is easy to find there:
// "Won at $455.00 + $6.25 shipping · 27 bids · Oct 22". Empty when we don't have the details.
const usd = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function saleLine(d) {
  const o = d?.outcome;
  if (!o || o.bid == null) return "";
  const parts = [`Won at ${usd(o.bid)}${o.shipping ? ` + ${usd(o.shipping)} shipping` : o.shipping === 0 ? " + free shipping" : ""}`];
  if (o.bids) parts.push(`${o.bids} bid${o.bids === 1 ? "" : "s"}`);
  const ended = o.ended || d.endsAt;
  if (ended) parts.push(new Date(ended).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }));
  return parts.join(" · ");
}

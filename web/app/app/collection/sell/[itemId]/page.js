import Link from "next/link";
import { notFound } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import SellForm from "@/components/SellForm";
import { itemLabel, unitValue } from "@/lib/collection";
import { ebayAccount, ebaySellReady, listingsFor, sellerPolicies, suggestDescription, suggestTitle } from "@/lib/ebay-sell";
import { ebaySearch } from "@/lib/ebay-link";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Sell on eBay" };

// Sell on eBay: the listing is built from the collection item; the member adds photos, checks the price and posts.
export default async function SellPage({ params }) {
  const { itemId } = await params;
  const user = await requireUser(`/app/collection/sell/${encodeURIComponent(itemId)}`);
  const item = await store.getItem(user.id, itemId);
  if (!item || item.list !== "owned" || item.kind === "sealed") notFound();

  const head = (
    <div className="sell-head">
      <CardThumb item={item} width={90} />
      <div>
        <div className="crumbs"><Link href="/app/collection">Collection</Link> / <Link href={`/app/cards/${item.productId}`}>{item.name.replace(/\s*\(.*\)$/, "")}</Link> / Sell</div>
        <h1>Sell on eBay</h1>
        <div className="muted">{item.name} · {item.setName}{item.number ? ` · #${item.number}` : ""} · {itemLabel(item)}</div>
      </div>
    </div>
  );

  if (!ebaySellReady() || user.demo) return <>{head}<div className="notice">Selling on eBay is coming soon.</div></>;
  const account = await ebayAccount(user.id);
  if (!account) {
    return (
      <>
        {head}
        <div className="panel">
          <h2>Connect your eBay account</h2>
          <p className="muted" style={{ marginTop: 0 }}>One-time step: you sign in on eBay&apos;s own page and allow TCG Boogie to create listings for you. We never see your eBay password.</p>
          <a className="btn primary" href="/api/ebay/connect">Connect eBay</a>
        </div>
      </>
    );
  }

  let policies;
  try {
    policies = await sellerPolicies(user.id);
  } catch (e) {
    return <>{head}<div className="notice bad">eBay: {e.message} <a href="/api/ebay/connect">Connect eBay again</a></div></>;
  }
  if (!policies.ready) {
    return (
      <>
        {head}
        <div className="panel">
          <h2>One thing to set up on eBay first</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            eBay needs a <b>shipping</b>, <b>payment</b> and <b>return</b> policy on your seller account before anything can be listed for you.
            Most sellers create them once (eBay calls them business policies).
          </p>
          <a className="btn primary" href="https://www.ebay.com/sh/settings/policies" target="_blank" rel="noopener noreferrer">Set up policies on eBay ↗</a>
          <p className="hint">Then come back to this page.</p>
        </div>
      </>
    );
  }

  const value = unitValue(item);
  const grade = item.kind === "graded" ? ` ${item.grader} ${item.grade}` : "";
  const sold = ebaySearch(`${item.name.replace(/\s*\(.*\)$/, "")} ${item.number || ""}${grade}`.trim(), { sold: true, source: "sell-page-sold" });
  const past = await listingsFor(user.id, item.id);
  const facts = [
    "Category: Pokémon single cards",
    item.kind === "graded" ? `Graded: ${item.grader} ${item.grade}${item.certNumber ? ` · cert ${item.certNumber}` : " · add the cert number to the card in your collection to include it"}`
      : `Ungraded: ${item.condition || "Near Mint"}`,
    item.setName ? `Set: ${item.setName}` : null,
    item.number ? `Card number: ${item.number}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      {head}
      {past.length > 0 && (
        <div className="notice">
          You listed this card before: {past.map((l) => <a key={l.id} href={`https://www.ebay.com/itm/${l.listingId}`} target="_blank" rel="noopener noreferrer">{l.title} ↗</a>)}
        </div>
      )}
      <SellForm itemId={item.id} policies={policies} needsZip={!account.postalCode} suggested={value} soldHref={sold.href}
        initial={{ title: suggestTitle(item), description: suggestDescription(item), price: value ? Math.round(value * 100) / 100 : null, facts }} />
    </>
  );
}

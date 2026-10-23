import Link from "next/link";
import { notFound } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import SellForm from "@/components/SellForm";
import { createPolicies } from "../actions";
import { itemLabel, unitValue } from "@/lib/collection";
import { ebayAccount, ebaySellReady, listingsFor, sellerPolicies, suggestDescription, suggestTitle } from "@/lib/ebay-sell";
import { ebaySearch } from "@/lib/ebay-link";
import FeatureLocked from "@/components/FeatureLocked";
import { quotaStatus } from "@/lib/quota";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Sell on eBay" };

// Sell on eBay: the listing is built from the collection item; the member adds photos, checks the price and posts.
const SETUP_ERRORS = { opting_in: "eBay is still switching on business policies for your account. Try again in a few minutes." };

export default async function SellPage({ params, searchParams }) {
  const { itemId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/app/collection/sell/${encodeURIComponent(itemId)}`);
  if (!user.plan.sellOnEbay) return <FeatureLocked name="Sell on eBay" flag="sellOnEbay" from="sell" />;
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
    const missing = [!policies.fulfillment?.length && "shipping", !policies.payment?.length && "payment", !policies.return?.length && "returns"].filter(Boolean);
    return (
      <>
        {head}
        <form action={createPolicies.bind(null, item.id)} className="panel sell-form">
          <h2>Quick setup: how you ship and handle returns</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            eBay needs {missing.join(", ").replace(/, (?!.*, )/, " and ")} settings on your seller account before anything can be listed.
            Pick these once and we&apos;ll create them on eBay for you. You can change them later on eBay anytime.
          </p>
          {sp?.setup && <div className="notice bad">{SETUP_ERRORS[sp.setup] || sp.setup}</div>}
          {!policies.fulfillment?.length && (
            <div className="sell-step">
              <h2>Shipping (USPS Ground Advantage)</h2>
              <label className="check"><input type="radio" name="shipping" value="flat" defaultChecked /> <span>Buyer pays $<input name="shipCost" type="number" step="0.01" min="0" defaultValue="4.99" style={{ width: 90, display: "inline-block" }} /> per order</span></label>
              <label className="check"><input type="radio" name="shipping" value="free" /> <span>Free shipping (you cover it)</span></label>
              <label className="field" style={{ maxWidth: 260 }}>Ships within
                <select name="handlingDays" defaultValue="1"><option value="1">1 business day</option><option value="2">2 business days</option><option value="3">3 business days</option></select>
              </label>
            </div>
          )}
          {!policies.return?.length && (
            <div className="sell-step">
              <h2>Returns</h2>
              <label className="check"><input type="radio" name="returns" value="none" defaultChecked /> <span>No returns (common for cards)</span></label>
              <label className="check"><input type="radio" name="returns" value="30" /> <span>30-day returns, buyer pays return shipping</span></label>
            </div>
          )}
          {!policies.payment?.length && <p className="small muted">Payment: eBay&apos;s standard checkout (eBay collects payment and pays you out).</p>}
          <button className="btn primary sell-go">Create these on eBay and continue</button>
          <p className="hint" style={{ textAlign: "center" }}>
            Prefer to do it yourself? <a href="https://www.ebay.com/help/selling/business-policies/business-policies?id=4212" target="_blank" rel="noopener noreferrer">eBay&apos;s guide to business policies ↗</a>
          </p>
        </form>
      </>
    );
  }

  const quota = await quotaStatus("ebayListing", user);
  if (quota.limit !== null && quota.left === 0) {
    return (
      <>
        {head}
        <div className="panel">
          <p style={{ marginTop: 0 }}>You&apos;ve listed {quota.limit} {quota.limit === 1 ? "card" : "cards"} on eBay this month, all your plan includes. Your allowance resets on the 1st.</p>
          <Link href="/app/premium?from=sell" className="btn primary">Unlimited listings with Premium</Link>
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
      <SellForm itemId={item.id} quota={quota} policies={policies} needsZip={!account.postalCode} suggested={value} soldHref={sold.href}
        initial={{ title: suggestTitle(item), description: suggestDescription(item), price: value ? Math.round(value * 100) / 100 : null, facts }} />
    </>
  );
}

import Link from "next/link";
import FeatureLocked from "@/components/FeatureLocked";
import TradeAnalyzer from "@/components/TradeAnalyzer";
import { catalogLive } from "@/lib/catalog";
import { itemLabel, unitValue } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Trade analyzer" };

// The analyzer only needs prices; history and sales would just weigh the page down.
const lean = (p) => p && { id: p.id, type: p.type, name: p.name, setName: p.setName, number: p.number, image: p.image,
  prices: p.prices, graded: p.graded, ...(p.language ? { language: p.language } : {}) };

export default async function TradePage() {
  const user = await requireUser("/app/collection/trade");
  if (!user.plan.tradeAnalyzer) {
    return <><div className="crumbs"><Link href="/app/collection">Collection</Link> / Trade analyzer</div><FeatureLocked name="The trade analyzer" flag="tradeAnalyzer" from="trade" /></>;
  }
  const c = await loadCollection(user);
  const mine = c.owned.map((it) => ({
    id: it.id, productId: it.productId, name: it.name, setName: it.setName, number: it.number, image: it.image, productType: it.productType,
    quantity: it.quantity || 1, label: itemLabel(it), value: unitValue(it),
    spec: { kind: it.kind, printing: it.printing, condition: it.condition, grader: it.grader, grade: it.grade },
    product: lean(c.products[it.productId]),
  })).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Trade analyzer</div>
      <div className="page-head">
        <div>
          <h1>Trade analyzer</h1>
          <p>Put in what you&apos;d give and what you&apos;d get. We price both sides at today&apos;s market and tell you if it&apos;s fair.</p>
        </div>
      </div>
      <TradeAnalyzer mine={mine} isDemo={user.demo || !catalogLive()} />
    </>
  );
}

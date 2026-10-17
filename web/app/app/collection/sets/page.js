import Link from "next/link";
import SetBrowser from "@/components/SetBrowser";
import { listSets } from "@/lib/catalog";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Sets" };

export default async function SetsPage() {
  const user = await requireUser();
  const [sets, items] = await Promise.all([listSets().catch(() => null), store.listItems(user.id)]);
  const have = {};
  for (const it of items) {
    if (it.list === "owned" && it.productType === "card") (have[it.setName] ||= new Set()).add(it.productId);
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/app/collection">Collection</Link> / Sets</div>
          <h1>Sets</h1>
          <p>Open a set and tap the cards you own.</p>
        </div>
      </div>
      {sets === null ? (
        <div className="notice warn">The set list didn&apos;t load from the price service. Please try again in a minute.</div>
      ) : (
        <SetBrowser sets={sets.map((s) => ({ ...s, have: have[s.name]?.size || 0 }))} />
      )}
    </>
  );
}

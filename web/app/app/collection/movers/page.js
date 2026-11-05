import Link from "next/link";
import MoversView from "@/components/MoversView";
import { itemLabel, unitValue } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Top Movers" };

// Every card in the collection that moved in price over a range, up and down, from the same saved prices as the
// Collection page (no extra price service calls).
export default async function MoversPage() {
  const user = await requireUser("/app/collection/movers");
  const c = await loadCollection(user);
  const items = c.owned.filter((it) => unitValue(it) !== null).map((it) => ({
    id: it.id, productId: it.productId, image: it.image, name: it.name, number: it.number, productType: it.productType, kind: it.kind,
    grader: it.grader, grade: it.grade, quantity: it.quantity, unitValue: it.unitValue, customValue: it.customValue,
    changes: it.changes, change7: it.change7, label: itemLabel(it),
  }));
  return (
    <>
      <Link href="/app/collection" className="small muted">← Collection</Link>
      <h1 style={{ margin: "6px 0 0" }}>Top movers</h1>
      <p className="muted small" style={{ margin: "2px 0 0" }}>Every card in your collection that moved in price, for all your copies of it.</p>
      <MoversView items={items} historyDays={user.plan.collectionHistoryDays} />
    </>
  );
}

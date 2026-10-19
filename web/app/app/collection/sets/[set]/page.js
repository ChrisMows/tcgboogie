import Link from "next/link";
import { notFound } from "next/navigation";
import SetGrid from "@/components/SetGrid";
import { getSetCards, listSets } from "@/lib/catalog";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { money, nmPrice, ownedCounts, unitValue } from "@/lib/collection";
import { slim } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export async function generateMetadata({ params }) {
  return { title: decodeURIComponent((await params).set).slice(0, 80) };
}

export default async function SetPage({ params }) {
  const user = await requireUser();
  const name = decodeURIComponent((await params).set).slice(0, 120);
  // Only real set names get looked up (a made-up name in the address must not reach the price service).
  const sets = await listSets().catch(() => []);
  const set = sets.find((s) => s.name === name);
  if (!set) notFound();
  if (!allow("setLoad", user.id)) return <div className="notice warn">{SLOW_DOWN}</div>;
  const [cards, items, watches] = await Promise.all([
    getSetCards(name).catch(() => null), store.listItems(user.id), store.listWatches(user.id),
  ]);
  const owned = ownedCounts(items);
  const wished = items.filter((it) => it.list === "wishlist").map((it) => it.productId);
  const inSet = new Set((cards || []).map((c) => c.id));
  const ownedValue = items.filter((it) => it.list === "owned" && inSet.has(it.productId))
    .reduce((s, it) => s + (unitValue(it) ?? 0) * it.quantity, 0);
  const missing = (cards || []).filter((c) => !owned[c.id]);
  const toComplete = missing.reduce((s, c) => s + (nmPrice(c) ?? 0), 0);
  const have = (cards || []).length - missing.length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/app/collection">Collection</Link> / <Link href="/app/collection/sets">Sets</Link> / {name}</div>
          <h1>{name}</h1>
          <p>{[set?.series, set?.releaseDate ? `Released ${new Date(`${set.releaseDate.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : null].filter(Boolean).join(" · ") || "Tap a card to add it to your collection."}</p>
        </div>
      </div>

      {cards === null ? (
        <div className="notice warn">This set didn&apos;t load from the price service. Please try again in a minute.</div>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <b>{have} / {cards.length}</b>
              <span>cards owned · {cards.length ? Math.round((have / cards.length) * 100) : 0}% complete</span>
              <span className="bar" style={{ marginTop: 8 }}><i style={{ width: `${cards.length ? Math.max(2, (have / cards.length) * 100) : 0}%` }} /></span>
            </div>
            <div className="stat"><b>{money(ownedValue)}</b><span>what your cards from this set are worth</span></div>
            <div className="stat"><b>{money(toComplete)}</b><span>to finish the set in Near Mint ({missing.length} cards)</span></div>
          </div>
          <SetGrid cards={cards.map(slim)} owned={owned} wished={wished} watched={watches.map((w) => w.productId)} isDemo={user.demo} />
        </>
      )}
    </>
  );
}

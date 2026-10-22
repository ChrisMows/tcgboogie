import { eraOf, setLabel } from "@/lib/sets";
import Link from "next/link";
import { notFound } from "next/navigation";
import SetGrid from "@/components/SetGrid";
import CardThumb from "@/components/CardThumb";
import CardRequest from "@/components/CardRequest";
import { memberCardsInSet } from "@/lib/member-cards";
import { getSetCards, getSetSealed, listSets } from "@/lib/catalog";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { money, nmPrice, ownedCounts, unitValue } from "@/lib/collection";
import { slim } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export async function generateMetadata({ params }) {
  return { title: setLabel(decodeURIComponent((await params).set)).name.slice(0, 80) };
}

export default async function SetPage({ params, searchParams }) {
  const user = await requireUser();
  const name = decodeURIComponent((await params).set).slice(0, 120);
  // Only real set names get looked up (a made-up name in the address must not reach the price service).
  const sets = await listSets().catch(() => []);
  const set = sets.find((s) => s.name === name);
  if (!set) notFound();
  if (!allow("setLoad", user.id)) return <div className="notice warn">{SLOW_DOWN}</div>;
  const [serviceCards, items, watches, added] = await Promise.all([
    getSetCards(name).catch(() => null), store.listItems(user.id), store.listWatches(user.id), memberCardsInSet(name),
  ]);
  // Cards members added to this set that the price service doesn't list (no prices) come after the service's cards.
  const cards = serviceCards && [...serviceCards, ...added.filter((m) => !serviceCards.some((c) => c.id === m.id))];
  const owned = ownedCounts(items);
  const wished = items.filter((it) => it.list === "wishlist").map((it) => it.productId);
  const inSet = new Set((cards || []).map((c) => c.id));
  const ownedValue = items.filter((it) => it.list === "owned" && inSet.has(it.productId))
    .reduce((s, it) => s + (unitValue(it) ?? 0) * it.quantity, 0);
  const missing = (cards || []).filter((c) => !owned[c.id]);
  const toComplete = missing.reduce((s, c) => s + (nmPrice(c) ?? 0), 0);
  const have = (cards || []).length - missing.length;
  // Sealed products load on request (they cost credits the first time anyone opens them for this set).
  const showSealed = (await searchParams)?.sealed === "1";
  const sealed = showSealed ? await getSetSealed(name).catch(() => null) : null;
  const ownedSealed = new Set(items.filter((it) => it.list === "owned" && it.productType === "sealed").map((it) => it.productId));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/app/collection">Collection</Link> / <Link href="/app/collection/sets">Sets</Link> / {setLabel(name).name}</div>
          <h1>{setLabel(name).name}</h1>
          <p>{[setLabel(name).code, eraOf(set) + " era", set?.releaseDate ? `Released ${new Date(`${set.releaseDate.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : null].filter(Boolean).join(" · ") || "Tap a card to add it to your collection."}</p>
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
            <div className="stat"><b>{money(toComplete)}</b><span>to finish the set in Near Mint ({missing.length} {missing.length === 1 ? "card" : "cards"})</span></div>
          </div>
          <SetGrid cards={cards.map(slim)} owned={owned} wished={wished} watched={watches.map((w) => w.productId)} isDemo={user.demo} />
          {!user.demo && <CardRequest query={setLabel(name).name} label="Missing a card from this set? Request it →" />}
          <div className="panel" id="sealed" style={{ marginTop: 18 }}>
            <h2 style={{ marginTop: 0 }}>Sealed products</h2>
            {!showSealed ? (
              <Link href={`/app/collection/sets/${encodeURIComponent(name)}?sealed=1#sealed`} className="btn">Show sealed products from this set</Link>
            ) : sealed === null ? (
              <p className="muted" style={{ margin: 0 }}>Sealed products didn&apos;t load. Please try again in a minute.</p>
            ) : sealed.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No sealed products listed for this set.</p>
            ) : (
              <div className="sealed-list">
                {sealed.map((p) => (
                  <Link key={p.id} href={`/app/cards/${encodeURIComponent(p.id)}`} className="sealed-row">
                    <CardThumb item={p} width={52} />
                    <span className="sealed-name"><b>{p.name}</b>{ownedSealed.has(p.id) && <span className="badge good">You own it</span>}</span>
                    <b>{p.prices.market ? money(p.prices.market) : "—"}</b>
                  </Link>
                ))}
              </div>
            )}
            <p className="hint" style={{ marginBottom: 0 }}>Open a product to add it to your collection, wishlist it, or set a price alert.</p>
            {showSealed && !user.demo && <CardRequest query={`${setLabel(name).name} sealed`} kind="sealed" label="Missing a sealed product from this set? Request it →" />}
          </div>
        </>
      )}
    </>
  );
}

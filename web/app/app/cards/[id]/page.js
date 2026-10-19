import Link from "next/link";
import { notFound } from "next/navigation";
import CardActions from "@/components/CardActions";
import CardThumb from "@/components/CardThumb";
import ValueChart from "@/components/ValueChart";
import { getProduct } from "@/lib/catalog";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { COND_SHORT, GRADERS, change, marketValue, money, nmPrice, pct, pokemonName } from "@/lib/collection";
import { slim } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { targetPrice } from "@/lib/watches";
import { ebaySearch } from "@/lib/ebay-link";
import Source from "@/components/Source";

export async function generateMetadata({ params }) {
  // Title from the cache only: this runs before the sign-in check, so it must never spend price-service credits.
  const p = await getProduct((await params).id, { cachedOnly: true }).catch(() => null);
  return { title: p ? p.name : "Card" };
}

const GRADE_LABEL = (key) => {
  const m = key.match(/^([a-z]+)(\d+)(?:_(\d))?$/);
  if (!m) return key;
  const grader = GRADERS.find((g) => g.toLowerCase() === m[1]) || m[1].toUpperCase();
  return `${grader} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
};

export default async function CardPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  let product = await getProduct(id, { cachedOnly: true }).catch(() => null);
  if (product === undefined) {
    if (!allow("cardPage", user.id)) return <div className="notice warn">{SLOW_DOWN}</div>;
    try { product = await getProduct(id); } catch { product = null; }
  }
  if (product === null) notFound();
  const p = slim(product);
  const [items, binders, watches] = await Promise.all([store.listItems(user.id), store.listBinders(user.id), store.listWatches(user.id)]);
  // Value your copies from today's prices (the saved value can lag behind).
  const mine = items.filter((it) => it.productId === p.id).map((it) => ({
    ...it, unitValue: marketValue(p, it) ?? it.unitValue, createdAt: String(it.createdAt), valueUpdatedAt: null,
  }));
  const watch = watches.find((w) => w.productId === p.id);
  const now = p.type === "sealed" ? p.prices?.market : nmPrice(p);
  const c7 = change(p, 7), c30 = change(p, 30);
  const printings = p.type === "card" ? Object.entries(p.prices || {}) : [];
  const graded = Object.entries(p.graded || {}).sort((a, b) => b[1].price - a[1].price);
  const isSealed = p.type === "sealed";
  const filterHref = `/app/deals?${new URLSearchParams({ pokemon: pokemonName(p.name), ...(p.setName ? { set: p.setName } : {}) })}`;
  const ebayQuery = `${p.name.replace(/\s*\(.*\)$/, "")} ${p.number || p.setName || ""}`.trim();
  const ebay = ebaySearch(ebayQuery, { source: "card-page" });
  const ebaySold = ebaySearch(ebayQuery, { sold: true, source: "card-page-sold" });

  // One line per source, cheapest highlighted (null price = link only).
  const firstPrinting = Object.keys(p.prices || {})[0];
  const tcgLow = isSealed ? p.prices?.low : p.prices?.[firstPrinting]?.["Near Mint"]?.low ?? null;
  const psa10 = p.graded?.psa10?.price ?? null;
  const compareRows = [
    { source: "tcgplayer", label: isSealed ? "Market price" : "Market price, NM", price: now ?? null, href: p.tcgplayerUrl },
    { source: "tcgplayer", label: isSealed ? "Lowest listing" : "Lowest listing, NM", price: tcgLow, href: p.tcgplayerUrl },
    ...(psa10 ? [{ source: "ebay", label: "Sold recently, PSA 10", price: psa10, href: ebaySold.href, affiliate: ebaySold.affiliate }] : []),
    { source: "ebay", label: "Live listings and auctions", price: null, href: ebay.href, affiliate: ebay.affiliate },
  ];
  const priced = compareRows.filter((r) => r.price !== null && !r.label.includes("PSA"));
  const cheapest = priced.length > 1 ? priced.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  if (cheapest) cheapest.best = true;

  return (
    <>
      <div className="crumbs">
        <Link href="/app/collection">Collection</Link> /{" "}
        {p.setName ? <><Link href={`/app/collection/sets/${encodeURIComponent(p.setName)}`}>{p.setName}</Link> / </> : null}
        {p.name.replace(/\s*\(.*\)$/, "")}
      </div>

      <div className="card-hero">
        <div className="card-hero-art"><CardThumb item={p} width={260} /></div>
        <div className="card-hero-info">
          <h1>{p.name}</h1>
          <div className="muted">
            {p.setName && <Link href={`/app/collection/sets/${encodeURIComponent(p.setName)}`}>{p.setName}</Link>}
            {p.number ? ` · #${p.number}` : ""}{p.rarity ? ` · ${p.rarity}` : ""}{isSealed ? " · Sealed product" : ""}
          </div>
          <div className="hero-price">
            <span className="small muted">{isSealed ? "Market price" : "Raw Near Mint market price"}</span>
            <b>{money(now)}</b>
            <span className="small">
              {c7 !== null && <span className={c7 >= 0 ? "up" : "down"}>{c7 >= 0 ? "▲" : "▼"} {pct(c7)} 7d</span>}
              {c30 !== null && <span className={c30 >= 0 ? "up" : "down"} style={{ marginLeft: 12 }}>{c30 >= 0 ? "▲" : "▼"} {pct(c30)} 30d</span>}
            </span>
          </div>
          <CardActions product={p} mine={mine} binders={binders} watch={watch ? { id: watch.id, target: targetPrice(watch), status: watch.status } : null}
            plan={user.plan} filterHref={filterHref} />
        </div>
      </div>

      <div className="panel">
        <h2>Compare prices</h2>
        <div className="compare-list">
          {compareRows.map((r) => (
            <a key={r.label} href={r.href} target="_blank" rel={`noopener noreferrer${r.affiliate ? " sponsored" : ""}`}
              className={`compare-item ${r.best ? "best" : ""}`}>
              <Source name={r.source} />
              <span className="compare-label">{r.label}{r.best ? " · lowest" : ""}</span>
              <b>{r.price === null ? "See ↗" : money(r.price)}</b>
            </a>
          ))}
        </div>
        {(ebay.affiliate) && <p className="hint" style={{ margin: "8px 0 0" }}>Ad · Links may earn us a commission.</p>}
      </div>

      <div className="card-detail-grid">
        <div className="panel" style={{ marginBottom: 0 }}>
          <ValueChart points={(p.history || []).map((h) => ({ day: h.date, value: h.price }))} historyDays={null}
            label={isSealed ? "Market price" : "Near Mint market price"} ranges={[["7D", 7], ["30D", 30], ["90D", 90]]} height={160} />
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          {isSealed ? <p className="muted" style={{ margin: 0 }}>Sealed product. Prices from TCGplayer, updated daily.</p> : (
            <>
              <h2>By condition</h2>
              {printings.map(([printing, byCond]) => (
                <div key={printing} style={{ marginBottom: 12 }}>
                  {printings.length > 1 && <div className="small muted" style={{ marginBottom: 4 }}>{printing}</div>}
                  <div className="cond-grid">
                    {Object.entries(byCond).map(([cond, v]) => (
                      <div key={cond} className="cond-cell"><span className="small muted">{COND_SHORT[cond] || cond}</span><b>{money(v.market)}</b></div>
                    ))}
                  </div>
                </div>
              ))}
              <h2 style={{ marginTop: 18 }}>Graded</h2>
              {graded.length === 0 ? <p className="small muted" style={{ margin: 0 }}>No recent graded sales for this card.</p> : (
                <div className="cond-grid">
                  {graded.slice(0, 12).map(([key, g]) => (
                    <div key={key} className="cond-cell"><span className="small muted">{GRADE_LABEL(key)}</span><b>{money(g.price, 0)}</b></div>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>
            Raw prices from TCGplayer, graded values from recent eBay sales. Updated about once a day.{" "}
            <a href={p.tcgplayerUrl} target="_blank" rel="noopener noreferrer sponsored">View on TCGplayer ↗</a>
          </p>
        </div>
      </div>
    </>
  );
}

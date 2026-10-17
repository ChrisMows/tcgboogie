import Link from "next/link";
import { notFound } from "next/navigation";
import CardActions from "@/components/CardActions";
import CardThumb from "@/components/CardThumb";
import ValueChart from "@/components/ValueChart";
import { getProduct } from "@/lib/catalog";
import { COND_SHORT, GRADERS, change, money, nmPrice, pct, pokemonName } from "@/lib/collection";
import { slim } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { targetPrice } from "@/lib/watches";
import { ebaySearch } from "@/lib/ebay-link";

export async function generateMetadata({ params }) {
  const p = await getProduct((await params).id).catch(() => null);
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
  let product;
  try { product = await getProduct(id); } catch { product = null; }
  if (product === null) notFound();
  const p = slim(product);
  const [items, binders, watches] = await Promise.all([store.listItems(user.id), store.listBinders(user.id), store.listWatches(user.id)]);
  const mine = items.filter((it) => it.productId === p.id).map((it) => ({ ...it, createdAt: String(it.createdAt), valueUpdatedAt: null }));
  const watch = watches.find((w) => w.productId === p.id);
  const now = p.type === "sealed" ? p.prices?.market : nmPrice(p);
  const c7 = change(p, 7), c30 = change(p, 30);
  const printings = p.type === "card" ? Object.entries(p.prices || {}) : [];
  const graded = Object.entries(p.graded || {}).sort((a, b) => b[1].price - a[1].price);
  const isSealed = p.type === "sealed";
  const filterHref = `/app/filters?${new URLSearchParams({ pokemon: pokemonName(p.name), ...(p.setName ? { set: p.setName } : {}) })}`;
  const ebayQuery = `${p.name.replace(/\s*\(.*\)$/, "")} ${p.number || p.setName || ""}`.trim();
  const ebay = ebaySearch(ebayQuery, { source: "card-page" });
  const ebaySold = ebaySearch(ebayQuery, { sold: true, source: "card-page-sold" });

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
            plan={user.plan} filterHref={filterHref} ebay={ebay} ebaySold={ebaySold} />
        </div>
      </div>

      <div className="card-detail-grid">
        <div className="panel" style={{ marginBottom: 0 }}>
          <ValueChart points={(p.history || []).map((h) => ({ day: h.date, value: h.price }))} historyDays={null}
            label={isSealed ? "Market price" : "Near Mint market price"} ranges={[["7D", 7], ["30D", 30], ["90D", 90]]} height={160} />
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <h2>Prices</h2>
          {isSealed ? (
            <table className="list"><tbody>
              <tr><td>Market price</td><td className="num">{money(p.prices?.market)}</td></tr>
              <tr><td>Lowest listing</td><td className="num">{money(p.prices?.low)}</td></tr>
            </tbody></table>
          ) : (
            <>
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

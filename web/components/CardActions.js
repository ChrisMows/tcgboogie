"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import { addItem, changeQuantity, editItem, moveToCollection, quickAdd, removeFromWishlist, removeItem, watchProduct } from "@/app/app/collection/actions";
import { itemLabel, money, nmPrice, pct, unitValue } from "@/lib/collection";

/** Everything you can do with one card, on its page: own it, want it, watch its price, get deals on it. */
export default function CardActions({ product, mine, binders, watch, plan, filterHref, ebay, ebaySold }) {
  const router = useRouter();
  const [panel, setPanel] = useState(null); // "add" | "watch" | null
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const now = product.type === "sealed" ? product.prices?.market : nmPrice(product);
  const [target, setTarget] = useState(now ? (Math.floor(now * 0.85 * 100) / 100).toFixed(2) : "");
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const owned = mine.filter((it) => it.list === "owned");
  const wish = mine.find((it) => it.list === "wishlist");
  const copies = owned.reduce((s, it) => s + it.quantity, 0);
  const worth = owned.reduce((s, it) => s + (unitValue(it) ?? 0) * it.quantity, 0);
  const paid = owned.filter((it) => it.purchasePrice !== null && it.purchasePrice !== undefined);
  const cost = paid.reduce((s, it) => s + it.purchasePrice * it.quantity, 0);
  const gain = paid.length ? paid.reduce((s, it) => s + ((unitValue(it) ?? it.purchasePrice) - it.purchasePrice) * it.quantity, 0) : null;

  const run = (fn, msg, action) => start(async () => {
    const r = await fn();
    if (r?.ok === false) {
      if (r.errors) return setErrors(r.errors);
      return show(r.error || "Something went wrong.", r.limit ? { href: "/app/billing", label: "Upgrade" } : null, "bad");
    }
    setErrors({});
    if (msg) show(typeof msg === "function" ? msg(r) : msg, action);
    router.refresh();
  });

  return (
    <div className="card-actions">
      {copies > 0 ? (
        <div className="you-own">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <b style={{ flex: "none" }}>✓ You own {copies}</b>
            <span className="small muted" style={{ flex: "none" }}>
              Worth {money(worth)}{gain !== null ? <> · <span className={gain >= 0 ? "up" : "down"}>{gain >= 0 ? "+" : ""}{money(gain)} ({cost ? pct(gain / cost) : "—"})</span></> : null}
            </span>
          </div>
          {owned.map((it) => (
            <div key={it.id} className="copy-row">
              <span className="chip-mini">{itemLabel(it)}</span>
              <span className="small muted copy-meta">
                {money(unitValue(it))} each{it.purchasePrice ? ` · paid ${money(it.purchasePrice)}` : ""}
                {it.binderId && binders.find((b) => b.id === it.binderId) ? ` · ${binders.find((b) => b.id === it.binderId).name}` : ""}
              </span>
              <span className="stepper xs">
                <button type="button" disabled={pending} onClick={() => (it.quantity > 1 || window.confirm("Remove this copy from your collection?")) && run(() => changeQuantity(it.id, -1))} aria-label="One fewer">−</button>
                <span>{it.quantity}</span>
                <button type="button" disabled={pending} onClick={() => run(() => changeQuantity(it.id, 1))} aria-label="One more">+</button>
              </span>
              <button type="button" className="link-btn small" onClick={() => { setErrors({}); setEditing(editing === it.id ? null : it.id); }}>{editing === it.id ? "Close" : "Edit"}</button>
              {editing === it.id && (
                <div className="copy-edit">
                  <ItemForm product={product} initial={it} binders={binders} allowList={false} submitLabel="Save changes" pending={pending} errors={errors}
                    onSubmit={(input) => run(() => editItem(it.id, input), "Saved.")} />
                  <button type="button" className="btn sm danger" style={{ marginTop: 10 }} onClick={() => window.confirm("Remove this from your collection?") && run(() => removeItem(it.id), "Removed.")}>Remove from collection</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : wish ? (
        <div className="you-own wish"><b>♥ On your wishlist</b> <span className="small muted">Got it? Move it to your collection in one tap.</span></div>
      ) : null}

      <div className="action-row">
        {wish ? (
          <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => moveToCollection(wish.id), "Moved to your collection 🎉")}>✓ Got it</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => setPanel(panel === "add" ? null : "add")}>{copies ? "+ Add another" : "+ Add to collection"}</button>
        )}
        {copies === 0 && (
          wish ? <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeFromWishlist(product.id), "Removed from your wishlist.")}>♥ Wishlisted</button>
            : <button type="button" className="btn" disabled={pending} onClick={() => run(() => quickAdd(product.id, "wishlist"), "Added to your wishlist.", { href: "/app/collection?tab=wishlist", label: "Wishlist" })}>♡ Wishlist</button>
        )}
        {watch ? (
          <Link href="/app/watches" className="btn">🔔 {watch.status === "triggered" ? "At your target!" : `Watching · ${money(watch.target)}`}</Link>
        ) : (
          <button type="button" className="btn" onClick={() => setPanel(panel === "watch" ? null : "watch")}>🔔 Watch price</button>
        )}
        {product.type === "card" && <Link href={filterHref} className="btn">⚡ Get deal alerts</Link>}
        <a href={ebay.href} className="btn ghost" target="_blank" rel={`noopener noreferrer${ebay.affiliate ? " sponsored" : ""}`}>eBay listings ↗</a>
        <a href={ebaySold.href} className="btn ghost" target="_blank" rel={`noopener noreferrer${ebaySold.affiliate ? " sponsored" : ""}`}>eBay sold ↗</a>
      </div>
      {ebay.affiliate && <div className="hint">Ad · eBay links may earn us a commission. It doesn&apos;t change the price you pay.</div>}

      {panel === "add" && !wish && (
        <div className="action-panel">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <b style={{ flex: "none" }}>Add to your collection</b>
            <button type="button" className="link-btn small" style={{ flex: "none" }} disabled={pending}
              onClick={() => run(() => quickAdd(product.id), product.type === "card" ? "Added a Near Mint copy." : "Added.")}>
              Just add one {product.type === "card" ? "Near Mint " : ""}copy →
            </button>
          </div>
          <ItemForm product={product} binders={binders} pending={pending} errors={errors}
            onSubmit={(input) => run(() => addItem(product.id, input), input.list === "wishlist" ? "Added to your wishlist." : (r) => `Added${r.value ? ` · worth ${money(r.value * (input.quantity || 1))}` : ""}`)} />
        </div>
      )}

      {panel === "watch" && !watch && (
        <form className="action-panel" onSubmit={(e) => { e.preventDefault(); run(() => watchProduct(product.id, { targetPrice: target }), (r) => `Watching. We'll alert you at ${money(r.target)} or less.`, { href: "/app/watches", label: "Price watches" }); setPanel(null); }}>
          <b>Alert me when {product.type === "card" ? "the Near Mint price" : "the price"} drops to</b>
          <div className="row" style={{ marginTop: 10, maxWidth: 360 }}>
            <input type="number" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target price" />
            <button className="btn primary" style={{ flex: "none" }} disabled={pending || !Number(target)}>Start watching</button>
          </div>
          <div className="hint">
            Now {money(now)}{Number(target) && now ? ` · ${Math.round((1 - Number(target) / now) * 100)}% below today` : ""}.
            {product.type === "card" ? " We'll also watch eBay for listings at or under your target." : ""}
            {plan.maxPriceWatches !== null ? ` Free includes ${plan.maxPriceWatches} watches.` : ""}
            {" "}More options on <Link href="/app/watches">Price watches</Link>.
          </div>
        </form>
      )}
      {toast}
    </div>
  );
}

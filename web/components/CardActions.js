"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import Source from "@/components/Source";
import { useRouter } from "next/navigation";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import { addItem, changeQuantity, editItem, moveToCollection, quickAdd, removeFromWishlist, removeItem, watchProduct } from "@/app/app/collection/actions";
import { itemLabel, money, nmPrice, pct, unitValue } from "@/lib/collection";

/** The "add a copy" button next to the card title: opens the add panel below. */
export function AddCardButton({ label }) {
  return (
    <button type="button" className="btn primary card-add-btn" onClick={() => window.dispatchEvent(new Event("tcgb:add-card"))}>{label}</button>
  );
}

/** Everything you can do with one card, on its page: own it, want it, watch its price, get deals on it, check eBay. */
export default function CardActions({ product, mine, binders, watch, plan, filterHref, ebayLive, ebaySold }) {
  const router = useRouter();
  const [panel, setPanel] = useState(null); // "add" | "watch" | null
  const panelRef = useRef(null);
  useEffect(() => {
    const open = () => { setPanel("add"); setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
    window.addEventListener("tcgb:add-card", open);
    return () => window.removeEventListener("tcgb:add-card", open);
  }, []);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const now = product.type === "sealed" ? product.prices?.market : nmPrice(product);
  const suggest = (up) => (now ? (Math.round(now * (up ? 1.15 : 0.85) * 100) / 100).toFixed(2) : "");
  const [selling, setSelling] = useState(mine.some((it) => it.list === "owned")); // own it? you're probably selling
  const [target, setTarget] = useState(suggest(mine.some((it) => it.list === "owned")));
  const pickSide = (up) => { setSelling(up); setTarget(suggest(up)); };
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
      return show(r.error || "Something went wrong.", r.limit ? { href: "/app/premium?from=watches", label: "See Premium" } : null, "bad");
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
              {plan?.sellOnEbay && product.type === "card" && owned.length > 1 && <Link href={`/app/collection/sell/${it.id}`} className="link-btn small sell-link">Sell this copy</Link>}
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
        {wish && (
          <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => moveToCollection(wish.id), "Moved to your collection 🎉")}>✓ Got it</button>
        )}
        {copies === 0 && (
          wish ? <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeFromWishlist(product.id), "Removed from your wishlist.")}>♥ Wishlisted</button>
            : <button type="button" className="btn" disabled={pending} onClick={() => run(() => quickAdd(product.id, "wishlist"), "Added to your wishlist.", { href: "/app/collection?tab=wishlist", label: "Wishlist" })}>♡ Wishlist</button>
        )}
        {watch ? (
          <Link href="/app/watches" className="btn">🔔 {watch.status === "triggered" ? "Hit your price!" : `Alert at ${money(watch.target)}`}</Link>
        ) : (
          <button type="button" className="btn" onClick={() => setPanel(panel === "watch" ? null : "watch")}>🔔 Price alert</button>
        )}
        {product.type === "card" && <Link href={filterHref} className="btn">⚡ Get deal alerts</Link>}
        {ebayLive && (
          <a href={ebayLive.href} target="_blank" rel={`noopener noreferrer${ebayLive.affiliate ? " sponsored" : ""}`} className="btn ebay-btn live"
            title="Live eBay listings and auctions for this card">
            <Source name="ebay" className="src-sm" /> <span className="live-dot" aria-hidden="true" />Live listings ↗
          </a>
        )}
        {ebaySold && (
          <a href={ebaySold.href} target="_blank" rel={`noopener noreferrer${ebaySold.affiliate ? " sponsored" : ""}`} className="btn ebay-btn sold"
            title="eBay sold and completed listings for this card, most recent first">
            <Source name="ebay" className="src-sm" /> <span aria-hidden="true">🧾</span>Recent sales ↗
          </a>
        )}
      </div>
      {(ebayLive?.affiliate || ebaySold?.affiliate) && <p className="hint ebay-note">eBay links may earn us a commission.</p>}

      {panel === "add" && !wish && (
        <div className="action-panel" ref={panelRef}>
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
        <form className="action-panel" onSubmit={(e) => {
          e.preventDefault();
          run(() => watchProduct(product.id, { targetPrice: target, mode: selling ? "above" : "below" }),
            (r) => `Alert set. We'll tell you at ${money(r.target)} or ${selling ? "more" : "less"}.`, { href: "/app/watches", label: "Price alerts" });
          setPanel(null);
        }}>
          <div className="seg" role="group" aria-label="Buying or selling" style={{ marginBottom: 12 }}>
            <button type="button" className={!selling ? "on" : ""} onClick={() => pickSide(false)}>📉 Buying</button>
            <button type="button" className={selling ? "on" : ""} onClick={() => pickSide(true)}>📈 Selling</button>
          </div>
          <b>Alert me when {product.type === "card" ? "the Near Mint price" : "the price"} {selling ? "climbs to" : "drops to"}</b>
          <div className="row" style={{ marginTop: 10, maxWidth: 360 }}>
            <input type="number" min="0.01" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target price" />
            <button className="btn primary" style={{ flex: "none" }} disabled={pending || !Number(target)}>Set alert</button>
          </div>
          <div className="hint">
            Now {money(now)}{Number(target) && now ? ` · ${Math.round(Math.abs(Number(target) / now - 1) * 100)}% ${Number(target) >= now ? "above" : "below"} today` : ""}.
            {product.type === "card" && !selling ? " We'll also watch eBay for listings at or under your price." : ""}
            {plan.maxPriceWatches !== null ? ` Free includes ${plan.maxPriceWatches} alerts.` : ""}
            {" "}More options on <Link href="/app/watches">Price alerts</Link>.
          </div>
        </form>
      )}
      {toast}
    </div>
  );
}

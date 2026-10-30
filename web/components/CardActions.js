"use client";

import { revealCard } from "@/lib/reveal";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import { addItem, changeQuantity, editItem, moveToCollection, quickAdd, removeFromWishlist, removeItem, watchProduct } from "@/app/app/collection/actions";
import { itemLabel, money, pct, unitValue } from "@/lib/collection";
import AlertSheet from "@/components/AlertSheet";

/** The "add a copy" button next to the card title: opens the add panel below. */
export function AddCardButton({ label }) {
  return (
    <button type="button" className="btn primary card-add-btn" onClick={() => window.dispatchEvent(new Event("tcgb:add-card"))}>{label}</button>
  );
}

/** What a member's price alert on this card says, on its button: "Alert at $40", "Alert on new highs"... */
export const alertLabel = (watch) => (watch.mode === "high" ? "Alert on new highs" : watch.mode === "low" ? "Alert on new lows"
  : watch.status === "triggered" ? "Hit your price!" : `Alert at ${money(watch.target)}`);

/** The bell and lightning icons beside a card's name: the price alert pop-up (or, with an alert set, the alert) and
 * deal alerts for this card. */
export function CardAlertIcons({ watch, filterHref }) {
  return (
    <span className="card-icons">
      {watch ? <Link href="/app/watches" className="alert-bell set" title={alertLabel(watch)} aria-label={`Price alert: ${alertLabel(watch)}`}>🔔</Link>
        : <button type="button" className="alert-bell" title="Price alert" aria-label="Set a price alert"
          onClick={() => window.dispatchEvent(new Event("tcgb:price-alert"))}>🔔</button>}
      {filterHref && <Link href={filterHref} className="alert-bell" title="Deal alerts for this card" aria-label="Get deal alerts for this card">⚡</Link>}
    </span>
  );
}

/** Everything you can do with one card, on its page: own it, want it, watch its price, get deals on it, check eBay. */
export default function CardActions({ product, mine, binders, watch, plan }) {
  const router = useRouter();
  const [panel, setPanel] = useState(null); // "add" | null
  const panelRef = useRef(null);
  const alertRef = useRef(null); // the price alert pop-up (a native <dialog>)
  const [alertError, setAlertError] = useState(null);
  const openAlert = () => { setAlertError(null); alertRef.current?.showModal(); };
  useEffect(() => {
    const open = () => { setPanel("add"); setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
    window.addEventListener("tcgb:add-card", open);
    window.addEventListener("tcgb:price-alert", openAlert);
    return () => { window.removeEventListener("tcgb:add-card", open); window.removeEventListener("tcgb:price-alert", openAlert); };
  }, []);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
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
    if (r?.reveal) revealCard(r.reveal);
    if (msg) show(typeof msg === "function" ? msg(r) : msg, action);
    router.refresh();
  });

  return (
    <div className="card-actions">
      {copies > 0 ? (
        <div className="you-own">
          <div className="you-own-head"><b>✓ In your collection</b></div>
          {owned.map((it) => {
            const each = unitValue(it);
            const lineGain = it.purchasePrice != null && each != null ? (each - it.purchasePrice) * it.quantity : null;
            return (
            <div key={it.id} className="copy-row">
              <div className="copy-line">
                <span className="copy-what"><span className="copy-qty">{it.quantity}×</span><span className="copy-label">{itemLabel(it)}</span></span>
                <span className="copy-value">
                  <b>{money(each != null ? each * it.quantity : null)}</b>
                  {it.quantity > 1 && <span className="small muted">{money(each)} each</span>}
                </span>
              </div>
              <div className="copy-line">
                <span className="small muted copy-meta">
                  {it.purchasePrice ? <>Paid {money(it.purchasePrice)}{lineGain !== null && <> · <span className={lineGain >= 0 ? "up" : "down"}>{lineGain >= 0 ? "+" : "−"}{money(Math.abs(lineGain))}</span></>}</> : null}
                  {it.purchasePrice && binders.find((b) => b.id === it.binderId) ? " · " : ""}{binders.find((b) => b.id === it.binderId)?.name}
                </span>
                <span className="copy-tools">
                  <span className="stepper xs">
                    <button type="button" disabled={pending} onClick={() => (it.quantity > 1 || window.confirm("Remove this copy from your collection?")) && run(() => changeQuantity(it.id, -1))} aria-label="One fewer">−</button>
                    <span>{it.quantity}</span>
                    <button type="button" disabled={pending} onClick={() => run(() => changeQuantity(it.id, 1))} aria-label="One more">+</button>
                  </span>
                  <button type="button" className="link-btn small" data-tour="item-edit" onClick={() => { setErrors({}); setEditing(editing === it.id ? null : it.id); }}>{editing === it.id ? "Close" : "Edit"}</button>
                </span>
              </div>
              {editing === it.id && (
                <div className="copy-edit">
                  <ItemForm product={product} initial={it} binders={binders} allowList={false} submitLabel="Save changes" pending={pending} errors={errors}
                    onSubmit={(input) => run(() => editItem(it.id, input), "Saved.")} />
                  <button type="button" className="btn sm danger" style={{ marginTop: 10 }} onClick={() => window.confirm("Remove this from your collection?") && run(() => removeItem(it.id), "Removed.")}>Remove from collection</button>
                </div>
              )}
            </div>
            );
          })}
          {owned.length > 1 && (
            <div className="copy-line you-own-total">
              <span className="small muted">Total{gain !== null ? <> · <span className={gain >= 0 ? "up" : "down"}>{gain >= 0 ? "+" : "−"}{money(Math.abs(gain))} ({cost ? pct(gain / cost) : "—"})</span></> : null}</span>
              <b>{money(worth)}</b>
            </div>
          )}
        </div>
      ) : wish ? (
        <div className="you-own wish"><b>♥ On your wishlist</b> <span className="small muted">Got it? Move it to your collection in one tap.</span></div>
      ) : null}

      {(wish || copies === 0) && <div className="action-row">
        {wish && (
          <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => moveToCollection(wish.id), "Moved to your collection 🎉")}>✓ Got it</button>
        )}
        {copies === 0 && (
          wish ? <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeFromWishlist(product.id), "Removed from your wishlist.")}>♥ Wishlisted</button>
            : <button type="button" className="btn" disabled={pending} onClick={() => run(() => quickAdd(product.id, "wishlist"), "Added to your wishlist.", { href: "/app/collection?tab=wishlist", label: "Wishlist" })}>♡ Wishlist</button>
        )}
      </div>}

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

      {!watch && (
        <dialog ref={alertRef} className="cmp-dialog alert-dialog" aria-labelledby="alert-title"
          onClick={(e) => { if (e.target === alertRef.current) alertRef.current.close(); }}>
          <div className="cmp-inner">
            <div className="cmp-top">
              <div className="alert-head">
                {product.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={product.image} alt="" width={48} height={48} />}
                <div>
                  <h2 id="alert-title">Price alert</h2>
                  <div className="small muted">{product.name}{product.setName ? ` · ${product.setName}` : ""}</div>
                </div>
              </div>
              <button type="button" className="cmp-close" onClick={() => alertRef.current?.close()} aria-label="Close">✕</button>
            </div>
            <AlertSheet product={product} plan={plan} owned={copies > 0} printing={owned.find((it) => it.printing)?.printing}
              pending={pending} error={alertError} onMore={() => router.push(`/app/watches?add=${product.id}`)}
              onCreate={(input) => start(async () => {
                const r = await watchProduct(product.id, input);
                if (r?.ok === false) return setAlertError(r.error || "Something went wrong.");
                alertRef.current?.close();
                show(input.mode === "high" ? "Alert set. We'll tell you each time it hits a new high."
                  : input.mode === "low" ? "Alert set. We'll tell you each time it hits a new low."
                    : `Alert set. We'll tell you at ${money(r.target)} or ${input.mode === "above" ? "more" : "less"}.`, { href: "/app/watches", label: "Price alerts" });
                router.refresh();
              })} />
          </div>
        </dialog>
      )}
      {toast}
    </div>
  );
}

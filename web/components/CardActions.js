"use client";

import { revealCard } from "@/lib/reveal";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import { addItem, changeQuantity, dealAlertForCard, editItem, moveToCollection, quickAdd, removeFromWishlist, removeItem, watchProduct } from "@/app/app/collection/actions";
import { CONDITIONS, GRADERS, fitGrade, gradeKey, gradeName, gradeOption, gradesFor, isOwnValue, marketValue, money, pct, unitValue } from "@/lib/collection";
import AlertSheet from "@/components/AlertSheet";
import DealSheet from "@/components/DealSheet";

/** What a member's price alert on this card says, on its button: "Alert at $40", "Alert on new highs"... */
export const alertLabel = (watch) => (watch.mode === "high" ? "Alert on new highs" : watch.mode === "low" ? "Alert on new lows"
  : watch.status === "triggered" ? "Hit your price!" : `Alert at ${money(watch.target)}`);

const Icon = ({ children, filled = false }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const HEART = "M12 20.5s-7.5-4.6-9.3-9.1C1.5 8.2 3.4 5 6.6 5c2 0 3.8 1.1 5.4 3.2C13.6 6.1 15.4 5 17.4 5c3.2 0 5.1 3.2 3.9 6.4-1.8 4.5-9.3 9.1-9.3 9.1z";
const BOLT = "M13 2 4 14h7l-1 8 9-12h-7l1-8z";
const BELL = "M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2.2 2.2 0 0 0 4 0";

/** The icons at the top right of a card page: wishlist, deal alert, price alert (or, once set, a link to the alert or
 * the deal filter), then whatever's passed in (the signature star). */
export function CardAlertIcons({ watch, deals = false, dealFilter = false, wished = false, children = null }) {
  return (
    <span className="card-icons">
      <button type="button" className={`alert-bell ${wished ? "set" : ""}`} aria-pressed={wished}
        title={wished ? "On your wishlist: tap to remove" : "Add to wishlist"} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        onClick={() => window.dispatchEvent(new Event("tcgb:wishlist"))}><Icon filled={wished}><path d={HEART} /></Icon></button>
      {deals && (dealFilter ? <Link href="/app/deals" className="alert-bell set" title="You get deal alerts on this card" aria-label="Deal alerts: on for this card"><Icon filled><path d={BOLT} /></Icon></Link>
        : <button type="button" className="alert-bell" title="Deal alerts" aria-label="Get deal alerts for this card"
          onClick={() => window.dispatchEvent(new Event("tcgb:deal-alert"))}><Icon><path d={BOLT} /></Icon></button>)}
      {watch ? <Link href="/app/watches" className="alert-bell set" title={alertLabel(watch)} aria-label={`Price alert: ${alertLabel(watch)}`}><Icon filled><path d={BELL} /></Icon></Link>
        : <button type="button" className="alert-bell" title="Price alert" aria-label="Set a price alert"
          onClick={() => window.dispatchEvent(new Event("tcgb:price-alert"))}><Icon><path d={BELL} /></Icon></button>}
      {children}
    </span>
  );
}

const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);

/** A copy's name in the box: "PSA 10", "Raw · Near Mint", "Sealed". */
const copyName = (it) => (it.kind === "graded" ? gradeName(it.grader, it.grade) : it.kind === "sealed" ? "Sealed" : `Raw · ${it.condition || "Near Mint"}`);

/**
 * The chosen copy's details under the table, with Delete and Save changes. A copy with no market price takes the member's
 * own value, so its details start open; a market price always takes over from it (lib/collection.js). Quantity isn't here:
 * the steppers in the table save as they're tapped.
 */
function CopyDetails({ it, product, binders, pending, errors, onSave, onDelete, open, onToggle }) {
  const isCard = product.type === "card";
  const printings = isCard ? Object.keys(product.prices || {}) : [];
  const start = {
    kind: it.kind, printing: it.printing || printings[0] || null, condition: it.condition || "Near Mint", grader: it.grader || "PSA", grade: it.grade || "10",
    customValue: it.customValue ?? "", purchasePrice: it.purchasePrice ?? "",
    purchaseDate: it.purchaseDate ? String(it.purchaseDate).slice(0, 10) : "", certNumber: it.certNumber || "", binderId: it.binderId || "", notes: it.notes || "",
  };
  const [d, setD] = useState(start);
  const set = (field) => (e) => setD((x) => ({ ...x, [field]: e.target.value }));
  const dirty = Object.keys(start).some((k) => String(start[k] ?? "") !== String(d[k] ?? ""));
  // The stored price until the member changes which copy this is; then what that condition or grade sells for.
  const sameCopy = ["kind", "printing", "condition", "grader", "grade"].every((k) => start[k] === d[k]);
  const market = sameCopy ? it.unitValue ?? null : marketValue(product, d);
  const gradedKeys = Object.keys(product.graded || {});
  return (
    <form className="own-copy" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, quantity: it.quantity }); }}>
      <details className="own-more" open={open || market === null} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary data-tour="item-edit">
          {isCard ? "Purchase details & notes" : "Details & notes"}
          <span className="own-more-arrow" aria-hidden="true" />
        </summary>
        {market === null && <p className="own-note">No market price yet. Set your own value below.</p>}
        <div className="form-grid own-more-body">
          {market === null && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="field" htmlFor={`own-value-${it.id}`}>Your value per copy</label>
              <span className="own-money"><span aria-hidden="true">$</span>
                <input id={`own-value-${it.id}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={d.customValue} onChange={set("customValue")} />
              </span>
              <span className="hint">Used until a market price becomes available.</span>
              <Err msg={errors.customValue} />
            </div>
          )}
          {isCard && (
            <div>
              <label className="field" htmlFor={`own-kind-${it.id}`}>Type</label>
              <select id={`own-kind-${it.id}`} value={d.kind} onChange={set("kind")}><option value="raw">Raw card</option><option value="graded">Graded slab</option></select>
            </div>
          )}
          {isCard && printings.length > 1 && (
            <div>
              <label className="field" htmlFor={`own-printing-${it.id}`}>Printing</label>
              <select id={`own-printing-${it.id}`} value={d.printing || ""} onChange={set("printing")}>{printings.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
          )}
          {isCard && d.kind === "raw" && (
            <div>
              <label className="field" htmlFor={`own-cond-${it.id}`}>Condition</label>
              <select id={`own-cond-${it.id}`} value={d.condition} onChange={set("condition")}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
          )}
          {isCard && d.kind === "graded" && (
            <>
              <div>
                <label className="field" htmlFor={`own-grader-${it.id}`}>Graded by</label>
                <select id={`own-grader-${it.id}`} value={d.grader} onChange={(e) => { const g = e.target.value; setD((x) => ({ ...x, grader: g, grade: fitGrade(g, x.grade) })); }}>{GRADERS.map((g) => <option key={g}>{g}</option>)}</select>
              </div>
              <div>
                <label className="field" htmlFor={`own-grade-${it.id}`}>Grade</label>
                <select id={`own-grade-${it.id}`} value={d.grade} onChange={set("grade")}>
                  {gradesFor(d.grader).map((g) => <option key={g} value={g}>{gradeOption(d.grader, g)}{gradedKeys.includes(gradeKey(d.grader, g)) ? "" : " (no recent sales)"}</option>)}
                </select>
                <Err msg={errors.grade} />
              </div>
              <div>
                <label className="field" htmlFor={`own-cert-${it.id}`}>Cert number</label>
                <input id={`own-cert-${it.id}`} type="text" value={d.certNumber} onChange={set("certNumber")} />
              </div>
            </>
          )}
          {!sameCopy && market !== null && <p className="own-note" style={{ gridColumn: "1 / -1" }}>Worth {money(market)} per copy once saved.</p>}
          <div>
            <label className="field" htmlFor={`own-paid-${it.id}`}>Paid per copy</label>
            <input id={`own-paid-${it.id}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="$" value={d.purchasePrice} onChange={set("purchasePrice")} />
            <Err msg={errors.purchasePrice} />
          </div>
          <div>
            <label className="field" htmlFor={`own-date-${it.id}`}>Date bought</label>
            <input id={`own-date-${it.id}`} type="date" value={d.purchaseDate} max={new Date().toISOString().slice(0, 10)} onChange={set("purchaseDate")} />
            <Err msg={errors.purchaseDate} />
          </div>
          {binders.length > 0 && (
            <div>
              <label className="field" htmlFor={`own-binder-${it.id}`}>Binder</label>
              <select id={`own-binder-${it.id}`} data-tour="item-binder" value={d.binderId} onChange={set("binderId")}>
                <option value="">No binder</option>
                {binders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          {market !== null && (
            <div>
              <label className="field" htmlFor={`own-value-${it.id}`}>Your own value per copy</label>
              <input id={`own-value-${it.id}`} type="number" min="0" step="0.01" placeholder="If the market price goes away" value={d.customValue} onChange={set("customValue")} />
              <Err msg={errors.customValue} />
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="field" htmlFor={`own-notes-${it.id}`}>Notes</label>
            <input id={`own-notes-${it.id}`} type="text" maxLength={300} value={d.notes} onChange={set("notes")} placeholder="e.g. pulled from a booster box, centering 55/45" />
          </div>
        </div>
      </details>
      <Err msg={errors._} />
      <Err msg={errors.quantity} />
      <div className="own-actions">
        <button type="button" className="btn own-remove" disabled={pending} onClick={onDelete}>Delete</button>
        <button className="btn primary" disabled={pending || !dirty}>{pending ? "Saving..." : "Save changes"}</button>
      </div>
    </form>
  );
}

/** Everything you can do with one card, on its page: own it, want it, watch its price, get deals on it, check eBay. */
export default function CardActions({ product, mine, binders, watch, plan, price = null, dealFilter = false, filterHref = "/app/deals" }) {
  const router = useRouter();
  const [panel, setPanel] = useState(null); // "add" | null
  const panelRef = useRef(null);
  const alertRef = useRef(null); // the price alert pop-up (a native <dialog>)
  const [alertError, setAlertError] = useState(null);
  const openAlert = () => { setAlertError(null); alertRef.current?.showModal(); };
  const dealRef = useRef(null); // the deal alert pop-up
  const [dealError, setDealError] = useState(null);
  const openDeal = () => { setDealError(null); dealRef.current?.showModal(); };
  useEffect(() => {
    const open = () => { setPanel("add"); setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
    window.addEventListener("tcgb:add-card", open);
    window.addEventListener("tcgb:price-alert", openAlert);
    window.addEventListener("tcgb:deal-alert", openDeal);
    return () => {
      window.removeEventListener("tcgb:add-card", open); window.removeEventListener("tcgb:price-alert", openAlert); window.removeEventListener("tcgb:deal-alert", openDeal);
    };
  }, []);
  const [chosen, setChosen] = useState(null); // the copy Delete, Save and the details act on (the first until a pencil is tapped)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // the copy waiting on "Are you sure you want to remove…?"
  const confirmRef = useRef(null);
  useEffect(() => { if (confirm) confirmRef.current?.showModal(); }, [confirm]);
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
  const active = owned.find((it) => it.id === chosen) || owned[0] || null;

  // The heart beside the card's name (CardAlertIcons).
  useEffect(() => {
    const toggle = () => {
      if (pending) return;
      if (wish) run(() => removeFromWishlist(product.id), "Removed from your wishlist.");
      else run(() => quickAdd(product.id, "wishlist"), "Added to your wishlist.", { href: "/app/collection?tab=wishlist", label: "Wishlist" });
    };
    window.addEventListener("tcgb:wishlist", toggle);
    return () => window.removeEventListener("tcgb:wishlist", toggle);
  });

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

  const closeConfirm = () => { confirmRef.current?.close(); setConfirm(null); };
  const addForm = panel === "add" && (
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
  );

  return (
    <div className="card-actions">
      <div className="you-own">
        <div className="own-head">{copies > 0 && <span className="own-check" aria-hidden="true" />}<h2>Your collection</h2></div>
        {copies > 0 ? (
          <>
            <div className="own-stats">
              <div><b>{copies.toLocaleString("en-US")}</b><span>{copies === 1 ? "Copy owned" : "Copies owned"}</span></div>
              <div><b className="sensitive">{money(worth)}</b><span>Total value</span></div>
            </div>
            {gain !== null && (
              <div className="own-profit"><span className="muted">Profit on what you paid</span>
                <b className={`sensitive ${gain >= 0 ? "up" : "down"}`}>{gain >= 0 ? "+" : "−"}{money(Math.abs(gain))}{cost ? ` (${pct(gain / cost)})` : ""}</b></div>
            )}
            <div className="own-table" role="table" aria-label="Your copies">
              <div className="own-tr own-th" role="row"><span role="columnheader">Variant</span><span role="columnheader">Qty</span><span role="columnheader">Value</span><span /></div>
              {owned.map((it) => {
                const each = unitValue(it);
                const name = copyName(it);
                const isActive = owned.length > 1 && it.id === active?.id;
                return (
                  <div key={it.id} className={`own-tr ${isActive ? "on" : ""}`} role="row">
                    <span className="own-td-name" role="cell">{name}</span>
                    <span role="cell">
                      <span className="stepper xs">
                        <button type="button" disabled={pending} aria-label={`One fewer ${name}`}
                          onClick={() => (it.quantity <= 1 ? setConfirm({ id: it.id, name }) : run(() => changeQuantity(it.id, -1)))}>−</button>
                        <span>{it.quantity}</span>
                        <button type="button" disabled={pending} aria-label={`One more ${name}`} onClick={() => run(() => changeQuantity(it.id, 1))}>+</button>
                      </span>
                    </span>
                    <b className={`own-td-value sensitive ${isOwnValue(it) ? "own-value" : ""}`} role="cell" title={isOwnValue(it) ? "You typed this value in; it isn't a market price" : undefined}>{money(each != null ? each * it.quantity : null)}</b>
                    <button type="button" className="own-edit" title={`Edit ${name}`} aria-label={`Edit ${name}`} aria-pressed={detailsOpen && it.id === active?.id}
                      onClick={() => { setErrors({}); setChosen(it.id); setDetailsOpen(it.id === active?.id ? !detailsOpen : true); }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.33-2.33a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.82-1.84z" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn primary own-add" aria-expanded={panel === "add"} onClick={() => setPanel(panel === "add" ? null : "add")}>+ Add a copy</button>
            {addForm}
            {owned.length > 1 && active && <p className="own-note own-editing">Details below are for <b>{copyName(active)}</b>. Tap a pencil to switch.</p>}
            {active && (
              <CopyDetails key={active.id} it={active} product={product} binders={binders} pending={pending} errors={errors} open={detailsOpen} onToggle={setDetailsOpen}
                onSave={(input) => run(() => editItem(active.id, input), "Saved.")} onDelete={() => setConfirm({ id: active.id, name: copyName(active), quantity: active.quantity })} />
            )}
          </>
        ) : wish ? (
          <>
            <p className="own-note"><b>♥ On your wishlist.</b> Got it? Move it to your collection in one tap.</p>
            <button type="button" className="btn primary own-add" disabled={pending} onClick={() => run(() => moveToCollection(wish.id), "Moved to your collection 🎉")}>✓ Got it</button>
          </>
        ) : (
          <>
            <p className="own-note">Not in your collection yet.</p>
            <button type="button" className="btn primary own-add" aria-expanded={panel === "add"} onClick={() => setPanel(panel === "add" ? null : "add")}>+ Add to collection</button>
            {addForm}
          </>
        )}
      </div>

      {confirm && (
        <dialog ref={confirmRef} className="cmp-dialog alert-dialog own-confirm" aria-labelledby="own-confirm-title" onClose={() => setConfirm(null)}
          onClick={(e) => { if (e.target === confirmRef.current) closeConfirm(); }}>
          <div className="cmp-inner">
            <h2 id="own-confirm-title">Are you sure you want to remove this from your collection?</h2>
            <p className="small muted">{confirm.quantity > 1 ? `All ${confirm.quantity} copies of ${confirm.name}` : confirm.name} · {product.name.replace(/\s*\(.*\)$/, "")}</p>
            <div className="own-actions">
              <button type="button" className="btn" autoFocus onClick={closeConfirm}>No</button>
              <button type="button" className="btn own-remove" disabled={pending}
                onClick={() => { const { id } = confirm; closeConfirm(); setChosen(null); setDetailsOpen(false); run(() => removeItem(id), "Removed."); }}>Yes</button>
            </div>
          </div>
        </dialog>
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
      {!dealFilter && product.type === "card" && (
        <dialog ref={dealRef} className="cmp-dialog alert-dialog" aria-labelledby="deal-title"
          onClick={(e) => { if (e.target === dealRef.current) dealRef.current.close(); }}>
          <div className="cmp-inner">
            <div className="cmp-top">
              <div className="alert-head">
                {product.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={product.image} alt="" width={48} height={48} />}
                <div>
                  <h2 id="deal-title">Deal alert</h2>
                  <div className="small muted">{product.name}{product.setName ? ` · ${product.setName}` : ""}</div>
                </div>
              </div>
              <button type="button" className="cmp-close" onClick={() => dealRef.current?.close()} aria-label="Close">✕</button>
            </div>
            <DealSheet product={product} plan={plan} price={price} moreHref={filterHref} pending={pending} error={dealError}
              onCreate={(input) => start(async () => {
                const r = await dealAlertForCard(product.id, input);
                if (r?.ok === false) return setDealError(r.error || "Something went wrong.");
                dealRef.current?.close();
                show(r.already ? "You already get deal alerts on this card." : `Deal alert set. We'll tell you when an auction for this card ends ${input.pct}% or more under market.`,
                  { href: "/app/deals", label: "Deal filters" });
                router.refresh();
              })} />
          </div>
        </dialog>
      )}
      {toast}
    </div>
  );
}

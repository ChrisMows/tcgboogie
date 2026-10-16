"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import {
  addBinder, changeQuantity, editItem, moveToCollection, removeBinder, removeItem, renameBinder, watchProduct,
} from "@/app/app/collection/actions";
import { KINDS, SORTS, itemLabel, money, pct, unitValue } from "@/lib/collection";

const short = (name) => name.replace(/\s*\(.*\)$/, "");

function Change({ v }) {
  if (v === null || v === undefined) return null;
  const flat = Math.abs(v) < 0.005;
  return <span className={`chg ${flat ? "" : v > 0 ? "up" : "down"}`}>{flat ? "•" : v > 0 ? "▲" : "▼"} {pct(v)}</span>;
}

function WatchButton({ item, watched, onWatch, pending }) {
  return watched ? (
    <Link href="/app/watches" className="btn sm" title="You're watching this card's price">🔔 Watching</Link>
  ) : (
    <button type="button" className="btn sm" disabled={pending} onClick={() => onWatch(item)} title="Alert me when the price drops">🔔 Watch price</button>
  );
}

export default function CollectionView({ items, binders, products, watched: watchedIds, tab, isDemo }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [binder, setBinder] = useState("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("value");
  const [view, setView] = useState("grid");
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [manage, setManage] = useState(false);
  const [newBinder, setNewBinder] = useState("");
  const [watched, setWatched] = useState(new Set(watchedIds));
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const wishlist = tab === "wishlist";

  useEffect(() => {
    try { const v = localStorage.getItem("tcg-coll-view"); if (v === "list" || v === "grid") setView(v); } catch {}
  }, []);
  const pickView = (v) => { setView(v); try { localStorage.setItem("tcg-coll-view", v); } catch {} };

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = items.filter((it) =>
      (binder === "all" || (binder === "none" ? !it.binderId : it.binderId === Number(binder)))
      && (kind === "all" || it.kind === kind)
      && words.every((w) => `${it.name} ${it.setName} ${it.number || ""} ${itemLabel(it)}`.toLowerCase().includes(w)));
    const total = (it) => (unitValue(it) ?? 0) * it.quantity;
    const gain = (it) => (it.purchasePrice !== null && it.purchasePrice !== undefined && unitValue(it) !== null ? (unitValue(it) - it.purchasePrice) * it.quantity : -Infinity);
    const by = {
      value: (a, b) => total(b) - total(a),
      gain: (a, b) => gain(b) - gain(a),
      change: (a, b) => (b.change7 ?? -Infinity) - (a.change7 ?? -Infinity),
      name: (a, b) => a.name.localeCompare(b.name),
      added: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    };
    return [...list].sort(by[sort] || by.value);
  }, [items, q, binder, kind, sort]);

  const act = (fn, msg) => start(async () => { const r = await fn(); if (r?.ok === false && r.error) show(r.error, null, "bad"); else if (msg) show(msg); router.refresh(); });

  function watch(it) {
    start(async () => {
      const r = await watchProduct(it.productId);
      if (!r.ok) return show(r.error, r.limit ? { href: "/app/billing", label: "Upgrade" } : null, "bad");
      setWatched((s) => new Set(s).add(it.productId));
      show(r.already ? "You're already watching this one." : `Watching ${short(it.name)} · alert at ${money(r.target)} or less`, { href: "/app/watches", label: "Adjust" });
      router.refresh();
    });
  }

  function save(id, input) {
    start(async () => {
      const r = await editItem(id, input);
      if (!r.ok) return setErrors(r.errors || {});
      setErrors({}); setEditing(null); show("Saved.");
      router.refresh();
    });
  }

  const binderName = (id) => binders.find((b) => b.id === id)?.name;

  return (
    <>
      <div className="coll-toolbar">
        <div className="search-box small">
          <span aria-hidden="true">⌕</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={wishlist ? "Search your wishlist" : "Search your collection"} aria-label="Search" />
        </div>
        {!wishlist && (
          <select value={binder} onChange={(e) => setBinder(e.target.value)} aria-label="Binder">
            <option value="all">All binders</option>
            {binders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="none">Not in a binder</option>
          </select>
        )}
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="all">Raw, graded & sealed</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v} only</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).filter(([k]) => !wishlist || k !== "gain").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="seg" role="group" aria-label="View">
          <button type="button" className={view === "grid" ? "on" : ""} onClick={() => pickView("grid")} aria-label="Grid view">▦</button>
          <button type="button" className={view === "list" ? "on" : ""} onClick={() => pickView("list")} aria-label="List view">☰</button>
        </div>
        {!wishlist && <button type="button" className="btn ghost sm" onClick={() => setManage(!manage)}>{manage ? "Close binders" : "Manage binders"}</button>}
      </div>

      {manage && (
        <div className="panel binders">
          <h2>Binders</h2>
          <p className="small muted" style={{ marginTop: -8 }}>Group cards however you like. Removing a binder keeps its cards.</p>
          {binders.map((b) => (
            <div key={b.id} className="binder-row">
              <input type="text" defaultValue={b.name} maxLength={40} aria-label="Binder name"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== b.name && act(() => renameBinder(b.id, e.target.value), "Binder renamed.")} />
              <span className="small muted">{items.filter((it) => it.binderId === b.id).length} lines</span>
              <button type="button" className="btn sm danger" onClick={() => window.confirm(`Remove the binder "${b.name}"? Its cards stay in your collection.`) && act(() => removeBinder(b.id), "Binder removed.")}>Remove</button>
            </div>
          ))}
          <form className="binder-row" onSubmit={(e) => { e.preventDefault(); act(() => addBinder(newBinder), "Binder added."); setNewBinder(""); }}>
            <input type="text" value={newBinder} maxLength={40} onChange={(e) => setNewBinder(e.target.value)} placeholder="New binder, e.g. For trade" aria-label="New binder name" />
            <button className="btn sm" disabled={!newBinder.trim() || pending}>Add binder</button>
          </form>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="panel empty-state">
          {items.length === 0 ? (
            wishlist ? <>Your wishlist is empty. Tap ♡ on any card in a set, or on a card&apos;s page, to add it.</>
              : <>Nothing here yet. Use <b>Add cards</b> above, or <Link href="/app/collection/sets">browse a set</Link> and tap the cards you own.</>
          ) : "No cards match these filters."}
        </div>
      ) : view === "grid" ? (
        <div className="tile-grid">
          {shown.map((it) => (
            <div className="tile" key={it.id}>
              <Link href={`/app/cards/${it.productId}`} className="tile-link">
                <div className="tile-art">
                  <CardThumb item={it} width={150} />
                  {it.quantity > 1 && <span className="qty-badge">×{it.quantity}</span>}
                </div>
                <div className="tile-name" title={it.name}>{short(it.name)}</div>
                <div className="tile-meta">{it.setName}{it.number ? ` · ${it.number.split("/")[0]}` : ""}</div>
                <div className="tile-foot">
                  <span className="chip-mini">{itemLabel(it)}</span>
                  <Change v={it.change7} />
                </div>
                <div className="tile-value">{money(unitValue(it) !== null ? unitValue(it) * (wishlist ? 1 : it.quantity) : null)}</div>
              </Link>
              {wishlist && (
                <div className="tile-actions">
                  <button type="button" className="btn sm primary" disabled={pending} onClick={() => act(() => moveToCollection(it.id), `${short(it.name)} moved to your collection 🎉`)}>Got it</button>
                  {watched.has(it.productId) ? <Link href="/app/watches" className="btn sm" title="Watching price">🔔</Link>
                    : <button type="button" className="btn sm" disabled={pending} onClick={() => watch(it)} title="Watch price">🔔</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="item-list">
          {shown.map((it) => {
            const v = unitValue(it);
            const paid = it.purchasePrice;
            const gain = v !== null && paid !== null && paid !== undefined ? (v - paid) * it.quantity : null;
            return (
              <div className="item-row" key={it.id}>
                <div className="item-main">
                  <Link href={`/app/cards/${it.productId}`}><CardThumb item={it} width={48} /></Link>
                  <div className="item-text">
                    <Link href={`/app/cards/${it.productId}`} className="item-name">{short(it.name)}</Link>
                    <div className="small muted">
                      {it.setName}{it.number ? ` · ${it.number}` : ""} · <span className="chip-mini">{itemLabel(it)}</span>
                      {it.binderId && binderName(it.binderId) ? <> · {binderName(it.binderId)}</> : null}
                      {it.customValue !== null && it.customValue !== undefined ? <> · your value</> : null}
                    </div>
                  </div>
                </div>
                {!wishlist && (
                  <div className="stepper sm" aria-label="Quantity">
                    <button type="button" disabled={pending} onClick={() => (it.quantity > 1 || window.confirm(`Remove ${short(it.name)} from your collection?`)) && act(() => changeQuantity(it.id, -1))} aria-label="One fewer">−</button>
                    <span>{it.quantity}</span>
                    <button type="button" disabled={pending} onClick={() => act(() => changeQuantity(it.id, 1))} aria-label="One more">+</button>
                  </div>
                )}
                <div className="item-value">
                  <b>{money(v !== null ? v * (wishlist ? 1 : it.quantity) : null)}</b>
                  <div className="small muted">{!wishlist && it.quantity > 1 && v !== null ? `${money(v)} each · ` : ""}<Change v={it.change7} /></div>
                </div>
                {!wishlist && (
                  <div className={`item-gain ${gain === null ? "muted" : gain >= 0 ? "up" : "down"}`}>
                    {gain === null ? <span className="small">No cost</span> : <>{gain >= 0 ? "+" : ""}{money(gain)}<div className="small">{paid ? pct((v - paid) / paid) : ""}</div></>}
                  </div>
                )}
                <div className="item-actions">
                  {wishlist && <button type="button" className="btn sm primary" disabled={pending} onClick={() => act(() => moveToCollection(it.id), `${short(it.name)} moved to your collection 🎉`)}>Got it</button>}
                  <WatchButton item={it} watched={watched.has(it.productId)} onWatch={watch} pending={pending} />
                  {!wishlist && <button type="button" className="btn sm" onClick={() => { setErrors({}); setEditing(editing === it.id ? null : it.id); }}>{editing === it.id ? "Close" : "Edit"}</button>}
                  <button type="button" className="btn sm danger" disabled={pending} aria-label={`Remove ${it.name}`}
                    onClick={() => window.confirm(`Remove ${short(it.name)}${wishlist ? " from your wishlist" : " from your collection"}?`) && act(() => removeItem(it.id), "Removed.")}>✕</button>
                </div>
                {editing === it.id && (
                  <div className="item-edit">
                    {products[it.productId] ? (
                      <ItemForm product={products[it.productId]} initial={it} binders={binders} allowList={false} submitLabel="Save changes" onSubmit={(input) => save(it.id, input)} pending={pending} errors={errors} />
                    ) : <p className="muted small">Prices for this card are still loading. Try again in a moment.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {isDemo && <p className="hint" style={{ marginTop: 14 }}>Demo collection with sample prices. Changes last until the preview server restarts.</p>}
      {toast}
    </>
  );
}

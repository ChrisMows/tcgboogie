"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import { useToast } from "@/components/Toast";
import { quickAdd, removeFromWishlist, removeOneCopy, watchProduct } from "@/app/app/collection/actions";
import { money, nmPrice } from "@/lib/collection";

const short = (name) => name.replace(/\s*\(.*\)$/, "");
const numKey = (c) => {
  const n = String(c.number || "").split("/")[0];
  const d = parseInt(n.replace(/\D/g, ""), 10);
  return [n.replace(/\d/g, ""), Number.isFinite(d) ? d : 9999];
};

/** Every card in a set. Tap a missing card to add a Near Mint copy; owned cards get a − / + stepper. */
export default function SetGrid({ cards, owned: ownedInit, wished: wishedInit, watched: watchedInit, isDemo }) {
  const router = useRouter();
  const [owned, setOwned] = useState(ownedInit);
  const [wished, setWished] = useState(new Set(wishedInit));
  const [watched, setWatched] = useState(new Set(watchedInit));
  const [show, setShow] = useState("all");
  const [sort, setSort] = useState("number");
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const [toast, toastShow] = useToast();

  const list = useMemo(() => {
    const w = q.toLowerCase().trim();
    const out = cards.filter((c) => (show === "all" || (show === "owned" ? owned[c.id] : !owned[c.id]))
      && (!w || `${c.name} ${c.number}`.toLowerCase().includes(w)));
    return out.sort(sort === "price"
      ? (a, b) => (nmPrice(b) ?? 0) - (nmPrice(a) ?? 0)
      : (a, b) => { const [pa, na] = numKey(a), [pb, nb] = numKey(b); return pa.localeCompare(pb) || na - nb; });
  }, [cards, owned, show, sort, q]);

  // Optimistic: the tile updates at once, the server catches up, and we roll back if it fails.
  function add(c) {
    setOwned((o) => ({ ...o, [c.id]: (o[c.id] || 0) + 1 }));
    start(async () => {
      const r = await quickAdd(c.id);
      if (!r.ok) { setOwned((o) => ({ ...o, [c.id]: Math.max(0, (o[c.id] || 1) - 1) })); return toastShow(r.error, null, "bad"); }
      toastShow(`Added ${short(c.name)} #${String(c.number).split("/")[0].replace(/^0+(?=\d)/, "")}${r.value ? ` · ${money(r.value)}` : ""}`, { label: "Undo", onClick: () => remove(c, true) });
      router.refresh();
    });
  }
  function remove(c, quiet) {
    setOwned((o) => ({ ...o, [c.id]: Math.max(0, (o[c.id] || 1) - 1) }));
    start(async () => { await removeOneCopy(c.id); if (!quiet) toastShow(`Removed one ${short(c.name)}`); router.refresh(); });
  }
  function toggleWish(c) {
    const on = !wished.has(c.id);
    setWished((s) => { const n = new Set(s); on ? n.add(c.id) : n.delete(c.id); return n; });
    start(async () => {
      if (on) await quickAdd(c.id, "wishlist"); else await removeFromWishlist(c.id);
      toastShow(on ? `${short(c.name)} is on your wishlist` : "Removed from your wishlist", on ? { href: "/app/collection?tab=wishlist", label: "Wishlist" } : null);
      router.refresh();
    });
  }
  function watch(c) {
    start(async () => {
      const r = await watchProduct(c.id);
      if (!r.ok) return toastShow(r.error, r.limit ? { href: "/app/billing", label: "Upgrade" } : null, "bad");
      setWatched((s) => new Set(s).add(c.id));
      toastShow(r.already ? "Already watching this card." : `Watching ${short(c.name)} · alert at ${money(r.target)} or less`, { href: "/app/watches", label: "Adjust" });
    });
  }

  const ownedCount = cards.filter((c) => owned[c.id]).length;

  return (
    <>
      <div className="coll-toolbar">
        <div className="seg" role="group" aria-label="Show">
          <button type="button" className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All {cards.length}</button>
          <button type="button" className={show === "owned" ? "on" : ""} onClick={() => setShow("owned")}>Owned {ownedCount}</button>
          <button type="button" className={show === "missing" ? "on" : ""} onClick={() => setShow("missing")}>Missing {cards.length - ownedCount}</button>
        </div>
        <div className="search-box small">
          <span aria-hidden="true">⌕</span>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card or number" aria-label="Find a card in this set" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="number">By card number</option>
          <option value="price">By price</option>
        </select>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>Tap a card to add a Near Mint copy. Graded or a different condition? Open the card with ↗.</p>

      <div className="set-cards">
        {list.map((c) => {
          const n = owned[c.id] || 0;
          return (
            <div key={c.id} className={`set-tile ${n ? "owned" : "missing"}`}>
              <button type="button" className="set-tile-art" onClick={() => add(c)} aria-label={n ? `Add another ${c.name}` : `I own ${c.name}`}>
                <CardThumb item={c} width={140} />
                {!n && <span className="tap-hint">+ I own this</span>}
              </button>
              <Link href={`/app/cards/${c.id}`} className="open-card" aria-label={`Open ${c.name}`} title="Open card page">↗</Link>
              <button type="button" className={`heart ${wished.has(c.id) ? "on" : ""}`} onClick={() => toggleWish(c)}
                aria-pressed={wished.has(c.id)} aria-label={wished.has(c.id) ? "Remove from wishlist" : "Add to wishlist"} title="Wishlist">{wished.has(c.id) ? "♥" : "♡"}</button>
              <div className="set-tile-info">
                <span className="small muted">#{String(c.number || "").split("/")[0].replace(/^0+(?=\d)/, "")}</span>
                <Link href={`/app/cards/${c.id}`} className="set-tile-name" title={c.name}>{short(c.name)}</Link>
                <div className="set-tile-foot">
                  <b>{money(nmPrice(c))}</b>
                  {n ? (
                    <span className="stepper xs">
                      <button type="button" onClick={() => remove(c)} aria-label="One fewer">−</button>
                      <span>{n}</span>
                      <button type="button" onClick={() => add(c)} aria-label="One more">+</button>
                    </span>
                  ) : watched.has(c.id) ? <Link href="/app/watches" className="small" title="Watching price">🔔</Link>
                    : <button type="button" className="link-btn small" onClick={() => watch(c)} title="Set a price alert">🔔 Alert</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <div className="panel muted">No cards match.</div>}
      {isDemo && <p className="hint">Demo set with sample prices: only a handful of cards from the real set are included.</p>}
      {toast}
    </>
  );
}

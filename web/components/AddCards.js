"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import { addItem, quickAdd, searchCatalog } from "@/app/app/collection/actions";
import { money, nmPrice } from "@/lib/collection";

/** Search-as-you-type to add cards and sealed products. Quick "+" adds a Near Mint copy; picking a result opens details. */
export default function AddCards({ binders, owned = {}, isDemo, autoFocus = false, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [errors, setErrors] = useState({});
  const [counts, setCounts] = useState(owned);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setError(null); return; }
    const n = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchCatalog(term);
      if (n !== seq.current) return; // a newer search is on its way
      setSearching(false);
      if (!res.ok) { setResults([]); setError(res.error); return; }
      setError(null);
      setResults(res.results);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  function quick(p) {
    start(async () => {
      const res = await quickAdd(p.id);
      if (!res.ok) return show(res.error, null, "bad");
      setCounts((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
      show(`Added ${p.name.replace(/\s*\(.*\)$/, "")}${p.type === "card" ? " (Near Mint)" : ""}`, { href: `/app/cards/${p.id}`, label: "Open card" });
      router.refresh();
    });
  }

  function submit(input) {
    start(async () => {
      const res = await addItem(picked.id, input);
      if (!res.ok) return setErrors(res.errors || {});
      setErrors({});
      if (input.list === "owned") setCounts((c) => ({ ...c, [picked.id]: (c[picked.id] || 0) + Number(input.quantity || 1) }));
      show(input.list === "wishlist" ? `${picked.name} is on your wishlist` : `Added to your collection${res.value ? ` · worth ${money(res.value * (input.quantity || 1))}` : ""}${res.fromWishlist ? " · taken off your wishlist" : ""}`,
        { href: `/app/cards/${picked.id}`, label: "Open card" });
      setPicked(null);
      router.refresh();
    });
  }

  return (
    <div className="add-cards">
      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input type="text" value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          placeholder="Search a card, set, or number (Charizard 151, 215/203), or paste a TCGplayer link" aria-label="Search cards to add" />
        {searching && <span className="small muted">Searching…</span>}
        {onClose && <button type="button" className="btn ghost sm" onClick={onClose}>Done</button>}
      </div>
      {isDemo && !q && <div className="hint">Preview catalog (a few sample cards): try “Charizard”, “151”, “Umbreon”, “Base Set”, or “Elite Trainer Box”.</div>}
      {error && <div className="hint">{error}</div>}

      {picked ? (
        <div className="picked">
          <div className="picked-head">
            <CardThumb item={picked} width={72} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{picked.name}</b>
              <div className="small muted">{picked.setName}{picked.number ? ` · ${picked.number}` : ""}{picked.language === "japanese" ? " · Japanese" : ""}</div>
              <Link href={`/app/cards/${picked.id}`} className="small">Open card page →</Link>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>← Back to results</button>
          </div>
          <ItemForm key={picked.id} product={picked} binders={binders} onSubmit={submit} pending={pending} errors={errors} />
        </div>
      ) : results && results.length > 0 && (
        <ul className="results">
          {results.map((p) => {
            const price = p.type === "sealed" ? p.prices?.market : nmPrice(p);
            return (
              <li key={p.id}>
                <button type="button" className="result-main" onClick={() => { setErrors({}); setPicked(p); }}>
                  <CardThumb item={p} width={42} />
                  <span className="result-text">
                    <b>{p.name}</b>
                    <span className="small muted">{p.setName}{p.number ? ` · ${p.number}` : ""}{p.type === "sealed" ? " · Sealed" : ""}{p.language === "japanese" ? " · Japanese" : ""}</span>
                  </span>
                  {counts[p.id] ? <span className="badge accent">You own {counts[p.id]}</span> : null}
                  <span className="result-price">{money(price)}</span>
                </button>
                <button type="button" className="btn sm primary" disabled={pending} onClick={() => quick(p)}
                  title={p.type === "card" ? "Add one Near Mint copy" : "Add one"}>+ Add</button>
              </li>
            );
          })}
        </ul>
      )}
      {toast}
    </div>
  );
}

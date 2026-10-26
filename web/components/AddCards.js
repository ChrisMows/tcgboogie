"use client";

import { revealCard } from "@/lib/reveal";
import { PHOTO_TIP, runningLow } from "@/lib/quota-tips";
import CardRequest from "@/components/CardRequest";
import { SuggestIdea } from "@/components/IdeaBox";
import { shrinkImage } from "@/lib/shrink-image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import ItemForm from "@/components/ItemForm";
import { useToast } from "@/components/Toast";
import { addItem, productDetails, quickAdd, searchByPhoto, searchCatalog } from "@/app/app/collection/actions";
import { money, nmPrice } from "@/lib/collection";

/** Search-as-you-type to add cards and sealed products. Quick "+" adds a Near Mint copy; picking a result opens details. */
const PAGE = 8; // search results per page (big pictures, so you can tell versions apart)

export default function AddCards({ binders, owned = {}, isDemo, autoFocus = false, onClose, photoSearch = false, photoQuota = null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);
  // This month's search-by-picture allowance (Free): { limit, left }; null limit = unlimited.
  const [photoLeft, setPhotoLeft] = useState(photoQuota?.limit == null ? null : photoQuota.left);
  const photoOut = photoLeft === 0;
  // Search results don't carry graded sales: show the form at once, then fill in the card's full details.
  const pick = (p) => {
    setPicked({ ...p, detailsLoading: p.type === "card" });
    if (p.type !== "card") return;
    productDetails(p.id, p.language).then((full) => {
      setPicked((cur) => (cur?.id === p.id ? { ...cur, ...(full || {}), detailsLoading: false } : cur));
    });
  };
  const [errors, setErrors] = useState({});
  const [counts, setCounts] = useState(owned);
  const [searching, setSearching] = useState(false);
  const [shown, setShown] = useState(PAGE); // results show a page at a time, with big pictures
  // Search by picture: the photo's preview, what we read but couldn't find, and whether it's being read.
  const [photo, setPhoto] = useState(null); // { url, unread: [{ name, number, language }] }
  const [reading, setReading] = useState(false);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  // ✕ in the search bar, and after every add: an empty bar, ready for the next card (focused again where there's a
  // keyboard, but not on a phone, where it would pop the keyboard up over the pack opening).
  const clearSearch = (refocus = true) => {
    setQ(""); setResults(null); setError(null); setShown(PAGE);
    if (refocus && window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  };
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { if (!photo) { setResults(null); setError(null); } return; }
    setPhoto(null);
    const n = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchCatalog(term);
      if (n !== seq.current) return; // a newer search is on its way
      setSearching(false);
      if (!res.ok) { setResults([]); setError(res.error); return; }
      setError(null);
      setResults(res.results);
      setShown(PAGE);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // Search by picture: read the photo, then show the cards found as the search results.
  async function onPhoto(file) {
    if (!file) return;
    setQ(""); setPicked(null); setError(null); setShown(PAGE);
    setPhoto({ url: URL.createObjectURL(file), unread: [] });
    setResults(null);
    setReading(true);
    const fd = new FormData();
    fd.append("photo", await shrinkImage(file));
    const res = await searchByPhoto(fd).catch(() => ({ ok: false, error: "We couldn't read that photo. Please try again." }));
    setReading(false);
    if (typeof res.left === "number") setPhotoLeft(res.left);
    if (!res.ok) { setResults([]); setError(res.error); return; }
    setResults(res.results);
    setPhoto((p) => p && { ...p, unread: res.unread || [] });
    if (!res.results.length) setError("We read the card but couldn't find it in our catalog. Request it below and we'll add it.");
  }
  const clearPhoto = () => { setPhoto(null); setResults(null); setError(null); };

  function quick(p) {
    start(async () => {
      const res = await quickAdd(p.id);
      if (!res.ok) return show(res.error, null, "bad");
      revealCard(res.reveal);
      setCounts((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
      clearSearch();
      show(`Added ${p.name.replace(/\s*\(.*\)$/, "")}${p.type === "card" ? " (Near Mint)" : ""}`, { href: `/app/cards/${p.id}`, label: "Open card" });
      router.refresh();
    });
  }

  function submit(input) {
    start(async () => {
      const res = await addItem(picked.id, input);
      if (!res.ok) return setErrors(res.errors || {});
      setErrors({});
      revealCard(res.reveal);
      if (input.list === "owned") setCounts((c) => ({ ...c, [picked.id]: (c[picked.id] || 0) + Number(input.quantity || 1) }));
      show(input.list === "wishlist" ? `${picked.name} is on your wishlist` : `Added to your collection${res.value ? ` · worth ${money(res.value * (input.quantity || 1))}` : ""}${res.fromWishlist ? " · taken off your wishlist" : ""}`,
        { href: `/app/cards/${picked.id}`, label: "Open card" });
      setPicked(null);
      clearSearch();
      router.refresh();
    });
  }

  return (
    <div className="add-cards">
      <div className="search-box">
        <span aria-hidden="true">⌕</span>
        <input ref={inputRef} type="text" enterKeyHint="search" value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setPicked(null); }}
          placeholder="Card name + number, e.g. Black Kyurem 020/027" aria-label="Search cards to add" data-tour="add-search" />
        {searching && <span className="small muted">Searching…</span>}
        {q && <button type="button" className="search-clear" onClick={() => clearSearch()} aria-label="Clear search" title="Clear">✕</button>}
        {photoSearch === true && photoOut ? (
          <Link href="/app/premium?from=photo-search" className="photo-search-btn"
            title={`You've used this month's ${photoQuota.limit} picture searches.${photoQuota.canUpgrade ? " More with Premium." : " They reset on the 1st."}`} aria-label="Search by picture (used up this month)">📷</Link>
        ) : photoSearch === true ? (
          <>
            <button type="button" className="photo-search-btn" onClick={() => fileRef.current?.click()} disabled={reading}
              title="Search by picture: take a photo or upload one" aria-label="Search by picture">📷</button>
            {/* No capture attribute: phones offer "Take photo" or the photo library; desktops get a file picker. */}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        ) : photoSearch === "locked" ? (
          <Link href="/app/premium?from=photo-search" className="photo-search-btn" title="Search by picture is part of Premium" aria-label="Search by picture (Premium)">📷</Link>
        ) : null}
        {onClose && <button type="button" className="btn ghost sm" onClick={onClose}>Done</button>}
      </div>
      {photoSearch === true && photoLeft !== null && (
        <div className="hint">
          📷 Search by picture: {photoOut ? <>you&apos;ve used all {photoQuota.limit} this month (they reset on the 1st).{photoQuota.canUpgrade && <> <Link href="/app/premium?from=photo-search">More with Premium</Link></>}</>
            : <>{photoLeft} of {photoQuota.limit} left this month{runningLow({ limit: photoQuota.limit, left: photoLeft }) ? `. ${PHOTO_TIP}` : ""}</>}
        </div>
      )}
      {isDemo && !q && !photo && <div className="hint">Preview catalog (a few sample cards): try “Charizard”, “151”, “Umbreon”, “Base Set”, or “Elite Trainer Box”.</div>}
      {photo && (
        <div className="photo-search">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Your photo" />
          <span className="small">{reading ? "Reading your photo…" : results?.length ? `Found ${results.length} card${results.length === 1 ? "" : "s"} in your photo` : "Your photo"}</span>
          <button type="button" className="link-btn small" onClick={clearPhoto}>Clear</button>
        </div>
      )}
      {error && <div className="hint">{error}</div>}
      {q.trim().length >= 2 && !searching && <CardRequest query={q} />}
      {q.trim().length >= 2 && !searching && results && results.length === 0 && !photo && (
        <SuggestIdea source="search" className="link-btn small idea-inline" label="Looking for something else, like a feature or another game? Tell us →"
          prompt={`You searched for "${q.trim().slice(0, 60)}". What were you hoping to find or do?`} context={{ search: q.trim() }} />
      )}
      {photo && !reading && photo.unread.slice(0, 3).map((c, i) => (
        <CardRequest key={i} query={`${c.name}${c.number ? ` ${c.number}` : ""}${c.language === "japanese" ? " Japanese" : ""}`}
          label={`Can’t find ${c.name}${c.number ? ` ${c.number}` : ""}? Request it →`} />
      ))}

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
        <>
          <ul className="result-grid">
            {results.slice(0, shown).map((p) => {
              const price = p.type === "sealed" ? p.prices?.market : nmPrice(p);
              return (
                <li key={`${p.id}:${p.language || "english"}`} className="result-tile">
                  <button type="button" className="result-tile-main" onClick={() => { setErrors({}); pick(p); }} title="Choose condition, grade and more">
                    <span className="result-tile-art">
                      <CardThumb item={p} width={150} />
                      {counts[p.id] ? <span className="badge accent result-owned">You own {counts[p.id]}</span> : null}
                    </span>
                    <b className="result-tile-name">{p.name}</b>
                    <span className="small muted result-tile-set">
                      {p.setName}{p.number ? ` · ${p.number}` : ""}{p.type === "sealed" ? " · Sealed" : ""}{p.language && p.language !== "english" ? ` · ${p.language[0].toUpperCase()}${p.language.slice(1)}` : ""}
                    </span>
                    <span className="result-price">{p.memberAdded ? <span className="small muted">No price data</span> : money(price)}</span>
                  </button>
                  <button type="button" className="btn sm primary" disabled={pending} onClick={() => quick(p)}
                    title={p.type === "card" ? "Add one Near Mint copy" : "Add one"}>+ Add</button>
                </li>
              );
            })}
          </ul>
          {results.length > shown && (
            <button type="button" className="btn ghost sm result-more" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({results.length - shown})
            </button>
          )}
        </>
      )}
      {toast}
    </div>
  );
}

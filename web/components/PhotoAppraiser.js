"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import CardThumb from "@/components/CardThumb";
import { addAppraised, appraise } from "@/app/app/collection/photo/actions";

const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shrink in the browser (longest side 1568px, Claude's sweet spot for images) so uploads are quick.
async function shrink(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  return blob ? new File([blob], "cards.jpg", { type: "image/jpeg" }) : file;
}

/** Snap or upload a photo of cards: we read each one, price it, and let you add them to your collection. */
export default function PhotoAppraiser({ allowed }) {
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState({});
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();

  const onFile = (file) => {
    if (!file) return;
    setError(null); setResult(null); setDone(null);
    setPreview(URL.createObjectURL(file));
    start(async () => {
      const fd = new FormData();
      fd.append("photo", await shrink(file));
      const r = await appraise(fd);
      if (!r.ok) { setError(r.error); return; }
      setResult(r);
      setPicked(Object.fromEntries(r.cards.map((c, i) => [i, Boolean(c.product)])));
    });
  };

  const add = () => start(async () => {
    const picks = result.cards.map((c, i) => [c, i]).filter(([c, i]) => picked[i] && c.product)
      .map(([c]) => ({ productId: c.product.id, name: c.product.name, graded: c.graded, grader: c.grader, grade: c.grade }));
    const r = await addAppraised(picks);
    setDone(r);
  });

  if (!allowed) {
    return (
      <div className="panel">
        <p style={{ marginTop: 0 }}>Take a photo of a binder page, a stack of cards spread out, or a few slabs. We read every card, look up what it&apos;s worth, and add them to your collection in one tap.</p>
        <Link href="/app/premium?from=photo" className="btn primary">See Premium</Link>
      </div>
    );
  }

  const chosen = result ? result.cards.filter((c, i) => picked[i] && c.product) : [];
  return (
    <>
      <div className="panel photo-drop">
        <label className="btn primary" style={{ cursor: "pointer" }}>
          📷 {result || preview ? "Try another photo" : "Take or choose a photo"}
          <input type="file" accept="image/*" capture="environment" hidden disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="small muted">Works best with cards flat, in good light, numbers visible. Up to 20 cards per photo.</span>
      </div>

      {error && <div className="notice warn">{error}</div>}
      {pending && !result && <div className="notice">Reading your cards… this takes a few seconds.</div>}

      {result && (
        <div className="photo-result">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="Your photo" className="photo-preview" />}
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{result.cards.length} card{result.cards.length === 1 ? "" : "s"} · about {money(result.total)}</h2>
            </div>
            {result.cards.length === 0 && <p className="muted">We couldn&apos;t make out any cards. Try a closer, brighter photo.</p>}
            <div className="photo-list">
              {result.cards.map((c, i) => (
                <label key={i} className={`photo-row ${c.product ? "" : "dim"}`}>
                  <input type="checkbox" checked={Boolean(picked[i])} disabled={!c.product} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} />
                  <CardThumb item={c.product || { name: c.read.name, number: c.read.number }} width={44} />
                  <span className="photo-name">
                    <b>{c.product ? c.product.name : c.read.name || "Unreadable card"}</b>
                    <span className="small muted">
                      {c.product ? `${c.product.setName} · ${c.product.number}` : `Read as ${c.read.number || "no number"} · no match found`}
                      {c.graded ? ` · ${c.grader} ${c.grade}` : " · raw, priced as Near Mint"}
                      {c.product?.language === "japanese" ? " · Japanese" : ""}
                    </span>
                    {c.read.confidence === "low" && <span className="badge warn">Hard to read: check it</span>}
                  </span>
                  <b className="photo-value">{c.value ? money(c.value) : "—"}</b>
                  {c.product && <Link href={`/app/cards/${encodeURIComponent(c.product.id)}`} className="small" onClick={(e) => e.stopPropagation()}>View</Link>}
                </label>
              ))}
            </div>
            {chosen.length > 0 && !done && (
              <button type="button" className="btn primary" disabled={pending} onClick={add} style={{ marginTop: 12 }}>
                {pending ? "Adding…" : `Add ${chosen.length} to my collection`}
              </button>
            )}
            {done && (
              <div className="notice good" style={{ marginTop: 12 }}>
                Added {done.added} card{done.added === 1 ? "" : "s"}.{done.failed.length ? ` Couldn't add: ${done.failed.join(", ")}.` : ""}{" "}
                <Link href="/app/collection">Open your collection</Link>
              </div>
            )}
            <p className="hint" style={{ marginBottom: 0 }}>Raw cards are priced as Near Mint; change condition later from Edit. Always double-check the set and number.</p>
          </div>
        </div>
      )}
    </>
  );
}

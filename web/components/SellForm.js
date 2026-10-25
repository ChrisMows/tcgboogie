"use client";

import { useState, useTransition } from "react";
import { listOnEbay } from "@/app/app/collection/sell/actions";

// Shrink photos in the browser (longest side 1600px, JPEG) so uploads are quick and stay under eBay's limits.
async function shrink(file) {
  if (!file.type.startsWith("image/")) return file;
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

export default function SellForm({ itemId, initial, policies, needsZip, suggested, soldHref, quota = null }) {
  const [title, setTitle] = useState(initial.title);
  const [format, setFormat] = useState("FIXED_PRICE");
  const [photos, setPhotos] = useState([]); // { file, url }
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();

  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 6 - photos.length);
    const shrunk = await Promise.all(files.map(shrink));
    setPhotos((p) => [...p, ...shrunk.map((f) => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, 6));
    e.target.value = "";
  };
  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("photoPicker");
    for (const p of photos) fd.append("photos", p.file);
    setResult(null);
    start(async () => setResult(await listOnEbay(itemId, fd)));
  };

  if (result?.ok) {
    return (
      <div className="panel sell-done">
        <h2>🎉 Listed on eBay</h2>
        <p className="muted">Your listing is live. eBay may take a minute to show it in search.</p>
        <a className="btn primary" href={result.url} target="_blank" rel="noopener noreferrer">View your listing on eBay ↗</a>
      </div>
    );
  }

  const one = (list) => (list?.length === 1 ? list[0].id : "");
  return (
    <form className="panel sell-form" onSubmit={submit}>
      <div className="sell-step">
        <h2 data-tour="sell-photos">1. Photos <span className="small muted">(required, up to 6: front, back, close-ups)</span></h2>
        <div className="sell-photos">
          {photos.map((p, i) => (
            <div key={p.url} className="sell-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${i + 1}`} />
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}>✕</button>
              {i === 0 && <span className="sell-main">Main</span>}
            </div>
          ))}
          {photos.length < 6 && (
            <label className="sell-add">
              <input type="file" name="photoPicker" accept="image/*" multiple onChange={addPhotos} hidden />
              <span>＋ Add photos</span>
            </label>
          )}
        </div>
        <p className="hint">Photos of the actual card (eBay doesn&apos;t allow stock images). For slabs, include the label and cert number.</p>
      </div>

      <div className="sell-step">
        <h2>2. Listing</h2>
        <label className="field" htmlFor="title">Title <span className="small muted">({title.length}/80)</span></label>
        <input id="title" name="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} required />
        <div className="sell-facts small muted">{initial.facts}</div>
        <label className="field" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={5} defaultValue={initial.description} />
      </div>

      <div className="sell-step">
        <h2 data-tour="sell-price">3. Price</h2>
        <div className="seg">
          <label className={format === "FIXED_PRICE" ? "on" : ""}><input type="radio" name="format" value="FIXED_PRICE" checked={format === "FIXED_PRICE"} onChange={() => setFormat("FIXED_PRICE")} hidden />Buy It Now</label>
          <label className={format === "AUCTION" ? "on" : ""}><input type="radio" name="format" value="AUCTION" checked={format === "AUCTION"} onChange={() => setFormat("AUCTION")} hidden />Auction</label>
        </div>
        <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 160px" }}>{format === "AUCTION" ? "Starting bid ($)" : "Price ($)"}
            <input name="price" type="number" step="0.01" min="0.99" defaultValue={initial.price ?? ""} required />
          </label>
          {format === "AUCTION" && (
            <label className="field" style={{ flex: "1 1 160px" }}>Runs for
              <select name="duration" defaultValue="7">{[1, 3, 5, 7, 10].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select>
            </label>
          )}
        </div>
        <p className="hint">
          {suggested ? <>Sells for about <b>${suggested.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b> right now. </> : null}
          <a href={soldHref} target="_blank" rel="noopener noreferrer sponsored">Check recent eBay sales ↗</a>
        </p>
      </div>

      <div className="sell-step">
        <h2 data-tour="sell-shipping">4. Shipping, payment and returns</h2>
        {needsZip && (
          <label className="field">Ships from ZIP code
            <input name="postalCode" inputMode="numeric" pattern="\d{5}" maxLength={5} required placeholder="43215" style={{ maxWidth: 160 }} />
          </label>
        )}
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {[["fulfillment", "Shipping"], ["payment", "Payment"], ["return", "Returns"]].map(([k, label]) => (
            <label key={k} className="field" style={{ flex: "1 1 180px" }}>{label}
              <select name={k} defaultValue={one(policies[k])} required>
                {policies[k]?.length !== 1 && <option value="">Choose…</option>}
                {(policies[k] || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="hint">These are your eBay business policies. Change them anytime on eBay.</p>
      </div>

      {result?.error && (
        <div className="notice bad">{result.error}{result.reconnect && <> <a href="/api/ebay/connect">Connect eBay again</a></>}</div>
      )}
      <button className="btn primary sell-go" data-tour="sell-go" disabled={pending || !photos.length}>
        {pending ? "Posting to eBay…" : photos.length ? `List on eBay${format === "AUCTION" ? " (auction)" : ""}` : "Add a photo to list"}
      </button>
      <p className="hint" style={{ textAlign: "center" }}>Posts to your eBay account right away. eBay&apos;s normal selling fees apply.</p>
      {quota?.limit != null && (
        <p className="hint" style={{ textAlign: "center" }}>
          {typeof result?.left === "number" ? result.left : quota.left} of {quota.limit} listings left this month · <a href="/app/premium?from=sell">Unlimited with Premium</a>
        </p>
      )}
    </form>
  );
}

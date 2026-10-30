"use client";

import Link from "next/link";
import { PHOTO_TIP, runningLow } from "@/lib/quota-tips";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import CardThumb from "@/components/CardThumb";
import CardRequest from "@/components/CardRequest";
import PackLoader from "@/components/PackLoader";
import { shrinkImage as shrink } from "@/lib/shrink-image";
import { addAppraised, appraise } from "@/app/app/collection/photo/actions";

/** The version in a product name, "Jolteon (Master Ball Pattern)" -> "Master Ball Pattern"; the plain card is "Regular". */
const versionOf = (name) => /\(([^)]+)\)\s*$/.exec(String(name || ""))?.[1] || "Regular";

const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Snap or upload a photo of cards: we read each one, price it, and let you add them to your collection. */
export default function PhotoAppraiser({ allowed, quota = null }) {
  const [left, setLeft] = useState(quota?.limit == null ? null : quota.left);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState({});
  const [version, setVersion] = useState({}); // card index -> which of its options the member picked
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [choice, setChoice] = useState(null); // null: ask; "pick": choose which ones below; "later": not now
  const [pending, start] = useTransition();
  const router = useRouter();
  const listRef = useRef(null);

  const onFile = (file) => {
    if (!file) return;
    setError(null); setResult(null); setDone(null); setChoice(null);
    setPreview(URL.createObjectURL(file));
    start(async () => {
      const fd = new FormData();
      fd.append("photo", await shrink(file));
      const r = await appraise(fd);
      if (typeof r.left === "number") setLeft(r.left);
      if (!r.ok) { setError(r.error); return; }
      setResult(r);
      setVersion({});
      setPicked(Object.fromEntries(r.cards.map((c, i) => [i, Boolean(c.product)])));
    });
  };

  // The version picked for card i (the best match unless the member chose another).
  const productOf = (c, i) => (version[i] != null && c.options?.[version[i]]) || c.product;
  const chooser = (c) => (c.options?.length || 0) > 1 || (!c.product && (c.options?.length || 0) > 0);
  // Add the ticked cards (or every card we matched), then go to the collection to see them.
  const add = (all = false) => start(async () => {
    const picks = result.cards.map((c, i) => [c, i]).filter(([c, i]) => productOf(c, i) && (all || picked[i]))
      .map(([c, i]) => ({ productId: productOf(c, i).id, name: productOf(c, i).name, graded: c.graded, grader: c.grader, grade: c.grade }));
    const r = await addAppraised(picks);
    setDone(r);
    if (r.added > 0 && !r.failed.length) router.push(`/app/collection?appraised=${r.added}`);
  });

  if (!allowed) {
    return (
      <div className="panel">
        <p style={{ marginTop: 0 }}>Take a photo of a binder page, a stack of cards spread out, or a few slabs. We read every card, look up what it&apos;s worth, and add them to your collection in one tap.</p>
        <Link href="/app/premium?from=photo" className="btn primary">See Premium</Link>
      </div>
    );
  }

  if (left === 0 && !result) {
    return (
      <div className="panel">
        <p style={{ marginTop: 0 }}>You&apos;ve used all {quota.limit} photo appraiser photos for this month. They reset on the 1st.</p>
        {quota.canUpgrade && <Link href="/app/premium?from=photo" className="btn primary">More with Premium</Link>}
      </div>
    );
  }

  const chosen = result ? result.cards.filter((c, i) => picked[i] && productOf(c, i)) : [];
  const matched = result ? result.cards.filter((c, i) => productOf(c, i)) : [];
  const matchedValue = result ? result.cards.reduce((t, c, i) => t + (Number(productOf(c, i)?.value) || 0), 0) : 0;
  const unsure = result ? result.cards.filter((c, i) => chooser(c) && version[i] == null).length : 0; // not yet chosen by the member
  return (
    <>
      {!result && !preview && (
        // How it works, until a photo is picked: snap your cards, see their value, build your collection.
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="photo-steps" src="/assets/photo-appraiser-steps.webp" width={1200} height={480}
          alt="How it works: snap your cards, see their value, build your collection" />
      )}
      <div className="panel photo-drop">
        <label className="btn primary" style={{ cursor: "pointer" }}>
          📷 {result || preview ? "Try another photo" : "Take or choose a photo"}
          <input type="file" accept="image/*" hidden disabled={pending} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="small muted">Works best with cards flat, in good light, numbers visible. Up to 20 cards per photo.{left !== null && ` ${left} of ${quota.limit} photos left this month.`}</span>
      </div>
      {runningLow({ limit: quota?.limit, left }) && (
        <div className="notice warn">Only {left} photo{left === 1 ? "" : "s"} left this month. {PHOTO_TIP}</div>
      )}

      {error && <div className="notice warn">{error}</div>}
      {pending && !result && <div className="panel photo-loading"><PackLoader label="Reading your cards… this takes a few seconds." /></div>}

      {/* The question first: add what we found? */}
      {result && matched.length > 0 && !done && choice === null && (
        <div className="panel photo-ask">
          <div>
            <b>We found {matched.length} card{matched.length === 1 ? "" : "s"}{matchedValue ? ` worth about ${money(matchedValue)}` : ""}.</b>
            <span className="muted"> Add {matched.length === 1 ? "it" : "them"} to your collection?</span>
            {unsure > 0 && <div className="small photo-ask-note">{unsure === 1 ? "1 card" : `${unsure} cards`} could be more than one version. We picked the closest match; check {unsure === 1 ? "it" : "them"} below.</div>}
          </div>
          <div className="photo-ask-actions">
            <button type="button" className="btn primary" disabled={pending} onClick={() => add(true)}>
              {pending ? "Adding…" : matched.length === 1 ? "Add it" : `Add all ${matched.length}`}
            </button>
            {(matched.length > 1 || unsure > 0) && (
              <button type="button" className="btn" disabled={pending} onClick={() => { setChoice("pick"); setTimeout(() => listRef.current?.scrollIntoView({ block: "start", behavior: "instant" }), 50); }}>
                {unsure > 0 ? "Check versions first" : "Pick which ones"}
              </button>
            )}
            <button type="button" className="btn ghost" disabled={pending} onClick={() => setChoice("later")}>Not now</button>
          </div>
        </div>
      )}

      {result && (
        <div className="photo-result" ref={listRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="Your photo" className="photo-preview" />}
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{result.cards.length} card{result.cards.length === 1 ? "" : "s"} · about {money(result.total)}</h2>
            </div>
            {result.cards.length === 0 && <p className="muted">We couldn&apos;t make out any cards. Try a closer, brighter photo.</p>}
            <div className="photo-list">
              {result.cards.map((c, i) => {
                const p = productOf(c, i) || null;
                const sel = version[i] ?? (c.product ? 0 : -1);
                return (
                  <div key={i} className="photo-item">
                    <label className={`photo-row ${p ? "" : "dim"}`}>
                      <input type="checkbox" checked={Boolean(picked[i])} disabled={!p} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} />
                      <CardThumb item={p || { name: c.read.name, number: c.read.number }} width={44} />
                      <span className="photo-name">
                        <b>{p ? p.name : c.read.name || "Unreadable card"}</b>
                        <span className="small muted">
                          {p ? `${p.setName} · ${p.number}` : `Read as ${c.read.number || "no number"} · no match found`}
                          {c.graded ? ` · ${c.grader} ${c.grade}` : " · raw, priced as Near Mint"}
                          {p?.language === "japanese" ? " · Japanese" : ""}
                        </span>
                        {c.read.confidence === "low" && <span className="badge warn">Hard to read: check it</span>}
                        {chooser(c) && <span className="badge accent">{c.product ? `${c.options.length} possible versions: check below` : "Which one is it? Pick below"}</span>}
                      </span>
                      <b className="photo-value">{p?.value ? money(p.value) : "—"}</b>
                      {p && <Link href={`/app/cards/${encodeURIComponent(p.id)}${p.language === "japanese" ? "?lang=japanese" : ""}`} className="small" onClick={(e) => e.stopPropagation()}>View</Link>}
                    </label>
                    {/* More than one version fits: show them all and let the member pick the right one. */}
                    {chooser(c) && (
                      <div className="photo-versions" role="radiogroup" aria-label={`Which ${c.read.name}?`}>
                        {c.options.map((o, k) => (
                          <button key={o.id} type="button" role="radio" aria-checked={sel === k}
                            className={`photo-version ${sel === k ? "on" : ""}`}
                            onClick={() => { setVersion({ ...version, [i]: k }); setPicked({ ...picked, [i]: true }); }}>
                            <CardThumb item={o} width={56} />
                            <span className="photo-version-name">{versionOf(o.name)}</span>
                            <span className="small"><b>{o.setName}</b><br />{o.number}{o.language === "japanese" ? " · JP" : ""}</span>
                            <span className="small photo-version-price">{o.value ? money(o.value) : "No price"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Cards we read but couldn't find: request them right here (a link to the card adds it). */}
            {result.cards.filter((c) => !c.product && c.read.name).slice(0, 3).map((c, i) => (
              <CardRequest key={i} query={`${c.read.name}${c.read.number ? ` ${c.read.number}` : ""}${c.read.language === "japanese" ? " Japanese" : ""}`}
                label={`Can’t find ${c.read.name}${c.read.number ? ` ${c.read.number}` : ""}? Request it →`} />
            ))}
            {chosen.length > 0 && !done && choice !== null && (
              <button type="button" className="btn primary" disabled={pending} onClick={() => add(false)} style={{ marginTop: 12 }}>
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

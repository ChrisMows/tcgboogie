"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import CardBackArt from "@/components/CardBackArt";
import { REVEAL_EVENT } from "@/lib/reveal";

const OFF_KEY = "tcgb-reveal-off";
const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Every card added to a collection gets a pack opening: the TCG Boogie pack shakes and bursts, the card rises out
 * face down (its real back: English, Japanese or the original Japanese back), shimmering with slow pulsing light,
 * then spins around to show the card. Tap anywhere to close. Members can turn it off from the overlay; devices set to
 * reduced motion skip it.
 */
export default function PackReveal() {
  const [card, setCard] = useState(null);
  const [run, setRun] = useState(0); // restarts the animation when a new card comes in mid-reveal
  const closeRef = useRef(null);
  const timer = useRef(null);

  const close = useCallback(() => { setCard(null); clearTimeout(timer.current); }, []);

  useEffect(() => {
    const onReveal = (e) => {
      try { if (localStorage.getItem(OFF_KEY) === "1") return; } catch { /* storage blocked: show it */ }
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const r = e.detail;
      if (!r?.name) return;
      if (r.image) { const img = new Image(); img.src = r.image; } // start loading the front now
      setCard(r);
      setRun((n) => n + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCard(null), 9000);
    };
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => { window.removeEventListener(REVEAL_EVENT, onReveal); clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!card) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 50);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [card, close]);

  if (!card) return null;
  const turnOff = (e) => {
    e.stopPropagation();
    try { localStorage.setItem(OFF_KEY, "1"); } catch { /* ignore */ }
    close();
  };

  return (
    <div className="reveal" key={run} role="dialog" aria-modal="true" aria-label={`Added ${card.name} to your collection`} onClick={close}>
      <div className="reveal-rays" aria-hidden="true" />
      <div className="reveal-stage" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="reveal-pack" src="/brand/pack.webp" alt="" />
        <div className="reveal-burst" />
        <div className="reveal-lift">
          <div className="reveal-card">
            <div className="reveal-face reveal-back"><CardBackArt back={card.back} /><span className="reveal-holo" /></div>
            <div className="reveal-face reveal-front">
              {card.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={card.image} alt="" draggable={false} />
                : <div className="reveal-noimg">{card.name}</div>}
              <span className="reveal-holo" />
            </div>
          </div>
        </div>
        {[1, 2, 3, 4, 5, 6].map((i) => <span key={i} className={`reveal-spark k${i}`} />)}
      </div>
      <div className="reveal-caption" onClick={(e) => e.stopPropagation()}>
        <div className="small reveal-kicker">Added to your collection</div>
        <div className="reveal-name">{card.name}</div>
        <div className="small muted">{[card.setName, card.number ? `#${card.number}` : null].filter(Boolean).join(" · ")}</div>
        {card.value ? <div className="reveal-value">Worth {money(card.value)}{card.quantity > 1 ? ` each · ×${card.quantity}` : ""}</div> : null}
        <div className="reveal-actions">
          <button ref={closeRef} type="button" className="btn primary" onClick={close}>Nice!</button>
          {card.productId && <Link href={`/app/cards/${card.productId}`} className="btn" onClick={close}>Open card</Link>}
        </div>
        <button type="button" className="link-btn small reveal-off" onClick={turnOff}>Don&apos;t show pack openings</button>
      </div>
    </div>
  );
}

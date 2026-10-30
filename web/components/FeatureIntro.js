"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { hideIntroAction } from "@/app/app/collection/actions";

// "What's new" pop-up on the collection page: a short, looping demo of the bell (price alerts) and lightning (deal
// alerts) on a card page, drawn with the member's own card. "Got it" closes it for this visit; "Don't show again"
// hides it for good (saved on the account, lib/store.js hideIntro).
const ID = "introAlerts1";
const STEP_MS = 1100;

const SLIDES = [
  {
    key: "bell", title: "Price alerts in one tap",
    text: "Open any card and tap the bell next to its name. Pick a price, or hear about it each time it hits a new high or low.",
    steps: 7, // card · tap bell · sheet · tap "new high" · tap Set alert · toast · hold
  },
  {
    key: "bolt", title: "Deal alerts with the lightning",
    text: "Tap the lightning, pick raw or graded and how good a deal, and we'll tell you when an eBay auction for that card is ending under market.",
    steps: 6, // card · tap lightning · filter · tap Save · notification · hold
  },
];

const money = (v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FeatureIntro({ card }) {
  const ref = useRef(null);
  const [slide, setSlide] = useState(0);
  const [tick, setTick] = useState(0); // steps played on this slide
  const [manual, setManual] = useState(false); // a slide picked by hand stays put

  useEffect(() => {
    try { if (sessionStorage.getItem(`tcgb-${ID}`)) return; } catch { /* storage blocked: show it */ }
    const t = setTimeout(() => ref.current?.showModal(), 900);
    return () => clearTimeout(t);
  }, []);

  // Play the demo on a loop; after one full play, move on to the next slide.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), STEP_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!manual && tick >= SLIDES[slide].steps && slide < SLIDES.length - 1) { setSlide(slide + 1); setTick(0); }
  }, [tick, slide, manual]);
  const step = tick % SLIDES[slide].steps;

  const go = (i) => { setSlide(i); setTick(0); setManual(true); };
  const close = () => { try { sessionStorage.setItem(`tcgb-${ID}`, "1"); } catch { /* fine */ } ref.current?.close(); };
  const never = () => { close(); hideIntroAction(ID).catch(() => {}); };

  const s = SLIDES[slide];
  const bell = s.key === "bell";
  // Where the finger is, and what's on the little phone, for this step.
  const finger = bell
    ? [null, "at-bell", null, "at-high", "at-save", null, null][step]
    : [null, "at-bolt", null, "at-save", null, null][step];
  const tapped = (bell && (step === 1 || step === 3 || step === 4)) || (!bell && (step === 1 || step === 3));
  const sheet = bell ? step >= 2 && step <= 4 : step >= 2 && step <= 3;
  const highOn = bell && step >= 3;
  const saved = bell ? step >= 5 : step >= 4;

  return (
    <dialog ref={ref} className="cmp-dialog intro-dialog" aria-labelledby="intro-title"
      onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="cmp-inner">
        <div className="cmp-top">
          <div>
            <span className="intro-badge">New</span>
            <h2 id="intro-title">{s.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{s.text}</p>
          </div>
          <button type="button" className="cmp-close" onClick={close} aria-label="Close">✕</button>
        </div>

        <div className="intro-stage" aria-hidden="true">
          <div className="intro-phone">
            <div className="ip-card">
              <div className="ip-thumb">{card.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={card.image} alt="" /> : null}</div>
              <div className="ip-info">
                <b>{card.name}</b>
                <span>{card.set}</span>
                <strong>{money(card.price)}</strong>
              </div>
              <span className={`ip-icon bell ${bell && saved ? "on" : ""}`}>🔔</span>
              <span className={`ip-icon bolt ${!bell && saved ? "on" : ""}`}>⚡</span>
            </div>
            <svg className="ip-chart" viewBox="0 0 220 60" preserveAspectRatio="none">
              <path d="M0,48 L30,46 L55,38 L80,40 L110,28 L140,30 L170,18 L200,20 L220,10" />
            </svg>

            <div className={`ip-sheet ${sheet ? "open" : ""}`}>
              {bell ? (
                <>
                  <b>Price alert</b>
                  <div className={`ip-opt ${highOn ? "" : "on"}`}>🎯 Reaches a price I pick</div>
                  <div className={`ip-opt ${highOn ? "on" : ""}`}>🚀 Hits a new high</div>
                  <div className="ip-opt">📉 Hits a new low</div>
                  <div className={`ip-btn ${finger === "at-save" ? "pressed" : ""}`}>Set alert</div>
                </>
              ) : (
                <>
                  <b>Deal alert</b>
                  <div className="ip-q"><span>Copies</span><div className="ip-chips"><i>Raw</i><i>Graded</i><i className="on">Both</i></div></div>
                  <div className="ip-q"><span>Under market by</span><div className="ip-chips"><i>20%</i><i className="on">30%</i><i>40%</i></div></div>
                  <div className="ip-q"><span>Auction ends within</span><div className="ip-chips"><i>5 min</i><i className="on">10 min</i><i>20 min</i></div></div>
                  <div className={`ip-btn ${finger === "at-save" ? "pressed" : ""}`}>Create deal alert</div>
                </>
              )}
            </div>

            <div className={`ip-toast ${saved ? "show" : ""}`}>
              {bell ? <>🔔 Alert set. We&apos;ll tell you each time it hits a new high.</>
                : <>⚡ <b>{card.name}</b> auction ending in 6 min · {money(card.price * 0.68)}, 32% under market</>}
            </div>
            {finger && <span className={`ip-finger ${finger} ${tapped ? "tap" : ""}`}>👆</span>}
          </div>
        </div>

        <div className="intro-dots" role="group" aria-label="Choose a demo">
          {SLIDES.map((x, i) => (
            <button key={x.key} type="button" className={i === slide ? "on" : ""} onClick={() => go(i)}>
              {x.key === "bell" ? "🔔 Price alerts" : "⚡ Deal alerts"}
            </button>
          ))}
        </div>

        <div className="intro-foot">
          <button type="button" className="link-btn small" onClick={never}>Don&apos;t show again</button>
          <span style={{ display: "flex", gap: 10 }}>
            {card.id && <Link href={`/app/cards/${card.id}`} className="btn" onClick={close}>Try it on {card.short}</Link>}
            <button type="button" className="btn primary" onClick={close}>Got it</button>
          </span>
        </div>
      </div>
    </dialog>
  );
}

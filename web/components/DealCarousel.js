"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

/**
 * Homepage "Deals we caught": the deal cards in a row that scrolls a page at a time (3 cards on desktop, 1 on phones,
 * set in home.css), with ‹ › arrows and "1–3 of 15". At the end, › starts again from the first cards. Swiping and
 * trackpads scroll it too; each stop snaps to a card.
 */
export default function DealCarousel({ children }) {
  const track = useRef(null);
  const total = Children.count(children);
  const [view, setView] = useState({ first: 1, last: Math.min(3, total), atStart: true, atEnd: total <= 3 });

  const measure = useCallback(() => {
    const el = track.current;
    const card = el?.firstElementChild;
    if (!el || !card) return;
    const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || "0");
    const perView = Math.max(1, Math.round((el.clientWidth + 1) / step));
    const first = Math.min(total, Math.round(el.scrollLeft / step) + 1);
    setView({ first, last: Math.min(total, first + perView - 1), atStart: el.scrollLeft <= 2,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, [total]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Jump to a specific card (the first of the next or previous group), so quick clicks never drift between cards.
  const page = (dir) => {
    const el = track.current;
    if (!el?.children.length) return;
    const perView = Math.max(1, view.last - view.first + 1);
    const at = view.first - 1;
    // Forward: the next group of cards (the last group ends flush), and from the last group back to the first.
    // Back: the previous group boundary (1-3, 4-6...).
    const to = dir > 0 ? (view.atEnd ? 0 : Math.min(at + perView, Math.max(0, total - perView)))
      : Math.max(0, (Math.ceil(at / perView) - 1) * perView);
    el.scrollTo({ left: el.children[to].offsetLeft - el.children[0].offsetLeft, behavior: "smooth" });
    setView((v) => ({ ...v, first: to + 1, last: Math.min(total, to + perView), atStart: to === 0, atEnd: to + perView >= total }));
  };

  return (
    <div className="deal-carousel">
      <div className="deal-carousel-bar">
        <span className="deal-carousel-count" aria-live="polite">{view.first === view.last ? view.first : `${view.first}–${view.last}`} of {total}</span>
        <button type="button" className="deal-arrow" onClick={() => page(-1)} disabled={view.atStart} aria-label="Previous deals">‹</button>
        <button type="button" className="deal-arrow" onClick={() => page(1)} disabled={view.atStart && view.atEnd}
          aria-label={view.atEnd ? "Back to the first deals" : "More deals"} title={view.atEnd ? "Back to the start" : undefined}>›</button>
      </div>
      <div className="deal-track" ref={track} onScroll={measure}>{children}</div>
    </div>
  );
}

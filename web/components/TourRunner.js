"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOURS } from "@/lib/tours";

const STORE = "tcgb-tour"; // { id, i }: the walkthrough in progress, so it carries on across pages
const FIND_MS = 3500; // how long to look for a step's target before skipping it
const GAP = 12;

const read = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { return null; } };
const write = (v) => { try { v ? sessionStorage.setItem(STORE, JSON.stringify(v)) : sessionStorage.removeItem(STORE); } catch { /* storage blocked */ } };
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const find = (sel) => { if (!sel) return null; try { return [...document.querySelectorAll(sel)].find(visible) || null; } catch { return null; } };

/**
 * "Show me how" walkthroughs (lib/tours.js): dims the page, rings the button to tap and points at it with a short
 * note, step by step, across pages. Mounted once in the root layout.
 */
export default function TourRunner({ signedIn }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams()?.toString() || "";
  const [run, setRun] = useState(null); // { id, i }
  const [el, setEl] = useState(null); // the current step's target, once found
  const [looking, setLooking] = useState(false);
  const [refind, setRefind] = useState(0); // bumped when the target is re-drawn, to look for it again
  const [box, setBox] = useState(null); // target rect
  const popRef = useRef(null);
  const [pop, setPop] = useState(null); // { top, left, side, arrowX }

  const tour = run ? TOURS[run.id] : null;
  const step = tour?.steps[run.i];

  const go = useCallback((next) => { write(next); setRun(next); setEl(null); setBox(null); }, []);
  const stop = useCallback(() => go(null), [go]);
  const advance = useCallback((by = 1) => {
    setRun((r) => {
      if (!r) return r;
      const i = r.i + by;
      const next = i < 0 ? { ...r, i: 0 } : i >= TOURS[r.id].steps.length ? { ...r, i: TOURS[r.id].steps.length, done: true } : { ...r, i };
      write(next.done ? null : next);
      return next;
    });
    setEl(null); setBox(null);
  }, []);

  // Start: from Boogie Bot or any "Show me how" link. Carry on after a page change.
  useEffect(() => {
    const start = (e) => { if (TOURS[e.detail]) { window.dispatchEvent(new Event("tcgb-helper-close")); go({ id: e.detail, i: 0 }); } };
    window.addEventListener("tcgb-tour", start);
    const saved = read();
    if (saved && TOURS[saved.id]) setRun(saved);
    return () => window.removeEventListener("tcgb-tour", start);
  }, [go]);

  // Each step: open its page if needed, then look for the target (tapping `open` first if it's missing).
  useEffect(() => {
    if (!step || run.done) return;
    if (step.path && step.path.startsWith("/app") && !signedIn) return; // the sign-up note below
    const here = path || "/";
    const onPage = step.path && `${here}${search ? `?${search}` : ""}` === step.path;
    if (step.path && !onPage && !(step.at && new RegExp(step.at).test(here))) { router.push(step.path); return; }
    if (!step.path && step.at && !new RegExp(step.at).test(here)) return; // waiting for them to get there
    if (!step.target) { setEl(null); setLooking(false); return; }
    let cancelled = false, opened = false;
    setLooking(true);
    const t0 = Date.now();
    const tick = () => {
      if (cancelled) return;
      const found = find(step.target);
      if (found) { found.scrollIntoView({ block: "center", behavior: "smooth" }); setEl(found); setLooking(false); return; }
      if (step.open && !opened) { const o = find(step.open); if (o) { opened = true; o.click(); } }
      if (Date.now() - t0 > FIND_MS) {
        setLooking(false);
        if (!step.wait) { advance(1); return; } // not on this page or plan: skip it
      }
      setTimeout(tick, Date.now() - t0 > FIND_MS ? 400 : 150);
    };
    tick();
    return () => { cancelled = true; };
  }, [step, run, path, search, router, signedIn, advance, refind]);

  // A step that ends when they reach another page (at), tap the target (tap) or something appears (until).
  useEffect(() => {
    if (!step || run?.done) return;
    const nextStep = tour.steps[run.i + 1];
    if (step.at && step.path && new RegExp(step.at).test(path || "")) { advance(1); return; }
    if (nextStep?.at && !nextStep.path && new RegExp(nextStep.at).test(path || "") && !(step.at && new RegExp(step.at).test(path || ""))) { advance(1); return; }
    const cleanups = [];
    if (step.tap && el) {
      const onTap = () => setTimeout(() => advance(1), 250);
      el.addEventListener("click", onTap, { once: true });
      cleanups.push(() => el.removeEventListener("click", onTap));
    }
    if (step.until) {
      const iv = setInterval(() => { if (find(step.until)) { clearInterval(iv); advance(1); } }, 300);
      cleanups.push(() => clearInterval(iv));
    }
    return () => cleanups.forEach((f) => f());
  }, [step, el, run, tour, path, advance]);

  // Follow the target as the page scrolls, resizes or shifts.
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      if (!el.isConnected) { setEl(null); setBox(null); setRefind((n) => n + 1); return; }
      const r = el.getBoundingClientRect();
      setBox((b) => (b && Math.abs(b.top - r.top) < 1 && Math.abs(b.left - r.left) < 1 && Math.abs(b.width - r.width) < 1 && Math.abs(b.height - r.height) < 1 ? b : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    measure();
    const iv = setInterval(measure, 250);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { clearInterval(iv); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [el]);

  // Put the note below the target if it fits, else above; keep it on screen.
  useLayoutEffect(() => {
    const p = popRef.current;
    if (!p || !box) { setPop(null); return; }
    const w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const below = box.top + box.height + GAP + h < vh - 8 || box.top - GAP - h < 8;
    const top = below ? Math.min(box.top + box.height + GAP, vh - h - 8) : box.top - GAP - h;
    const left = Math.max(8, Math.min(box.left + box.width / 2 - w / 2, vw - w - 8));
    const arrowX = Math.max(14, Math.min(box.left + box.width / 2 - left, w - 14));
    setPop((o) => (o && o.top === top && o.left === left && o.side === (below ? "below" : "above") && o.arrowX === arrowX ? o : { top, left, side: below ? "below" : "above", arrowX }));
  }, [box, step]);

  useEffect(() => {
    if (!run) return;
    const onKey = (e) => { if (e.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, stop]);

  if (!run || !tour) return null;
  const count = tour.steps.length;
  const controls = (
    <div className="tour-foot">
      <span className="small muted">{run.done ? `${count} of ${count}` : `${run.i + 1} of ${count}`}</span>
      <button type="button" className="link-btn small" onClick={stop}>{run.done ? "Close" : "End tour"}</button>
      {!run.done && run.i > 0 && <button type="button" className="btn sm ghost" onClick={() => advance(-1)}>Back</button>}
      {!run.done && <button type="button" className="btn sm primary" onClick={() => { if (step?.then) find(step.then)?.click(); advance(step?.end && el ? count - run.i : 1); }}>{run.i === count - 1 || (step?.end && el) ? "Finish" : "Next"}</button>}
    </div>
  );
  const head = <div className="tour-title"><span aria-hidden="true">🤖</span> Boogie Bot · {tour.title}</div>;

  // Middle-of-the-screen notes: the end, sign up first, waiting for a tap on another page, or a step without a target.
  let middle = null;
  if (run.done) middle = <p>You&apos;re all set! Ask Boogie Bot anytime if you get stuck.</p>;
  else if (step.path?.startsWith("/app") && !signedIn) middle = <p>This needs a free account. <Link href="/login?mode=signup" onClick={stop}>Sign up free</Link>, then ask Boogie Bot again.</p>;
  else if (!step.target) middle = <p>{step.text}</p>;
  else if (!el && step.at && !step.path && !new RegExp(step.at).test(path || "")) middle = <p>{step.text}</p>;
  else if (!el && step.wait && !looking) middle = <p>{step.wait}</p>;
  if (middle) {
    return (
      <div className="tour-center" role="dialog" aria-label={tour.title}>
        {head}{middle}{controls}
      </div>
    );
  }
  if (!el || !box) return looking ? <div className="tour-looking" aria-live="polite">Boogie Bot is finding that…</div> : null;

  const pad = 6;
  return (
    <>
      <div className="tour-ring" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} aria-hidden="true" />
      <div ref={popRef} className={`tour-pop ${pop?.side || "below"}`} role="dialog" aria-label={tour.title}
        style={{ top: pop?.top ?? -9999, left: pop?.left ?? -9999, "--arrow-x": `${pop?.arrowX ?? 20}px` }}>
        {head}
        <p>{step.text}</p>
        {controls}
      </div>
    </>
  );
}

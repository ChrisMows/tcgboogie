"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveSignature } from "@/app/app/profile/actions";
import CardThumb from "@/components/CardThumb";
import SignatureShowcase from "@/components/SignatureShowcase";
import { itemLabel, money } from "@/lib/collection";

const MAX = 3;

/**
 * Profile -> Signature cards: up to 3 copies from the member's collection, shown big. Choose opens a picker of the
 * collection (most valuable first, with search); Change swaps one; Remove frees its slot.
 * picks: the current signature cards. choices: every owned copy (lib/showcase.js showcaseItem).
 */
export default function SignatureCards({ picks, choices }) {
  const router = useRouter();
  const [picking, setPicking] = useState(null); // the slot being filled (index), or null
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  const ids = picks.map((p) => p.id);

  const save = (next) => start(async () => {
    setError(null);
    const r = await saveSignature(next);
    if (!r.ok) setError(r.message);
    setPicking(null);
    router.refresh();
  });
  const choose = (id) => {
    const next = [...ids];
    if (picking < next.length) next[picking] = id; else next.push(id);
    save(next);
  };

  return (
    <section className="panel sig">
      <div className="sig-head">
        <div>
          <h3>Signature cards</h3>
          <p className="small muted">Up to 3 cards that define your collection.</p>
        </div>
        {picks.length > 0 && picks.length < MAX && <button type="button" className="btn sm" onClick={() => setPicking(picks.length)} disabled={pending}>+ Add</button>}
      </div>
      {error && <div className="notice warn">{error}</div>}
      {picks.length > 0 ? (
        <SignatureShowcase items={picks} renderActions={(it, i) => (
          <span className="sig-actions">
            <button type="button" className="link-btn small" onClick={() => setPicking(i)} disabled={pending}>Change</button>
            <button type="button" className="link-btn small" onClick={() => save(ids.filter((x) => x !== it.id))} disabled={pending}>Remove</button>
          </span>
        )} />
      ) : choices.length ? (
        <button type="button" className="sig-empty" onClick={() => setPicking(0)}>
          <span aria-hidden="true">☆</span>
          <b>Choose your signature cards</b>
          <span className="small muted">Pick up to 3 cards to show off here and on your shared profile.</span>
        </button>
      ) : (
        <div className="sig-empty static">
          <span aria-hidden="true">☆</span>
          <b>Add cards to your collection first</b>
          <Link href="/app/collection" className="btn sm primary">Go to Collection</Link>
        </div>
      )}
      {picking !== null && <Picker choices={choices} taken={ids} onPick={choose} onClose={() => setPicking(null)} pending={pending} />}
    </section>
  );
}

function Picker({ choices, taken, onPick, onClose, pending }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter((c) => !taken.includes(c.id))
      .filter((c) => words.every((w) => `${c.name} ${c.setName || ""} ${c.number || ""} ${c.grader || ""} ${c.grade || ""}`.toLowerCase().includes(w)))
      .slice(0, 60);
  }, [q, choices, taken]);
  return (
    <div className="dq-backdrop" onClick={onClose}>
      <div className="panel sig-picker" role="dialog" aria-label="Choose a signature card" onClick={(e) => e.stopPropagation()}>
        <div className="sig-picker-head">
          <h3>Choose a signature card</h3>
          <button type="button" className="install-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input type="search" placeholder="Search your collection" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul>
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)} disabled={pending}>
                <CardThumb item={c} width={40} />
                <span className="sig-picker-name">
                  <b>{c.name}</b>
                  <span className="small muted">{[c.setName, itemLabel(c)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="small sensitive">{c.value != null ? money(c.value) : ""}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="small muted sig-picker-none">No cards match.</li>}
        </ul>
      </div>
    </div>
  );
}

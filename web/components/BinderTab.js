"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import { useToast } from "@/components/Toast";
import { addBinder, removeBinder, renameBinder } from "@/app/app/collection/actions";
import { money, unitValue } from "@/lib/collection";

/**
 * Collection → Binders tab: every binder as a tile (a peek at its most valuable cards, how many cards, what they're
 * worth), plus "Not in a binder". Tap a tile to see just those cards on the Collection tab. Add, rename and remove
 * binders right here; removing one keeps its cards.
 */
export default function BinderTab({ binders, items }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  const [newBinder, setNewBinder] = useState("");
  const [renaming, setRenaming] = useState(null);

  const act = (fn, msg) => start(async () => {
    const r = await fn();
    if (r?.ok === false && r.error) show(r.error, null, "bad"); else if (msg) show(msg);
    router.refresh();
  });

  const summary = (list) => ({
    cards: list.reduce((n, it) => n + it.quantity, 0),
    value: list.reduce((v, it) => v + (unitValue(it) ?? 0) * it.quantity, 0),
    top: [...list].sort((a, b) => (unitValue(b) ?? 0) - (unitValue(a) ?? 0)).slice(0, 4),
  });
  const loose = items.filter((it) => !it.binderId);
  const tiles = [
    ...binders.map((b) => ({ id: b.id, name: b.name, ...summary(items.filter((it) => it.binderId === b.id)) })),
    ...(loose.length ? [{ id: "none", name: "Not in a binder", loose: true, ...summary(loose) }] : []),
  ];

  return (
    <>
      <form className="binder-new" onSubmit={(e) => { e.preventDefault(); act(() => addBinder(newBinder), "Binder added."); setNewBinder(""); }}>
        <input type="text" value={newBinder} maxLength={40} onChange={(e) => setNewBinder(e.target.value)}
          placeholder="New binder, e.g. For trade" aria-label="New binder name" />
        <button className="btn primary sm" disabled={!newBinder.trim() || pending}>+ Add binder</button>
      </form>
      <p className="small muted" style={{ margin: "0 0 14px" }}>
        Group your cards however you like. Pick a binder when you add or edit a card. Removing a binder keeps its cards.
      </p>

      {tiles.length === 0 ? (
        <div className="panel empty-state">No binders yet. Add one above, then pick it when you add or edit a card.</div>
      ) : (
        <div className="binder-grid">
          {tiles.map((t) => (
            <div key={t.id} className={`binder-tile ${t.loose ? "loose" : ""}`}>
              <Link href={`/app/collection?binder=${t.id}`} className="binder-peek" aria-label={`Open ${t.name}`}>
                {t.top.length ? t.top.map((it) => <CardThumb key={it.id} item={it} width={58} />)
                  : <span className="small muted">No cards yet</span>}
              </Link>
              {renaming === t.id ? (
                <form className="binder-rename" onSubmit={(e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get("name");
                  setRenaming(null);
                  if (String(name).trim() && name !== t.name) act(() => renameBinder(t.id, name), "Binder renamed.");
                }}>
                  <input name="name" type="text" defaultValue={t.name} maxLength={40} autoFocus aria-label="Binder name" />
                  <button className="btn sm primary">Save</button>
                  <button type="button" className="btn sm ghost" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <Link href={`/app/collection?binder=${t.id}`} className="binder-name"><b>{t.name}</b></Link>
              )}
              <div className="small muted">{t.cards} {t.cards === 1 ? "card" : "cards"} · <span className="sensitive">{money(t.value)}</span></div>
              {!t.loose && renaming !== t.id && (
                <div className="binder-tools">
                  <button type="button" className="link-btn small" onClick={() => setRenaming(t.id)}>Rename</button>
                  <button type="button" className="link-btn small danger-link" disabled={pending}
                    onClick={() => window.confirm(`Remove the binder "${t.name}"? Its cards stay in your collection.`) && act(() => removeBinder(t.id), "Binder removed.")}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {toast}
    </>
  );
}

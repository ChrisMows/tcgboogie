"use client";

import { useState } from "react";
import { CONDITIONS, GRADERS, gradeKey, gradeOption, gradesFor, marketValue, money } from "@/lib/collection";

const Err = ({ msg }) => (msg ? <div className="err">{msg}</div> : null);

/** Details for one collection line: raw / graded / sealed, condition or grade, quantity, what you paid, binder. */
export default function ItemForm({ product, initial, binders = [], onSubmit, submitLabel = "Add to collection", pending, errors = {}, allowList = true }) {
  const isCard = product.type === "card";
  const printings = isCard ? Object.keys(product.prices || {}) : [];
  const [list, setList] = useState(initial?.list || "owned");
  const [kind, setKind] = useState(isCard ? initial?.kind || "raw" : "sealed");
  const [printing, setPrinting] = useState(initial?.printing || printings[0] || null);
  const [condition, setCondition] = useState(initial?.condition || "Near Mint");
  const [grader, setGrader] = useState(initial?.grader || "PSA");
  const [grade, setGrade] = useState(initial?.grade || "10");
  const [quantity, setQuantity] = useState(initial?.quantity || 1);
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice ?? "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ? String(initial.purchaseDate).slice(0, 10) : "");
  const [customValue, setCustomValue] = useState(initial?.customValue ?? "");
  const [certNumber, setCertNumber] = useState(initial?.certNumber || "");
  const [binderId, setBinderId] = useState(initial?.binderId || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [more, setMore] = useState(Boolean(initial?.customValue || initial?.notes || initial?.certNumber));

  const value = marketValue(product, { kind, printing, condition, grader, grade });
  const gradedKeys = Object.keys(product.graded || {});
  const owned = list === "owned";

  return (
    <form className="item-form" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ list, kind, printing, condition, grader, grade, quantity, purchasePrice, purchaseDate, customValue, certNumber, binderId, notes });
    }}>
      {allowList && (
        <div className="seg wide" role="group" aria-label="Add to">
          <button type="button" className={owned ? "on" : ""} onClick={() => setList("owned")}>I own this</button>
          <button type="button" className={!owned ? "on" : ""} onClick={() => setList("wishlist")}>♡ I want this</button>
        </div>
      )}

      {isCard && (
        <div className="seg wide" role="group" aria-label="Raw or graded">
          <button type="button" className={kind === "raw" ? "on" : ""} onClick={() => setKind("raw")}>Raw card</button>
          <button type="button" className={kind === "graded" ? "on" : ""} onClick={() => setKind("graded")}>Graded slab</button>
        </div>
      )}

      <div className="form-grid">
        {isCard && printings.length > 1 && (
          <div>
            <label className="field" htmlFor="if-printing">Printing</label>
            <select id="if-printing" value={printing || ""} onChange={(e) => setPrinting(e.target.value)}>
              {printings.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        )}
        {kind === "raw" && (
          <div>
            <label className="field" htmlFor="if-cond">Condition</label>
            <select id="if-cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {kind === "graded" && (
          <>
            <div>
              <label className="field" htmlFor="if-grader">Graded by</label>
              <select id="if-grader" value={grader} onChange={(e) => { setGrader(e.target.value); if (e.target.value !== "CGC" && grade === "10 Pristine") setGrade("10"); }}>
                {GRADERS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="field" htmlFor="if-grade">Grade</label>
              <select id="if-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
                {gradesFor(grader).map((g) => <option key={g} value={g}>{gradeOption(grader, g)}{product.detailsLoading || gradedKeys.includes(gradeKey(grader, g)) ? "" : " (no recent sales)"}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="field" htmlFor="if-qty">Quantity</label>
          <div className="stepper">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, Number(q) - 1))} aria-label="One fewer">−</button>
            <input id="if-qty" type="number" min="1" max="9999" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <button type="button" onClick={() => setQuantity((q) => Number(q) + 1)} aria-label="One more">+</button>
          </div>
          <Err msg={errors.quantity} />
        </div>
        {owned && (
          <div>
            <label className="field" htmlFor="if-paid">Paid per copy (optional)</label>
            <input id="if-paid" type="number" min="0" step="0.01" inputMode="decimal" placeholder="$" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            <Err msg={errors.purchasePrice} />
          </div>
        )}
        {owned && binders.length > 0 && (
          <div>
            <label className="field" htmlFor="if-binder">Binder</label>
            <select id="if-binder" data-tour="item-binder" value={binderId || ""} onChange={(e) => setBinderId(e.target.value)}>
              <option value="">No binder</option>
              {binders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <Err msg={errors.grade} />

      <div className="value-line">
        {value !== null ? <>Worth about <b>{money(value)}</b> each{Number(quantity) > 1 ? <> · <b>{money(value * quantity)}</b> for {quantity}</> : null}</>
          : <span className="muted">{kind === "graded" ? `No recent ${grader} ${grade} sales to value it from. You can set your own value below.` : "No current price for this one yet."}</span>}
      </div>

      {owned && (
        <button type="button" className="link-btn" onClick={() => setMore(!more)}>{more ? "− Fewer details" : "+ More details (date, cert number, your own value, notes)"}</button>
      )}
      {owned && more && (
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div>
            <label className="field" htmlFor="if-date">Date bought</label>
            <input id="if-date" type="date" value={purchaseDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPurchaseDate(e.target.value)} />
            <Err msg={errors.purchaseDate} />
          </div>
          {kind === "graded" && (
            <div>
              <label className="field" htmlFor="if-cert">Cert number</label>
              <input id="if-cert" type="text" value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
            </div>
          )}
          <div>
            <label className="field" htmlFor="if-own">Your own value per copy</label>
            <input id="if-own" type="number" min="0" step="0.01" placeholder="Use market value" value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
            <Err msg={errors.customValue} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="field" htmlFor="if-notes">Notes</label>
            <input id="if-notes" type="text" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. pulled from a booster box, centering 55/45" />
          </div>
        </div>
      )}
      <Err msg={errors._} />
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={pending}>{pending ? "Saving..." : owned ? submitLabel : "Add to wishlist"}</button>
      </div>
    </form>
  );
}

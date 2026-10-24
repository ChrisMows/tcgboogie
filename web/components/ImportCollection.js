"use client";

import Link from "next/link";
import { useState } from "react";
import CardThumb from "@/components/CardThumb";
import { guessColumns, importRows, matchRows } from "@/app/app/collection/import/actions";
import { FIELDS, readCollectionCsv, rowsFrom } from "@/lib/import-csv";

const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FIELD_NAMES = { name: "Name", set: "Set", number: "Number", quantity: "Quantity", condition: "Condition", grade: "Grade", grader: "Grader", paid: "Price paid", productId: "TCGplayer ID", printing: "Printing", language: "Language", list: "List" };

/** Which column holds each field: pre-filled from the column names or Claude's guess, and the member can change any. */
function ColumnPicker({ all, start, onUse, onCancel }) {
  const [cols, setCols] = useState(start.columns || {});
  const [hasHeader, setHasHeader] = useState(start.hasHeader !== false);
  const width = Math.max(...all.slice(0, 6).map((r) => r.length));
  const sample = (i) => (all[hasHeader ? 1 : 0]?.[i] ?? "").slice(0, 24);
  const label = (i) => `${hasHeader ? (all[0][i] || `Column ${i + 1}`) : `Column ${i + 1}`}${sample(i) ? ` (e.g. ${sample(i)})` : ""}`;
  const ready = cols.name !== undefined || cols.productId !== undefined;
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Which column is which?</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        {start.guessed ? "We didn't recognise this file's columns, so we made a guess. Check it and fix anything that's off." : "Check the columns we'll use and change any that are wrong."}{" "}
        A card name (or TCGplayer ID) is all we need; set and number make matches more exact.
      </p>
      <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> The first row is column names
      </label>
      <div className="import-columns">
        {Object.entries(FIELDS).map(([k, text]) => (
          <label key={k} className="small">
            <span>{text}{k === "name" ? " *" : ""}</span>
            <select value={cols[k] ?? -1} onChange={(e) => {
              const v = Number(e.target.value);
              const next = { ...cols };
              if (v < 0) delete next[k]; else next[k] = v;
              setCols(next);
            }}>
              <option value={-1}>Not in this file</option>
              {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{label(i)}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="btn primary" style={{ flex: "none" }} disabled={!ready} onClick={() => onUse(cols, hasHeader)}>Use these columns</button>
        {onCancel && <button type="button" className="btn ghost" style={{ flex: "none" }} onClick={onCancel}>Cancel</button>}
        {!ready && <span className="small muted">Pick the column with the card name.</span>}
      </div>
    </div>
  );
}

/** Upload a CSV from another app (or ours): match every row to a card, review, and import. */
export default function ImportCollection() {
  const [file, setFile] = useState(null); // { name, rows, columns, skipped, all, hasHeader }
  const [picking, setPicking] = useState(null); // column picker: { columns, hasHeader, guessed } or "guessing"
  const [results, setResults] = useState([]); // per row: { product, value } once matched
  const [picked, setPicked] = useState({});
  const [stage, setStage] = useState("pick"); // pick -> ready -> matching -> review -> importing -> done
  const [note, setNote] = useState(null);
  const [done, setDone] = useState(null);

  const onFile = async (f) => {
    if (!f) return;
    setNote(null); setResults([]); setDone(null); setPicking(null);
    const parsed = readCollectionCsv(await f.text());
    if (parsed.error) { setNote(parsed.error); setStage("pick"); return; }
    setFile({ name: f.name, ...parsed, hasHeader: true });
    if (!parsed.needsColumns) { setStage("ready"); return; }
    // Columns we don't know by name: guess them, then let the member check.
    setStage("columns");
    setPicking("guessing");
    const g = await guessColumns(f.name, parsed.all.slice(0, 6)).catch(() => ({ columns: {}, hasHeader: true }));
    // Claude's guess wins; columns we recognised by name fill the gaps (or everything, if there was no guess).
    setPicking({ ...g, columns: { ...parsed.columns, ...g.columns } });
  };

  const useColumns = (columns, hasHeader) => {
    const { rows, skipped } = rowsFrom(file.all, columns, hasHeader);
    setFile({ ...file, rows, skipped, columns, hasHeader });
    setPicking(null); setResults([]);
    if (!rows.length) { setNote("No rows had a card name in that column. Pick another column."); setPicking({ columns, hasHeader }); return; }
    setNote(null);
    setStage("ready");
  };

  const match = async () => {
    setStage("matching");
    const out = [];
    for (let i = 0; i < file.rows.length; i += 20) {
      const r = await matchRows(file.rows.slice(i, i + 20));
      out.push(...(r.results || []));
      setResults([...out]);
      if (!r.ok) { setNote(r.error); break; }
    }
    setPicked(Object.fromEntries(out.map((x, i) => [i, Boolean(x.product)])));
    setStage("review");
  };

  const run = async () => {
    setStage("importing");
    const chosen = results.map((x, i) => [x, i]).filter(([x, i]) => picked[i] && x.product).map(([x, i]) => ({ ...file.rows[i], productId: x.product.id }));
    let added = 0;
    const failed = [];
    for (let i = 0; i < chosen.length; i += 50) {
      const r = await importRows(chosen.slice(i, i + 50));
      if (!r.ok) { setNote(r.error); break; }
      added += r.added; failed.push(...r.failed);
    }
    setDone({ added, failed });
    setStage("done");
  };

  const found = results.filter((x) => x.product).length;
  const chosenCount = results.filter((x, i) => picked[i] && x.product).length;
  const total = results.reduce((s, x, i) => s + (picked[i] && x.value ? x.value * (file.rows[i].quantity || 1) : 0), 0);

  return (
    <>
      <div className="panel">
        <label className="btn primary" style={{ cursor: "pointer" }} data-tour="import-file">
          {file ? "Choose another file" : "Choose a CSV file"}
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" hidden disabled={stage === "matching" || stage === "importing"} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="hint" style={{ marginBottom: 0 }}>
          Export your collection as CSV from TCGplayer, Collectr, PriceCharting, another app or a spreadsheet. Any layout works: if we
          don&apos;t recognise the columns, we&apos;ll work them out and you can check them. A card name is all we need; set, number or a
          TCGplayer ID make matches more exact. Up to 1,000 rows.
        </p>
      </div>
      {note && <div className="notice warn">{note}</div>}

      {picking === "guessing" && <div className="notice">We don&apos;t recognise this file&apos;s columns yet. Working out which is which…</div>}
      {picking && picking !== "guessing" && file && (
        <ColumnPicker key={JSON.stringify(picking)} all={file.all} start={picking} onUse={useColumns}
          onCancel={stage === "ready" ? () => setPicking(null) : null} />
      )}

      {file && !picking && stage !== "pick" && stage !== "columns" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{file.name}: {file.rows.length} row{file.rows.length === 1 ? "" : "s"}{file.skipped ? ` (${file.skipped} skipped)` : ""}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Columns we&apos;ll use: {Object.keys(file.columns).filter((k) => FIELD_NAMES[k]).map((k) => FIELD_NAMES[k]).join(", ")}.{" "}
            {stage === "ready" && <button type="button" className="link-btn small" onClick={() => setPicking({ columns: file.columns, hasHeader: file.hasHeader })}>Change columns</button>}
          </p>
          {stage === "ready" && <button type="button" className="btn primary" data-tour="import-match" onClick={match}>Find these cards</button>}
          {stage === "matching" && <div className="notice">Finding cards… {results.length} of {file.rows.length}</div>}

          {results.length > 0 && stage !== "matching" && (
            <>
              <p style={{ margin: "8px 0" }}><b>{found}</b> of {results.length} matched{found < results.length ? "; the rest weren't found and won't be imported" : ""}. About <b>{money(total)}</b> selected.</p>
              <div className="photo-list import-list">
                {results.map((x, i) => {
                  const r = file.rows[i];
                  return (
                    <label key={i} className={`photo-row ${x.product ? "" : "dim"}`}>
                      <input type="checkbox" checked={Boolean(picked[i])} disabled={!x.product || stage !== "review"} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} />
                      <CardThumb item={x.product || { name: r.name, number: r.number }} width={36} />
                      <span className="photo-name">
                        <b>{x.product ? x.product.name : r.name}</b>
                        <span className="small muted">
                          {x.product ? `${x.product.setName}${x.product.number ? ` · ${x.product.number}` : ""}` : `${r.set || "no set"}${r.number ? ` · ${r.number}` : ""} · not found`}
                          {" · "}{r.graded ? `${r.grader} ${r.grade}` : r.condition || "Sealed"}{r.quantity > 1 ? ` · ×${r.quantity}` : ""}{r.list === "wishlist" ? " · wishlist" : ""}
                        </span>
                      </span>
                      <b className="photo-value">{x.value ? money(x.value) : "—"}</b>
                    </label>
                  );
                })}
              </div>
              {stage === "review" && chosenCount > 0 && (
                <button type="button" className="btn primary" data-tour="import-go" style={{ marginTop: 12 }} onClick={run}>Import {chosenCount} line{chosenCount === 1 ? "" : "s"}</button>
              )}
              {stage === "importing" && <div className="notice" style={{ marginTop: 12 }}>Importing…</div>}
              {done && (
                <div className="notice good" style={{ marginTop: 12 }}>
                  Imported {done.added} line{done.added === 1 ? "" : "s"}.{done.failed.length ? ` Couldn't import: ${done.failed.slice(0, 5).join(", ")}${done.failed.length > 5 ? "…" : ""}.` : ""}{" "}
                  <Link href="/app/collection">Open your collection</Link>
                </div>
              )}
              <p className="hint" style={{ marginBottom: 0 }}>Importing adds to your collection; it doesn&apos;t replace what&apos;s there. Check a few matches before importing.</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

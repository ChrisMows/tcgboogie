"use client";

import Link from "next/link";
import { useState } from "react";
import CardThumb from "@/components/CardThumb";
import { importRows, matchRows } from "@/app/app/collection/import/actions";
import { readCollectionCsv } from "@/lib/import-csv";

const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FIELD_NAMES = { name: "Name", set: "Set", number: "Number", quantity: "Quantity", condition: "Condition", grade: "Grade", grader: "Grader", paid: "Price paid", productId: "TCGplayer ID", printing: "Printing", language: "Language", list: "List" };

/** Upload a CSV from another app (or ours): match every row to a card, review, and import. */
export default function ImportCollection() {
  const [file, setFile] = useState(null); // { name, rows, columns, skipped }
  const [results, setResults] = useState([]); // per row: { product, value } once matched
  const [picked, setPicked] = useState({});
  const [stage, setStage] = useState("pick"); // pick -> ready -> matching -> review -> importing -> done
  const [note, setNote] = useState(null);
  const [done, setDone] = useState(null);

  const onFile = async (f) => {
    if (!f) return;
    setNote(null); setResults([]); setDone(null);
    const parsed = readCollectionCsv(await f.text());
    if (parsed.error) { setNote(parsed.error); setStage("pick"); return; }
    setFile({ name: f.name, ...parsed });
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
        <label className="btn primary" style={{ cursor: "pointer" }}>
          {file ? "Choose another file" : "Choose a CSV file"}
          <input type="file" accept=".csv,text/csv" hidden disabled={stage === "matching" || stage === "importing"} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="hint" style={{ marginBottom: 0 }}>
          Export your collection as CSV from TCGplayer, Collectr, PriceCharting or a spreadsheet. The first row should be column names
          (Name, Set, Number, Quantity, Condition…). A TCGplayer ID column gives the most exact matches. Up to 1,000 rows.
        </p>
      </div>
      {note && <div className="notice warn">{note}</div>}

      {file && stage !== "pick" && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{file.name}: {file.rows.length} row{file.rows.length === 1 ? "" : "s"}{file.skipped ? ` (${file.skipped} skipped)` : ""}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Columns we&apos;ll use: {Object.keys(file.columns).filter((k) => FIELD_NAMES[k]).map((k) => FIELD_NAMES[k]).join(", ")}.
          </p>
          {stage === "ready" && <button type="button" className="btn primary" onClick={match}>Find these cards</button>}
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
                <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={run}>Import {chosenCount} line{chosenCount === 1 ? "" : "s"}</button>
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

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { DEFAULT_GRADING_COST, MIN_PROFIT, gradingMath } from "@/lib/grading";

const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const FREE_ROWS = 3;

/** The grading check list: which raw Near Mint cards you own are worth sending to PSA, at a cost you can adjust. */
export default function GradingCheck({ candidates, full }) {
  const [cost, setCost] = useState(DEFAULT_GRADING_COST);
  const rows = useMemo(() => candidates.map((c) => ({ ...c, ...gradingMath(c, cost) }))
    .filter((c) => c.verdict !== "skip").sort((a, b) => b.profit10 - a.profit10), [candidates, cost]);
  const shown = full ? rows : rows.slice(0, FREE_ROWS);

  return (
    <>
      <div className="panel grading-head">
        <label className="field" htmlFor="gradeCost" style={{ margin: 0 }}>Grading cost per card (fee + shipping)</label>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span>$</span>
          <input id="gradeCost" type="number" min="0" max="500" step="1" value={cost} onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))} style={{ width: 90 }} />
          <span className="small muted">PSA&apos;s cheapest tier plus shipping is about $30. Faster tiers cost more.</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="panel"><p className="muted" style={{ margin: 0 }}>
          None of your raw Near Mint cards would clear {money(MIN_PROFIT)} profit as a PSA 10 at {money(cost)} a card. Cards need reliable PSA 10 sales data to be checked.
        </p></div>
      ) : (
        <div className="panel grading-list">
          {shown.map((c) => (
            <Link key={`${c.productId}:${c.printing}`} href={`/app/cards/${encodeURIComponent(c.productId)}`} className="grading-row">
              <CardThumb item={c} width={56} />
              <div className="grading-name">
                <b>{c.name}</b>
                <span className="small muted">{c.setName}{c.number ? ` · ${c.number}` : ""}{c.copies > 1 ? ` · you own ${c.copies}` : ""}</span>
                <span className={`badge ${c.verdict === "safe" ? "good" : "warn"}`}>{c.verdict === "safe" ? "Worth grading" : "Only if it gets a 10"}</span>
              </div>
              <div className="grading-nums">
                <span><span className="small muted">Raw NM</span> <b>{money(c.raw)}</b></span>
                <span><span className="small muted">PSA 10</span> <b>{money(c.psa10)}</b> <span className="up">{money(c.profit10)} profit</span></span>
                <span><span className="small muted">PSA 9</span> {c.psa9 !== null
                  ? <><b>{money(c.psa9)}</b> <span className={c.profit9 >= 0 ? "up" : "down"}>{money(c.profit9)}</span></>
                  : <span className="muted">not enough data</span>}</span>
              </div>
            </Link>
          ))}
          {!full && rows.length > FREE_ROWS && (
            <div className="grading-more">
              <b>{rows.length - FREE_ROWS} more card{rows.length - FREE_ROWS === 1 ? "" : "s"} worth a look.</b>{" "}
              <span className="muted">The full grading check is part of Premium.</span>{" "}
              <Link href="/app/premium?from=grading" className="btn sm primary">See Premium</Link>
            </div>
          )}
        </div>
      )}
      <p className="hint">
        Profit = sale price − raw value − grading cost, using recent PSA sales. A 10 is never guaranteed: check centering, corners, edges and
        surface before you send. &quot;Worth grading&quot; means even a PSA 9 would cover the cost.
      </p>
    </>
  );
}

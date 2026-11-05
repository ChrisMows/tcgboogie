"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { itemMove, money, pct, unitValue } from "@/lib/collection";

const RANGES = [[1, "1D"], [7, "7D"], [30, "30D"], [90, "90D"], [365, "1Y"], [0, "All"]];
const SORTS = {
  value: ["Card value (high to low)", (a, b) => b.held - a.held],
  dollars: ["Biggest $ move", (a, b) => Math.abs(b.move.dollars) - Math.abs(a.move.dollars)],
  percent: ["Biggest % move", (a, b) => Math.abs(b.move.pct) - Math.abs(a.move.pct)],
};
const shortName = (name) => String(name || "").replace(/\s*\(.*\)$/, "");

function MoverList({ label, rows, total }) {
  if (!rows.length) return <div className="panel home-list"><div className="small muted">{label}</div><p className="small muted" style={{ margin: "6px 0 0" }}>No cards moved {label.toLowerCase()} in this range.</p></div>;
  return (
    <div className="panel home-list">
      <div className="small muted movers-list-head">
        <span>{label} · {rows.length} {rows.length === 1 ? "card" : "cards"}</span>
        <b className={`sensitive ${total >= 0 ? "up" : "down"}`}>{total >= 0 ? "+" : "-"}{money(Math.abs(total))}</b>
      </div>
      {rows.map(({ it, held, move }) => (
        <Link key={it.id} href={`/app/cards/${it.productId}`} className="mini-row">
          <CardThumb item={it} width={34} />
          <span className="mini-text"><b>{shortName(it.name)}</b><span className="small muted">{it.quantity > 1 ? `${it.quantity}× · ` : ""}{it.label}</span></span>
          <span className="home-move">
            <b className="small sensitive">{money(held)}</b>
            <span className={`small sensitive ${move.dollars >= 0 ? "up" : "down"}`}>{move.dollars >= 0 ? "▲" : "▼"} {money(Math.abs(move.dollars))} ({pct(move.pct)})</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** The whole collection's movers: pick a range and a sort, see risers and fallers. */
export default function MoversView({ items, historyDays }) {
  // Same limit as the value chart: a plan with a limited history sees ranges inside it.
  const ranges = historyDays ? RANGES.filter(([d]) => d && d <= historyDays) : RANGES;
  const [range, setRange] = useState(7);
  const [sort, setSort] = useState("value");
  const [side, setSide] = useState("both");

  const { up, down, unchanged, noHistory } = useMemo(() => {
    const rows = [];
    let flat = 0, none = 0;
    for (const it of items) {
      const move = itemMove(it, range);
      if (!move) none++;
      else if (Math.abs(move.dollars) < 0.005) flat++;
      else rows.push({ it, move, held: unitValue(it) * (it.quantity || 1) });
    }
    rows.sort(SORTS[sort][1]);
    return { up: rows.filter((r) => r.move.dollars > 0), down: rows.filter((r) => r.move.dollars < 0), unchanged: flat, noHistory: none };
  }, [items, range, sort]);

  const sum = (rows) => rows.reduce((t, r) => t + r.move.dollars, 0);
  const net = sum(up) + sum(down);

  return (
    <>
      <div className="movers-tools">
        <div className="seg" role="group" aria-label="Range">
          {ranges.map(([d, label]) => <button key={d} type="button" className={range === d ? "on" : ""} aria-pressed={range === d} onClick={() => setRange(d)}>{label}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Show">
          {[["both", "All"], ["up", "Up"], ["down", "Down"]].map(([k, label]) => <button key={k} type="button" className={side === k ? "on" : ""} aria-pressed={side === k} onClick={() => setSide(k)}>{label}</button>)}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {(up.length > 0 || down.length > 0) && <span className={`small movers-total sensitive ${net >= 0 ? "up" : "down"}`}>Net {net >= 0 ? "+" : "-"}{money(Math.abs(net))}</span>}
      </div>
      <div className="home-movers" style={side === "both" ? undefined : { gridTemplateColumns: "1fr" }}>
        {side !== "down" && <MoverList label="Up" rows={up} total={sum(up)} />}
        {side !== "up" && <MoverList label="Down" rows={down} total={sum(down)} />}
      </div>
      {(unchanged > 0 || noHistory > 0) && (
        <p className="hint">
          {unchanged > 0 ? `${unchanged} ${unchanged === 1 ? "card" : "cards"} didn't move. ` : ""}
          {noHistory > 0 ? `${noHistory} ${noHistory === 1 ? "card doesn't" : "cards don't"} have price history for this range yet.` : ""}
        </p>
      )}
    </>
  );
}

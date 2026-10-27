"use client";

import { RANGE_LABEL, rangeLabel, setChartRange, useChartRange } from "@/lib/chart-range";
import { pct } from "@/lib/collection";

const RANGES = [1, 7, 30, 90, 365, null];

/**
 * A card page's price change with a 1D / 7D / 30D / 90D / 1Y / All switch. The range is shared (lib/chart-range.js),
 * so the price chart below and the collection list follow it. changes: { [days]: fraction, 0: all the history }.
 */
export default function PriceRangeChange({ changes }) {
  const range = useChartRange();
  const v = changes ? changes[range ?? 0] ?? null : null;
  return (
    <span className="price-range">
      <span className="seg price-range-seg" role="group" aria-label="Price change over">
        {RANGES.map((r) => (
          <button key={r ?? "all"} type="button" className={range === r ? "on" : ""} aria-pressed={range === r} onClick={() => setChartRange(r)}>
            {r ? RANGE_LABEL[r] : "All"}
          </button>
        ))}
      </span>
      {v !== null
        ? <span className={`price-range-val ${v >= 0 ? "up" : "down"}`}>{v >= 0 ? "▲" : "▼"} {pct(Math.abs(v)).replace("+", "")} <span className="muted">{rangeLabel(range) === "All" ? "over all the history we have" : `in ${rangeLabel(range)}`}</span></span>
        : <span className="small muted">Not enough price history for {rangeLabel(range)}.</span>}
    </span>
  );
}

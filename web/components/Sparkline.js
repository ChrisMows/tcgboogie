/** Tiny price-history line with an optional dashed target line. */
export default function Sparkline({ points, target, width = 160, height = 44 }) {
  const values = (points || []).map((p) => p.price).filter((v) => Number.isFinite(v));
  if (values.length < 2) return <span className="small muted">No history yet</span>;
  const all = target ? [...values, target] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v) => height - 4 - ((v - min) / span) * (height - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Price over the last ${values.length} days, from $${values[0]} to $${values[values.length - 1]}`}>
      {target ? <line x1="0" x2={width} y1={y(target)} y2={y(target)} stroke="#d3ff66" strokeDasharray="4 3" strokeWidth="1" /> : null}
      <path d={d} fill="none" stroke={up ? "#d3ff66" : "#f85149"} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

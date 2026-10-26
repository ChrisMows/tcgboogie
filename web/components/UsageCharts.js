// Admin -> Usage (lib/usage.js): one card per metric with today's use against its daily limit and a 60-day bar
// chart. Server-rendered SVG; hovering (or tapping) a bar shows that day's number.
const fmt = (v, d = 0) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** How close a value is to its limit: ok below 75%, near from 75%, over from 90%. */
function level(value, cap) {
  if (!cap) return null;
  const share = value / cap;
  return share >= 0.9 ? "over" : share >= 0.75 ? "near" : "ok";
}
const LEVEL = { ok: ["✓", "Comfortable"], near: ["▲", "Getting close"], over: ["●", "At the limit"] };

function Chart({ m }) {
  const W = 600, H = 110, TOP = 14, BASE = H - 2;
  const n = m.series.length, gap = 2, bw = (W - gap * (n - 1)) / n;
  const peak = Math.max(...m.series.map((s) => s.value), 0);
  const scaleMax = Math.max(peak, m.cap || 0) * 1.08 || 1;
  const y = (v) => BASE - (v / scaleMax) * (BASE - TOP);
  // Labels are page text beside the SVG, not SVG text: the chart stretches to the card's width, and would stretch them.
  return (
    <div className="usage-chart-wrap">
      <svg className="usage-chart" viewBox={`0 0 ${W} ${H}`} role="img" preserveAspectRatio="none"
        aria-label={`${m.label}, last ${n} days: peak ${fmt(peak, m.decimals)} ${m.unit}${m.cap ? `, limit ${fmt(m.cap, m.decimals)}` : ""}`}>
        <line x1="0" x2={W} y1={BASE} y2={BASE} className="usage-axis" />
        {m.series.map((s, i) => {
          const cap = s.cap || m.cap;
          const h = Math.max(s.value > 0 ? 2 : 0, BASE - y(s.value));
          return (
            <g key={s.day}>
              {/* hit target: the full column, so thin bars are easy to hover */}
              <rect x={i * (bw + gap)} y={TOP} width={bw} height={BASE - TOP} className="usage-hit">
                <title>{`${shortDay(s.day)}: ${fmt(s.value, m.decimals)} ${m.unit}${cap ? ` of ${fmt(cap, m.decimals)} (${Math.round((s.value / cap) * 100)}%)` : ""}`}</title>
              </rect>
              {h > 0 && <rect x={i * (bw + gap)} y={BASE - h} width={bw} height={h} rx={Math.min(2, bw / 2)} className={`usage-bar ${level(s.value, cap) || ""}`} pointerEvents="none" />}
            </g>
          );
        })}
        {m.cap ? <line x1="0" x2={W} y1={y(m.cap)} y2={y(m.cap)} className="usage-cap" /> : null}
      </svg>
      {m.cap ? <span className="usage-cap-label" style={{ top: `calc(${(y(m.cap) / H) * 100}% - 16px)` }}>limit {fmt(m.cap, m.decimals)}</span> : null}
      <div className="usage-days"><span>{shortDay(m.series[0].day)}</span><span>today</span></div>
    </div>
  );
}

function Card({ m }) {
  const today = m.series[m.series.length - 1];
  const cap = today.cap || m.cap;
  const lv = level(today.value, cap);
  const days = m.series.filter((s) => s.value > 0);
  const peak = m.series.reduce((a, s) => (s.value > a.value ? s : a), m.series[0]);
  const avg = days.length ? days.reduce((t, s) => t + s.value, 0) / days.length : 0;
  return (
    <div className="panel usage-card">
      <div className="usage-head">
        <b>{m.label}</b>
        {lv && <span className={`usage-pill ${lv}`}><span aria-hidden="true">{LEVEL[lv][0]}</span> {LEVEL[lv][1]}</span>}
      </div>
      <div className="usage-now">
        <span className="usage-big">{fmt(today.value, m.decimals)}</span>
        <span className="muted">{cap ? ` of ${fmt(cap, m.decimals)} ${m.unit} today · ${Math.round((today.value / cap) * 100)}%` : ` ${m.unit} today`}</span>
      </div>
      {cap ? <div className="usage-meter" aria-hidden="true"><span className={lv} style={{ width: `${Math.min(100, (today.value / cap) * 100)}%` }} /></div> : null}
      {m.parts?.length ? (
        <p className="small muted usage-parts">Today: {m.parts.map((x) => `${x.label} ${fmt(x.today)}`).join(" · ")}</p>
      ) : null}
      {m.recorded ? <Chart m={m} /> : <p className="small muted usage-empty">No readings yet. They start with the next deploy and fill in day by day.</p>}
      {m.recorded && (
        <p className="small muted" style={{ margin: 0 }}>
          60-day peak {fmt(peak.value, m.decimals)} on {shortDay(peak.day)}{cap ? ` (${Math.round((peak.value / (peak.cap || cap)) * 100)}%)` : ""} · average {fmt(avg, m.decimals)} on days with any use
        </p>
      )}
      <p className="small muted" style={{ margin: 0 }}>{m.note}</p>
    </div>
  );
}

export default function UsageCharts({ metrics }) {
  const groups = [...new Set(metrics.map((m) => m.group))];
  const watch = metrics.filter((m) => {
    const t = m.series[m.series.length - 1];
    return level(t.value, t.cap || m.cap) && level(t.value, t.cap || m.cap) !== "ok";
  });
  return (
    <>
      <div className={`panel usage-summary ${watch.length ? "near" : "ok"}`}>
        {watch.length
          ? <><b>▲ Close to a limit today:</b> {watch.map((m) => m.label).join(", ")}</>
          : <><b>✓ Everything is comfortably under its limits today.</b> <span className="muted">Amber from 75% of a limit, red from 90%. Boogie Bot messages you on Discord at 75% and 90%, and when a day&apos;s pace would run out a limit before the reset. Days run on UTC time (they turn over at 8 PM Eastern, 7 PM in winter), when eBay and the price service reset.</span></>}
      </div>
      {groups.map((g) => (
        <section key={g}>
          <h2 className="usage-group">{g}</h2>
          <div className="usage-grid">{metrics.filter((m) => m.group === g).map((m) => <Card key={m.key} m={m} />)}</div>
        </section>
      ))}
    </>
  );
}

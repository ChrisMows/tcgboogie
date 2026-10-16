import Link from "next/link";

const money = (v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function dealLabel(d) {
  const grade = d.kind === "raw" ? `Raw ${d.condition}` : `${d.grader} ${d.grade}`;
  const lang = d.language === "japanese" ? " · Japanese" : "";
  return `${d.name} · ${d.setName} ${d.number} · ${grade}${lang}`;
}

/** mode: "live" (auction still open), "missed" (free view: after the end, with the sale price), or "preview" */
export default function DealCard({ deal: d, mode = "live" }) {
  const missed = mode === "missed";
  return (
    <div className="deal">
      <div className="top">
        <span className="badge good">{d.discountPct}% below market</span>
        {missed ? (
          <span className="badge">Ended · sold for {money(d.soldFor)}</span>
        ) : (
          <span className="badge accent">{d.minutesLeft} min left</span>
        )}
      </div>
      <div className="name">{dealLabel(d)}</div>
      <div className="meta">
        {missed ? "Was" : "Current bid + shipping"} {money(d.total)} · 30-day market {money(d.marketValue)} from {d.comps} sales
      </div>
      {d.flags?.length > 0 && (
        <div className="flags">
          {d.flags.map((f) => (
            <span className="badge warn" key={f}>{f}</span>
          ))}
        </div>
      )}
      <div className="actions">
        {missed ? (
          <>
            <span className="small muted">
              Premium members got this {d.minutesLeft} minutes before it ended, {money(d.soldFor - d.total)} under what it sold for.
            </span>
            <Link href="/app/billing" className="btn primary sm">Get deals live with Premium</Link>
          </>
        ) : mode === "live" ? (
          <>
            <a className="btn primary sm" href={d.url || "https://www.ebay.com/"} target="_blank" rel="noopener noreferrer sponsored">
              Open listing
            </a>
            <a className="btn sm" href="https://www.ebay.com/sch/i.html?LH_Sold=1" target="_blank" rel="noopener noreferrer">
              Sold comps
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

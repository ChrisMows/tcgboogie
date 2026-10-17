import CardThumb from "@/components/CardThumb";

// A deal as a picture tile (like a store product grid). Plain component: works on server and client pages.
// mode: "live" (auction still open), "missed" (Free: after it ended, with the sale price)
const money = (v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function gradeLabel(d) {
  return d.kind === "raw" ? `Raw · ${d.condition}` : `${d.grader} ${d.grade}`;
}

export default function DealTile({ deal: d, mode = "live", href, affiliate = false }) {
  const missed = mode === "missed";
  const body = (
    <>
      <div className="dt-art">
        <CardThumb item={{ image: d.image, name: d.name, number: d.number, type: "card" }} width={120} />
        <span className="dt-off">−{d.discountPct}%</span>
        {d.flags?.length > 0 && <span className="dt-flag" title={d.flags.join(" · ")}>⚠ {d.flags.length}</span>}
      </div>
      <div className="dt-info">
        <div className="dt-name" title={d.name}>{d.name}</div>
        <div className="dt-meta">{d.setName} · {d.number}{d.language === "japanese" ? " · JP" : ""}</div>
        <span className="chip-mini">{gradeLabel(d)}</span>
        <div className="dt-price">
          <b>{money(d.total)}</b>
          <span className="dt-mkt">{money(d.marketValue)} mkt</span>
        </div>
        <div className={`dt-time ${missed ? "" : "live"}`}>
          {missed ? `Ended · sold for ${money(d.soldFor)}` : `◷ ${d.minutesLeft} min left`}
        </div>
      </div>
    </>
  );
  if (missed || !href) return <div className={`deal-tile ${missed ? "missed" : ""}`}>{body}</div>;
  return (
    <a className="deal-tile" href={href} target="_blank" rel={`noopener noreferrer${affiliate ? " sponsored" : ""}`}
      title={`Open on eBay: ${d.title || d.name}`}>
      {body}
    </a>
  );
}

/** A grid of deal tiles with an empty state. */
export function DealGrid({ deals, mode, empty }) {
  if (!deals.length) return <div className="panel empty-state">{empty || "No deals yet."}</div>;
  return (
    <div className="deal-tiles">
      {deals.map((d) => <DealTile key={d.id} deal={d} mode={mode} href={d.href} affiliate={d.affiliate} />)}
    </div>
  );
}

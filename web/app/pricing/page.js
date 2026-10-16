import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "Pricing" };

const rows = [
  ["Deal feed", "After the auction ends, with the sale price", "Live, while you can still bid"],
  ["Instant alerts (Discord and phone)", "—", "✓"],
  ["Filter profiles", "1", "15"],
  ["Lowest discount you can set", `${PLANS.free.minDiscountFloor}% below market`, `${PLANS.premium.minDiscountFloor}% below market`],
  ["How early before the auction ends", `Up to ${PLANS.free.maxWindowMinutes} minutes`, `Up to ${PLANS.premium.maxWindowMinutes} minutes`],
  ["Card values covered", `$${PLANS.free.minValueFloor}+`, `$${PLANS.premium.minValueFloor}+`],
  ["Graded and raw cards", "✓", "✓"],
  ["Japanese cards", "—", "✓"],
  ["Email recap", "Weekly", "Daily"],
  ["Community Discord", "✓", "✓"],
];

export default function Pricing() {
  const { free, premium } = PLANS;
  return (
    <div className="wrap section">
      <h2>Simple pricing</h2>
      <p className="sub">Start free to see how many deals you're missing. Upgrade when one good flip pays for the month.</p>
      <div className="plans">
        <div className="plan">
          <h3>{free.label}</h3>
          <div className="price">$0</div>
          <div className="muted">{free.tagline}</div>
          <ul>{free.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link href="/login?mode=signup" className="btn block">Start free</Link>
        </div>
        <div className="plan featured">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ flex: "none" }}>{premium.label}</h3>
            <span className="badge accent" style={{ flex: "none" }}>Most popular</span>
          </div>
          <div className="price">${premium.price}<small> / month</small></div>
          <div className="muted">{premium.tagline}</div>
          <ul>{premium.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <Link href="/login?mode=signup&plan=premium" className="btn primary block">Get Premium</Link>
          <div className="hint" style={{ textAlign: "center" }}>Cancel anytime. Card payments launch soon.</div>
        </div>
      </div>
      <div className="table-wrap" style={{ maxWidth: 820, margin: "32px auto 0" }}>
        <table className="list">
          <thead><tr><th>Feature</th><th>Free</th><th>Premium</th></tr></thead>
          <tbody>
            {rows.map(([name, a, b]) => (
              <tr key={name}><td>{name}</td><td className="muted">{a}</td><td>{b}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

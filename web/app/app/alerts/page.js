import { dealLabel } from "@/components/DealCard";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Alert history" };

const money = (v) => `$${Number(v).toLocaleString()}`;

export default async function Alerts() {
  const user = await requireUser();
  const premium = user.tier === "premium";
  const rows = premium ? SAMPLE_DEALS.slice(0, 6) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alert history</h1>
          <p>Every alert we sent you, and what it sold for.</p>
        </div>
      </div>
      {user.demo && premium && <div className="notice">Sample alerts.</div>}
      {!premium ? (
        <div className="panel">
          <p style={{ marginTop: 0 }}>Instant alerts are part of Premium, so there's no alert history on Free.</p>
          <a className="btn primary" href="/app/billing">See Premium</a>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr><th>Card</th><th>Alerted at</th><th>Market</th><th>Sold for</th><th>Below market</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{dealLabel(d)}</td>
                  <td className="muted">{money(d.total)} · {d.minutesLeft} min left</td>
                  <td>{money(d.marketValue)}</td>
                  <td>{money(d.soldFor)}</td>
                  <td><span className="badge good">{d.discountPct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

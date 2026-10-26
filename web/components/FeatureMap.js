import Link from "next/link";
import { GROWS } from "@/lib/feature-map";

// Admin -> Feature map (lib/feature-map.js): the services we pay for or depend on, then every feature with its Free and
// Premium limits, the services it uses and what makes its cost grow. Click a service to see only the features using it.
const fmt = (v, d = 0) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const level = (share) => (share >= 0.9 ? "over" : share >= 0.75 ? "near" : "ok");

function Vendor({ v, on }) {
  const share = v.cap && v.used !== null ? v.used / v.cap : null;
  return (
    <Link href={on ? "/app/admin?tab=map" : `/app/admin?tab=map&vendor=${v.key}`} className={`panel fmap-vendor${on ? " on" : ""}${v.status === "off" ? " off" : ""}`}
      aria-current={on ? "true" : undefined}>
      <div className="fmap-vendor-head">
        <b>{v.name}</b>
        <span className={`badge ${v.status === "live" ? "good" : ""}`}>{v.status === "live" ? "Live" : "Off"}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{v.what}</p>
      <dl className="fmap-facts">
        <dt>Cost</dt><dd>{v.price}</dd>
        <dt>Limit</dt><dd>{v.limit}</dd>
        {v.used !== null && v.used !== undefined && (
          <><dt>Today</dt><dd>{v.cost !== null && v.cost !== undefined ? `≈ $${fmt(v.cost, 2)} (${fmt(v.used)} tokens)` : `${fmt(v.used, v.unit === "GB" ? 1 : 0)}${v.unit ? ` ${v.unit}` : ""}${v.cap ? ` of ${fmt(v.cap, v.unit === "GB" ? 1 : 0)}` : ""}`}</dd></>
        )}
      </dl>
      {share !== null && <div className="usage-meter" aria-hidden="true"><span className={level(share)} style={{ width: `${Math.min(100, share * 100)}%` }} /></div>}
      {v.note && <span className="small muted">{v.note}</span>}
      <span className="small fmap-count">{v.features ? `Used by ${v.features} feature${v.features === 1 ? "" : "s"} →` : "No features yet"}</span>
    </Link>
  );
}

export default function FeatureMap({ map, vendor }) {
  const names = Object.fromEntries(map.vendors.map((v) => [v.key, v.name]));
  const picked = map.vendors.find((v) => v.key === vendor) || null;
  const list = picked ? map.features.filter((f) => f.vendors.includes(picked.key)) : map.features;
  const fixed = 9.99 + 20; // PokemonPriceTracker + Resend Pro (hosting and the VPS are on your Hostinger bills)
  const claude = map.vendors.find((v) => v.key === "claude");
  return (
    <>
      <div className="panel fmap-summary">
        <div><span className="fmap-big">{map.vendors.length}</span><span className="muted">services</span></div>
        <div><span className="fmap-big">{map.features.length}</span><span className="muted">features</span></div>
        <div><span className="fmap-big">${fmt(fixed, 2)}</span><span className="muted">a month in subscriptions, plus Hostinger</span></div>
        {claude?.cost != null && <div><span className="fmap-big">≈ ${fmt(claude.cost * 30, 0)}</span><span className="muted">a month of Claude at today&apos;s pace</span></div>}
      </div>

      <h2 className="usage-group">Services</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Click a service to see which features use it. Today&apos;s numbers come from Admin → Usage.</p>
      <div className="fmap-vendors">{map.vendors.map((v) => <Vendor key={v.key} v={v} on={picked?.key === v.key} />)}</div>

      <h2 className="usage-group">Features</h2>
      {picked ? (
        <div className="notice">Showing the {list.length} feature{list.length === 1 ? "" : "s"} that use <b>{picked.name}</b>. <Link href="/app/admin?tab=map">Show all</Link></div>
      ) : (
        <div className="fmap-legend small">
          <b>What makes it cost more:</b>
          {Object.entries(GROWS).map(([k, g]) => <span key={k}><span className={`fmap-grow ${k}`}>{g.label}</span> {g.help}</span>)}
        </div>
      )}
      {map.areas.map((area) => {
        const rows = list.filter((f) => f.area === area);
        if (!rows.length) return null;
        return (
          <section key={area} className="panel fmap-area">
            <h3>{area}</h3>
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="list fmap-table">
                <thead><tr><th>Feature</th><th>Free</th><th>Premium</th><th>Services</th><th>Grows</th></tr></thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.name}>
                      <td><Link href={f.link}><b>{f.name}</b></Link><div className="small muted">{f.what}</div></td>
                      <td className={f.free === "—" ? "muted" : ""}>{f.free}</td>
                      <td className={f.premium === "—" ? "muted" : ""}>{f.premium}</td>
                      <td>
                        <div className="fmap-chips">
                          {f.vendors.length ? f.vendors.map((k) => (
                            <Link key={k} href={`/app/admin?tab=map&vendor=${k}`} className={`fmap-chip${picked?.key === k ? " on" : ""}`}>{names[k]}</Link>
                          )) : <span className="small muted">None (our own code)</span>}
                        </div>
                      </td>
                      <td><span className={`fmap-grow ${f.grows}`} title={GROWS[f.grows].help}>{GROWS[f.grows].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

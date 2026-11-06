"use client";

import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { gradeLabel } from "@/lib/collection";
import { FLIP_POINTS, GRADE_TARGETS, GRADING_COMPANIES, MIN_PROFIT, THIN_SALES, flipScore, gradingMath, targetName } from "@/lib/grading";

const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const plus = (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fee = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
const pct = (v) => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100)).toLocaleString("en-US")}%`;
const sales = (n) => (n === null || n === undefined ? "Recent sales" : `${n} ${n === 1 ? "sale" : "sales"} in 90 days`);
const tone = (v) => (v >= 0 ? "up" : "down");
const TARGETS = Object.keys(GRADE_TARGETS);

/** The score for gradingMath's numbers at a target grade. */
const scoreOf = (c, id, m) => flipScore({ raw: c.raw, ...m }, c.grades[id].topSales);

/** One way the card could come back: what it sells for, and what that leaves. */
function Outcome({ title, price, profit, spend, count }) {
  if (price === null) {
    return (
      <div className="fd-outcome">
        <span className="small muted">If it comes back {title}</span>
        <b className="fd-outcome-num">Unknown</b>
        <span className="small muted">Not enough recent sales to price it</span>
      </div>
    );
  }
  return (
    <div className="fd-outcome">
      <span className="small muted">If it comes back {title}</span>
      <b className={`fd-outcome-num ${tone(profit)}`}>{plus(profit)}</b>
      <span className="small">Sells for about {money(price)} · {pct(profit / spend)} return</span>
      <span className="small muted">{sales(count)}</span>
    </div>
  );
}

/** The odds a member would need for the flip to be worth it, in a sentence. */
function oddsLine(m) {
  if (m.profit10 <= 0) return `At this cost it loses money even as a ${m.topName}.`;
  if (m.profit9 === null) return `Only the ${m.topName} has recent sales, so we can't say what a lower grade would leave.`;
  if (m.profit9 >= 0) return `It still makes money as a ${m.nextName}, so missing the ${m.topName} doesn't lose money unless it grades lower than that.`;
  const need = -m.profit9 / (m.profit10 - m.profit9);
  return `To break even, about ${Math.ceil(need * 100)}% of copies you send in would need to come back ${m.topName}, with the rest coming back ${m.nextName}.`;
}

/** Grade & Flip's page for one card: change the grader, level, shipping and buy price, and see what each outcome leaves. */
export default function FlipDetail({ card, start, links }) {
  const [target, setTarget] = useState(start.target);
  const [tier, setTier] = useState(start.tier);
  const [own, setOwn] = useState(null); // the member's own fee per card, instead of a service level
  const [shipping, setShipping] = useState(start.shipping);
  const [raw, setRaw] = useState(card.raw); // what they'd pay: starts at TCGplayer's Near Mint market price

  const t = GRADE_TARGETS[target];
  const co = GRADING_COMPANIES[t.grader];
  const c = useMemo(() => ({ ...card, raw }), [card, raw]);
  const m = gradingMath(c, target, tier, { own, shipping });
  const flip = m && scoreOf(c, target, m);
  const spend = m && raw + m.cost;
  const grades = c.grades[target] || {};
  const topShort = gradeLabel(t.grader, t.top);
  const sold = links.sold[target];

  // Every grader at its cheapest level that takes this card, best Flip Score first; no data last.
  const rows = useMemo(() => TARGETS.map((id) => {
    const r = gradingMath(c, id, 0, { shipping });
    return { id, m: r, flip: r && scoreOf(c, id, r) };
  }).sort((a, b) => (b.flip?.score ?? -1) - (a.flip?.score ?? -1) || (b.m?.profit10 ?? 0) - (a.m?.profit10 ?? 0)), [c, shipping]);

  const pick = (id) => {
    if (GRADE_TARGETS[id].grader !== t.grader) { setTier(0); setOwn(null); } // another company's levels: start at its cheapest
    setTarget(id);
  };
  const number = (set) => (e) => set(Math.max(0, Number(e.target.value) || 0));

  const parts = flip && [
    { key: "profit", label: "Profit", say: `${money(m.profit10)} as a ${m.topName}` },
    { key: "return", label: "Return", say: `${pct(m.profit10 / spend)} on the ${money(spend)} you put in` },
    { key: "safety", label: "If it grades lower", say: m.profit9 === null ? `No recent ${m.nextName} sales` : `${plus(m.profit9)} as a ${m.nextName}` },
    { key: "demand", label: "Demand", say: `${grades.topSales ?? 0} ${m.topName} ${grades.topSales === 1 ? "sale" : "sales"} in 90 days${(grades.topSales ?? 0) < THIN_SALES ? `: under ${THIN_SALES} can't score Excellent` : ""}` },
  ];

  return (
    <>
      <section className="panel fd-head">
        <CardThumb item={card} width={150} />
        <div className="fd-head-main">
          <h1 className="fd-name">{card.name.replace(/\s*\(.*\)$/, "")}</h1>
          <span className="muted">{card.setName}{card.number ? ` · ${card.number}` : ""}{card.language === "japanese" ? " · Japanese" : ""}</span>
          {m ? (
            <div className="fd-sum">
              <span className={`gr-score ${flip.tier.key}`} aria-label={`Flip Score ${flip.score.toFixed(1)} out of 10, ${flip.tier.label}`}>
                <b className="gr-score-num">{flip.score.toFixed(1)}</b>
                <span className="gr-score-body">
                  <span className="gr-score-label"><b>{flip.tier.label}</b><span className="muted">Flip Score</span></span>
                  <span className="gr-score-bar"><i style={{ width: `${flip.score * 10}%` }} /></span>
                </span>
              </span>
              <div className="fd-sum-profit">
                <div className={`gr-profit ${tone(m.profit10)}`}>{plus(m.profit10)}</div>
                <span className="small muted">profit as a {m.topName}</span>
              </div>
            </div>
          ) : <p className="muted">No reliable {targetName(target)} sales for this card yet. Pick another grade below.</p>}
          <div className="fd-links small">
            <a className="btn sm" href={links.raw.href} target="_blank" rel={`noopener noreferrer${links.raw.affiliate ? " sponsored" : ""}`}>Find raw copies on eBay ↗</a>
            {sold && <a className="btn sm" href={sold.href} target="_blank" rel={`noopener noreferrer${sold.affiliate ? " sponsored" : ""}`}>See sold {targetName(target)} copies ↗</a>}
            {links.raw.affiliate && <span className="muted">Ad</span>}
            <a className="btn sm ghost" href={links.card}>Full card page</a>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Your flip</h2>
        <div className="fd-controls">
          <label className="gr-field">
            <span className="small muted">Grading company and grade</span>
            <select value={target} onChange={(e) => pick(e.target.value)}>
              {TARGETS.map((id) => <option key={id} value={id}>{targetName(id)}</option>)}
            </select>
          </label>
          <label className="gr-field">
            <span className="small muted">{t.grader} service level</span>
            <select value={own !== null ? "own" : String(tier)} onChange={(e) => {
              if (e.target.value === "own") setOwn(co.tiers[tier].fee);
              else { setOwn(null); setTier(Number(e.target.value)); }
            }}>
              {co.tiers.map((x, i) => <option key={x.name} value={i}>{x.name} · {fee(x.fee)}{x.days ? ` · ~${x.days} days` : ""}{x.max ? ` · cards up to $${x.max.toLocaleString("en-US")}` : ""}{x.min ? ` · ${x.min}-card minimum` : ""}</option>)}
              <option value="own">My own price…</option>
            </select>
          </label>
          {own !== null && (
            <label className="gr-field gr-small">
              <span className="small muted">Fee per card</span>
              <span className="gr-money"><span className="muted">$</span><input type="number" min="0" max="9999" step="1" value={own} onChange={number(setOwn)} /></span>
            </label>
          )}
          <label className="gr-field gr-small">
            <span className="small muted">Raw price you&apos;d pay</span>
            <span className="gr-money"><span className="muted">$</span><input type="number" min="0" max="100000" step="any" value={raw} onChange={number(setRaw)} /></span>
          </label>
          <label className="gr-field gr-small">
            <span className="small muted">Shipping per card</span>
            <span className="gr-money"><span className="muted">$</span><input type="number" min="0" max="999" step="1" value={shipping} onChange={number(setShipping)} /></span>
          </label>
        </div>
        <p className="small muted fd-raw-note">
          TCGplayer Near Mint market is {money(card.raw)}.{raw !== card.raw && <> <button type="button" className="link-btn" onClick={() => setRaw(card.raw)}>Use that price</button></>}
        </p>

        {m && (
          <>
            <div className="fd-outcomes">
              <Outcome title={`a ${m.topName}`} price={m.top} profit={m.profit10} spend={spend} count={grades.topSales} />
              <Outcome title={`a ${m.nextName}`} price={m.next} profit={m.profit9} spend={spend} count={grades.nextSales} />
              <div className="fd-outcome">
                <span className="small muted">You put in</span>
                <b className="fd-outcome-num">{money(spend)}</b>
                <span className="small">{money(raw)} raw + {m.tier ? `${m.tier.name} ${fee(m.tier.fee)}` : `${fee(own)} grading`} + {fee(shipping)} shipping</span>
                <span className="small muted">{m.tier ? (m.tier.days ? `About ${m.tier.days} business days at ${t.grader}` : `${t.grader} doesn't publish this level's turnaround`) : "Your own grading price"}</span>
              </div>
            </div>
            {m.bumped && <div className="notice fd-note">This card&apos;s {money(m.top)} value is over the limit for the level you picked, so it&apos;s priced at {m.tier.name}.</div>}
            {m.tier?.max && m.top > m.tier.max && <div className="notice warn fd-note">A {money(m.top)} card is over the ${m.tier.max.toLocaleString("en-US")} limit {t.grader} publishes for {m.tier.name} too, its highest level, so check with {t.grader} what a card like this costs.</div>}
            {m.tier?.min > 1 && <div className="notice fd-note">{t.grader} {m.tier.name} needs at least {m.tier.min} cards in one submission.</div>}
            <ul className="fd-reads">
              <li>{oddsLine(m)}</li>
              <li>To make at least {money(MIN_PROFIT)} as a {m.topName}, pay no more than <b>{money(Math.max(0, m.top - m.cost - MIN_PROFIT))}</b> raw.</li>
              {m.next !== null && <li>{m.next - m.cost > 0 ? <>To break even as a {m.nextName}, pay no more than <b>{money(m.next - m.cost)}</b> raw.</> : <>A {m.nextName} can&apos;t cover the grading cost at this level, whatever you pay raw.</>}</li>}
            </ul>
          </>
        )}
      </section>

      {parts && (
        <section className="panel">
          <h2>Why it scores {flip.score.toFixed(1)}</h2>
          <div className="fd-parts">
            {parts.map((p) => (
              <div key={p.key} className={`fd-part gr-score ${flip.tier.key}`}>
                <span className="fd-part-head"><b>{p.label}</b><span className="small muted">{flip.parts[p.key]} of {FLIP_POINTS[p.key]}</span></span>
                <span className="gr-score-bar"><i style={{ width: `${(flip.parts[p.key] / FLIP_POINTS[p.key]) * 100}%` }} /></span>
                <span className="small muted">{p.say}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Compare graders</h2>
        <p className="small muted fd-compare-note">Each at its cheapest level that takes this card, with your raw price and shipping. Pick one to use it above.</p>
        <div className="table-wrap">
          <table className="list fd-compare">
            <thead><tr><th>Grade</th><th>Level</th><th>Top grade</th><th>Grade below</th><th>Flip Score</th></tr></thead>
            <tbody>
              {rows.map(({ id, m: r, flip: f }) => (
                <tr key={id} className={id === target ? "on" : ""}>
                  <td><button type="button" className="link-btn" onClick={() => pick(id)} aria-pressed={id === target}>{targetName(id)}</button></td>
                  {r ? (
                    <>
                      <td>{r.tier.name} {fee(r.tier.fee)}<div className="small muted">{r.tier.days ? `~${r.tier.days} days` : "Turnaround not published"}{r.tier.min ? ` · ${r.tier.min}-card minimum` : ""}</div></td>
                      <td className={tone(r.profit10)}>{plus(r.profit10)}<div className="small muted">sells {money(r.top)}</div></td>
                      <td className={r.profit9 === null ? "muted" : tone(r.profit9)}>{r.profit9 === null ? "Unknown" : plus(r.profit9)}{r.next !== null && <div className="small muted">{r.nextName} sells {money(r.next)}</div>}</td>
                      <td><span className={`gr-score ${f.tier.key} fd-mini`}><b>{f.score.toFixed(1)}</b> <span className="small muted">{f.tier.label}</span></span></td>
                    </>
                  ) : <td colSpan={4} className="muted small">Not enough recent {targetName(id)} sales</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="hint">
        Graded prices are recent sales with enough data to trust; {topShort === "10" ? "a 10" : `a ${topShort}`} isn&apos;t guaranteed, and a card can come back lower than the grades shown here.
        Profit is before selling fees, such as eBay&apos;s. Grading fees are the graders&apos; published prices as of October 2026; pick &quot;My own price&quot; if yours differ.
        Check centering, corners, edges and surface before you buy: raw copies sold as &quot;Near Mint&quot; aren&apos;t always.
      </p>
    </>
  );
}

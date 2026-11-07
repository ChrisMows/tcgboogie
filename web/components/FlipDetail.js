"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CardThumb from "@/components/CardThumb";
import { gradeLabel } from "@/lib/collection";
import { EBAY_FEE, EBAY_FEE_NOTE, FLIP_CHECK, FLIP_POINTS, GRADE_TARGETS, GRADING_COMPANIES, GRADING_PRICES_MONTH, THIN_SALES, flipScore, gradingMath, targetName } from "@/lib/grading";

const money = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const plus = (v) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fee = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100)).toLocaleString("en-US")}%`;
const sales = (n) => (n === null || n === undefined ? "Recent sales" : `${n} ${n === 1 ? "sale" : "sales"} in 90 days`);
const tone = (v) => (v >= 0 ? "up" : "down");
const TARGETS = Object.keys(GRADE_TARGETS);

/** The score for gradingMath's numbers at a target grade. */
const scoreOf = (c, id, m) => flipScore({ raw: c.raw, ...m }, c.grades[id].topSales);

/** The card's name without its brackets or a number already in it ("Lugia V - 138/195", the Prize Pack names). */
function cardTitle({ name, number }) {
  const base = name.replace(/\s*\(.*\)$/, "");
  const bare = number && base.endsWith(` - ${number}`) ? base.slice(0, -` - ${number}`.length) : base;
  return number ? `${bare} · ${number}` : bare;
}

/** A dollar box (or percent box): shows two decimals until it's being typed in. */
function MoneyInput({ value, onChange, max, label, percent }) {
  const [typing, setTyping] = useState(null);
  return (
    <span className="gr-money">
      {!percent && <span className="muted">$</span>}
      <input type="number" inputMode="decimal" min="0" max={max} step="any" aria-label={label} value={typing !== null && Number(typing) === value ? typing : value.toFixed(2)}
        onFocus={() => setTyping(String(value))} onBlur={() => setTyping(null)}
        onChange={(e) => { setTyping(e.target.value); onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0))); }} />
      {percent && <span className="muted">%</span>}
    </span>
  );
}

function Info() {
  return <svg className="fd-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
}

function Trend({ down }) {
  return <svg className="fd-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{down ? <path d="M3 7l6 6 4-4 8 8M21 11v6h-6" /> : <path d="M3 17l6-6 4 4 8-8M21 13V7h-6" />}</svg>;
}

/** One way the card could come back: what it sells for, and what that leaves. */
function Outcome({ grade, price, fee, profit, spend, count, main }) {
  if (price === null) {
    return (
      <div className="fd-outcome">
        <span className="fd-outcome-title">If graded <b>{grade}</b></span>
        <b className="fd-outcome-num">Unknown</b>
        <span className="muted">Not enough recent sales to price it</span>
      </div>
    );
  }
  return (
    <div className={`fd-outcome ${main && profit >= 0 ? "main" : ""}`}>
      <span className="fd-outcome-title">If graded <b>{grade}</b></span>
      <b className={`fd-outcome-num ${tone(profit)}`}>{plus(profit)}</b>
      <span className="muted">Projected {profit >= 0 ? "profit" : "loss"}</span>
      <span className="fd-outcome-line"><span>Sale value <b>{money(price)}</b></span>{fee > 0 && <span>eBay fee <b>−{money(fee)}</b></span>}<span><b>{pct(profit / spend)}</b> return</span></span>
      <span className="small muted">{sales(count)}</span>
    </div>
  );
}

/** What the grade below the top means for this flip: the price to stay under, and what happens at the price entered. */
function BreakEven({ m }) {
  const line = m.next === null ? null : m.next - m.feeNext - m.cost;
  const say = (ok, head, value, text) => (
    <div className={`fd-even ${ok ? "ok" : "warn"}`}>
      <Trend down={!ok} />
      <b className="fd-even-head">{head}{value && <span className="fd-even-num"> {value}</span>}</b>
      <span className="fd-even-text">{text}</span>
    </div>
  );
  if (line === null) return say(false, `No recent ${m.nextName} sales`, null, `Only the ${m.topName} has recent sales, so we can't say what a lower grade would leave.`);
  if (line <= 0) return say(false, `A ${m.nextName} can't break even`, null, "After eBay's fee, it sells for less than the grading cost, whatever you pay raw.");
  const head = `${m.nextName} break-even purchase price`;
  if (m.profit9 >= 0) return say(true, head, money(line), `${m.nextName} remains profitable at your purchase price.`);
  if (m.profit10 <= 0) return say(false, head, money(line), `At your purchase price it loses money even as a ${m.topName}.`);
  const need = Math.ceil((-m.profit9 / (m.profit10 - m.profit9)) * 100);
  return say(false, head, money(line), `${m.nextName} loses money at your purchase price. About ${need}% of copies would need to come back ${m.topName} to break even.`);
}

/** Grade & Flip's page for one card: change the grader, level, shipping and buy price, and see what each outcome leaves. */
export default function FlipDetail({ card, start, links }) {
  const [target, setTarget] = useState(start.target);
  const [tier, setTier] = useState(start.tier);
  const [own, setOwn] = useState(null); // the member's own fee per card, instead of a service level
  const [shipping, setShipping] = useState(start.shipping);
  const [raw, setRaw] = useState(card.raw); // what they'd pay: starts at TCGplayer's Near Mint market price
  const [feePercent, setFeePercent] = useState(Math.round(EBAY_FEE.rate * 10000) / 100); // eBay's rate, or the member's own
  const feeRate = feePercent / 100;

  const t = GRADE_TARGETS[target];
  const co = GRADING_COMPANIES[t.grader];
  const c = useMemo(() => ({ ...card, raw }), [card, raw]);
  const m = gradingMath(c, target, tier, { own, shipping, feeRate });
  const flip = m && scoreOf(c, target, m);
  const spend = m && raw + m.cost;
  const grades = c.grades[target] || {};
  const topShort = gradeLabel(t.grader, t.top);
  const sold = links.sold[target];
  // The level the numbers use, which a card's value can push above the one picked.
  const level = m?.tier ? co.tiers.indexOf(m.tier) : tier;

  // Every grader at its cheapest level that takes this card, best Flip Score first; no data last.
  const rows = useMemo(() => TARGETS.map((id) => {
    const r = gradingMath(c, id, 0, { shipping, feeRate });
    return { id, m: r, flip: r && scoreOf(c, id, r) };
  }).sort((a, b) => (b.flip?.score ?? -1) - (a.flip?.score ?? -1) || (b.m?.profit10 ?? 0) - (a.m?.profit10 ?? 0)), [c, shipping, feeRate]);

  const pick = (id) => {
    if (GRADE_TARGETS[id].grader !== t.grader) { setTier(0); setOwn(null); } // another company's levels: start at its cheapest
    setTarget(id);
  };

  const parts = flip && [
    { key: "profit", label: "Profit", say: `${money(m.profit10)} as a ${m.topName}` },
    { key: "return", label: "Return", say: `${pct(m.profit10 / spend)} on the ${money(spend)} you put in` },
    { key: "safety", label: "Grade downside", say: m.profit9 === null ? `No recent ${m.nextName} sales` : `${plus(m.profit9)} as a ${m.nextName}` },
    { key: "demand", label: "Demand", say: `${grades.topSales ?? 0} ${m.topName} ${grades.topSales === 1 ? "sale" : "sales"} in 90 days${(grades.topSales ?? 0) < THIN_SALES ? `: under ${THIN_SALES} can't score Excellent` : ""}` },
  ];

  return (
    <>
      <section className="panel fd-head">
        <CardThumb item={card} width={140} />
        <div className="fd-head-main">
          <div className="fd-head-top">
            <div className="fd-title">
              <h1 className="fd-name">{cardTitle(card)}</h1>
              <span className="fd-set">{card.setName}{card.language === "japanese" ? " · Japanese" : ""}</span>
              {flip && (
                <span className={`gr-score ${flip.tier.key} fd-pill`} aria-label={`Flip Score ${flip.score.toFixed(1)} out of 10, ${flip.tier.label}`}>
                  <b>{flip.score.toFixed(1)} / 10</b>
                  <span>{flip.tier.key === "long" ? flip.tier.label : `${flip.tier.label} flip`}</span>
                </span>
              )}
            </div>
            {m && (
              <div className="fd-head-profit">
                <div className={`fd-big ${tone(m.profit10)}`}>{plus(m.profit10)}</div>
                <span className="muted">{m.profit10 >= 0 ? "profit" : "loss"} as a {m.topName}</span>
              </div>
            )}
          </div>
          {!m && <p className="muted fd-none">No reliable {targetName(target)} sales for this card yet. Pick another grade below.</p>}
          <div className="fd-links">
            <a className="btn" href={links.raw.href} target="_blank" rel={`noopener noreferrer${links.raw.affiliate ? " sponsored" : ""}`}>Find raw copies on eBay ↗</a>
            {sold && <a className="btn" href={sold.href} target="_blank" rel={`noopener noreferrer${sold.affiliate ? " sponsored" : ""}`}>See sold {targetName(target)} copies ↗</a>}
            {links.raw.affiliate && <span className="small muted">Ad</span>}
            <Link className="fd-card-link" href={links.card} prefetch={false}>Full card page →</Link>
          </div>
        </div>
      </section>

      <section className="panel fd-flip">
        <h2>Your flip</h2>
        <p className="muted fd-flip-sub">Estimate your grading outcome</p>
        <div className="fd-controls">
          <label className="gr-field">
            <span className="small muted">Grade</span>
            <select value={target} onChange={(e) => pick(e.target.value)}>
              {TARGETS.map((id) => <option key={id} value={id}>{targetName(id)}</option>)}
            </select>
          </label>
          <label className="gr-field">
            <span className="small muted">Service level</span>
            <select value={own !== null ? "own" : String(level)} onChange={(e) => {
              if (e.target.value === "own") setOwn(co.tiers[level].fee);
              else { setOwn(null); setTier(Number(e.target.value)); }
            }}>
              {co.tiers.map((x, i) => <option key={x.name} value={i}>{x.name} · {fee(x.fee)}{x.days ? ` · ~${x.days} days` : ""}{x.max && m && m.top > x.max ? ` · cards up to $${x.max.toLocaleString("en-US")}` : ""}</option>)}
              <option value="own">My own price…</option>
            </select>
          </label>
          {own !== null && (
            <div className="gr-field">
              <span className="small muted">Fee per card</span>
              <MoneyInput value={own} onChange={setOwn} max={9999} label="Fee per card" />
            </div>
          )}
          <div className="gr-field">
            <span className="small muted">Raw purchase price</span>
            <MoneyInput value={raw} onChange={setRaw} max={100000} label="Raw purchase price" />
            <span className="small muted">
              {raw === card.raw ? <>Near Mint market: {money(card.raw)}</> : <button type="button" className="link-btn" onClick={() => setRaw(card.raw)}>Use Near Mint market: {money(card.raw)}</button>}
            </span>
          </div>
          <div className="gr-field">
            <span className="small muted">Shipping per card</span>
            <MoneyInput value={shipping} onChange={setShipping} max={999} label="Shipping per card" />
          </div>
          <div className="gr-field">
            <span className="small muted">eBay selling fee</span>
            <MoneyInput percent value={feePercent} onChange={setFeePercent} max={50} label="eBay selling fee percent" />
            <span className="small muted">Set it to 0 if you sell elsewhere</span>
          </div>
        </div>

        {m && (
          <>
            {m.bumped && <div className="notice warn fd-note"><Info />{m.tier.name} required: projected value exceeds the {co.tiers[tier].name} limit.</div>}
            {m.tier?.max && m.top > m.tier.max && <div className="notice warn fd-note"><Info />A {money(m.top)} card is over the ${m.tier.max.toLocaleString("en-US")} limit {t.grader} publishes for {m.tier.name}, its highest level. Check with {t.grader} what a card like this costs.</div>}
            {m.tier?.min > 1 && <div className="notice warn fd-note"><Info />{t.grader} {m.tier.name} needs at least {m.tier.min} cards in one submission.</div>}
            <div className="fd-outcomes">
              <Outcome main grade={m.topName} price={m.top} fee={m.feeTop} profit={m.profit10} spend={spend} count={grades.topSales} />
              <Outcome grade={m.nextName} price={m.next} fee={m.feeNext} profit={m.profit9} spend={spend} count={grades.nextSales} />
            </div>
            <div className="fd-total">
              <div className="fd-total-sum"><span>Total investment</span><b>{money(spend)}</b></div>
              <div className="fd-total-sum-line">Card {fee(raw)} + Grading {fee(m.tier ? m.tier.fee : own)} + Shipping {fee(shipping)}</div>
              <div className="fd-total-time">
                <span className="muted">Estimated turnaround</span>
                <b>{m.tier ? (m.tier.days ? `${m.tier.days} business days` : `Not published by ${t.grader}`) : "Depends on your grader"}</b>
              </div>
            </div>
            <BreakEven m={m} />
            <div className="notice small fd-check fd-check-in"><b>Double-check before you buy.</b> {FLIP_CHECK}</div>
          </>
        )}
      </section>

      {parts && (
        <section className="panel">
          <h2 className="fd-why">Why it scores {flip.score.toFixed(1)}</h2>
          <div className="fd-parts">
            {parts.map((p) => (
              <div key={p.key} className={`fd-part gr-score ${flip.tier.key}`}>
                <span className="fd-part-head"><b>{p.label}</b><span className="muted">{flip.parts[p.key]} / {FLIP_POINTS[p.key]}</span></span>
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
        {EBAY_FEE_NOTE} Grading fees are the graders&apos; published prices as of {GRADING_PRICES_MONTH}; pick &quot;My own price&quot; if yours differ.
        Check centering, corners, edges and surface before you buy: raw copies sold as &quot;Near Mint&quot; aren&apos;t always.
      </p>
    </>
  );
}

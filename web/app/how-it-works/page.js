import Link from "next/link";
import Source from "@/components/Source";

export const metadata = { title: "How it works" };

const CHECKS = [
  ["Exact card", "Set, number, printing, language, and grade or condition. Not sure? We skip it."],
  ["Real sales", "Value comes from what that exact card sold for in the last 30 days."],
  ["Red flags", "New sellers, overseas shipping and fishy wording are flagged on the alert."],
];

function StepOne() {
  return (
    <div className="mock">
      <div className="mock-title">Your filters</div>
      <div className="mock-chips">
        {["Charizard", "Umbreon", "PSA 9–10", "Raw: Near Mint", "Under $300", "20%+ below market"].map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="mock-line"><span>Card value</span><b>$30 and up</b></div>
      <div className="mock-line"><span>Ending within</span><b>10 minutes</b></div>
    </div>
  );
}

function StepTwo() {
  return (
    <div className="mock">
      <div className="mock-title">Watching now <span className="mock-live">● Live</span></div>
      <div className="mock-line"><Source name="ebay" /><span>Ending auctions</span><b>every minute</b></div>
      <div className="mock-line"><Source name="tcgplayer" /><span>Price alerts</span><b>daily prices</b></div>
      <div className="mock-line"><span>Your collection</span><b>valued daily</b></div>
    </div>
  );
}

function StepThree() {
  return (
    <div className="mock alert-mock">
      <div className="mock-title lime">⚡ It&apos;s time to Boogie</div>
      <b>Charizard ex · 151 · 199/165 · Near Mint</b>
      <div className="mock-line"><span>Current bid + shipping</span><b className="lime">$259</b></div>
      <div className="mock-line"><span>Sells for (30 days, 14 sales)</span><b>$318</b></div>
      <div className="mock-line"><span>Time left</span><b>6 min</b></div>
      <span className="btn primary sm" aria-hidden="true">Open listing ↗</span>
    </div>
  );
}

const STEPS = [
  ["Tell us what you want", "Pick the cards, grades and budget you care about. Change it anytime.", <StepOne key="1" />],
  ["We keep watch", "Every ending eBay auction and the TCGplayer prices you follow, around the clock.", <StepTwo key="2" />],
  ["You make the move", "The alert has the price, what it really sells for, and the time left. Bid or pass.", <StepThree key="3" />],
];

export default function HowItWorks() {
  return (
    <div className="wrap section how">
      <h2>Up and running in 3 steps</h2>
      <p className="sub">Set it up once. Takes about a minute.</p>

      <div className="how-steps">
        {STEPS.map(([title, body, mock], i) => (
          <div className="how-step" key={title}>
            <div className="how-copy">
              <span className="step-num">{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
            {mock}
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 56 }}>What we check on every deal</h2>
      <div className="grid" style={{ marginTop: 20 }}>
        {CHECKS.map(([t, b]) => (
          <div className="card" key={t}><h3>✓ {t}</h3><p>{b}</p></div>
        ))}
      </div>

      <p className="hint" style={{ textAlign: "center", marginTop: 24 }}>
        Values are estimates from past sales. Auctions often jump at the end, so bid what you&apos;re comfortable with.
      </p>
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <Link href="/login?mode=signup" className="btn primary lg">Start free ↗</Link>
        <div className="hint">Free forever. No card needed.</div>
      </div>
    </div>
  );
}

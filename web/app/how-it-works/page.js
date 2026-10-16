import Link from "next/link";

export const metadata = { title: "How it works" };

const steps = [
  ["We watch eBay", "Every minute or so, TCG Boogie checks graded Pokémon slabs and raw cards whose auctions are about to end."],
  ["We identify the exact card", "Set, card number, printing (holo, reverse holo, 1st Edition), language, grader and grade, or raw condition. If a listing is ambiguous, we skip it rather than guess."],
  ["We price it from real sales", "Market value comes from what that exact card sold for over the last 30 days. Thin or inconsistent data means no alert."],
  ["We check for red flags", "New or low-feedback sellers, international shipping, missing cert numbers, and suspicious wording are flagged right on the alert."],
  ["Your filters decide", "Only deals that match one of your filter profiles reach you: your cards, sets, grades, budget and discount."],
  ["You act in time", "Premium alerts arrive instantly on Discord or your phone, with the listing, the comps, and the time left."],
];

export default function HowItWorks() {
  return (
    <div className="wrap section">
      <h2>How TCG Boogie finds deals</h2>
      <p className="sub">The same checks a careful collector would make, done automatically on every ending auction.</p>
      <div className="grid">
        {steps.map(([title, body], i) => (
          <div className="card" key={title}>
            <div className="step-num">{i + 1}</div>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <div className="notice" style={{ marginTop: 28 }}>
        Values are estimates from past sales, not guarantees. Auctions often rise in the final seconds, so set a maximum
        bid you're comfortable with. Raw card conditions are the seller's own description.
      </div>
      <div style={{ textAlign: "center", marginTop: 28 }}>
        <Link href="/login?mode=signup" className="btn primary lg">Start free</Link>
      </div>
    </div>
  );
}

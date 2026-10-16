const features = [
  {
    title: "Watches every auction",
    body: "Graded slabs and raw cards on eBay, checked around the clock as auctions approach their end.",
  },
  {
    title: "Real market value",
    body: "Each card is priced from what the same card, grade, or condition actually sold for in the last 30 days.",
  },
  {
    title: "Your filters, your deals",
    body: "Pick the cards, sets, grades, conditions, and discounts you care about. Only those reach you.",
  },
  {
    title: "Alerts in seconds",
    body: "Instant notifications on Discord or your phone, with the listing, the comps, and the time left.",
  },
];

export default function Home() {
  return (
    <div className="wrap">
      <section className="hero">
        <h1>
          Find underpriced cards <em>before the auction ends</em>
        </h1>
        <p>
          TCG Boogie scans eBay for graded and raw trading cards listed well below what they really sell for, and
          tells you in time to act.
        </p>
        <div className="example" aria-label="Example alert">
          <div className="tag">42% below market · 6 min left</div>
          <div className="name">Umbreon VMAX · Evolving Skies 215/203 · PSA 10</div>
          <div className="meta">Current bid + shipping $2,180 · 30-day market $3,750 from 46 sales</div>
        </div>
      </section>

      <section className="grid">
        {features.map((f) => (
          <div className="card" key={f.title}>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState } from "react";


// `cards` is rendered on the server (CardArt), keyed by deal name.
export default function DealTabs({ deals, cards }) {
  const [saved, setSaved] = useState({});
  const [toast, setToast] = useState("");
  const timer = useRef();

  function toggle(name) {
    const on = !saved[name];
    setSaved((s) => ({ ...s, [name]: on }));
    setToast(on ? "Saved. Sign up to turn this into a real alert." : "Removed from your preview list.");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2200);
  }

  return (
    <>
      <div className="deal-grid">
        {deals.map((d) => (
            <article className="deal-card" key={d.name}>
              <div className="art">
                <span className="art-tag">{d.tag}</span>
                <button className="save" aria-label={`Save ${d.name}`} aria-pressed={!!saved[d.name]} onClick={() => toggle(d.name)}>
                  {saved[d.name] ? "★" : "☆"}
                </button>
                {cards[d.name]}
              </div>
              <div className="info">
                <span className="category">POKÉMON</span>
                <h3>{d.name}</h3>
                <div className="meta">{d.meta}</div>
                <div className="prices">
                  <div><span className="price">${d.price}</span><span className="old">${d.market}</span></div>
                  <span className="discount">↓ {d.off}%</span>
                </div>
                <div className="bottom">
                  <span>◷ {d.left} left · Example</span>
                  <Link href="/login?mode=signup">Set an alert ↗</Link>
                </div>
              </div>
            </article>
          ))}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

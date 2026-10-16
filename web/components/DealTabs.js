"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const TABS = [
  ["all", "All games"],
  ["pokemon", "Pokémon"],
  ["magic", "Magic: The Gathering"],
  ["lorcana", "Disney Lorcana"],
  ["other", "More TCGs +"],
];
const NAMES = { magic: "Magic: The Gathering", lorcana: "Disney Lorcana", other: "More trading card games" };

// `cards` is rendered on the server (CardArt), keyed by deal name.
export default function DealTabs({ deals, cards }) {
  const [tab, setTab] = useState("all");
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
      <div className="tabs" role="tablist" aria-label="Filter example deals">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="deal-grid">
        {tab === "all" || tab === "pokemon" ? (
          deals.map((d) => (
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
          ))
        ) : (
          <div className="empty">
            <h3>A bigger universe of finds.</h3>
            <p>{NAMES[tab]} is on our roadmap. Today, TCG Boogie covers Pokémon cards.</p>
            <Link className="btn primary" href="/login?mode=signup">Start with Pokémon ↗</Link>
          </div>
        )}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

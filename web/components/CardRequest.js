"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestCard } from "@/app/app/collection/actions";

/**
 * Under card searches (and on set pages): "Can't find it? Request it" with a link to the card or sealed product.
 * TCGplayer links are added at once; other links are read and added when we can tell what they are.
 */
export default function CardRequest({ query, label = "Can’t find it? Request a card or sealed product →", kind: startKind = "card" }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [kind, setKind] = useState(startKind);
  const [res, setRes] = useState(null);
  const [pending, start] = useTransition();
  if (!open) {
    return <button type="button" className="link-btn small card-request-open" data-tour="request-open" onClick={() => { setOpen(true); setRes(null); }}>{label}</button>;
  }
  const send = (e) => {
    e.preventDefault();
    start(async () => setRes(await requestCard(query, link, kind)));
  };
  return (
    <div className="card-request">
      {res ? (
        <div className={`notice ${res.status === "declined" ? "bad" : res.status === "pending" ? "" : "good"}`} style={{ margin: 0 }}>
          {res.message}{" "}
          {res.product && <Link href={`/app/cards/${encodeURIComponent(res.product.id)}${res.product.language === "japanese" ? "?lang=japanese" : ""}`}>Open {res.product.name} →</Link>}
          {res.status === "declined" && <button type="button" className="link-btn" onClick={() => setRes(null)}>Try again</button>}
        </div>
      ) : (
        <form onSubmit={send} className="card-request-form">
          <div className="seg card-request-kind" data-tour="request-kind" role="radiogroup" aria-label="What are you looking for?">
            {[["card", "A card"], ["sealed", "A sealed product"]].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <label className="small" htmlFor="cr-link">
            Paste a link to the {kind === "sealed" ? "product (booster box, ETB, tin…)" : "card"} on TCGplayer, eBay or a card database and we&apos;ll add it.
            Anything our price service doesn&apos;t cover, like many Korean and Chinese {kind === "sealed" ? "products" : "cards"}, is added without prices.
          </label>
          <div className="row" style={{ gap: 8 }}>
            <input id="cr-link" data-tour="request-link" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" required value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.tcgplayer.com/product/…" />
            <button className="btn sm primary" data-tour="request-send" style={{ flex: "none" }} disabled={pending || !link.trim()}>{pending ? "Adding…" : "Send"}</button>
            <button type="button" className="btn sm ghost" style={{ flex: "none" }} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {query && <span className="small muted">Searching for: “{query}”</span>}
        </form>
      )}
    </div>
  );
}

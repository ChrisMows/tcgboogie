"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestCard } from "@/app/app/collection/actions";

/** Under card searches: "Can't find it? Request it" with a link to the card (TCGplayer links are added at once). */
export default function CardRequest({ query }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [res, setRes] = useState(null);
  const [pending, start] = useTransition();
  if (!open) {
    return <button type="button" className="link-btn small card-request-open" onClick={() => { setOpen(true); setRes(null); }}>Can&apos;t find it? Request a card →</button>;
  }
  const send = (e) => {
    e.preventDefault();
    start(async () => setRes(await requestCard(query, link)));
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
          <label className="small" htmlFor="cr-link">Paste a link to the card (TCGplayer, eBay, a card database…) and we&apos;ll add it. Cards our price service doesn&apos;t cover, like many Korean and Chinese cards, are added without prices.</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="cr-link" type="url" required value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.tcgplayer.com/product/…" />
            <button className="btn sm primary" style={{ flex: "none" }} disabled={pending || !link.trim()}>{pending ? "Adding…" : "Send"}</button>
            <button type="button" className="btn sm ghost" style={{ flex: "none" }} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <span className="small muted">Searching for: “{query}”</span>
        </form>
      )}
    </div>
  );
}

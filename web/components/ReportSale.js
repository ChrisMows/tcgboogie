"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportSaleAction } from "@/app/app/cards/[id]/actions";

/** "Saw a sale we're missing?" Paste an eBay link; we verify it through eBay's API and add it to this card's sales. */
export default function ReportSale({ productId, language }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open) {
    return <button type="button" className="link-btn small report-sale-open" onClick={() => setOpen(true)}>Saw a sale we&apos;re missing? Report it</button>;
  }
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const r = await reportSaleAction(productId, language, link);
      setResult(r);
      if (r.ok) { setLink(""); router.refresh(); }
    });
  };
  return (
    <form className="report-sale" onSubmit={submit}>
      <label className="small" htmlFor="sale-link">Paste the eBay link of a sold listing for this card (graded)</label>
      <div className="row" style={{ gap: 8 }}>
        <input id="sale-link" type="url" inputMode="url" placeholder="https://www.ebay.com/itm/…" value={link} onChange={(e) => setLink(e.target.value)} required />
        <button className="btn sm primary" style={{ flex: "none" }} disabled={pending}>{pending ? "Checking…" : "Add sale"}</button>
      </div>
      {result && <div className={`small ${result.ok ? "good" : "muted"}`} style={{ marginTop: 6 }}>{result.message}</div>}
      <div className="hint" style={{ margin: "4px 0 0" }}>We check it with eBay directly: it has to have sold, and be this card and grade.</div>
    </form>
  );
}

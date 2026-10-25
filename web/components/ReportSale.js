"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportSaleAction } from "@/app/app/cards/[id]/actions";

/** "Saw a sale we're missing?" Paste an eBay link; we verify it through eBay's API and add it to this card's sales. */
export default function ReportSale({ productId, language }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [soldOn, setSoldOn] = useState("");
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  // The "Price wrong?" button at the top of the page links here (#report-sale) and opens the form.
  useEffect(() => {
    const show = () => {
      setOpen(true);
      setTimeout(() => {
        document.getElementById("report-sale")?.scrollIntoView({ block: "center" });
        document.getElementById("sale-link")?.focus({ preventScroll: true });
      }, 60);
    };
    if (window.location.hash === "#report-sale") show();
    const onClick = (e) => { if (e.target.closest?.('a[href="#report-sale"]')) { e.preventDefault(); show(); } };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!open) {
    return (
      <div id="report-sale">
        <button type="button" className="btn sm report-sale-open" onClick={() => setOpen(true)}>✎ Report a sale we&apos;re missing</button>
      </div>
    );
  }
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const r = await reportSaleAction(productId, language, link, soldOn || null);
      setResult(r);
      if (r.ok) { setLink(""); setSoldOn(""); router.refresh(); }
    });
  };
  return (
    <form className="report-sale" id="report-sale" onSubmit={submit}>
      <label className="small" htmlFor="sale-link">Paste the eBay link of a sold, completed listing for this card (graded)</label>
      <div className="row" style={{ gap: 8 }}>
        <input id="sale-link" autoFocus type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://www.ebay.com/itm/…" value={link} onChange={(e) => setLink(e.target.value)} required />
        <button className="btn sm primary" style={{ flex: "none" }} disabled={pending}>{pending ? "Checking…" : "Add sale"}</button>
      </div>
      {(result?.needDate || soldOn) && (
        <label className="small report-sale-date">Sold on (the date eBay shows)
          <input type="date" value={soldOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSoldOn(e.target.value)} required={Boolean(result?.needDate)} />
        </label>
      )}
      {result && <div className={`small ${result.ok ? "good" : "muted"}`} style={{ marginTop: 6 }}>{result.message}</div>}
      <div className="hint" style={{ margin: "4px 0 0" }}>eBay links only. We check it with eBay directly: it has to have sold and ended, and be this card and grade.</div>
    </form>
  );
}

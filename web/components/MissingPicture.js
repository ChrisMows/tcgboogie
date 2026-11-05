"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportPictureAction } from "@/app/app/cards/[id]/actions";

/** "Missing picture?" on a card page: we look for the picture right away, or ask the admin (lib/card-images.js). */
export default function MissingPicture({ productId, language }) {
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const click = () => start(async () => {
    const r = await reportPictureAction(productId, language);
    setResult(r);
    if (r.status === "fixed") router.refresh();
  });
  return (
    <span className="price-wrong">
      <button type="button" className="btn price-wrong-btn" title="Blank picture? We'll find it, or ask a person to add it." onClick={click} disabled={pending || (result && result.status !== "error")}>
        {pending ? "Looking for it…" : result?.status === "fixed" ? "✓ Picture added" : <>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></svg>
          Missing photo?
        </>}
      </button>
      {result && <span className={`price-wrong-tip picture-result ${result.status}`} role="status">{result.message}</span>}
    </span>
  );
}

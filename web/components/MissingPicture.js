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
        {pending ? "Looking for it…" : result?.status === "fixed" ? "✓ Picture added" : "📷 Missing picture?"}
      </button>
      {result && <span className={`price-wrong-tip picture-result ${result.status}`} role="status">{result.message}</span>}
    </span>
  );
}

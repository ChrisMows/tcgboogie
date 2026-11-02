"use client";

import { useEffect, useState } from "react";

/** The shared profile's link, with Copy (and the phone's Share sheet where there is one). */
export default function ShareLink({ url }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(Boolean(navigator.share)), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is selectable */ }
  };
  const share = async () => {
    try { await navigator.share({ title: "My TCG Boogie profile", url }); } catch { /* cancelled */ }
  };
  return (
    <div className="prof-link-box">
      <input readOnly value={url} aria-label="Your profile link" onFocus={(e) => e.target.select()} />
      <button type="button" className="btn sm" onClick={copy}>{copied ? "✓ Copied" : "Copy"}</button>
      {canShare && <button type="button" className="btn sm" onClick={share}>Share</button>}
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn sm">View</a>
    </div>
  );
}

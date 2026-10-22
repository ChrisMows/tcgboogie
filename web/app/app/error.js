"use client";

import { useEffect } from "react";

// Errors that mean "this page is from an older version of the site" (we deployed while it was open):
// reload once to pick up the new version instead of showing an error.
const STALE = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|Server Action|deployment/i;

export default function AppError({ error, reset }) {
  const stale = STALE.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem("tcgb-reloaded") || 0);
      if (Date.now() - last < 30000) return; // already tried: show the message instead of looping
      sessionStorage.setItem("tcgb-reloaded", String(Date.now()));
    } catch { /* storage blocked: reload anyway */ }
    window.location.reload();
  }, [stale]);

  return (
    <div className="panel" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
      <h2 style={{ marginTop: 0 }}>{stale ? "Updating to the latest version…" : "Something went wrong"}</h2>
      <p className="muted">
        {stale
          ? "TCG Boogie was just updated. Reloading the page…"
          : "That didn't load properly. Anything you saved is safe. Try again, and if it keeps happening, let us know at support@tcgboogie.com."}
      </p>
      {!stale && <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>}
    </div>
  );
}

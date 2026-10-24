"use client";

/** A link that opens the site helper (components/HelperChat.js). */
export default function AskHelper({ label = "Ask the helper" }) {
  return <button type="button" className="link-btn" onClick={() => window.dispatchEvent(new Event("tcgb-helper-open"))}>{label}</button>;
}

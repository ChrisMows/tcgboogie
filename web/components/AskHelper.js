"use client";

/** A link that opens Boogie Bot, the site helper (components/HelperChat.js). */
export default function AskHelper({ label = "Ask Boogie Bot" }) {
  return <button type="button" className="link-btn" onClick={() => window.dispatchEvent(new Event("tcgb-helper-open"))}>{label}</button>;
}

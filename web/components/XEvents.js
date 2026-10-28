"use client";

import { useEffect } from "react";

// X (Twitter) conversion events for our ads (the base pixel is in app/layout.js). Each fires once per member, from
// their browser, with a conversion ID so X never counts it twice; no names or emails are sent (privacy policy).
// Event IDs come from X's Events Manager for pixel ri3dv.
export const X_EVENTS = {
  signup: "tw-ri3dv-ri4cm", // Sign up: a new account
  purchase: "tw-ri3dv-ri4co", // Purchase: Premium paid straight away (no trial), with its price
  trial: null, // Start trial: the 7-day Premium trial (add its event ID from X's Events Manager)
};

/** Fire an X event once per key (remembered on this device), when X's pixel has loaded. */
function fireOnce(event, key, params = {}) {
  const id = X_EVENTS[event];
  if (!id) return;
  const flag = `tcgb-x-${event}-${key}`;
  try { if (localStorage.getItem(flag)) return; } catch { /* storage blocked: X dedupes by conversion ID */ }
  let tries = 0;
  const go = () => {
    if (typeof window.twq !== "function") { if (++tries < 20) setTimeout(go, 500); return; } // the pixel loads after the page
    window.twq("event", id, { conversion_id: `${event}-${key}`, ...params });
    try { localStorage.setItem(flag, "1"); } catch { /* fine */ }
  };
  go();
}

/** In the member area: Sign up when this account was created in the last 30 minutes (the first pages after joining). */
export default function XEvents({ userId, newMember }) {
  useEffect(() => {
    if (userId && newMember) fireOnce("signup", userId);
  }, [userId, newMember]);
  return null;
}

/**
 * Back from Stripe checkout (Settings, "Welcome to Premium"): Purchase with the price, or Start trial, once per
 * subscription. The first charge after a trial happens later on Stripe's side, where no browser can report it.
 */
export function XCheckout({ trial, subscriptionId, price }) {
  useEffect(() => {
    if (!subscriptionId) return;
    if (trial) fireOnce("trial", subscriptionId);
    else fireOnce("purchase", subscriptionId, { value: Number(price), currency: "USD" });
  }, [trial, subscriptionId, price]);
  return null;
}

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const SRC_KEY = "tcgb-src"; // what first brought this browser here (utm_source / campaign, or the referring site)
const SENT_KEY = "tcgb-src-sent"; // already credited to a sign-up

/**
 * Counts page views for Admin → Traffic: one small request per page, no cookies (app/api/pv). The first page of a
 * visit also says which site or campaign link brought the visitor. That source is remembered in this browser, and
 * when a new member signs up it's sent once so sign-ups can be credited to what brought them.
 */
export default function PageViews({ signedIn }) {
  const path = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    let ref = "", source = "", signupSource = "";
    try {
      const firstPage = !sessionStorage.getItem("tcgb-pv");
      sessionStorage.setItem("tcgb-pv", "1");
      if (firstPage && document.referrer) {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (host !== location.hostname.replace(/^www\./, "")) ref = host;
      }
      const utm = [search.get("utm_source"), search.get("utm_campaign")].filter(Boolean).join(" / ");
      if (firstPage) source = utm;
      if ((utm || ref) && !localStorage.getItem(SRC_KEY)) localStorage.setItem(SRC_KEY, utm || ref);
      if (signedIn && !localStorage.getItem(SENT_KEY)) {
        signupSource = localStorage.getItem(SRC_KEY) || "direct";
        localStorage.setItem(SENT_KEY, "1");
      }
    } catch { /* storage blocked: count the view anyway */ }
    const body = JSON.stringify({ path, ref, source, signupSource });
    try {
      if (!navigator.sendBeacon?.("/api/pv", new Blob([body], { type: "application/json" }))) {
        fetch("/api/pv", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch { /* never let counting break a page */ }
  }, [path, search, signedIn]);

  return null;
}

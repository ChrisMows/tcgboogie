import { NextResponse } from "next/server";
import { allow } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { bump, creditSignup, firstVisitToday } from "@/lib/traffic";

// Visit counting for Admin → Traffic (components/PageViews.js sends one of these per page). No cookies: see
// lib/traffic.js. Body: { path, ref?, source?, signupSource? }. Always answers 204 so it never shows as an error.
export const dynamic = "force-dynamic";

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python/i;
const SKIP = /^\/(app\/admin|app\/logs|api)(\/|$)/;

/** "/app/cards/123456" -> "/app/cards/[id]": one row per kind of page, not per card. */
function pageKey(path) {
  const p = String(path || "/").split(/[?#]/)[0].slice(0, 120) || "/";
  return p
    .replace(/^\/app\/cards\/[^/]+/, "/app/cards/[id]")
    .replace(/^\/app\/collection\/sell\/[^/]+/, "/app/collection/sell/[id]")
    .replace(/^\/app\/collection\/sets\/[^/]+/, "/app/collection/sets/[set]")
    .replace(/\/+$/, "") || "/";
}
const clean = (s, n = 80) => String(s || "").toLowerCase().replace(/[^a-z0-9._\-/ ]+/g, "").trim().slice(0, n);

export async function POST(req) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOTS.test(ua)) return done;
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
    if (!await allow("pageView", ip)) return done;
    const body = await req.json().catch(() => ({}));
    const path = pageKey(body.path);
    if (SKIP.test(path)) return done;

    await bump("view", path);
    if (await firstVisitToday(ip, ua)) {
      await bump("visitor", "all");
      const ref = clean(body.ref);
      if (ref && !/(^|\.)tcgboogie\.com$/.test(ref)) await bump("ref", ref);
      const source = clean(body.source);
      if (source) await bump("source", source);
    }
    // A new member's first page after signing up: credit what first brought them (kept in their browser till now).
    if (body.signupSource) {
      const user = await getCurrentUser().catch(() => null);
      if (user && !user.demo && user.createdAt && Date.now() - new Date(user.createdAt).getTime() < 3 * 86400000) {
        await creditSignup(user.id, clean(body.signupSource) || "direct");
      }
    }
  } catch { /* counting must never fail a page */ }
  return done;
}

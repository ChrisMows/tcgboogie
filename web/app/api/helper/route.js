import { NextResponse } from "next/server";
import { askHelper, MAX_QUESTION } from "@/lib/helper";
import { allow } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

// The site helper (components/HelperChat.js). Body: { messages: [{ role, text }], page }. Daily limits per visitor
// (by IP), Free member and Premium member keep the Anthropic bill bounded.
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ answer: "The helper isn't switched on yet. Email support@tcgboogie.com and we'll help.", failed: true });
  const body = await req.json().catch(() => ({}));
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, m.role === "user" ? MAX_QUESTION : 4000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const bucket = !user ? "helperVisitor" : user.tier === "premium" ? "helperPremium" : "helperFree";
  if (!await allow(bucket, user ? user.id : ip)) {
    const answer = !user
      ? "That's all the questions for today without an account. [Sign up free](/login?mode=signup) to ask more, or see the [FAQ](/faq)."
      : "You've asked a lot of questions today, so the helper is taking a break until tomorrow. The [FAQ](/faq) covers most things, or email support@tcgboogie.com.";
    return NextResponse.json({ answer, limited: true });
  }
  const page = String(body.page || "/").split(/[?#]/)[0].slice(0, 120);
  return NextResponse.json(await askHelper({ messages, user, page }));
}

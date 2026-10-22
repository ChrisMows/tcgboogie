import { NextResponse } from "next/server";
import { applyUnsubscribe, validUnsubscribe } from "@/lib/unsubscribe";

// The unsubscribe link in every member email. Mail apps' one-click "Unsubscribe" POSTs here and it takes effect at
// once. Opening the link in a browser shows a confirm page first, so link scanners that open every URL in an email
// don't unsubscribe anyone by accident.
const params = (req) => {
  const q = new URL(req.url).searchParams;
  return { u: q.get("u"), k: q.get("k"), t: q.get("t") };
};

export async function POST(req) {
  const { u, k, t } = params(req);
  if (!validUnsubscribe(u, k, t)) return new NextResponse("Invalid unsubscribe link", { status: 400 });
  await applyUnsubscribe(u, k);
  return new NextResponse("Unsubscribed", { status: 200 });
}

export async function GET(req) {
  const { u, k, t } = params(req);
  const to = new URL("/unsubscribe", req.url);
  if (u) to.searchParams.set("u", u);
  if (k) to.searchParams.set("k", k);
  if (t) to.searchParams.set("t", t);
  return NextResponse.redirect(to);
}

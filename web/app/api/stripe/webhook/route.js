import { handleWebhook } from "@/lib/billing";

// Stripe calls this when a payment, renewal, failure or cancellation happens. Signed by Stripe; see lib/billing.js.
export const dynamic = "force-dynamic";

export async function POST(req) {
  const raw = await req.text();
  const status = await handleWebhook(raw, req.headers.get("stripe-signature"));
  return new Response(status === 200 ? "ok" : "no", { status });
}

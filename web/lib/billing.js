import "server-only";

// Billing (Stripe). Card payments aren't live yet; this holds the safety rules that must hold once they are.
//   STRIPE_SECRET_KEY  set on Hostinger when payments launch

export const billingLive = () => Boolean(process.env.STRIPE_SECRET_KEY);

/**
 * Stop all billing for a member before their account is deleted: deletes their Stripe customer, which cancels every
 * subscription immediately (no further charges) and removes saved payment methods. Stripe keeps past invoices.
 * Throws if Stripe can't confirm, so the caller must NOT delete the account in that case.
 */
export async function endBillingForDeletion(user) {
  if (!user?.stripeCustomerId) return { ended: false, reason: "no-customer" };
  if (!billingLive()) {
    // A customer exists but we can't reach Stripe: refuse rather than leave a subscription charging.
    throw new Error("Billing isn't configured, so the subscription couldn't be cancelled.");
  }
  const r = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(user.stripeCustomerId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    cache: "no-store",
  });
  // 404 = already deleted on Stripe's side: nothing left to charge.
  if (r.status === 404) return { ended: true, reason: "already-gone" };
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.deleted !== true) throw new Error(`Stripe didn't confirm the cancellation (${r.status}).`);
  return { ended: true };
}

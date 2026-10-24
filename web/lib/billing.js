import "server-only";
import crypto from "node:crypto";
import { and, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/notify";
import { PLANS, planFor } from "@/lib/plans";
import { TERMS_VERSION } from "@/lib/terms";

// Billing (Stripe Checkout + Customer Portal), called over Stripe's REST API.
//   STRIPE_SECRET_KEY      sk_test_… while testing, sk_live_… once launched (set on Hostinger)
//   STRIPE_WEBHOOK_SECRET  optional: whsec_… from the Stripe dashboard. Without it, the admin panel's
//                          "Set up Stripe" button creates the webhook and keeps its secret in the database.

const { users, appSettings, stripeEvents } = schema;
const SITE = process.env.AUTH_URL || "https://tcgboogie.com";
const PRICE_KEY = "tcgboogie_premium_monthly"; // Stripe lookup key for the Premium price
const TAX_CODE = "txcd_10103001"; // Stripe tax code: Software as a service (SaaS), personal use
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
];

export const billingLive = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const billingMode = () => (String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_") ? "live" : "test");

/** Stripe statuses that keep Premium on. past_due = a renewal failed and Stripe is retrying the card. */
const PAID = ["active", "trialing", "past_due"];
export const hasLiveSubscription = (user) => Boolean(user?.stripeSubscriptionId) && PAID.includes(user.subscriptionStatus);

/**
 * Free-trial days this member would get at checkout (Admin → Plans → Billing). Only a member's first subscription:
 * anyone who has subscribed before (even if it ended) pays from day one.
 */
export const trialDaysFor = (user) => (user?.stripeSubscriptionId ? 0 : Math.max(0, Number(planFor("premium").trialDays) || 0));
export const onTrial = (user) => hasLiveSubscription(user) && user.subscriptionStatus === "trialing";
const longDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

// ---------- Stripe API ----------

/** Flatten { a: { b: 1 }, c: [x] } into Stripe's form encoding: a[b]=1&c[0]=x */
function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, path, params) {
  if (!billingLive()) throw new Error("Payments aren't set up yet.");
  const url = `https://api.stripe.com/v1/${path}`;
  const body = params && method !== "GET" ? form(params) : undefined;
  const q = params && method === "GET" ? `?${form(params)}` : "";
  const r = await fetch(url + q, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body,
    cache: "no-store",
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(json?.error?.message || `Stripe said ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

// ---------- Settings kept in the database (per mode, so test and live never mix) ----------

async function getSetting(key) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}
async function putSetting(key, value) {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/**
 * The Stripe price for Premium. Found by lookup key; if it's missing, or its amount no longer matches
 * lib/plans.js, a new one is created and takes over the key (existing subscribers keep the price they signed up at).
 */
export async function premiumPrice() {
  const cents = Math.round(PLANS.premium.price * 100);
  const found = await stripe("GET", "prices", { lookup_keys: [PRICE_KEY], active: "true", limit: 1, expand: ["data.product"] });
  const p = found.data?.[0];
  // Stripe Tax needs a tax code on the product: Premium is a software subscription for personal use.
  if (p?.product && !p.product.tax_code) await stripe("POST", `products/${p.product.id}`, { tax_code: TAX_CODE });
  // Prices are before tax ("$X/month plus tax"). Stripe lets an unspecified price be set once.
  if (p && (!p.tax_behavior || p.tax_behavior === "unspecified")) await stripe("POST", `prices/${p.id}`, { tax_behavior: "exclusive" });
  if (p && p.unit_amount === cents && p.currency === "usd" && p.recurring?.interval === "month") return p.id;
  const product = p?.product?.id || (await stripe("POST", "products", {
    name: "TCG Boogie Premium",
    description: "Instant deal alerts, price alerts by text, Discord and email, and the full collection tracker.",
    statement_descriptor: "TCG BOOGIE",
    tax_code: TAX_CODE,
  })).id;
  await log("payments", "info", `Creating Stripe price $${PLANS.premium.price}/month`, { replaces: p?.id || null });
  const created = await stripe("POST", "prices", {
    product, currency: "usd", unit_amount: cents, recurring: { interval: "month" },
    lookup_key: PRICE_KEY, transfer_lookup_key: "true", nickname: `Premium $${PLANS.premium.price}/month`, tax_behavior: "exclusive",
  });
  return created.id;
}

/**
 * Is Stripe Tax switched on in the dashboard (for this mode)? Checkout adds sales tax only then, so checkout keeps
 * working before it's set up. Checked at most every 10 minutes.
 */
let taxCache = { at: 0, mode: "", active: false };
export async function taxActive() {
  const mode = billingMode();
  if (taxCache.mode === mode && Date.now() - taxCache.at < 10 * 60 * 1000) return taxCache.active;
  let active = false;
  try { active = (await stripe("GET", "tax/settings"))?.status === "active"; } catch { active = false; }
  taxCache = { at: Date.now(), mode, active };
  return active;
}

/**
 * Stripe's billing page (Settings → Billing → Manage): our own settings, so nothing has to be set up by hand in the
 * dashboard in each mode. Members can update their card, see invoices and receipts, and cancel at the end of the
 * period they've paid for. Kept per mode; updated when "Set up Stripe" is pressed again.
 */
const PORTAL = {
  business_profile: { headline: "TCG Boogie Premium", privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms` },
  features: {
    payment_method_update: { enabled: "true" },
    invoice_history: { enabled: "true" },
    customer_update: { enabled: "true", allowed_updates: ["email", "address", "name"] },
    subscription_cancel: { enabled: "true", mode: "at_period_end", cancellation_reason: { enabled: "true", options: ["too_expensive", "missing_features", "unused", "other"] } },
  },
  default_return_url: `${SITE}/app/account#plan`,
};

async function setupPortal(mode) {
  const saved = await getSetting(`stripe_portal_${mode}`);
  if (saved?.id) {
    try { await stripe("POST", `billing_portal/configurations/${saved.id}`, PORTAL); return saved.id; } catch (e) { if (e.status !== 404) throw e; }
  }
  const c = await stripe("POST", "billing_portal/configurations", PORTAL);
  await putSetting(`stripe_portal_${mode}`, { id: c.id });
  return c.id;
}

/** Create (or update) the webhook that tells the site about payments. Returns what happened, for the admin panel. */
export async function setupStripe() {
  const mode = billingMode();
  const url = `${SITE}/api/stripe/webhook`;
  const price = await premiumPrice();
  await setupPortal(mode);
  let saved = await getSetting(`stripe_webhook_${mode}`);
  if (saved?.id) {
    try {
      await stripe("POST", `webhook_endpoints/${saved.id}`, { url, enabled_events: EVENTS, disabled: "false" });
      await log("payments", "info", `Stripe set up (${mode} mode): billing page and webhook updated`, { price, url });
      return { mode, price, webhook: "updated" };
    } catch (e) {
      if (e.status !== 404) throw e;
      saved = null; // deleted in the dashboard: make a fresh one
    }
  }
  const hook = await stripe("POST", "webhook_endpoints", { url, enabled_events: EVENTS, description: "TCG Boogie website" });
  await putSetting(`stripe_webhook_${mode}`, { id: hook.id, secret: hook.secret, url });
  await log("payments", "info", `Stripe set up (${mode} mode): billing page set and webhook created`, { price, url, webhook: hook.id });
  return { mode, price, webhook: "created" };
}

async function webhookSecret() {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  return (await getSetting(`stripe_webhook_${billingMode()}`))?.secret || null;
}

/** For the admin status page. */
export async function billingStatus() {
  if (!billingLive()) return { ok: false, detail: "No STRIPE_SECRET_KEY yet" };
  const mode = billingMode();
  const hook = process.env.STRIPE_WEBHOOK_SECRET ? "env" : (await getSetting(`stripe_webhook_${mode}`))?.id;
  if (!hook) return { ok: false, mode, detail: `${mode === "live" ? "Live" : "Test"} key added. Press “Set up Stripe” to finish.` };
  try {
    await stripe("GET", "prices", { lookup_keys: [PRICE_KEY], limit: 1 });
    const tax = (await taxActive()) ? "sales tax added automatically" : "sales tax off: turn on Stripe Tax in the Stripe dashboard";
    return { ok: true, mode, detail: `${mode === "live" ? "Live: real cards are charged" : "Test mode: fake cards only, no real money"} · ${tax}` };
  } catch (e) {
    return { ok: false, mode, detail: `Stripe: ${e.message}` };
  }
}

// ---------- Member flows ----------

async function customerFor(user) {
  if (user.stripeCustomerId) {
    try {
      const c = await stripe("GET", `customers/${encodeURIComponent(user.stripeCustomerId)}`);
      if (!c.deleted) return c.id;
    } catch (e) {
      if (e.status !== 404) throw e; // 404: e.g. a test-mode customer after switching to live keys
    }
  }
  const c = await stripe("POST", "customers", { email: user.email, name: user.name || undefined, metadata: { userId: user.id } });
  await db.update(users).set({ stripeCustomerId: c.id }).where(eq(users.id, user.id));
  await log("payments", "info", "Stripe customer created", { customer: c.id }, user.id);
  return c.id;
}

/** Start Checkout for Premium. Returns the Stripe-hosted page to send the member to. */
export async function checkoutUrl(user) {
  const [customer, price, tax] = await Promise.all([customerFor(user), premiumPrice(), taxActive()]);
  let trial = trialDaysFor(user);
  if (trial) {
    // Belt and braces: no trial if this Stripe customer has ever had a subscription.
    const past = await stripe("GET", "subscriptions", { customer, status: "all", limit: 1 }).catch(() => null);
    if (!past || past.data?.length) trial = 0;
  }
  const firstCharge = longDate(Date.now() + trial * 86400000);
  const s = await stripe("POST", "checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: "always", // a card is needed for the trial too
    subscription_data: {
      metadata: { userId: user.id, terms: TERMS_VERSION, ...(trial ? { trialDays: trial } : {}) },
      ...(trial ? { trial_period_days: trial, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
    },
    ...(trial ? { custom_text: { submit: { message: `You won't be charged today. Your first payment of $${PLANS.premium.price} plus tax is on ${firstCharge}, unless you cancel before then in Settings (one click). We email you 3 days before.` } } } : {}),
    allow_promotion_codes: "true",
    customer_update: { name: "auto", address: "auto" },
    // Sales tax from the member's billing address (Stripe Tax), on the first payment and every renewal.
    ...(tax ? { automatic_tax: { enabled: "true" }, billing_address_collection: "required" } : {}),
    success_url: `${SITE}/app/account?billing=success&session_id={CHECKOUT_SESSION_ID}#plan`,
    cancel_url: `${SITE}/app/premium?billing=cancelled#enroll`,
  });
  await log("payments", "info", trial ? `Checkout opened (${trial}-day free trial)` : "Checkout opened", { session: s.id, salesTax: tax }, user.id);
  return s.url;
}

/** Stripe's own billing page: update card, see invoices, cancel. Returns the URL. */
export async function portalUrl(user) {
  if (!user.stripeCustomerId) throw new Error("No billing account yet.");
  const portal = await getSetting(`stripe_portal_${billingMode()}`).catch(() => null);
  const s = await stripe("POST", "billing_portal/sessions", { customer: user.stripeCustomerId, return_url: `${SITE}/app/account#plan`, ...(portal?.id ? { configuration: portal.id } : {}) });
  return s.url;
}

/** Right after Checkout: confirm the payment ourselves, so Premium is on even if the webhook is a few seconds behind. */
export async function confirmCheckout(user, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId || ""))) return false;
  const s = await stripe("GET", `checkout/sessions/${sessionId}`);
  if (s.client_reference_id !== user.id || !s.subscription) {
    await log("payments", "warn", "Checkout return didn't match this member", { session: sessionId, status: s.status }, user.id);
    return false; // someone else's session (or not paid yet): ignore
  }
  await syncSubscription(s.subscription, user.id);
  return true;
}

/**
 * Settings → Billing: what the member pays, when, with which card, and every past invoice. Read live from Stripe
 * (nothing about cards is stored here). Returns null when Stripe can't be reached; the page then shows the basics.
 */
export async function billingDetails(user) {
  if (!billingLive() || !user.stripeCustomerId) return null;
  try {
    const [sub, invoices, customer] = await Promise.all([
      user.stripeSubscriptionId
        ? stripe("GET", `subscriptions/${encodeURIComponent(user.stripeSubscriptionId)}`, { expand: ["default_payment_method"] }).catch(() => null)
        : null,
      stripe("GET", "invoices", { customer: user.stripeCustomerId, limit: 24 }),
      stripe("GET", `customers/${encodeURIComponent(user.stripeCustomerId)}`, { expand: ["invoice_settings.default_payment_method"] }),
    ]);
    const pm = (sub?.default_payment_method && typeof sub.default_payment_method === "object" ? sub.default_payment_method : null)
      || (customer?.invoice_settings?.default_payment_method && typeof customer.invoice_settings.default_payment_method === "object" ? customer.invoice_settings.default_payment_method : null);
    const card = pm?.card ? { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year }
      : pm?.type ? { brand: pm.type.replace(/_/g, " "), last4: null } : null;
    const live = sub && PAID.includes(sub.status);
    const end = sub ? (sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end) : null;
    const amount = sub?.items?.data?.[0]?.price?.unit_amount;
    // The next charge (before tax; Stripe adds the member's sales tax on the invoice). None once cancelled.
    let next = live && !sub.cancel_at_period_end && !sub.cancel_at && end ? { date: new Date(end * 1000), amount: amount != null ? amount / 100 : PLANS.premium.price, exact: false } : null;
    if (next) {
      const preview = await stripe("POST", "invoices/create_preview", { customer: user.stripeCustomerId, subscription: sub.id }).catch(() => null);
      if (preview && Number.isFinite(preview.total)) next = { ...next, amount: preview.total / 100, exact: true };
    }
    return {
      status: sub?.status || null,
      trialEnd: sub?.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      endsAt: live && (sub.cancel_at_period_end || sub.cancel_at) ? new Date((sub.cancel_at || end) * 1000) : null,
      started: sub?.start_date ? new Date(sub.start_date * 1000) : null,
      next,
      card,
      invoices: (invoices.data || []).filter((i) => i.status !== "draft").map((i) => ({
        id: i.id,
        number: i.number,
        date: new Date((i.status_transitions?.paid_at || i.created) * 1000),
        amount: (i.status === "paid" ? i.amount_paid : i.amount_due) / 100,
        status: i.status, // paid / open / void / uncollectible
        trial: i.total === 0 && i.billing_reason === "subscription_create",
        url: i.hosted_invoice_url || null,
        pdf: i.invoice_pdf || null,
      })),
    };
  } catch (e) {
    await log("payments", "warn", `Billing details couldn't load: ${e.message}`, {}, user.id);
    return null;
  }
}

/** Cancel at the end of the paid month (the member keeps Premium until then), or undo that. */
export async function setCancelAtPeriodEnd(user, cancel) {
  if (!user.stripeSubscriptionId) throw new Error("No subscription to change.");
  const sub = await stripe("POST", `subscriptions/${user.stripeSubscriptionId}`, { cancel_at_period_end: cancel ? "true" : "false" });
  await applySubscription(sub, user.id);
  await log("payments", "info", cancel
    ? (sub.status === "trialing" ? "Member cancelled during the free trial (won't be charged)" : "Member cancelled renewal (keeps Premium to month end)")
    : "Member turned renewal back on", { subscription: sub.id }, user.id);
}

// ---------- Keeping the member's plan in step with Stripe ----------

/** Always re-read the subscription from Stripe, so events arriving out of order can't leave a stale plan. */
async function syncSubscription(subscriptionId, userId) {
  const sub = await stripe("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`);
  await applySubscription(sub, userId);
}

async function applySubscription(sub, userId) {
  let id = userId || sub.metadata?.userId;
  if (!id) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, sub.customer)).limit(1);
    id = u?.id;
  }
  if (!id) {
    await log("payments", "warn", "Subscription doesn't belong to any member", { subscription: sub.id, customer: sub.customer, status: sub.status });
    return; // not one of our members (e.g. made by hand in the dashboard)
  }
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) return;
  // A member only has one subscription that counts. Don't let an old, ended one overwrite a newer active one.
  if (u.stripeSubscriptionId && u.stripeSubscriptionId !== sub.id && !PAID.includes(sub.status) && PAID.includes(u.subscriptionStatus)) return;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const tier = PAID.includes(sub.status) ? "premium" : "free";
  const cancelling = Boolean(sub.cancel_at_period_end || sub.cancel_at);
  const fields = {
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    tier,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: cancelling,
  };
  // Stripe sends several events at once: only the update that actually changes the plan gets logged.
  const changed = await db.update(users).set(fields).where(and(eq(users.id, id), or(
    sql`${users.subscriptionStatus} is distinct from ${sub.status}`,
    sql`${users.tier} is distinct from ${tier}`,
    sql`${users.cancelAtPeriodEnd} is distinct from ${cancelling}`,
  ))).returning({ id: users.id });
  if (changed.length) {
    await log("payments", sub.status === "past_due" || sub.status === "unpaid" ? "warn" : "info",
      `Subscription ${u.subscriptionStatus || "none"} → ${sub.status}${cancelling ? " (cancels at month end)" : ""}; plan ${tier}`,
      { subscription: sub.id, renews: fields.currentPeriodEnd?.toISOString() ?? null }, id);
  } else {
    await db.update(users).set(fields).where(eq(users.id, id)); // e.g. the renewal date moved on
  }
}

/**
 * Billing emails (trial ending, payment failed, Premium ended). These go out whatever the member's alert settings,
 * like a receipt would. Never blocks the webhook: a failed email is only logged.
 */
async function emailMember(customerId, subscriptionUserId, message) {
  try {
    let [u] = subscriptionUserId ? await db.select().from(users).where(eq(users.id, subscriptionUserId)).limit(1) : [];
    if (!u && customerId) [u] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    if (!u?.email) return;
    await sendEmail(u.email, { ...message, footer: "You're getting this because it's about your TCG Boogie subscription. Questions? support@tcgboogie.com" });
    await log("payments", "info", `Billing email sent: ${message.subject}`, {}, u.id);
  } catch (e) {
    await log("payments", "warn", `Billing email failed: ${e.message}`, { subject: message.subject });
  }
}

const SETTINGS_BILLING = `${SITE}/app/account#billing`;

/** Check Stripe's signature on a webhook (Stripe-Signature: t=…,v1=…). Rejects anything older than 5 minutes. */
async function verify(raw, header) {
  const secret = await webhookSecret();
  if (!secret || !header) return false;
  let t = null;
  const sigs = [];
  for (const kv of String(header).split(",")) {
    const [k, v] = kv.split("=");
    if (k === "t") t = v;
    if (k === "v1" && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected);
  return sigs.some((s) => { const b = Buffer.from(s); return b.length === a.length && crypto.timingSafeEqual(a, b); });
}

/** Handle one webhook. Returns an HTTP status. */
export async function handleWebhook(raw, signature) {
  if (!db || !billingLive()) return 503;
  if (!(await verify(raw, signature))) {
    await log("payments", "warn", "Webhook rejected: bad or missing Stripe signature", { hasSignature: Boolean(signature) });
    return 400;
  }
  const event = JSON.parse(raw);
  // Stripe may deliver an event more than once: handle each only once.
  const fresh = await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id });
  if (!fresh.length) return 200;
  try {
    const o = event.data?.object || {};
    if (event.type === "checkout.session.completed" && o.mode === "subscription" && o.subscription) {
      await syncSubscription(o.subscription, o.client_reference_id);
    } else if (event.type.startsWith("customer.subscription.")) {
      await syncSubscription(o.id);
      if (event.type === "customer.subscription.trial_will_end" && o.status === "trialing" && !o.cancel_at_period_end && !o.cancel_at && o.trial_end) {
        const when = longDate(o.trial_end * 1000);
        await emailMember(o.customer, o.metadata?.userId, {
          subject: `Your Premium trial ends ${when}`,
          heading: "Your free trial ends soon",
          lines: [
            `Your TCG Boogie Premium trial ends on ${when}. Then your card is charged $${PLANS.premium.price} plus tax, and Premium renews monthly.`,
            "Want to keep Premium? Do nothing. Not for you? Cancel in Settings before then and you won't be charged.",
          ],
          button: { label: "Review billing", url: SETTINGS_BILLING },
        });
      }
      if (event.type === "customer.subscription.deleted") {
        await emailMember(o.customer, o.metadata?.userId, {
          subject: "Your Premium has ended",
          heading: "You're back on Free",
          lines: [
            "Your TCG Boogie Premium subscription has ended and you won't be charged again.",
            "Your collection, filters and settings are all still here. Anything over the Free limits is paused, not deleted.",
          ],
          button: { label: "Come back to Premium", url: `${SITE}/app/premium` },
        });
      }
    } else if (event.type.startsWith("invoice.")) {
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      if (subId) await syncSubscription(subId);
      if (event.type === "invoice.payment_failed") {
        await log("payments", "warn", "A payment failed (Stripe will retry)", { invoice: o.id, customer: o.customer, amount: o.amount_due / 100 });
        await emailMember(o.customer, null, {
          subject: "Your Premium payment didn't go through",
          heading: "We couldn't charge your card",
          lines: [
            `Your payment of $${(o.amount_due / 100).toFixed(2)} for TCG Boogie Premium didn't go through. We'll try again over the next few days.`,
            "To keep Premium, update your card in Settings → Billing.",
          ],
          button: { label: "Update card", url: SETTINGS_BILLING },
        });
      }
      if (event.type === "invoice.paid") await log("payments", "info", `Payment received: $${(o.amount_paid / 100).toFixed(2)}`, { invoice: o.id, customer: o.customer });
    }
    return 200;
  } catch (e) {
    // Let Stripe retry later: forget we saw it.
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    await log("payments", "error", `Webhook ${event.type} failed (Stripe will retry): ${e.message}`, { event: event.id });
    return 500;
  }
}

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
  await log("payments", "info", "Account deleted: Stripe customer and subscription ended", { customer: user.stripeCustomerId }, user.id);
  return { ended: true };
}

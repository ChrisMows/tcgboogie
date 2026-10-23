"use server";

import { redirect } from "next/navigation";
import { listItem, SellError, setupPolicies } from "@/lib/ebay-sell";
import { checkQuota, useQuota } from "@/lib/quota";
import { logError } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

/** Post the reviewed listing to eBay. Returns { ok, url } or { ok: false, error }. */
export async function listOnEbay(itemId, formData) {
  const user = await requireUser();
  if (!user.plan.sellOnEbay) return { ok: false, error: "Sell on eBay isn't part of your plan." };
  if (user.demo) return { ok: false, error: "Not available in the demo." };
  if (!await allow("ebayList", user.id)) return { ok: false, error: "Too many listings in a short time. Please wait a few minutes." };
  const quota = await checkQuota("ebayListing", user); // used only once eBay accepts the listing
  if (!quota.ok) return { ok: false, error: quota.message, left: 0 };
  const item = await store.getItem(user.id, itemId);
  if (!item || item.list !== "owned" || item.kind === "sealed") return { ok: false, error: "That card isn't in your collection." };
  const price = Number(String(formData.get("price") || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(price) || price < 0.99 || price > 100000) return { ok: false, error: "Enter a price between $0.99 and $100,000." };
  const title = String(formData.get("title") || "").trim();
  if (title.length < 10) return { ok: false, error: "Give the listing a title (at least 10 characters)." };
  const photos = formData.getAll("photos").filter((f) => f && typeof f === "object" && f.size > 0).slice(0, 6);
  try {
    const r = await listItem(user.id, item, {
      title, price,
      description: String(formData.get("description") || "").slice(0, 4000),
      format: formData.get("format") === "AUCTION" ? "AUCTION" : "FIXED_PRICE",
      duration: [1, 3, 5, 7, 10].includes(Number(formData.get("duration"))) ? Number(formData.get("duration")) : 7,
      postalCode: String(formData.get("postalCode") || "").trim(),
      policies: { fulfillment: String(formData.get("fulfillment") || ""), payment: String(formData.get("payment") || ""), return: String(formData.get("return") || "") },
      photos,
    });
    const used = await useQuota("ebayListing", user).catch(() => ({ left: null }));
    return { ok: true, url: r.url, left: used.left ?? null };
  } catch (e) {
    if (e instanceof SellError) {
      if (e.code === "not_connected" || e.code === "reconnect") return { ok: false, error: e.message, reconnect: true };
      return { ok: false, error: `eBay: ${e.message}` };
    }
    await logError("admin", "eBay listing failed", e, { itemId }, user.id);
    return { ok: false, error: "Something went wrong talking to eBay. Please try again." };
  }
}

/** Quick setup: create the seller's missing shipping, payment and return policies on eBay, then back to the listing. */
export async function createPolicies(itemId, formData) {
  const user = await requireUser();
  const back = `/app/collection/sell/${Number(itemId)}`;
  if (!user.plan.sellOnEbay) redirect(back);
  if (user.demo) redirect(back);
  if (!await allow("ebayList", user.id)) redirect(`${back}?setup=${encodeURIComponent("Too many tries. Please wait a few minutes.")}`);
  let err = null;
  try {
    await setupPolicies(user.id, {
      shipping: formData.get("shipping") === "free" ? "free" : "flat",
      shipCost: formData.get("shipCost"), handlingDays: formData.get("handlingDays"),
      returns: formData.get("returns") === "30" ? "30" : "none",
    });
  } catch (e) {
    err = e instanceof SellError && e.code === "opting_in" ? "opting_in" : `eBay: ${e.message}`.slice(0, 300);
    if (!(e instanceof SellError)) await logError("admin", "eBay policy setup failed", e, {}, user.id);
  }
  redirect(err ? `${back}?setup=${encodeURIComponent(err)}` : back);
}

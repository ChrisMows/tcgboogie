"use server";

import { listItem, SellError } from "@/lib/ebay-sell";
import { logError } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

/** Post the reviewed listing to eBay. Returns { ok, url } or { ok: false, error }. */
export async function listOnEbay(itemId, formData) {
  const user = await requireUser();
  if (user.demo) return { ok: false, error: "Not available in the demo." };
  if (!allow("ebayList", user.id)) return { ok: false, error: "Too many listings in a short time. Please wait a few minutes." };
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
    return { ok: true, url: r.url };
  } catch (e) {
    if (e instanceof SellError) {
      if (e.code === "not_connected" || e.code === "reconnect") return { ok: false, error: e.message, reconnect: true };
      return { ok: false, error: `eBay: ${e.message}` };
    }
    await logError("admin", "eBay listing failed", e, { itemId }, user.id);
    return { ok: false, error: "Something went wrong talking to eBay. Please try again." };
  }
}

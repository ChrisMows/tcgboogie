"use server";

import { revalidatePath } from "next/cache";
import { getProduct } from "@/lib/catalog";
import { logError } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { reportSale } from "@/lib/report-sale";
import { requireUser } from "@/lib/session";

/** A member reports an eBay sale we're missing for this card. */
export async function reportSaleAction(productId, language, link, soldOn) {
  const user = await requireUser();
  if (!user.plan.reportSales) return { ok: false, message: "Reporting sales isn't part of your plan." };
  if (!await allow("reportSale", user.id)) return { ok: false, message: "That's a lot of reports today. Thanks! Try again tomorrow." };
  try {
    const product = await getProduct(String(productId), { language: language === "japanese" ? "japanese" : "english" });
    if (!product || product.type !== "card") return { ok: false, message: "Sales can only be reported for cards." };
    const res = await reportSale(user, product, link, soldOn);
    if (res.ok) revalidatePath(`/app/cards/${productId}`);
    return res;
  } catch (e) {
    await logError("prices", "Reporting a sale failed", e, { productId }, user.id);
    return { ok: false, message: "Something went wrong checking that sale. Please try again in a minute." };
  }
}

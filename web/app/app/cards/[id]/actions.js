"use server";

import { revalidatePath } from "next/cache";
import { getProduct } from "@/lib/catalog";
import { reportMissingPicture } from "@/lib/card-images";
import { db } from "@/lib/db";
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

/** "Missing picture?": find the picture automatically, or put it in front of the admin (lib/card-images.js). */
export async function reportPictureAction(productId, language) {
  const user = await requireUser();
  if (!db) return { status: "ok", message: "In demo mode nothing is saved, but on the live site we'd look for this card's picture now." };
  if (!await allow("missingPicture", user.id)) return { status: "error", message: "That's a lot of reports today. Thanks! Try again tomorrow." };
  try {
    const product = await getProduct(String(productId), { language: language === "japanese" ? "japanese" : "english", cachedOnly: true, anyAge: true });
    if (!product) return { status: "error", message: "We couldn't find this card. Please try again in a minute." };
    const res = await reportMissingPicture(user, { ...product, language: product.language || language || "english" });
    if (res.status === "fixed") revalidatePath(`/app/cards/${productId}`);
    return res;
  } catch (e) {
    await logError("website", "Missing picture report failed", e, { productId }, user.id);
    return { status: "error", message: "Something went wrong. Please try again in a minute." };
  }
}

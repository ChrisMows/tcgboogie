"use server";

import { revalidatePath } from "next/cache";
import { addItem } from "@/app/app/collection/actions";
import { appraisePhoto, appraiserReady } from "@/lib/appraise";
import { logError } from "@/lib/log";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Read a photo of cards and price what's in it. */
export async function appraise(formData) {
  const user = await requireUser();
  if (!user.plan.photoAppraiser) return { ok: false, error: "The photo appraiser is part of Premium." };
  if (!appraiserReady()) return { ok: false, error: "The photo appraiser isn't switched on yet." };
  if (!await allow("appraise", user.id)) return { ok: false, error: SLOW_DOWN };
  const file = formData.get("photo");
  if (!file || typeof file === "string" || !file.size) return { ok: false, error: "Pick a photo first." };
  if (!TYPES.includes(file.type)) return { ok: false, error: "That photo format isn't supported. Try a JPEG or PNG (a screenshot works too)." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "That photo is too large. Try a smaller one." };
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const res = await appraisePhoto({ data, mediaType: file.type }, user.id);
    return { ok: true, ...res };
  } catch (e) {
    await logError("website", "Photo appraiser failed", e, {}, user.id);
    return { ok: false, error: "We couldn't read that photo. Try again with more light and the cards flat." };
  }
}

/** Add the chosen cards: raw ones as Near Mint, slabs with their grade. */
export async function addAppraised(picks) {
  await requireUser();
  let added = 0;
  const failed = [];
  for (const p of (Array.isArray(picks) ? picks : []).slice(0, 20)) {
    const input = p.graded ? { list: "owned", kind: "graded", grader: p.grader, grade: p.grade, quantity: 1 }
      : { list: "owned", kind: "raw", condition: "Near Mint", quantity: 1 };
    const r = await addItem(String(p.productId), input);
    if (r.ok) added++; else failed.push(p.name);
  }
  revalidatePath("/app/collection", "layout");
  return { ok: true, added, failed };
}

"use server";

import { headers } from "next/headers";
import { submitIdea } from "@/lib/ideas";
import { logError } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

/** "Suggest an idea" (components/IdeaBox.js): members and visitors, a few a day. */
export async function sendIdea({ text, source, page, context }) {
  const user = await getCurrentUser().catch(() => null);
  if (user?.demo) return { ok: true, demo: true };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  if (!await allow(user ? "idea" : "ideaVisitor", user ? user.id : ip)) return { error: "Thanks for all the ideas today! Send more tomorrow." };
  try {
    return await submitIdea(user, { text, source, page, context });
  } catch (e) {
    await logError("website", "Couldn't save an idea", e, {}, user?.id);
    return { error: "That didn't send. Try again in a minute, or email support@tcgboogie.com." };
  }
}

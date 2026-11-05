"use server";

import { revalidatePath } from "next/cache";
import { FLIP_FILTER_FIELDS, FLIP_FILTER_LIMIT } from "@/lib/grading";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

const NAME_MAX = 30;

/** Saves the form's choices as a new filter, or over the member's own when `id` is given. The page checks each value when it reads them. */
export async function saveFlipFilter({ id = null, name, params }) {
  const user = await requireUser();
  if (!user.plan.gradingFinder) return { ok: false, error: "Grade & Flip is part of Ultra." };
  const clean = String(name || "").trim().slice(0, NAME_MAX);
  if (!clean) return { ok: false, error: "Give this filter a name." };
  const kept = Object.fromEntries(FLIP_FILTER_FIELDS.map((k) => [k, String(params?.[k] ?? "").slice(0, 20)]));
  const saved = await store.saveFlipFilter(user.id, { id, name: clean, params: kept }, FLIP_FILTER_LIMIT);
  if (!saved) return { ok: false, error: id ? "That filter is gone. Reload the page." : `You can save up to ${FLIP_FILTER_LIMIT} filters. Delete one first.` };
  revalidatePath("/app/grade-and-flip");
  return { ok: true, id: saved };
}

export async function deleteFlipFilter(id) {
  const user = await requireUser();
  await store.deleteFlipFilter(user.id, String(id));
  revalidatePath("/app/grade-and-flip");
  return { ok: true };
}

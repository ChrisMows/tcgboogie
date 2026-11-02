"use server";

import { revalidatePath } from "next/cache";
import { logError } from "@/lib/log";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

function refresh(productIds = []) {
  revalidatePath("/app/profile");
  for (const id of productIds) revalidatePath(`/app/cards/${id}`);
}

/** Only the member's own owned copies can be signature cards, at most 3, no repeats, in the order given. */
async function ownedIds(userId, ids) {
  const owned = new Map((await store.listItems(userId)).filter((it) => it.list === "owned").map((it) => [it.id, it]));
  const clean = [...new Set((ids || []).map(Number))].filter((id) => owned.has(id)).slice(0, store.SIGNATURE_MAX);
  return { clean, owned };
}

/** Profile -> Signature cards: save the picks (from the picker). */
export async function saveSignature(ids) {
  const user = await requireUser();
  try {
    const { clean, owned } = await ownedIds(user.id, ids);
    await store.setSignatureItems(user.id, clean);
    refresh(clean.map((id) => owned.get(id).productId));
    return { ok: true, items: clean };
  } catch (e) {
    await logError("website", "Saving signature cards failed", e, null, user.id);
    return { ok: false, message: "Couldn't save that just now. Please try again." };
  }
}

/** A card page's "Signature card" button: add this copy (if there's room) or take it off. */
export async function toggleSignature(itemId) {
  const user = await requireUser();
  const id = Number(itemId);
  const current = (await store.getShowcase(user.id)).items;
  const { clean: kept, owned } = await ownedIds(user.id, current); // copies since sold or removed don't take a slot
  if (!owned.has(id)) return { ok: false, message: "That card isn't in your collection." };
  if (kept.includes(id)) {
    await store.setSignatureItems(user.id, kept.filter((x) => x !== id));
    refresh([owned.get(id).productId]);
    return { ok: true, on: false };
  }
  if (kept.length >= store.SIGNATURE_MAX) return { ok: false, full: true, message: "You have 3 signature cards. Swap one on your Profile." };
  await store.setSignatureItems(user.id, [...kept, id]);
  refresh([owned.get(id).productId]);
  return { ok: true, on: true };
}

/** Profile -> Share my profile: on (a new private link) or off (the link stops working). */
export async function setSharing(formData) {
  const user = await requireUser();
  await store.setSharing(user.id, formData.get("on") === "1");
  refresh();
}

/** Profile -> Show values on my shared profile. */
export async function setShareValues(formData) {
  const user = await requireUser();
  await store.setShareValues(user.id, formData.get("on") === "1");
  refresh();
}

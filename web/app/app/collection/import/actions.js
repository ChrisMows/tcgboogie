"use server";

import { revalidatePath } from "next/cache";
import { findCard, getProduct } from "@/lib/catalog";
import { marketValue, nmPrice, validateItem } from "@/lib/collection";
import { log } from "@/lib/log";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

// Products matched during this import, so the import step doesn't look them up (and spend credits) again.
const matched = globalThis.__tcgImportMatched ?? (globalThis.__tcgImportMatched = new Map());
const remember = (p) => {
  matched.set(p.id, { p, at: Date.now() });
  if (matched.size > 5000) for (const [k, v] of matched) if (Date.now() - v.at > 3600000) matched.delete(k);
};

async function productFor(row) {
  if (row.productId && /^\d{1,9}$/.test(row.productId) && Number(row.productId) > 0) {
    const p = await getProduct(row.productId).catch(() => null);
    if (p) return p;
  }
  if (row.sealed || !row.name) return null;
  return findCard({ name: row.name, number: row.number, language: row.language }).catch(() => null);
}

/** Match a batch of rows (at most 25) to catalog products. */
export async function matchRows(rows) {
  const user = await requireUser();
  if (!user.plan.collectionImport) return { ok: false, error: "CSV import isn't part of your plan.", results: [] };
  const out = [];
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, 25)) {
    if (!allow("importMatch", user.id)) return { ok: false, error: "That's the most cards we can look up today. Import these, then come back tomorrow for the rest.", results: out };
    const p = await productFor(row);
    if (p) remember(p);
    const value = p ? (p.type === "sealed" ? p.prices?.market ?? null
      : row.graded ? p.graded?.[`${String(row.grader).toLowerCase()}${String(row.grade).replace(".", "_")}`]?.price ?? null
        : marketValue(p, { kind: "raw", printing: Object.keys(p.prices || {})[0], condition: row.condition }) ?? nmPrice(p)) : null;
    out.push(p ? { product: { id: p.id, type: p.type, name: p.name, setName: p.setName, number: p.number, image: p.image, language: p.language || "english" }, value } : { product: null, value: null });
  }
  return { ok: true, results: out };
}

/** Add matched rows (at most 50 per call). Each row: the CSV fields plus productId of its match. */
export async function importRows(rows) {
  const user = await requireUser();
  if (!user.plan.collectionImport) return { ok: false, error: "CSV import isn't part of your plan." };
  if (!allow("importAdd", user.id)) return { ok: false, error: SLOW_DOWN };
  let added = 0;
  const failed = [];
  for (const r of (Array.isArray(rows) ? rows : []).slice(0, 50)) {
    try {
      const p = matched.get(String(r.productId))?.p || await getProduct(String(r.productId));
      if (!p) { failed.push(r.name); continue; }
      const input = {
        list: r.list === "wishlist" ? "wishlist" : "owned",
        kind: p.type === "sealed" ? "sealed" : r.graded ? "graded" : "raw",
        printing: r.printing, condition: r.condition || "Near Mint", grader: r.grader, grade: r.grade,
        quantity: r.quantity || 1, purchasePrice: r.paid ?? "",
      };
      const { item, errors } = validateItem(input, p);
      if (Object.keys(errors).length) { failed.push(r.name); continue; }
      await store.createItem(user.id, {
        productId: p.id, productType: p.type, name: p.name, setName: p.setName, number: p.number, image: p.image, tcgplayerUrl: p.tcgplayerUrl,
        ...item, unitValue: marketValue(p, item), valueUpdatedAt: new Date(),
      });
      added++;
    } catch {
      failed.push(r.name);
    }
  }
  revalidatePath("/app/collection", "layout");
  revalidatePath("/app");
  if (added) await log("website", "info", `Collection import: ${added} card line${added === 1 ? "" : "s"} added${failed.length ? `, ${failed.length} failed` : ""}`, null, user.id);
  return { ok: true, added, failed };
}

"use server";

import { revalidatePath } from "next/cache";
import { catalogLive, getProduct, searchProducts } from "@/lib/catalog";
import { marketValue, nmPrice, validateItem } from "@/lib/collection";
import { slim } from "@/lib/portfolio";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { atWatchLimit, currentPrice, isTriggered, parseTcgplayerInput, validateWatch } from "@/lib/watches";

function refresh(productId) {
  revalidatePath("/app/collection", "layout");
  revalidatePath("/app");
  if (productId) revalidatePath(`/app/cards/${productId}`);
}

const snapshotFields = (p) => ({
  productId: p.id, productType: p.type, name: p.name, setName: p.setName, number: p.number, image: p.image, tcgplayerUrl: p.tcgplayerUrl,
});

/** Search by name, card number, or a pasted TCGplayer link. */
export async function searchCatalog(query) {
  const user = await requireUser();
  if (!allow("search", user.id)) return { ok: false, error: SLOW_DOWN };
  const id = parseTcgplayerInput(query);
  try {
    if (id) {
      const p = await getProduct(id);
      return p ? { ok: true, results: [slim(p)] } : { ok: false, error: catalogLive() ? "We couldn't find that TCGplayer product." : "Our live card catalog isn't connected yet, so only sample cards can be added right now. Every TCGplayer card will work once it's switched on." };
    }
    const results = (await searchProducts(query)).map(slim);
    if (results.length) return { ok: true, results };
    return {
      ok: false,
      error: catalogLive()
        ? "No matches. Try fewer words, or the card number like 199/165."
        : "No match in the preview catalog. Until the price service is connected it only has a few sample cards: try Charizard, Umbreon, Blastoise, Mew, “151”, “Base Set”, or Elite Trainer Box.",
    };
  } catch {
    return { ok: false, error: "The price service didn't respond. Please try again in a minute." };
  }
}

/** Full details of a product picked from search results (search results don't carry graded sales). */
export async function productDetails(productId, language) {
  await requireUser();
  try {
    const p = await getProduct(String(productId), { language: language === "japanese" ? "japanese" : "english" });
    return p ? slim(p) : null;
  } catch {
    return null;
  }
}

/** Add a card or sealed product with full details (condition or grade, quantity, what you paid...). */
export async function addItem(productId, input) {
  const user = await requireUser();
  const product = await getProduct(productId);
  if (!product) return { ok: false, errors: { _: "That product is no longer available." } };
  const { item, errors } = validateItem(input || {}, product);
  if (Object.keys(errors).length) return { ok: false, errors };
  if (item.binderId && !(await store.listBinders(user.id)).some((b) => b.id === item.binderId)) item.binderId = null;
  // The same card in the same condition/grade (and no purchase details) just adds to the existing line.
  const same = (await store.listItems(user.id)).find((it) => it.productId === product.id && it.list === item.list && it.kind === item.kind
    && it.printing === item.printing && it.condition === item.condition && it.grader === item.grader && it.grade === item.grade
    && !item.purchasePrice && !item.certNumber && !item.customValue && (it.binderId || null) === item.binderId);
  const mv = marketValue(product, item);
  if (same) await store.updateItem(user.id, same.id, { quantity: same.quantity + item.quantity });
  else await store.createItem(user.id, { ...snapshotFields(product), ...item, unitValue: mv, valueUpdatedAt: new Date() });
  // Got a card you wanted: it comes off the wishlist.
  let fromWishlist = false;
  if (item.list === "owned") {
    for (const it of await store.listItems(user.id)) {
      if (it.productId === product.id && it.list === "wishlist") { await store.deleteItem(user.id, it.id); fromWishlist = true; }
    }
  }
  refresh(product.id);
  return { ok: true, value: mv, merged: Boolean(same), fromWishlist };
}

/** One tap: add a copy as raw Near Mint (or sealed), the most common case. Used by set grids and card pages. */
export async function quickAdd(productId, list = "owned") {
  await requireUser(); // before any price lookup, so signed-out callers can't spend credits
  const product = await getProduct(productId);
  if (!product) return { ok: false, error: "That product is no longer available." };
  const res = await addItem(productId, { list, kind: product.type === "sealed" ? "sealed" : "raw", condition: "Near Mint", quantity: 1 });
  return res.ok ? res : { ok: false, error: Object.values(res.errors || {})[0] };
}

/** Set-grid stepper: take one copy of a product back out (the most recently added line first). */
export async function removeOneCopy(productId) {
  const user = await requireUser();
  const lines = (await store.listItems(user.id)).filter((it) => it.productId === String(productId) && it.list === "owned");
  const it = lines.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!it) return { ok: false };
  if (it.quantity > 1) await store.updateItem(user.id, it.id, { quantity: it.quantity - 1 });
  else await store.deleteItem(user.id, it.id);
  refresh(String(productId));
  return { ok: true };
}

export async function editItem(id, input) {
  const user = await requireUser();
  const existing = await store.getItem(user.id, id);
  if (!existing) return { ok: false, errors: { _: "That card is no longer in your collection." } };
  const product = await getProduct(existing.productId);
  if (!product) return { ok: false, errors: { _: "That product is no longer available." } };
  const { item, errors } = validateItem({ ...existing, ...input }, product);
  if (Object.keys(errors).length) return { ok: false, errors };
  await store.updateItem(user.id, id, { ...item, unitValue: marketValue(product, item), valueUpdatedAt: new Date() });
  refresh(existing.productId);
  return { ok: true };
}

export async function changeQuantity(id, delta) {
  const user = await requireUser();
  const it = await store.getItem(user.id, id);
  if (!it) return { ok: false };
  const q = it.quantity + Number(delta);
  if (q < 1) await store.deleteItem(user.id, id);
  else await store.updateItem(user.id, id, { quantity: Math.min(q, 9999) });
  refresh(it.productId);
  return { ok: true, quantity: Math.max(q, 0) };
}

export async function removeItem(id) {
  const user = await requireUser();
  const it = await store.getItem(user.id, id);
  await store.deleteItem(user.id, id);
  refresh(it?.productId);
  return { ok: true };
}

/** Got it! Wishlist -> collection. */
export async function moveToCollection(id) {
  const user = await requireUser();
  const it = await store.getItem(user.id, id);
  if (!it) return { ok: false };
  await store.updateItem(user.id, id, { list: "owned", purchaseDate: new Date().toISOString().slice(0, 10) });
  refresh(it.productId);
  return { ok: true };
}

/** Remove the wishlist entry for a product (used by the heart toggle on set grids and card pages). */
export async function removeFromWishlist(productId) {
  const user = await requireUser();
  for (const it of await store.listItems(user.id)) {
    if (it.productId === String(productId) && it.list === "wishlist") await store.deleteItem(user.id, it.id);
  }
  refresh(String(productId));
  return { ok: true };
}

/** Start a TCGplayer price watch for a card straight from the collection, wishlist, set grid, or card page. */
export async function watchProduct(productId, input = {}) {
  const user = await requireUser();
  const watches = await store.listWatches(user.id);
  const existing = watches.find((w) => w.productId === String(productId));
  if (existing) return { ok: true, already: true };
  if (atWatchLimit(user.plan, watches.length)) {
    return { ok: false, limit: true, error: `You're using all ${user.plan.maxPriceWatches} price alerts on Free. Remove one, or upgrade for unlimited.` };
  }
  const product = await getProduct(productId);
  if (!product) return { ok: false, error: "That product is no longer available." };
  const now = product.type === "sealed" ? product.prices?.market : nmPrice(product);
  const selling = input.mode === "above" || input.mode === "rise";
  const target = input.targetPrice ?? (now ? Math.round(now * (selling ? 1.15 : 0.85) * 100) / 100 : null);
  if (!target) return { ok: false, error: "There's no current price for this product yet, so set a target on the Price alerts page." };
  const { watch, errors } = validateWatch({ priceType: "market", mode: "below", condition: "Near Mint", targetPrice: target, alsoEbay: product.type === "card" && product.language !== "japanese", ...input }, product);
  if (Object.keys(errors).length) return { ok: false, error: Object.values(errors)[0] };
  const price = currentPrice(product, watch);
  await store.createWatch(user.id, {
    ...snapshotFields(product), ...watch, lastPrice: price,
    status: isTriggered(watch, price) ? "triggered" : "watching", triggeredAt: isTriggered(watch, price) ? new Date() : null,
  });
  revalidatePath("/app/watches");
  refresh(product.id);
  return { ok: true, target: watch.targetPrice };
}

// ---------- binders ----------
const cleanName = (n) => String(n || "").trim().replace(/\s+/g, " ").slice(0, 40);

export async function addBinder(name) {
  const user = await requireUser();
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: "Give the binder a name." };
  const b = await store.createBinder(user.id, clean);
  refresh();
  return { ok: true, id: b.id };
}

export async function renameBinder(id, name) {
  const user = await requireUser();
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: "Give the binder a name." };
  await store.renameBinder(user.id, id, clean);
  refresh();
  return { ok: true };
}

export async function removeBinder(id) {
  const user = await requireUser();
  await store.deleteBinder(user.id, id);
  refresh();
  return { ok: true };
}

/** Premium collection alerts. */
export async function saveCollectionPrefs(prefs) {
  const user = await requireUser();
  if (!user.plan.collectionAlerts) return { ok: false, error: "Collection alerts are a Premium feature." };
  await store.setCollectionPrefs(user.id, prefs);
  refresh();
  return { ok: true };
}

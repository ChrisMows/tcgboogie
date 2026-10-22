"use server";

import { revalidatePath } from "next/cache";
import { catalogLive, getProduct } from "@/lib/catalog";
import { searchWithRequests } from "@/lib/card-requests";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";
import { atWatchLimit, currentPrice, isTriggered, parseTcgplayerInput, validateWatch } from "@/lib/watches";

const publicProduct = (p) => p && {
  id: p.id, type: p.type, name: p.name, setName: p.setName, number: p.number, image: p.image,
  tcgplayerUrl: p.tcgplayerUrl, prices: p.prices, history: p.history, language: p.language || "english",
  ...(p.memberAdded ? { memberAdded: true } : {}),
};

// Until the price service is connected, only the small preview catalog is searchable: say so plainly.
const notFound = (how) => (!catalogLive()
  ? "Our live card catalog isn't connected yet, so only a few sample cards can be found right now (try Charizard, Umbreon or Psyduck). Every TCGplayer card will work once it's switched on."
  : how === "link" ? "We couldn't find that TCGplayer product. Check the link, search by name, or request it below."
    : "No matches. Try fewer words or paste the TCGplayer link, or request the card or product below and we'll add it.");

/** Find a product from a pasted TCGplayer link/ID, or search by name. */
export async function findProducts(query) {
  const user = await requireUser();
  if (!await allow("search", user.id)) return { ok: false, error: SLOW_DOWN };
  const id = parseTcgplayerInput(query);
  try {
    if (id) {
      const p = await getProduct(id);
      return p ? { ok: true, results: [publicProduct(p)] } : { ok: false, error: notFound("link") };
    }
    const results = (await searchWithRequests(query)).map(publicProduct);
    return results.length ? { ok: true, results } : { ok: false, error: notFound("search") };
  } catch {
    return { ok: false, error: "The price service didn't respond. Please try again in a minute." };
  }
}

export async function addWatch(productId, input) {
  const user = await requireUser();
  if (atWatchLimit(user.plan, await store.countWatches(user.id))) {
    return { ok: false, errors: { _: `You're using all ${user.plan.maxPriceWatches} price alerts on Free. Remove one to add another, or upgrade for unlimited.` } };
  }
  const product = await getProduct(productId);
  if (!product) return { ok: false, errors: { _: "That product is no longer available." } };
  const { watch, errors } = validateWatch(input || {}, product);
  if (Object.keys(errors).length) return { ok: false, errors };
  const price = currentPrice(product, watch);
  await store.createWatch(user.id, {
    productId: product.id, productType: product.type, name: product.name, setName: product.setName,
    number: product.number, image: product.image, tcgplayerUrl: product.tcgplayerUrl, ...watch,
    lastPrice: price, status: isTriggered(watch, price) ? "triggered" : "watching",
    triggeredAt: isTriggered(watch, price) ? new Date() : null,
  });
  revalidatePath("/app/watches");
  return { ok: true, alreadyBelow: isTriggered(watch, price) };
}

export async function editWatch(id, input) {
  const user = await requireUser();
  const existing = (await store.listWatches(user.id)).find((w) => w.id === Number(id));
  if (!existing) return { ok: false, errors: { _: "That watch no longer exists." } };
  const product = await getProduct(existing.productId);
  if (!product) return { ok: false, errors: { _: "That product is no longer available." } };
  const { watch, errors } = validateWatch({ ...existing, ...input }, product);
  if (Object.keys(errors).length) return { ok: false, errors };
  const price = currentPrice(product, watch);
  const hit = isTriggered(watch, price);
  await store.updateWatch(user.id, id, {
    ...watch, lastPrice: price, status: hit ? "triggered" : "watching", triggeredAt: hit ? existing.triggeredAt || new Date() : null,
  });
  revalidatePath("/app/watches");
  return { ok: true };
}

/** After an alert, a watch stays quiet until the price goes back above the target. This re-arms it now. */
export async function rearmWatch(id) {
  const user = await requireUser();
  await store.updateWatch(user.id, id, { status: "watching", triggeredAt: null });
  revalidatePath("/app/watches");
  return { ok: true };
}

export async function removeWatch(id) {
  const user = await requireUser();
  await store.deleteWatch(user.id, id);
  revalidatePath("/app/watches");
  return { ok: true };
}

import "server-only";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { open, seal } from "@/lib/secret-box";

// "Sell on eBay": members connect their eBay seller account (OAuth, eBay's own sign-in page), then we build a listing
// from their collection item and post it with eBay's Inventory API.
//   EBAY_CLIENT_ID      Production App ID   (same keyset as the deal bot)
//   EBAY_CLIENT_SECRET  Production Cert ID
//   EBAY_RUNAME         eBay redirect URL name (developer.ebay.com -> User Tokens), e.g. Christopher_Rig-Christop-Boogie-pqckgy
// Condition and grade codes below come from eBay's Metadata API for category 183454 (Pokémon single cards).

const { ebayAccounts, ebayListings } = schema;
const API = "https://api.ebay.com";
const AUTH = "https://auth.ebay.com/oauth2/authorize";
export const CATEGORY = "183454"; // CCG Individual Cards
const MARKETPLACE = "EBAY_US";
const LOCATION_KEY = "tcgboogie-default";
export const SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory", // create and publish listings, upload photos
  "https://api.ebay.com/oauth/api_scope/sell.account", // read shipping, payment and return policies
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly", // show which eBay account is connected
];

export const ebaySellReady = () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_RUNAME);

// ---------- eBay's codes for trading cards ----------
export const GRADER_IDS = { PSA: "275010", BVG: "275012", BGS: "275013", CGC: "275015", SGC: "275016", TAG: "2750115", ACE: "2750119" };
const GRADE_IDS = {
  "10": "275020", "9.5": "275021", "9": "275022", "8.5": "275023", "8": "275024", "7.5": "275025", "7": "275026", "6.5": "275027",
  "6": "275028", "5.5": "275029", "5": "2750210", "4.5": "2750211", "4": "2750212", "3.5": "2750213", "3": "2750214", "2.5": "2750215",
  "2": "2750216", "1.5": "2750217", "1": "2750218",
};
const CONDITION_IDS = { "Near Mint": "400010", "Lightly Played": "400015", "Moderately Played": "400016", "Heavily Played": "400017", Damaged: "400017" };
const GRADER_NAMES = { PSA: "Professional Sports Authenticator (PSA)", BGS: "Beckett Grading Services (BGS)", BVG: "Beckett Vintage Grading (BVG)",
  CGC: "Certified Guaranty Company (CGC)", SGC: "Sportscard Guaranty Corporation (SGC)", TAG: "Technical Authentication & Grading (TAG)", ACE: "Ace Grading (Ace)" };

// ---------- sign-in (OAuth) ----------
const basic = () => `Basic ${Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64")}`;
const sign = (v) => crypto.createHmac("sha256", process.env.AUTH_SECRET || "").update(`ebay-state:${v}`).digest("base64url");

/** eBay's consent page, with a signed `state` tying the round trip to this member (expires in 10 minutes). */
export function authorizeUrl(userId) {
  const value = `${userId}.${Math.floor(Date.now() / 1000) + 600}.${crypto.randomBytes(8).toString("hex")}`;
  const state = `${value}.${sign(value)}`;
  const q = new URLSearchParams({ client_id: process.env.EBAY_CLIENT_ID, response_type: "code", redirect_uri: process.env.EBAY_RUNAME, scope: SCOPES.join(" "), state });
  return { url: `${AUTH}?${q}`, state };
}

/** The member ID from a valid, unexpired state, else null. */
export function readState(state) {
  const s = String(state || "");
  const i = s.lastIndexOf(".");
  if (i < 0) return null;
  const value = s.slice(0, i), mac = s.slice(i + 1), good = sign(value);
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  const [userId, exp] = value.split(".");
  return Number(exp) > Date.now() / 1000 ? userId : null;
}

async function tokenRequest(params) {
  const r = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST", cache: "no-store",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `eBay sign-in failed (${r.status})`);
  return j;
}

/** Finish the connection: swap the one-time code for tokens and remember the eBay account (encrypted). */
export async function connect(userId, code) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.EBAY_RUNAME });
  const now = Date.now();
  const row = {
    accessToken: seal(t.access_token), accessExpiresAt: new Date(now + (t.expires_in - 60) * 1000),
    refreshToken: seal(t.refresh_token), refreshExpiresAt: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000) : null,
  };
  let username = null;
  try {
    const me = await fetch(`https://apiz.ebay.com/commerce/identity/v1/user/`, { headers: { Authorization: `Bearer ${t.access_token}` }, cache: "no-store" });
    if (me.ok) username = (await me.json()).username || null;
  } catch { /* the username is only for display */ }
  await db.insert(ebayAccounts).values({ userId, ebayUsername: username, ...row, connectedAt: new Date() })
    .onConflictDoUpdate({ target: ebayAccounts.userId, set: { ebayUsername: username, ...row, connectedAt: new Date() } });
  await log("signin", "info", `Connected eBay${username ? ` (${username})` : ""}`, null, userId);
  return username;
}

/** An application token (no member involved), for calls like the Notification API's public keys. */
let appTok = { value: null, until: 0 };
export async function appToken() {
  if (appTok.value && Date.now() < appTok.until) return appTok.value;
  const t = await tokenRequest({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" });
  appTok = { value: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 };
  return appTok.value;
}

/** eBay says this eBay user closed their account (Marketplace Account Deletion): forget their connection. */
export async function forgetEbayUser(username) {
  if (!db || !username) return 0;
  const gone = await db.delete(ebayAccounts).where(eq(ebayAccounts.ebayUsername, String(username))).returning({ userId: ebayAccounts.userId });
  for (const g of gone) await log("signin", "info", "eBay account closed on eBay: connection removed", null, g.userId);
  return gone.length;
}

export async function ebayAccount(userId) {
  if (!db) return null;
  const [a] = await db.select().from(ebayAccounts).where(eq(ebayAccounts.userId, userId)).limit(1);
  return a || null;
}

export async function disconnect(userId) {
  await db.delete(ebayAccounts).where(eq(ebayAccounts.userId, userId));
  await log("signin", "info", "Disconnected eBay", null, userId);
}

/** A working access token for this member, refreshed when it has expired. */
async function accessToken(userId) {
  const a = await ebayAccount(userId);
  if (!a) throw new SellError("Connect your eBay account first.", "not_connected");
  if (a.accessExpiresAt.getTime() > Date.now()) return open(a.accessToken);
  let t;
  try {
    t = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(a.refreshToken), scope: SCOPES.join(" ") });
  } catch {
    throw new SellError("Your eBay connection expired. Please connect eBay again in Settings.", "reconnect");
  }
  await db.update(ebayAccounts).set({ accessToken: seal(t.access_token), accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) })
    .where(eq(ebayAccounts.userId, userId));
  return t.access_token;
}

export class SellError extends Error {
  constructor(message, code = "ebay") { super(message); this.code = code; }
}

/** One eBay API call as this member. Turns eBay's error list into one readable message. */
async function ebay(userId, method, path, body, { host = API, raw = false } = {}) {
  const token = await accessToken(userId);
  const r = await fetch(`${host}${path}`, {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Language": "en-US", "Accept-Language": "en-US",
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (raw) return r;
  const text = await r.text();
  const j = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!r.ok) {
    const msg = (j.errors || []).map((e) => e.longMessage || e.message).filter(Boolean).join(" ") || `eBay said ${r.status}`;
    throw new SellError(msg, (j.errors || [])[0]?.errorId ? `ebay_${j.errors[0].errorId}` : "ebay");
  }
  return j;
}

// ---------- what the seller needs set up on eBay ----------
/** The seller's shipping, payment and return policies (eBay requires one of each to list). */
export async function sellerPolicies(userId) {
  const get = (kind) => ebay(userId, "GET", `/sell/account/v1/${kind}_policy?marketplace_id=${MARKETPLACE}`)
    .then((j) => (j[`${kind}Policies`] || []).map((p) => ({ id: p[`${kind}PolicyId`], name: p.name })))
    .catch((e) => { if (e.code === "ebay_20403") return null; throw e; }); // 20403: not opted in to business policies
  const [fulfillment, payment, ret] = await Promise.all([get("fulfillment"), get("payment"), get("return")]);
  return { fulfillment, payment, return: ret, optedIn: fulfillment !== null && payment !== null && ret !== null,
    ready: Boolean(fulfillment?.length && payment?.length && ret?.length) };
}

const ALL = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];

/**
 * Create whichever of the three policies the seller is missing, from a few simple choices, switching on eBay's
 * business policies first if needed. choices: { shipping: "free"|"flat", shipCost, handlingDays, returns: "none"|"30" }.
 */
export async function setupPolicies(userId, choices) {
  let have = await sellerPolicies(userId);
  if (!have.optedIn) {
    await ebay(userId, "POST", "/sell/account/v1/program/opt_in", { programType: "SELLING_POLICY_MANAGEMENT" })
      .catch((e) => { if (!/already/i.test(e.message)) throw e; });
    have = await sellerPolicies(userId);
    if (!have.optedIn) throw new SellError("eBay is still switching on business policies for your account. Try again in a few minutes.", "opting_in");
  }
  const free = choices.shipping === "free";
  const cost = free ? 0 : Math.max(0, Math.min(100, Number(choices.shipCost) || 0));
  if (!have.fulfillment.length) {
    const service = (code) => ({
      name: `TCG Boogie: ${free ? "free shipping" : `$${cost.toFixed(2)} shipping`}`, marketplaceId: MARKETPLACE, categoryTypes: ALL,
      handlingTime: { value: [1, 2, 3].includes(Number(choices.handlingDays)) ? Number(choices.handlingDays) : 1, unit: "DAY" },
      shippingOptions: [{ optionType: "DOMESTIC", costType: "FLAT_RATE", shippingServices: [{
        shippingCarrierCode: "USPS", shippingServiceCode: code, sortOrder: 1, freeShipping: free,
        shippingCost: { value: cost.toFixed(2), currency: "USD" },
      }] }],
    });
    // USPS Ground Advantage replaced First Class; fall back to Priority if eBay doesn't take the code.
    await ebay(userId, "POST", "/sell/account/v1/fulfillment_policy", service("USPSGroundAdvantage"))
      .catch(() => ebay(userId, "POST", "/sell/account/v1/fulfillment_policy", service("USPSPriority")));
  }
  if (!have.payment.length) {
    await ebay(userId, "POST", "/sell/account/v1/payment_policy", { name: "TCG Boogie: eBay checkout", marketplaceId: MARKETPLACE, categoryTypes: ALL, immediatePay: true });
  }
  if (!have.return.length) {
    const r = choices.returns === "30"
      ? { returnsAccepted: true, returnPeriod: { value: 30, unit: "DAY" }, returnShippingCostPayer: "BUYER", refundMethod: "MONEY_BACK" }
      : { returnsAccepted: false };
    await ebay(userId, "POST", "/sell/account/v1/return_policy", { name: `TCG Boogie: ${choices.returns === "30" ? "30-day returns" : "no returns"}`, marketplaceId: MARKETPLACE, categoryTypes: ALL, ...r });
  }
  await log("admin", "info", "Created eBay shipping, payment and return policies", { shipping: free ? "free" : cost, returns: choices.returns }, userId);
}

async function ensureLocation(userId, postalCode) {
  const r = await ebay(userId, "GET", `/sell/inventory/v1/location/${LOCATION_KEY}`, null, { raw: true });
  if (r.ok) return;
  await ebay(userId, "POST", `/sell/inventory/v1/location/${LOCATION_KEY}`, {
    location: { address: { postalCode, country: "US" } }, locationTypes: ["WAREHOUSE"], name: "TCG Boogie listings",
    merchantLocationStatus: "ENABLED",
  });
}

/** Upload one photo to eBay's picture service; returns its eBay image URL. */
async function uploadPhoto(userId, file) {
  const form = new FormData();
  form.append("image", file, file.name || "photo.jpg");
  const r = await ebay(userId, "POST", "/commerce/media/v1_beta/image/create_image_from_file", form, { host: "https://apim.ebay.com", raw: true });
  if (r.status !== 201) {
    const j = await r.json().catch(() => ({}));
    throw new SellError((j.errors || [])[0]?.longMessage || `eBay didn't accept that photo (${r.status}). Use a JPG or PNG under 12 MB.`);
  }
  const loc = r.headers.get("location") || "";
  const id = loc.split("/").pop();
  const img = await ebay(userId, "GET", `/commerce/media/v1_beta/image/${encodeURIComponent(id)}`, null, { host: "https://apim.ebay.com" });
  return img.imageUrl;
}

// ---------- building the listing from a collection item ----------
const cardNumber = (n) => String(n || "").replace(/^#/, "");
const baseName = (n) => String(n || "").replace(/\s*-\s*\d+\/?\d*$/, "").replace(/\s*\(.*\)$/, "").trim();
const cleanSet = (s) => String(s || "").replace(/^[A-Za-z0-9]+:\s*/, "").replace(/^SM - |^XY - /, "");

/** A suggested title (max 80 characters): what buyers search for. */
export function suggestTitle(item) {
  const grade = item.kind === "graded" ? `${item.grader} ${item.grade}` : item.condition ? { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", Damaged: "DMG" }[item.condition] : "";
  const parts = ["Pokemon", baseName(item.name), cardNumber(item.number), cleanSet(item.setName),
    /reverse/i.test(item.printing || "") ? "Reverse Holo" : /holo/i.test(item.printing || "") ? "Holo" : "", grade];
  let t = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  while (t.length > 80) { parts.splice(parts.length - 2, 1); t = parts.filter(Boolean).join(" ").slice(0, 80); }
  return t;
}

export function suggestDescription(item) {
  const lines = [
    `${baseName(item.name)}${item.number ? ` #${cardNumber(item.number)}` : ""}${item.setName ? ` from ${cleanSet(item.setName)}` : ""}.`,
    item.kind === "graded" ? `Graded ${item.grader} ${item.grade}${item.certNumber ? `, certification #${item.certNumber}` : ""}.`
      : item.condition ? `Raw (ungraded) card in ${item.condition} condition.` : "",
    item.printing ? `Printing: ${item.printing}.` : "",
    "The card pictured is the exact card you will receive.",
    "Shipped securely in a sleeve and top loader (slabs bubble-wrapped).",
  ];
  return lines.filter(Boolean).join("\n");
}

function aspects(item) {
  const a = {
    Game: ["Pokémon TCG"], Manufacturer: ["The Pokémon Company"], "Card Name": [baseName(item.name)], Character: [baseName(item.name).split(" ")[0]],
    Language: ["English"], Graded: [item.kind === "graded" ? "Yes" : "No"],
  };
  if (item.setName) a.Set = [cleanSet(item.setName)];
  if (item.number) a["Card Number"] = [cardNumber(item.number)];
  if (item.printing) a.Finish = [/reverse/i.test(item.printing) ? "Reverse Holo" : /holo/i.test(item.printing) ? "Holo" : "Regular"];
  if (item.kind === "graded") {
    if (GRADER_NAMES[item.grader]) a["Professional Grader"] = [GRADER_NAMES[item.grader]];
    if (item.grade) a.Grade = [String(item.grade)];
    if (item.certNumber) a["Certification Number"] = [String(item.certNumber).slice(0, 20)];
  }
  return a;
}

function condition(item) {
  if (item.kind === "graded") {
    const d = [];
    if (GRADER_IDS[item.grader]) d.push({ name: "27501", values: [GRADER_IDS[item.grader]] });
    if (GRADE_IDS[String(parseFloat(item.grade))] || GRADE_IDS[String(item.grade)]) d.push({ name: "27502", values: [GRADE_IDS[String(parseFloat(item.grade))] || GRADE_IDS[String(item.grade)]] });
    if (item.certNumber) d.push({ name: "27503", additionalInfo: String(item.certNumber).slice(0, 20) });
    return { condition: "LIKE_NEW", conditionDescriptors: d }; // 2750 = Graded
  }
  return { condition: "USED_VERY_GOOD", conditionDescriptors: [{ name: "40001", values: [CONDITION_IDS[item.condition] || "400010"] }] }; // 4000 = Ungraded
}

/**
 * Create and publish the listing. `form`: { title, description, price, format (FIXED_PRICE|AUCTION), duration,
 * postalCode, policies: {fulfillment, payment, return}, photos: File[] }. Returns { listingId, url }.
 */
export async function listItem(userId, item, form) {
  if (!form.photos?.length) throw new SellError("Add at least one photo of your card.");
  if (form.postalCode && !/^\d{5}$/.test(form.postalCode)) throw new SellError("Enter the 5-digit ZIP code your card ships from.");
  const a = await ebayAccount(userId);
  const zip = form.postalCode || a?.postalCode;
  if (!zip) throw new SellError("Enter the ZIP code your card ships from.");
  if (zip !== a?.postalCode) await db.update(ebayAccounts).set({ postalCode: zip }).where(eq(ebayAccounts.userId, userId));
  await ensureLocation(userId, zip);

  const imageUrls = [];
  for (const f of form.photos.slice(0, 12)) imageUrls.push(await uploadPhoto(userId, f));

  const sku = `TCGB-${item.id}-${Date.now().toString(36)}`;
  const step = (name, details) => log("admin", "info", `eBay listing step: ${name}`, { sku, ...details }, userId);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. The card record (eBay calls it an inventory item).
  const put = await ebay(userId, "PUT", `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    ...condition(item),
    product: { title: form.title.slice(0, 80), description: form.description, aspects: aspects(item), imageUrls },
  }, { raw: true });
  const putBody = await put.text();
  if (!put.ok) {
    const j = (() => { try { return JSON.parse(putBody); } catch { return {}; } })();
    await step("card record rejected", { status: put.status, errors: j.errors });
    throw new SellError((j.errors || []).map((e) => e.longMessage || e.message).join(" ") || `eBay said ${put.status} saving the card`);
  }
  await step("card record saved", { status: put.status, warnings: putBody ? putBody.slice(0, 500) : null });
  // eBay can take a moment before a new record can be used: confirm it's there first.
  for (let i = 0; i < 6; i++) {
    const r = await ebay(userId, "GET", `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, null, { raw: true });
    if (r.ok) break;
    if (i === 5) {
      await step("card record never appeared", { status: r.status, body: (await r.text()).slice(0, 500) });
      throw new SellError("eBay didn't finish saving the card. Please try again in a minute.");
    }
    await wait(1500);
  }

  // 2. The offer (price, format, policies), retried if eBay still says the record isn't there.
  const auction = form.format === "AUCTION";
  const offerBody = {
    sku, marketplaceId: MARKETPLACE, format: auction ? "AUCTION" : "FIXED_PRICE", availableQuantity: 1, categoryId: CATEGORY,
    listingDescription: form.description.replace(/\n/g, "<br>"), merchantLocationKey: LOCATION_KEY,
    listingDuration: auction ? `DAYS_${form.duration || 7}` : "GTC",
    listingPolicies: { fulfillmentPolicyId: form.policies.fulfillment, paymentPolicyId: form.policies.payment, returnPolicyId: form.policies.return },
    pricingSummary: auction ? { auctionStartPrice: { value: form.price.toFixed(2), currency: "USD" } } : { price: { value: form.price.toFixed(2), currency: "USD" } },
  };
  let offer;
  for (let i = 0; ; i++) {
    try {
      offer = await ebay(userId, "POST", "/sell/inventory/v1/offer", offerBody);
      break;
    } catch (e) {
      await step("offer rejected", { attempt: i + 1, error: e.message, code: e.code });
      if (i >= 2 || !/could not be found|not available/i.test(e.message)) throw e;
      await wait(2500);
    }
  }
  await step("offer created", { offerId: offer.offerId });

  // 3. Publish.
  let pub;
  try {
    pub = await ebay(userId, "POST", `/sell/inventory/v1/offer/${offer.offerId}/publish`, {});
  } catch (e) {
    await step("publish rejected", { offerId: offer.offerId, error: e.message, code: e.code });
    throw e;
  }
  await db.insert(ebayListings).values({ userId, itemId: item.id, sku, offerId: offer.offerId, listingId: pub.listingId,
    format: auction ? "AUCTION" : "FIXED_PRICE", price: form.price, title: form.title.slice(0, 80) });
  await log("admin", "info", `Listed on eBay: ${form.title.slice(0, 80)} (${auction ? "auction" : "Buy It Now"} $${form.price.toFixed(2)})`, { listingId: pub.listingId }, userId);
  return { listingId: pub.listingId, url: `https://www.ebay.com/itm/${pub.listingId}` };
}

export async function listingsFor(userId, itemId) {
  if (!db) return [];
  return db.select().from(ebayListings).where(and(eq(ebayListings.userId, userId), eq(ebayListings.itemId, Number(itemId))))
    .orderBy(desc(ebayListings.createdAt)).limit(5);
}

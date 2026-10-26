// Database tables (PostgreSQL on our own server, the VPS; Neon until 2026-10-26). The four auth tables follow the Auth.js Drizzle adapter layout.
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"), // set by Auth.js from the first sign-in
  // Profile pictures from each connected sign-in, and which one to show (google / discord / initials).
  googleImage: text("google_image"),
  discordImage: text("discord_image"),
  avatarSource: text("avatar_source"),
  avatarCheckedAt: timestamp("avatar_checked_at", { mode: "date" }), // last automatic Discord picture check
  // Plan: "free" or "premium". Set by billing (Stripe) later; the Discord bot reads it to grant the role.
  tier: text("tier").notNull().default("free"),
  // Billing (Stripe). Deleting an account deletes the Stripe customer first, which cancels any subscription.
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionStatus: text("subscription_status"), // active / past_due / canceled ... (from Stripe)
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }), // paid through
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // Complimentary Premium granted by an admin (never charged): until a date, or unlimited.
  compUntil: timestamp("comp_until", { mode: "date" }),
  compUnlimited: boolean("comp_unlimited").notNull().default(false),
  compNote: text("comp_note"),
  compGrantedAt: timestamp("comp_granted_at", { mode: "date" }),
  // Alert delivery preferences
  alertDiscord: boolean("alert_discord").notNull().default(true),
  alertWebPush: boolean("alert_web_push").notNull().default(false),
  alertEmail: boolean("alert_email").notNull().default(true),
  // Text alerts (Premium): number in E.164 (+15551234567), confirmed with a one-time code, and the member's opt-in.
  phone: text("phone"),
  phoneVerifiedAt: timestamp("phone_verified_at", { mode: "date" }),
  alertSms: boolean("alert_sms").notNull().default(false),
  smsCodeHash: text("sms_code_hash"),
  smsCodeExpires: timestamp("sms_code_expires", { mode: "date" }),
  emailRecap: text("email_recap").notNull().default("weekly"), // off / weekly / daily
  // Collection alert settings (Premium): { setDeals: bool, sellHigh: bool, sellHighPct: number }
  collectionPrefs: jsonb("collection_prefs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// TCGplayer price watches (see lib/watches.js). Product details are snapshotted so the list loads without lookups;
// the price checker updates lastPrice / status a few times a day.
export const priceWatches = pgTable("price_watch", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(), // TCGplayer product ID
  productType: text("product_type").notNull(), // card / sealed
  name: text("name").notNull(),
  setName: text("set_name"),
  number: text("number"),
  image: text("image"),
  tcgplayerUrl: text("tcgplayer_url"),
  printing: text("printing"),
  condition: text("condition"),
  priceType: text("price_type").notNull().default("market"), // market / low
  mode: text("mode").notNull().default("below"), // below (target price) / drop (percent from basePrice)
  targetPrice: doublePrecision("target_price"),
  dropPct: integer("drop_pct"),
  basePrice: doublePrecision("base_price"),
  alsoEbay: boolean("also_ebay").notNull().default(true),
  status: text("status").notNull().default("watching"), // watching / triggered
  lastPrice: doublePrecision("last_price"),
  lastCheckedAt: timestamp("last_checked_at", { mode: "date" }),
  triggeredAt: timestamp("triggered_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------- collection tracker (see lib/collection.js) ----------
// Folders a member groups their cards into ("PC", "For trade", ...).
export const binders = pgTable("binder", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// One line of a collection or wishlist: a product in one printing + condition (raw), grader + grade (graded), or sealed.
// Product details are snapshotted; unitValue is refreshed from the price service about once a day.
export const collectionItems = pgTable("collection_item", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  list: text("list").notNull().default("owned"), // owned / wishlist
  binderId: integer("binder_id").references(() => binders.id, { onDelete: "set null" }),
  productId: text("product_id").notNull(), // TCGplayer product ID
  productType: text("product_type").notNull(), // card / sealed
  name: text("name").notNull(),
  setName: text("set_name"),
  number: text("number"),
  image: text("image"),
  tcgplayerUrl: text("tcgplayer_url"),
  kind: text("kind").notNull(), // raw / graded / sealed
  printing: text("printing"),
  condition: text("condition"), // raw cards
  grader: text("grader"), // graded cards
  grade: text("grade"),
  certNumber: text("cert_number"),
  quantity: integer("quantity").notNull().default(1),
  purchasePrice: doublePrecision("purchase_price"), // per copy
  purchaseDate: date("purchase_date"),
  customValue: doublePrecision("custom_value"), // member's own value per copy, overrides the market value
  unitValue: doublePrecision("unit_value"), // latest market value per copy
  valueUpdatedAt: timestamp("value_updated_at", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("collection_item_user_idx").on(t.userId)]);

// Real eBay sales we verified ourselves through eBay's API (never scraped): auctions the deal bot saw end
// ("tracked") and sales members reported ("member"). Merged with the price service's sales for card values.
export const sales = pgTable("sale", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().unique(), // eBay legacy item number
  productId: text("product_id").notNull(),
  kind: text("kind").notNull(), // graded / raw / sealed
  grader: text("grader"),
  grade: text("grade"),
  condition: text("condition"),
  language: text("language").notNull().default("english"),
  price: doublePrecision("price").notNull(), // final price, without shipping
  shipping: doublePrecision("shipping"),
  soldAt: timestamp("sold_at", { mode: "date" }).notNull(),
  title: text("title"),
  url: text("url"),
  source: text("source").notNull(), // tracked / member
  reportedBy: text("reported_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("sale_product_idx").on(t.productId)]);

// Sealed product prices, one per product per day. The price service charges ~100 credits for sealed history, so we
// keep our own (recorded whenever a sealed product is looked up, and daily for sealed products members own or watch).
export const sealedPrices = pgTable("sealed_price", {
  productId: text("product_id").notNull(),
  day: date("day").notNull(),
  price: doublePrecision("price").notNull(),
}, (t) => [primaryKey({ columns: [t.productId, t.day] })]);

// Each member's collection value, once a day, for the value-over-time chart.
export const portfolioSnapshots = pgTable("portfolio_snapshot", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  value: doublePrecision("value").notNull(),
  cost: doublePrecision("cost").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

// Price-service responses shared by every member, so a card is looked up once a day no matter how many people own it.
export const catalogCache = pgTable("catalog_cache", {
  key: text("key").primaryKey(),
  data: jsonb("data"),
  fetchedAt: timestamp("fetched_at", { mode: "date" }).notNull().defaultNow(),
});

// Phones and browsers that get push alerts (lib/push.js): one row per device a member switched on in Settings.
// Removed when the member turns that device off, deletes their account, or the browser says it's gone.
export const pushSubscriptions = pgTable("push_subscription", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(), // the browser's push address (Apple, Google, Mozilla...)
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  device: text("device"), // "iPhone", "Android", "Windows"... for the Settings list
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  lastSentAt: timestamp("last_sent_at", { mode: "date" }),
}, (t) => [index("push_subscription_user_idx").on(t.userId)]);

// Sales posts for X (Admin -> Sales, lib/market.js): which feed items were posted or skipped, so none goes out twice.
export const socialPosts = pgTable("social_post", {
  key: text("key").primaryKey(), // the feed item's id: "high-123", "big-123", "deal-123"
  status: text("status").notNull(), // posted / skipped
  caption: text("caption"),
  postId: text("post_id"), // the post's id on X
  postUrl: text("post_url"),
  by: text("by"), // the admin's email
  at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
});

// Topps Pokémon cards (lib/topps.js; the checklist ships with the code): the typical eBay asking price for a raw copy,
// worked out by the deal bot from current Buy It Now listings every few days (pokemon-deal-finder/dealfinder/topps.py).
export const toppsPrices = pgTable("topps_price", {
  productId: text("product_id").primaryKey(), // "t-s1-6" (lib/data/topps.json)
  price: doublePrecision("price"), // median asking price; null when too few listings matched
  low: doublePrecision("low"),
  high: doublePrecision("high"),
  listings: integer("listings").notNull().default(0), // matching listings the price rests on
  image: text("image"), // a current listing's photo (i.ebayimg.com)
  history: jsonb("history"), // [{ date, price }], one point per check, newest last
  checkedAt: timestamp("checked_at", { mode: "date" }).notNull().defaultNow(),
});

// A member's saved deal filters (see lib/filters.js for the shape of `filters`).
export const profiles = pgTable("profile", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// Every alert we send (price alerts today; deal alerts later), so nothing goes out twice and members have a history.
export const alertLog = pgTable("alert_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  watchId: integer("watch_id").references(() => priceWatches.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // price_buy / price_sell
  channel: text("channel").notNull(), // email / discord
  title: text("title").notNull(),
  price: doublePrecision("price"),
  target: doublePrecision("target"),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
  dealId: text("deal_id"), // deal alerts: the eBay item (see deal)
  sentAt: timestamp("sent_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("alert_log_user_idx").on(t.userId), index("alert_log_deal_idx").on(t.dealId)]);

// Small server-side settings (e.g. when the price-alert job last ran).
export const appSettings = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// Every change an admin makes to a member (who, what, when).
export const adminLog = pgTable("admin_log", {
  id: serial("id").primaryKey(),
  adminEmail: text("admin_email").notNull(),
  targetUserId: text("target_user_id"),
  targetEmail: text("target_email"),
  action: text("action").notNull(),
  details: jsonb("details"),
  at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
});

// Stripe webhook events already handled (Stripe can send the same event more than once).
export const stripeEvents = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { mode: "date" }).notNull().defaultNow(),
});

// Site-wide event log (Admin → Logs): what ran, what worked, what broke. Kept 60 days.
export const systemLog = pgTable("system_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
  source: text("source").notNull(), // payments / alerts / prices / signin / admin / website
  level: text("level").notNull().default("info"), // info / warn / error
  message: text("message").notNull(),
  details: jsonb("details"),
  userId: text("user_id"), // no foreign key: the log outlives deleted accounts
}, (t) => [index("system_log_at_idx").on(t.at), index("system_log_source_idx").on(t.source, t.at)]);

// Ideas and "I couldn't do this" notes from members and visitors (lib/ideas.js, Admin → Ideas). context is what
// the site attached (search words, the filter they were in...). When an admin marks one done, the member gets an email.
export const ideas = pgTable("idea", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
  userId: text("user_id"), // null for visitors; no foreign key, so ideas outlive deleted accounts
  source: text("source").notNull(), // menu / footer / faq / helper / search / filters / error / notfound
  page: text("page"),
  plan: text("plan"), // free / premium / visitor
  text: text("text").notNull(),
  context: jsonb("context"),
  status: text("status").notNull().default("new"), // new / planned / building / done / declined
  updatedAt: timestamp("updated_at", { mode: "date" }),
  notifiedAt: timestamp("notified_at", { mode: "date" }), // "it's live" email sent
}, (t) => [index("idea_at_idx").on(t.at), index("idea_status_idx").on(t.status)]);

// The site helper's questions and answers (lib/helper.js), kept 30 days so Admin → Helper can show what confuses
// members. Not shown to anyone else; no foreign key, so a deleted account's rows simply age out.
export const helperLog = pgTable("helper_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { mode: "date" }).notNull().defaultNow(),
  userId: text("user_id"), // null for visitors who aren't signed in
  page: text("page"), // the page they asked from
  question: text("question").notNull(),
  answer: text("answer"),
  ok: boolean("ok").notNull().default(true), // false when the helper couldn't answer (error or refusal)
}, (t) => [index("helper_log_at_idx").on(t.at)]);

// Deals found by the deal bot (pokemon-deal-finder), one row per eBay auction. `data` has the shape lib/filters.js
// matches against. The bot updates lastPrice while it can still see the auction; the website sends alerts once
// (dispatchedAt) and shows ended deals to Free members.
export const deals = pgTable("deal", {
  id: text("id").primaryKey(), // eBay item id
  data: jsonb("data").notNull(),
  endsAt: timestamp("ends_at", { mode: "date" }).notNull(),
  foundAt: timestamp("found_at", { mode: "date" }).notNull().defaultNow(),
  lastPrice: doublePrecision("last_price"),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
  dispatchedAt: timestamp("dispatched_at", { mode: "date" }),
  // How it really ended, looked up by the bot once after the auction (dealfinder/sales.py): did it sell, and for how
  // much including shipping. outcome_checked_at is set even when eBay no longer had the listing (sold stays null).
  sold: boolean("sold"),
  finalPrice: doublePrecision("final_price"),
  outcomeCheckedAt: timestamp("outcome_checked_at", { mode: "date" }),
}, (t) => [index("deal_ends_idx").on(t.endsAt)]);

// A member's connected eBay seller account (for "Sell on eBay"). Tokens are encrypted (lib/secret-box.js).
export const ebayAccounts = pgTable("ebay_account", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  ebayUsername: text("ebay_username"),
  accessToken: text("access_token").notNull(), // encrypted
  accessExpiresAt: timestamp("access_expires_at", { mode: "date" }).notNull(),
  refreshToken: text("refresh_token").notNull(), // encrypted
  refreshExpiresAt: timestamp("refresh_expires_at", { mode: "date" }),
  postalCode: text("postal_code"), // where items ship from (eBay requires a location)
  connectedAt: timestamp("connected_at", { mode: "date" }).notNull().defaultNow(),
});

// Listings a member created on eBay from their collection.
export const ebayListings = pgTable("ebay_listing", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => collectionItems.id, { onDelete: "set null" }),
  sku: text("sku").notNull(),
  offerId: text("offer_id"),
  listingId: text("listing_id"),
  format: text("format"), // FIXED_PRICE / AUCTION
  price: doublePrecision("price"),
  title: text("title"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("ebay_listing_user_idx").on(t.userId)]);

// eBay listings that met a price alert with "also alert me when it's listed on eBay" (found by the deal bot).
// The website alerts the member once per listing (notifiedAt).
export const watchListings = pgTable("watch_listing", {
  id: serial("id").primaryKey(),
  watchId: integer("watch_id").notNull().references(() => priceWatches.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(), // eBay item id
  title: text("title").notNull(),
  price: doublePrecision("price").notNull(), // with shipping
  url: text("url").notNull(),
  image: text("image"),
  photoCheck: text("photo_check"), // match / unclear / skipped
  flags: jsonb("flags"),
  foundAt: timestamp("found_at", { mode: "date" }).notNull().defaultNow(),
  notifiedAt: timestamp("notified_at", { mode: "date" }),
}, (t) => [uniqueIndex("watch_listing_unique").on(t.watchId, t.itemId), index("watch_listing_found_idx").on(t.foundAt)]);

// "Can't find a card? Request it": what a member searched for and the link they sent. A TCGplayer link to a product
// our price service has is added at once (status "added"); anything else waits for an admin (Admin → Requests).
export const cardRequests = pgTable("card_request", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("card"), // card / sealed / import (an import file we couldn't read)
  query: text("query").notNull(), // what they searched for (import: the file's column names)
  link: text("link").notNull(), // import: the file name
  note: text("note"),
  status: text("status").notNull(), // added / pending / declined
  productId: text("product_id"),
  language: text("language"),
  reason: text("reason"), // why it was added, held for review or declined (shown to admins)
  card: jsonb("card"), // what we read from the link when it's held for review (Admin → Requests: "Add as read")
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("card_request_status_idx").on(t.status, t.createdAt)]);

// Search words that should find a product the price service's search misses (learned from approved requests).
export const searchAliases = pgTable("search_alias", {
  id: serial("id").primaryKey(),
  term: text("term").notNull(), // normalized: lowercase words, single spaces
  productId: text("product_id").notNull(),
  language: text("language").notNull().default("english"),
  requestId: integer("request_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("search_alias_unique").on(t.term, t.productId, t.language)]);

// Cards members added through "Request a card" that our price service doesn't carry (often Korean or Chinese cards).
// They work like any card (collection, wishlist, price alerts, reported sales) but have no TCGplayer prices.
// product_id is the TCGplayer product number when there is one (so prices appear by themselves once the service adds
// it), otherwise "m-" plus a random code.
export const memberCards = pgTable("member_card", {
  id: serial("id").primaryKey(),
  productId: text("product_id").notNull().unique(),
  type: text("type").notNull().default("card"), // card / sealed
  name: text("name").notNull(),
  setName: text("set_name"),
  number: text("number"),
  rarity: text("rarity"),
  language: text("language").notNull().default("english"), // english / japanese / korean / chinese / other
  image: text("image"),
  sourceUrl: text("source_url").notNull(), // the link the member sent
  source: text("source").notNull(), // tcgplayer / page (read from the linked page)
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  requestId: integer("request_id"),
  hidden: boolean("hidden").notNull().default(false), // removed by an admin (junk); search and card pages skip it
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("member_card_source_idx").on(t.sourceUrl)]);

// Daily rate limits that must survive deploys (lib/rate-limit.js): one row per bucket, member and day window.
export const rateLimits = pgTable("rate_limit", {
  id: text("id").primaryKey(), // "<bucket>:<member>:<window start ms>"
  count: integer("count").notNull().default(0),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
}, (t) => [index("rate_limit_expires_idx").on(t.expiresAt)]);

// "Notify me" votes for games we don't cover yet (homepage). One per member per game; tells us which game to add next
// and who to tell when it's live.
export const gameInterest = pgTable("game_interest", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  game: text("game").notNull(), // magic / lorcana / onepiece / yugioh
  notifiedAt: timestamp("notified_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("game_interest_unique").on(t.userId, t.game)]);

// Our own visit counts (Admin → Traffic): one row per day, kind and key, e.g. ("2026-10-24", "view", "/faq") = 31.
// Only totals: nothing here identifies a visitor (lib/traffic.js).
export const siteTraffic = pgTable("site_traffic", {
  day: text("day").notNull(), // YYYY-MM-DD (UTC)
  kind: text("kind").notNull(), // view / visitor / ref / source / signup
  key: text("key").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.kind, t.key] })]);

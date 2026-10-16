// Database tables (PostgreSQL on Neon). The four auth tables follow the Auth.js Drizzle adapter layout.
import { boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Plan: "free" or "premium". Set by billing (Stripe) later; the Discord bot reads it to grant the role.
  tier: text("tier").notNull().default("free"),
  // Alert delivery preferences
  alertDiscord: boolean("alert_discord").notNull().default(true),
  alertWebPush: boolean("alert_web_push").notNull().default(false),
  emailRecap: text("email_recap").notNull().default("weekly"), // off / weekly / daily
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

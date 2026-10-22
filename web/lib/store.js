import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { defaultFilters } from "@/lib/filters";
import { PLANS } from "@/lib/plans";

const { users, accounts, profiles } = schema;

// ---------- demo mode: in-memory data so every page can be previewed without a database ----------
const g = globalThis;
function demo() {
  if (!g.__tcgDemo) {
    const f = defaultFilters(PLANS.premium);
    g.__tcgDemo = {
      nextId: 3,
      prefs: { alertDiscord: true, alertWebPush: false, alertEmail: true, alertSms: false, phone: null, phoneVerifiedAt: null, emailRecap: "daily", discordConnected: false },
      profiles: [
        { id: 1, userId: "demo", name: "My deals", active: true, filters: f, createdAt: new Date(), updatedAt: new Date() },
        {
          id: 2, userId: "demo", name: "Vintage PSA 8+", active: true, createdAt: new Date(), updatedAt: new Date(),
          filters: { ...f, cardTypes: ["graded"], graders: ["PSA"], minGrade: 8, minMarketValue: 100,
            sets: ["Base Set", "Jungle", "Fossil", "Team Rocket"], pokemon: ["Charizard", "Blastoise", "Venusaur"] },
        },
      ],
    };
  }
  return g.__tcgDemo;
}
const isDemo = (userId) => userId === "demo";
export const demoPrefs = () => demo().prefs;

// ---------- users ----------
export async function getUser(id) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row || null;
}

export async function linkedProviders(userId) {
  const rows = await db.select({ provider: accounts.provider }).from(accounts).where(eq(accounts.userId, userId));
  const user = await getUser(userId);
  const list = rows.map((r) => r.provider);
  if (user?.emailVerified) list.push("email");
  return [...new Set(list)];
}

// ---------- profile pictures ----------
const discordAvatarUrl = (p) => (p.avatar && /^(a_)?[a-f0-9]+$/.test(p.avatar)
  ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${p.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
  : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(p.id) >> 22n) % 6n)}.png`);

/** Swap an expired Discord access token for a new one with the refresh token Discord gave us, and store it. */
async function renewDiscordToken(userId, refreshToken) {
  if (!refreshToken || !process.env.AUTH_DISCORD_ID || !process.env.AUTH_DISCORD_SECRET) return null;
  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refreshToken,
      client_id: process.env.AUTH_DISCORD_ID, client_secret: process.env.AUTH_DISCORD_SECRET,
    }),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const t = await r.json();
  if (!t.access_token) return null;
  await db.update(accounts).set({
    access_token: t.access_token, refresh_token: t.refresh_token || refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + Number(t.expires_in || 604800),
  }).where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")));
  return t.access_token;
}

const DAY = 24 * 3600 * 1000;
const checking = g.__tcgAvatarChecks ?? (g.__tcgAvatarChecks = new Set());

/**
 * Pick up a member's current Discord picture (they may have changed it on Discord). Runs at most once a day per
 * member, or right away with { force: true } (e.g. when the saved picture stopped loading). Returns the URL or null.
 */
export async function refreshDiscordImage(userId, { force = false } = {}) {
  if (checking.has(userId)) return null;
  checking.add(userId);
  try {
    const [row] = await db.select({ at: users.avatarCheckedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (!force && row?.at && Date.now() - row.at.getTime() < DAY) return null;
    await db.update(users).set({ avatarCheckedAt: new Date() }).where(eq(users.id, userId));
    const [acct] = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord"))).limit(1);
    if (!acct) return null;
    let token = acct.access_token;
    if ((!token || (acct.expires_at && acct.expires_at * 1000 < Date.now() + 60000)) && acct.refresh_token) {
      token = await renewDiscordToken(userId, acct.refresh_token);
    }
    if (!token) return null;
    const me = (t) => fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    let r = await me(token);
    if (r.status === 401 && acct.refresh_token) {
      token = await renewDiscordToken(userId, acct.refresh_token);
      if (!token) return null;
      r = await me(token);
    }
    if (!r.ok) return null;
    const p = await r.json();
    if (!/^\d+$/.test(String(p.id || ""))) return null;
    const url = discordAvatarUrl(p);
    await db.update(users).set({ discordImage: url }).where(eq(users.id, userId));
    return url;
  } catch {
    return null;
  } finally {
    checking.delete(userId);
  }
}

export async function setAvatarSource(userId, source) {
  const clean = ["google", "discord", "initials"].includes(source) ? source : null;
  if (isDemo(userId)) return void (demo().prefs.avatarSource = clean);
  await db.update(users).set({ avatarSource: clean }).where(eq(users.id, userId));
}

// ---------- text alerts: phone number + one-time code ----------
export async function setPhoneCode(userId, phone, codeHash, expires) {
  if (isDemo(userId)) return void Object.assign(demo().prefs, { pendingPhone: phone, smsCodeHash: codeHash, smsCodeExpires: expires });
  await db.update(users).set({ phone, phoneVerifiedAt: null, alertSms: false, smsCodeHash: codeHash, smsCodeExpires: expires }).where(eq(users.id, userId));
}

export async function getPhoneCode(userId) {
  if (isDemo(userId)) { const p = demo().prefs; return { phone: p.pendingPhone, smsCodeHash: p.smsCodeHash, smsCodeExpires: p.smsCodeExpires }; }
  const [row] = await db.select({ phone: users.phone, smsCodeHash: users.smsCodeHash, smsCodeExpires: users.smsCodeExpires }).from(users).where(eq(users.id, userId)).limit(1);
  return row || {};
}

export async function confirmPhone(userId) {
  const now = new Date();
  if (isDemo(userId)) { const p = demo().prefs; return void Object.assign(p, { phone: p.pendingPhone, phoneVerifiedAt: now, alertSms: true, smsCodeHash: null }); }
  await db.update(users).set({ phoneVerifiedAt: now, alertSms: true, smsCodeHash: null, smsCodeExpires: null }).where(eq(users.id, userId));
}

export async function clearPhone(userId) {
  if (isDemo(userId)) return void Object.assign(demo().prefs, { phone: null, phoneVerifiedAt: null, alertSms: false, pendingPhone: null });
  await db.update(users).set({ phone: null, phoneVerifiedAt: null, alertSms: false, smsCodeHash: null, smsCodeExpires: null }).where(eq(users.id, userId));
}

/** Remove one connected sign-in method (e.g. Discord) from an account. */
export async function unlinkProvider(userId, provider) {
  await db.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));
}

export async function updatePrefs(userId, prefs) {
  const clean = {
    alertDiscord: Boolean(prefs.alertDiscord),
    alertWebPush: Boolean(prefs.alertWebPush),
    alertEmail: Boolean(prefs.alertEmail),
    alertSms: Boolean(prefs.alertSms),
    emailRecap: ["off", "weekly", "daily"].includes(prefs.emailRecap) ? prefs.emailRecap : "weekly",
  };
  if (isDemo(userId)) return Object.assign(demo().prefs, clean);
  await db.update(users).set(clean).where(eq(users.id, userId));
}

/** Turn one alert channel on or off ("alertEmail", "alertDiscord" or "alertSms"), leaving the other settings alone. */
export async function setAlertChannel(userId, field, on) {
  if (!["alertEmail", "alertDiscord", "alertSms"].includes(field)) return;
  if (isDemo(userId)) { demo().prefs[field] = Boolean(on); return; }
  await db.update(users).set({ [field]: Boolean(on) }).where(eq(users.id, userId));
}

export async function updateName(userId, name) {
  const clean = String(name || "").trim().slice(0, 60);
  if (isDemo(userId)) return;
  await db.update(users).set({ name: clean || null }).where(eq(users.id, userId));
}

export async function deleteUser(userId) {
  if (isDemo(userId)) {
    delete g.__tcgDemo;
    return;
  }
  await db.delete(users).where(eq(users.id, userId)); // profiles, accounts and sessions cascade
}

// ---------- filter profiles ----------
export async function listProfiles(userId) {
  if (isDemo(userId)) return [...demo().profiles];
  return db.select().from(profiles).where(eq(profiles.userId, userId)).orderBy(asc(profiles.id));
}

export async function getProfile(userId, id) {
  if (isDemo(userId)) return demo().profiles.find((p) => p.id === Number(id)) || null;
  const [row] = await db.select().from(profiles).where(and(eq(profiles.userId, userId), eq(profiles.id, Number(id)))).limit(1);
  return row || null;
}

export async function createProfile(userId, name, filters) {
  if (isDemo(userId)) {
    const d = demo();
    const row = { id: d.nextId++, userId, name, filters, active: true, createdAt: new Date(), updatedAt: new Date() };
    d.profiles.push(row);
    return row;
  }
  const [row] = await db.insert(profiles).values({ userId, name, filters }).returning();
  return row;
}

export async function updateProfile(userId, id, fields) {
  const patch = { ...fields, updatedAt: new Date() };
  if (isDemo(userId)) {
    const p = demo().profiles.find((x) => x.id === Number(id));
    if (p) Object.assign(p, patch);
    return p;
  }
  const [row] = await db.update(profiles).set(patch).where(and(eq(profiles.userId, userId), eq(profiles.id, Number(id)))).returning();
  return row;
}

export async function deleteProfile(userId, id) {
  if (isDemo(userId)) {
    const d = demo();
    d.profiles = d.profiles.filter((p) => p.id !== Number(id));
    return;
  }
  await db.delete(profiles).where(and(eq(profiles.userId, userId), eq(profiles.id, Number(id))));
}

// ---------- price watches ----------
const { priceWatches } = schema;

export async function listWatches(userId) {
  if (isDemo(userId)) return [...(demo().watches ||= [])];
  return db.select().from(priceWatches).where(eq(priceWatches.userId, userId)).orderBy(asc(priceWatches.id));
}

export async function countWatches(userId) {
  return (await listWatches(userId)).length;
}

export async function createWatch(userId, fields) {
  if (isDemo(userId)) {
    const d = demo();
    d.watches ||= [];
    const row = { id: d.nextId++, userId, status: "watching", lastCheckedAt: new Date(), triggeredAt: null, createdAt: new Date(), ...fields };
    d.watches.push(row);
    return row;
  }
  const [row] = await db.insert(priceWatches).values({ userId, ...fields }).returning();
  return row;
}

export async function updateWatch(userId, id, fields) {
  if (isDemo(userId)) {
    const w = (demo().watches || []).find((x) => x.id === Number(id));
    if (w) Object.assign(w, fields);
    return w;
  }
  const [row] = await db.update(priceWatches).set(fields)
    .where(and(eq(priceWatches.userId, userId), eq(priceWatches.id, Number(id)))).returning();
  return row;
}

export async function deleteWatch(userId, id) {
  if (isDemo(userId)) {
    const d = demo();
    d.watches = (d.watches || []).filter((w) => w.id !== Number(id));
    return;
  }
  await db.delete(priceWatches).where(and(eq(priceWatches.userId, userId), eq(priceWatches.id, Number(id))));
}

// ---------- collection tracker ----------
const { binders, collectionItems, portfolioSnapshots } = schema;
const DEMO_ITEMS = [
  { productId: "246723", productType: "card", name: "Umbreon VMAX (Alternate Art Secret)", setName: "Evolving Skies", number: "215/203", kind: "graded", printing: "Holofoil", grader: "PSA", grade: "10", purchasePrice: 4100, purchaseDate: "2025-11-02", binder: 1 },
  { productId: "517045", productType: "card", name: "Charizard ex", setName: "Scarlet & Violet 151", number: "199/165", kind: "raw", printing: "Holofoil", condition: "Near Mint", quantity: 2, purchasePrice: 240, purchaseDate: "2025-06-14", binder: 1 },
  { productId: "42382", productType: "card", name: "Charizard", setName: "Base Set", number: "004/102", kind: "raw", printing: "Holofoil", condition: "Lightly Played", purchasePrice: 380, purchaseDate: "2024-12-20", binder: 1 },
  { productId: "517035", productType: "card", name: "Psyduck", setName: "Scarlet & Violet 151", number: "175/165", kind: "raw", printing: "Holofoil", condition: "Near Mint", quantity: 3, purchasePrice: 31, binder: 2 },
  { productId: "demo-sv-151-168", productType: "card", name: "Charmander", setName: "Scarlet & Violet 151", number: "168/165", kind: "raw", printing: "Holofoil", condition: "Near Mint", purchasePrice: 25, binder: 2 },
  { productId: "demo-sv-151-170", productType: "card", name: "Squirtle", setName: "Scarlet & Violet 151", number: "170/165", kind: "raw", printing: "Holofoil", condition: "Near Mint", purchasePrice: 19, binder: 2 },
  { productId: "demo-sv-151-6", productType: "card", name: "Charizard ex", setName: "Scarlet & Violet 151", number: "006/165", kind: "raw", printing: "Holofoil", condition: "Near Mint", quantity: 4, purchasePrice: 4 },
  { productId: "demo-sv-151-1", productType: "card", name: "Bulbasaur", setName: "Scarlet & Violet 151", number: "001/165", kind: "raw", printing: "Normal", condition: "Near Mint", quantity: 6 },
  { productId: "demo-base-set-2", productType: "card", name: "Blastoise", setName: "Base Set", number: "002/102", kind: "graded", printing: "Holofoil", grader: "PSA", grade: "8", purchasePrice: 195, binder: 1 },
  { productId: "demo-evs-etb", productType: "sealed", name: "Evolving Skies Elite Trainer Box", setName: "Evolving Skies", kind: "sealed", quantity: 2, purchasePrice: 49.99, purchaseDate: "2021-08-27", binder: 3 },
  { productId: "84186", productType: "card", name: "Charizard", setName: "Skyridge", number: "146/144", kind: "raw", printing: "Holofoil", condition: "Near Mint", list: "wishlist" },
  { productId: "demo-evolving-skies-218", productType: "card", name: "Rayquaza VMAX (Alternate Art Secret)", setName: "Evolving Skies", number: "218/203", kind: "raw", printing: "Holofoil", condition: "Near Mint", list: "wishlist" },
];
function demoCollection() {
  const d = demo();
  if (!d.items) {
    d.binders = [
      { id: 1, userId: "demo", name: "Personal collection", createdAt: new Date() },
      { id: 2, userId: "demo", name: "151 master set", createdAt: new Date() },
      { id: 3, userId: "demo", name: "Sealed", createdAt: new Date() },
    ];
    d.items = DEMO_ITEMS.map(({ binder, ...it }, i) => ({
      id: 1000 + i, userId: "demo", list: "owned", quantity: 1, condition: null, grader: null, grade: null, certNumber: null,
      purchasePrice: null, purchaseDate: null, customValue: null, unitValue: null, valueUpdatedAt: null, notes: null, image: null,
      tcgplayerUrl: null, binderId: binder || null, createdAt: new Date(Date.now() - (DEMO_ITEMS.length - i) * 86400000 * 9), ...it,
    }));
    d.snapshots = [];
    d.collectionPrefs = { setDeals: true, sellHigh: false, sellHighPct: 25 };
  }
  return d;
}

export async function listItems(userId) {
  if (isDemo(userId)) return [...demoCollection().items];
  return db.select().from(collectionItems).where(eq(collectionItems.userId, userId)).orderBy(asc(collectionItems.id));
}

export async function getItem(userId, id) {
  return (await listItems(userId)).find((it) => it.id === Number(id)) || null;
}

export async function createItem(userId, fields) {
  if (isDemo(userId)) {
    const d = demoCollection();
    const row = { id: d.nextId++ + 5000, userId, createdAt: new Date(), unitValue: null, valueUpdatedAt: null, ...fields };
    d.items.push(row);
    return row;
  }
  const [row] = await db.insert(collectionItems).values({ userId, ...fields }).returning();
  return row;
}

export async function updateItem(userId, id, fields) {
  if (isDemo(userId)) {
    const it = demoCollection().items.find((x) => x.id === Number(id));
    if (it) Object.assign(it, fields);
    return it;
  }
  const [row] = await db.update(collectionItems).set(fields)
    .where(and(eq(collectionItems.userId, userId), eq(collectionItems.id, Number(id)))).returning();
  return row;
}

export async function deleteItem(userId, id) {
  if (isDemo(userId)) {
    const d = demoCollection();
    d.items = d.items.filter((x) => x.id !== Number(id));
    return;
  }
  await db.delete(collectionItems).where(and(eq(collectionItems.userId, userId), eq(collectionItems.id, Number(id))));
}

export async function listBinders(userId) {
  if (isDemo(userId)) return [...demoCollection().binders];
  return db.select().from(binders).where(eq(binders.userId, userId)).orderBy(asc(binders.id));
}

export async function createBinder(userId, name) {
  if (isDemo(userId)) {
    const d = demoCollection();
    const row = { id: d.nextId++ + 5000, userId, name, createdAt: new Date() };
    d.binders.push(row);
    return row;
  }
  const [row] = await db.insert(binders).values({ userId, name }).returning();
  return row;
}

export async function renameBinder(userId, id, name) {
  if (isDemo(userId)) {
    const b = demoCollection().binders.find((x) => x.id === Number(id));
    if (b) b.name = name;
    return;
  }
  await db.update(binders).set({ name }).where(and(eq(binders.userId, userId), eq(binders.id, Number(id))));
}

export async function deleteBinder(userId, id) {
  if (isDemo(userId)) {
    const d = demoCollection();
    d.binders = d.binders.filter((b) => b.id !== Number(id));
    for (const it of d.items) if (it.binderId === Number(id)) it.binderId = null;
    return;
  }
  await db.delete(binders).where(and(eq(binders.userId, userId), eq(binders.id, Number(id)))); // items keep, binder set null
}

/** Record today's collection value (one row per member per day; later views the same day overwrite it). */
export async function recordSnapshot(userId, value, cost) {
  const day = new Date().toISOString().slice(0, 10);
  if (isDemo(userId)) {
    const d = demoCollection();
    if (!d.snapshots.length && value > 0) {
      // Demo: invent a believable year of history ending at today's value.
      for (let i = 365; i >= 1; i--) {
        const k = 1 - i * 0.00075 + Math.sin(i / 11) * 0.035 + Math.sin(i / 3.7) * 0.01;
        d.snapshots.push({ day: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), value: Math.round(value * k * 100) / 100, cost });
      }
    }
    d.snapshots = d.snapshots.filter((s) => s.day !== day).concat({ day, value, cost });
    return;
  }
  await db.insert(portfolioSnapshots).values({ userId, day, value, cost })
    .onConflictDoUpdate({ target: [portfolioSnapshots.userId, portfolioSnapshots.day], set: { value, cost } });
}

export async function listSnapshots(userId) {
  if (isDemo(userId)) return [...demoCollection().snapshots];
  return db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId)).orderBy(asc(portfolioSnapshots.day));
}

export async function getCollectionPrefs(userId) {
  const defaults = { setDeals: false, sellHigh: false, sellHighPct: 25 };
  if (isDemo(userId)) return { ...defaults, ...demoCollection().collectionPrefs };
  return { ...defaults, ...((await getUser(userId))?.collectionPrefs || {}) };
}

export async function setCollectionPrefs(userId, prefs) {
  const clean = {
    setDeals: Boolean(prefs.setDeals),
    sellHigh: Boolean(prefs.sellHigh),
    sellHighPct: Math.min(200, Math.max(10, Math.round(Number(prefs.sellHighPct) || 25))),
  };
  if (isDemo(userId)) return Object.assign(demoCollection().collectionPrefs, clean);
  // Merged, so other choices kept here (like hiding the setup checklist) survive.
  await db.update(users).set({ collectionPrefs: sql`coalesce(${users.collectionPrefs}, '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb` }).where(eq(users.id, userId));
  return clean;
}

/** The member hid the "Get set up" checklist on their collection. */
export async function hideSetupSteps(userId) {
  if (isDemo(userId)) return void (demoCollection().collectionPrefs.hideSetup = true);
  await db.update(users).set({ collectionPrefs: sql`coalesce(${users.collectionPrefs}, '{}'::jsonb) || '{"hideSetup": true}'::jsonb` }).where(eq(users.id, userId));
}

/** New members start with one profile. */
export async function ensureStarterProfile(user) {
  const existing = await listProfiles(user.id);
  if (existing.length) return existing;
  await createProfile(user.id, "My deals", defaultFilters(user.plan));
  return listProfiles(user.id);
}

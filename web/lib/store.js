import { and, asc, eq } from "drizzle-orm";
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
      prefs: { alertDiscord: true, alertWebPush: false, emailRecap: "daily", discordConnected: false },
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

export async function updatePrefs(userId, prefs) {
  const clean = {
    alertDiscord: Boolean(prefs.alertDiscord),
    alertWebPush: Boolean(prefs.alertWebPush),
    emailRecap: ["off", "weekly", "daily"].includes(prefs.emailRecap) ? prefs.emailRecap : "weekly",
  };
  if (isDemo(userId)) return Object.assign(demo().prefs, clean);
  await db.update(users).set(clean).where(eq(users.id, userId));
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

/** New members start with one profile. */
export async function ensureStarterProfile(user) {
  const existing = await listProfiles(user.id);
  if (existing.length) return existing;
  await createProfile(user.id, "My deals", defaultFilters(user.plan));
  return listProfiles(user.id);
}

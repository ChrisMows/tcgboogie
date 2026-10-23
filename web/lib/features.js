import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { defaultFeatures, defaultLimits, normalizeFeatures, normalizeLimits, setFeatureOverrides } from "@/lib/plans";

// The admin's Free/Premium choice per feature (Admin → Features), stored in app_setting "plan_features" so it
// survives deploys. Every server entry point calls refreshFeatures() before using planFor(); it re-reads the
// database at most once a minute, so a change reaches every page and alert within about a minute.
const KEY = "plan_features";
const LIMITS_KEY = "plan_limits"; // Admin → Plans number limits, same rules
const TTL = 60 * 1000;
const g = globalThis;

export async function refreshFeatures(force = false) {
  if (!force && g.__tcgbFeaturesAt && Date.now() - g.__tcgbFeaturesAt < TTL) return;
  g.__tcgbFeaturesAt = Date.now();
  if (!db) { setFeatureOverrides(g.__tcgbDemoFeatures || {}, g.__tcgbDemoLimits || {}); return; }
  try {
    const rows = await db.select().from(schema.appSettings).where(inArray(schema.appSettings.key, [KEY, LIMITS_KEY]));
    const value = (k) => rows.find((r) => r.key === k)?.value || {};
    setFeatureOverrides(value(KEY), value(LIMITS_KEY));
  } catch {
    g.__tcgbFeaturesAt = 0; // keep the last known choices and try again next time
  }
}

/** { key: { free, premium } } for every feature: the admin's choices over the defaults. */
export async function currentFeatures() {
  await refreshFeatures(true);
  return { ...defaultFeatures(), ...(g.__tcgbFeatures || {}) };
}

export async function saveFeatures(map) {
  const clean = normalizeFeatures(map);
  if (!db) g.__tcgbDemoFeatures = clean;
  else {
    await db.insert(schema.appSettings).values({ key: KEY, value: clean })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: clean, updatedAt: new Date() } });
  }
  await refreshFeatures(true);
  return clean;
}

/** { free: {…}, premium: {…} }: the admin's number limits over the defaults (null = unlimited). */
export async function currentLimits() {
  await refreshFeatures(true);
  const d = defaultLimits();
  const o = g.__tcgbLimits || {};
  return { free: { ...d.free, ...(o.free || {}) }, premium: { ...d.premium, ...(o.premium || {}) } };
}

export async function saveLimits(map) {
  const clean = normalizeLimits(map);
  if (!db) g.__tcgbDemoLimits = clean;
  else {
    await db.insert(schema.appSettings).values({ key: LIMITS_KEY, value: clean })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: clean, updatedAt: new Date() } });
  }
  await refreshFeatures(true);
  return clean;
}

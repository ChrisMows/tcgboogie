import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { defaultFeatures, normalizeFeatures, setFeatureOverrides } from "@/lib/plans";

// The admin's Free/Premium choice per feature (Admin → Features), stored in app_setting "plan_features" so it
// survives deploys. Every server entry point calls refreshFeatures() before using planFor(); it re-reads the
// database at most once a minute, so a change reaches every page and alert within about a minute.
const KEY = "plan_features";
const TTL = 60 * 1000;
const g = globalThis;

export async function refreshFeatures(force = false) {
  if (!force && g.__tcgbFeaturesAt && Date.now() - g.__tcgbFeaturesAt < TTL) return;
  g.__tcgbFeaturesAt = Date.now();
  if (!db) { setFeatureOverrides(g.__tcgbDemoFeatures || {}); return; }
  try {
    const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).limit(1);
    setFeatureOverrides(row?.value || {});
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

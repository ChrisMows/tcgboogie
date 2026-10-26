import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One connection pool per server process (reused across hot reloads in development).
function createDb() {
  if (!process.env.DATABASE_URL) return null;
  // Idle connections are kept 5 minutes: opening one to the database server (encrypted, over the internet) takes
  // ~0.1 s, so reusing them keeps pages quick. keepAlive stops the network in between from dropping them while idle;
  // one that's dropped anyway is replaced (the "error" handler below). Neon needed 30 seconds; our own server doesn't.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 5 * 60000, keepAlive: true });
  pool.on("error", (e) => console.error("[database] idle connection dropped:", e.message)); // not fatal: the pool replaces it
  return drizzle(pool, { schema });
}

const g = globalThis;
export const db = g.__tcgDb ?? (g.__tcgDb = createDb());
export { schema };

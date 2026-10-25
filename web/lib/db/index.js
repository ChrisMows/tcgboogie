import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One connection pool per server process (reused across hot reloads in development).
function createDb() {
  if (!process.env.DATABASE_URL) return null;
  // Idle connections are closed after 30 seconds: the database (and the network in between) drops connections that
  // sit idle, and a pooled connection that was dropped fails the next query on it ("Connection terminated").
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, keepAlive: true });
  pool.on("error", (e) => console.error("[database] idle connection dropped:", e.message)); // not fatal: the pool replaces it
  return drizzle(pool, { schema });
}

const g = globalThis;
export const db = g.__tcgDb ?? (g.__tcgDb = createDb());
export { schema };

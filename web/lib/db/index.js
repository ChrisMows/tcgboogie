import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One connection pool per server process (reused across hot reloads in development).
function createDb() {
  if (!process.env.DATABASE_URL) return null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return drizzle(pool, { schema });
}

const g = globalThis;
export const db = g.__tcgDb ?? (g.__tcgDb = createDb());
export { schema };

// `npx drizzle-kit push` creates/updates the tables in the database named by DATABASE_URL.
// Locally, put DATABASE_URL in web/.env.db (git-ignored) so the site's preview stays in demo mode.
import fs from "node:fs";
if (!process.env.DATABASE_URL && fs.existsSync(".env.db")) process.loadEnvFile(".env.db");

/** @type {import('drizzle-kit').Config} */
export default {
  schema: "./lib/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
};

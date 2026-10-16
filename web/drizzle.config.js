// `npx drizzle-kit push` creates/updates the tables in the database named by DATABASE_URL.
/** @type {import('drizzle-kit').Config} */
export default {
  schema: "./lib/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
};

// Safe database structure update. ALWAYS use this (`npm run db:push`), never `drizzle-kit push --force`.
//
// 1. Takes a fresh backup on the bot server (nightly backups live there too) and stops if it fails.
// 2. Applies the change from lib/db/schema.js WITHOUT --force: drizzle-kit applies additions (new tables, new
//    columns) by itself, but asks before anything that would delete data (dropped/renamed columns or tables,
//    changed types). With no terminal to ask, it refuses - this script turns that refusal into a clear BLOCKED.
//
// A change that really must remove or rename something needs a planned migration (copy the data first), not --force.
//
// The database only accepts the website's server from outside (the bot server's firewall), so this reaches it through
// an SSH tunnel: localhost:15432 on this PC -> the database on the bot server.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const HOST = "root@2.24.77.223";
const KEY = path.join(os.homedir(), ".ssh", "tcgboogie_vps");
const skipBackup = process.argv.includes("--no-backup");

if (!skipBackup) {
  console.log("1/2  Backing up the database first...");
  try {
    execFileSync("ssh", ["-i", KEY, "-o", "BatchMode=yes", HOST,
      "systemctl start dbbackup && journalctl -u dbbackup --no-pager -n 1 -o cat"], { stdio: ["ignore", "inherit", "inherit"] });
  } catch {
    console.error("STOPPED: the backup didn't finish, so nothing was changed. (Use --no-backup only if you have another fresh backup.)");
    process.exit(1);
  }
}

console.log("2/2  Applying safe changes...");
if (!process.env.DATABASE_URL && fs.existsSync(".env.db")) process.loadEnvFile(".env.db");
const url = new URL(process.env.DATABASE_URL);
const TUNNEL_PORT = 15432;
const tunnel = spawn("ssh", ["-i", KEY, "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-N", "-L", `${TUNNEL_PORT}:127.0.0.1:${url.port || 5432}`, HOST], { stdio: "ignore" });
const open = () => new Promise((ok) => { const s = net.connect(TUNNEL_PORT, "127.0.0.1", () => { s.end(); ok(true); }); s.on("error", () => ok(false)); });
let up = false;
for (let i = 0; i < 40 && !up; i++) { up = await open(); if (!up) await new Promise((w) => setTimeout(w, 250)); }
if (!up) {
  tunnel.kill();
  console.error("STOPPED: couldn't open the SSH tunnel to the database, so nothing was changed.");
  process.exit(1);
}
// Through the tunnel the address is localhost, which the certificate doesn't name; SSH already encrypts the trip.
url.hostname = "127.0.0.1";
url.port = String(TUNNEL_PORT);
url.searchParams.set("sslmode", "require");
url.searchParams.set("uselibpqcompat", "true"); // node-postgres otherwise treats "require" as a full certificate check
const r = spawnSync("npx drizzle-kit push --verbose", { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", shell: true,
  env: { ...process.env, DATABASE_URL: url.toString() } });
tunnel.kill();
const out = `${r.stdout || ""}\n${r.stderr || ""}`.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/postgres(ql)?:\/\/\S+/g, "[hidden]");
const blocked = /still want to push|data loss|Interactive prompts require|truncate|Are you sure/i.test(out);
if (!blocked && r.status !== 0) {
  console.error("\nFAILED: drizzle-kit stopped before changing anything:");
  console.error(out.split("\n").filter((l) => l.trim() && !/Pulling schema|SECURITY WARNING|pg-connection-string|explicitly use|libpq|trace-warnings|To prepare/.test(l)).slice(-8).join("\n"));
  process.exit(1);
}
if (blocked) {
  const risky = out.split("\n").filter((l) => /DROP|ALTER .* TYPE|RENAME|TRUNCATE|delete|lose|data loss/i.test(l)).slice(0, 20);
  console.error("\nBLOCKED: this change would delete or rewrite existing data, so nothing was applied.");
  if (risky.length) console.error(risky.map((l) => `  ${l.trim()}`).join("\n"));
  console.error("Plan a migration that keeps the data (e.g. add the new column, copy values, then retire the old one).");
  process.exit(1);
}
console.log(out.includes("No changes detected") ? "No changes needed." : "Done: changes applied, nothing deleted.");

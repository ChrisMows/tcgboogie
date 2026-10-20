// Safe database structure update. ALWAYS use this (`npm run db:push`), never `drizzle-kit push --force`.
//
// 1. Takes a fresh backup on the bot server (nightly backups live there too) and stops if it fails.
// 2. Applies the change from lib/db/schema.js WITHOUT --force: drizzle-kit applies additions (new tables, new
//    columns) by itself, but asks before anything that would delete data (dropped/renamed columns or tables,
//    changed types). With no terminal to ask, it refuses - this script turns that refusal into a clear BLOCKED.
//
// A change that really must remove or rename something needs a planned migration (copy the data first), not --force.
import { execFileSync, spawnSync } from "node:child_process";
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
const r = spawnSync("npx drizzle-kit push --verbose", { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", shell: true });
const out = `${r.stdout || ""}\n${r.stderr || ""}`.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/postgres(ql)?:\/\/\S+/g, "[hidden]");
const blocked = /still want to push|data loss|Interactive prompts require|truncate|Are you sure/i.test(out);
if (blocked || r.status !== 0) {
  const risky = out.split("\n").filter((l) => /DROP|ALTER .* TYPE|RENAME|TRUNCATE|delete|lose|data loss/i.test(l)).slice(0, 20);
  console.error("\nBLOCKED: this change would delete or rewrite existing data, so nothing was applied.");
  if (risky.length) console.error(risky.map((l) => `  ${l.trim()}`).join("\n"));
  console.error("Plan a migration that keeps the data (e.g. add the new column, copy values, then retire the old one).");
  process.exit(1);
}
console.log(out.includes("No changes detected") ? "No changes needed." : "Done: changes applied, nothing deleted.");

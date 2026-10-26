# TCG Boogie website: rules that protect member data

Members' collections, filters, price alerts, accounts and history live in the Postgres database on the bot server (VPS, database `tcgboogie`; moved off Neon 2026-10-26), not in this code.
Deploys (push to main -> Hostinger rebuild) replace code only and never touch data. Keep it that way:

- **Database structure changes: only `npm run db:push`.** It backs up first and refuses anything that would delete data.
  **Never run `drizzle-kit push --force`** (it auto-approves dropping columns/tables).
- **Never drop or rename a column or table that holds member data.** Add the new column, copy the values in a separate
  step, switch the code over, and only retire the old column later, after a backup.
- **Deletes must be scoped** to one member and one record (`where userId = ... and id = ...`), like lib/store.js.
  No bulk deletes of member tables. The exceptions are account deletion (cascades, by design) and log retention.
- **Never point local development at the real database.** The local preview runs in demo mode (.env.local);
  only drizzle-kit reads web/.env.db.
- **Backups:** nightly at 3 AM Eastern on the bot server (`/var/backups/tcgboogie`, 30 nightly + 12 monthly),
  shown on Admin -> Status. Restore into a NEW database first, never over the live one
  (see pokemon-deal-finder/deploy/db_backup.sh).

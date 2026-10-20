#!/bin/bash
# Nightly backup of the website's database (Neon) to this server. Run by the dbbackup systemd timer; safe to run by hand:
#   systemctl start dbbackup      (then: journalctl -u dbbackup -n 20)
#
# Keeps the last 30 nightly copies plus the copy from the 1st of each month for a year, in /var/backups/tcgboogie.
# Every copy is checked (pg_restore --list) before it counts. The result goes to the site's Admin -> Status.
# The price-lookup cache is backed up as structure only: it rebuilds itself and would make backups 10x bigger.
#
# Restore (into a NEW, empty database first, never straight over the live one):
#   pg_restore --no-owner --no-privileges -d "<new database url>" /var/backups/tcgboogie/<file>.dump
set -euo pipefail
DIR=/var/backups/tcgboogie
ENV=/opt/dealbot/pokemon-deal-finder/.env
mkdir -p "$DIR" && chmod 700 "$DIR"
# .env came from Windows: strip quotes and carriage returns.
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV" | cut -d= -f2- | tr -d '"' | tr -d '\r')
STAMP=$(date -u +%Y-%m-%d_%H%M)
DAY=$(date -u +%d)
FILE="$DIR/tcgboogie_$STAMP.dump"

rm -f "$DIR"/*.part
pg_dump --format=custom --no-owner --no-privileges --exclude-table-data=catalog_cache "$DATABASE_URL" -f "$FILE.part"
pg_restore --list "$FILE.part" > /dev/null   # fails (and stops here) if the file isn't a valid, complete backup
mv "$FILE.part" "$FILE"
if [ "$DAY" = "01" ]; then cp "$FILE" "$DIR/monthly_$(date -u +%Y-%m).dump"; fi

# Retention: 30 nightly, 12 monthly.
ls -1t "$DIR"/tcgboogie_*.dump | tail -n +31 | xargs -r rm -f
ls -1t "$DIR"/monthly_*.dump 2>/dev/null | tail -n +13 | xargs -r rm -f || true

SIZE=$(stat -c %s "$FILE")
TABLES=$(pg_restore --list "$FILE" | grep -c "TABLE DATA" || true)
COUNT=$(ls -1 "$DIR"/tcgboogie_*.dump | wc -l)
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "INSERT INTO app_setting (key, value, updated_at) VALUES ('db_backup',
  jsonb_build_object('at', now(), 'file', '$(basename "$FILE")', 'bytes', $SIZE, 'tables', $TABLES, 'copies', $COUNT), now())
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;"
echo "Backup OK: $(basename "$FILE") ($SIZE bytes, $TABLES tables, $COUNT nightly copies kept)"

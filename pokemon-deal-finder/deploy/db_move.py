"""Copy the website's database from Neon into this server's own Postgres, and prove the copy is exact.

Run on the bot server as root:
    /opt/dealbot/venv/bin/python -I db_move.py tcgboogie_rehearsal          # practice copy (replaced on each run)
    /opt/dealbot/venv/bin/python -I db_move.py tcgboogie --with-catalog     # the real move (must not exist yet)

Neon is only ever read: one read-only transaction exports a snapshot, pg_dump copies exactly that snapshot, and the
same transaction fingerprints every table (row count + an md5 of every row). The new database is fingerprinted the
same way, so a single missing or changed value in any row shows as a mismatch. Nothing on Neon is changed or deleted.

The price-lookup cache (catalog_cache) is copied only with --with-catalog: it's ~450 MB over the network and rebuilds
itself; Neon's monthly network allowance is what this move is about.
Passwords for the new database's login are generated here, kept in /root/dbmove/<db>.pw (root only), never printed.
"""
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

import psycopg
from psycopg import sql

ENV = "/opt/dealbot/pokemon-deal-finder/.env"
WORK = Path("/root/dbmove")


def neon_url():
    line = next(l for l in Path(ENV).read_text().splitlines() if l.startswith("DATABASE_URL="))
    url = line.split("=", 1)[1].strip().strip('"').strip("\r")
    # Snapshots can't be shared through Neon's connection pooler: use the direct endpoint.
    return url.replace("-pooler.", ".")


def fingerprints(cur, tables):
    out = {}
    for t in tables:
        cur.execute(sql.SQL("SELECT count(*), coalesce(md5(string_agg(h, '' ORDER BY h)), '') FROM "
                            "(SELECT md5(x::text) h FROM {} x) s").format(sql.Identifier(t)))
        out[t] = cur.fetchone()
    return out


def main():
    target = sys.argv[1]
    with_catalog = "--with-catalog" in sys.argv
    if not re.fullmatch(r"tcgboogie(_rehearsal)?", target):
        sys.exit("target must be tcgboogie or tcgboogie_rehearsal")
    rehearsal = target.endswith("_rehearsal")
    WORK.mkdir(mode=0o700, exist_ok=True)
    role = f"{target}_app"
    pw_file = WORK / f"{target}.pw"
    if not pw_file.exists():
        pw_file.write_text(secrets.token_urlsafe(32))
        pw_file.chmod(0o600)
    pw = pw_file.read_text().strip()

    # The new database, empty. The real one must not exist yet (never copy over a database in use).
    # As the postgres superuser (local socket, so this runs as that system user); SQL goes in on stdin, so the
    # password never shows in the process list.
    def admin(statement, query=False):
        r = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", "postgres"],
                           input=statement, capture_output=True, text=True, check=True)
        return r.stdout.strip() if query else None

    if admin(f"SELECT 1 FROM pg_database WHERE datname = '{target}'", query=True):
        if not rehearsal:
            sys.exit(f"{target} already exists: stopping (the real database is never overwritten)")
        admin(f'DROP DATABASE "{target}" WITH (FORCE)')
    verb = "ALTER" if admin(f"SELECT 1 FROM pg_roles WHERE rolname = '{role}'", query=True) else "CREATE"
    admin(f"{verb} ROLE \"{role}\" LOGIN PASSWORD '{pw}'")  # token_urlsafe: letters, digits, - and _ only
    admin(f'CREATE DATABASE "{target}" OWNER "{role}"')
    local = f"host=127.0.0.1 dbname={target} user={role} password={pw}"

    dump = WORK / f"{target}.dump"
    with psycopg.connect(neon_url(), autocommit=True) as src:  # transaction opened by hand below
        cur = src.cursor()
        cur.execute("SET TimeZone = 'UTC'")
        cur.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        cur.execute("SELECT pg_export_snapshot()")
        snap = cur.fetchone()[0]
        cmd = ["pg_dump", "--format=custom", "--no-owner", "--no-privileges", f"--snapshot={snap}", "-f", str(dump)]
        if not with_catalog:
            cmd.append("--exclude-table-data=catalog_cache")
        subprocess.run(cmd + [neon_url()], check=True)
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' "
                    "AND table_type = 'BASE TABLE' ORDER BY 1")
        tables = [r[0] for r in cur.fetchall()]
        compare = [t for t in tables if with_catalog or t != "catalog_cache"]
        before = fingerprints(cur, compare)
        cur.execute("COMMIT")

    subprocess.run(["pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "-d",
                    f"postgresql://{role}:{pw}@127.0.0.1/{target}", str(dump)], check=True)

    with psycopg.connect(local) as dst:
        cur = dst.cursor()
        cur.execute("SET TimeZone = 'UTC'")
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' "
                    "AND table_type = 'BASE TABLE' ORDER BY 1")
        dst_tables = [r[0] for r in cur.fetchall()]
        after = fingerprints(cur, compare)

    bad = 0
    print(f"{'table':28} {'Neon rows':>10} {'copy rows':>10}  contents")
    for t in compare:
        same = before[t] == after[t]
        bad += not same
        print(f"{t:28} {before[t][0]:>10} {after[t][0]:>10}  {'identical' if same else 'DIFFERENT'}")
    if not with_catalog:
        print(f"{'catalog_cache':28} {'(not copied: price cache, rebuilds itself)':>45}")
    if set(dst_tables) != set(tables):
        bad += 1
        print("TABLE LIST DIFFERS:", sorted(set(tables) ^ set(dst_tables)))
    print(f"\n{len(compare)} tables compared, {bad} problem(s). " + ("COPY IS EXACT" if not bad else "DO NOT SWITCH"))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

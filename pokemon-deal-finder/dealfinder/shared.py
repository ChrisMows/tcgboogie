"""The website's database (Neon Postgres), shared with the bot.

- catalog_cache: PokemonPriceTracker responses, keyed by request URL exactly like the website (web/lib/catalog.js),
  so a card priced by the bot is free for the website's card pages and the other way round.
- app_setting "ppt_credits": the last known daily credits left (the bot and the website share one API key).

Every function fails soft: if the database can't be reached, the bot falls back to its local cache.
"""
import json
import logging
import os
import time
from datetime import datetime, timezone

log = logging.getLogger("dealfinder.shared")

try:
    import psycopg
    from psycopg.types.json import Jsonb
except ImportError:  # optional dependency: without it the bot just uses its local cache
    psycopg = None

_conn = None
_down_until = 0.0  # after a failure, don't retry the database for a minute


def enabled():
    return bool(psycopg and os.getenv("DATABASE_URL"))


def _db():
    global _conn, _down_until
    if not enabled() or time.time() < _down_until:
        return None
    if _conn is None or _conn.closed:
        try:
            _conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, connect_timeout=10)
        except Exception as e:  # noqa: BLE001 - network/auth problems all mean "use the local cache"
            log.warning("Shared database unavailable (%s); using the local cache for now", type(e).__name__)
            _down_until = time.time() + 60
            return None
    return _conn


def _run(sql, params=(), fetch=False):
    global _conn, _down_until
    conn = _db()
    if conn is None:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone() if fetch else True
    except Exception as e:  # noqa: BLE001
        log.warning("Shared database error (%s); using the local cache for now", type(e).__name__)
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
        _conn, _down_until = None, time.time() + 60
        return None


# ----- price-lookup cache -----
def cache_get(key, max_age_seconds):
    """Cached JSON for this request URL if fresher than max_age_seconds, else None."""
    row = _run("SELECT data, fetched_at FROM catalog_cache WHERE key = %s", (key,), fetch=True)
    if not row or row is True:
        return None
    data, fetched_at = row
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - fetched_at).total_seconds() > max_age_seconds:
        return None
    return {"data": data}


def cache_put(key, data):
    _run("INSERT INTO catalog_cache (key, data, fetched_at) VALUES (%s, %s, now()) "
         "ON CONFLICT (key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at",
         (key, Jsonb(data)))


# ----- shared daily credit counter -----
def credits_put(remaining):
    value = {"remaining": int(remaining), "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "by": "bot"}
    _run("INSERT INTO app_setting (key, value, updated_at) VALUES ('ppt_credits', %s, now()) "
         "ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
         (Jsonb(value),))


def credits_get():
    """(remaining, at) from whichever of the bot or website called the service last today (UTC), else None."""
    row = _run("SELECT value FROM app_setting WHERE key = 'ppt_credits'", fetch=True)
    if not row or row is True or not row[0]:
        return None
    v = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    try:
        at = datetime.fromisoformat(v["at"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    if at.date() != datetime.now(timezone.utc).date():
        return None
    return int(v["remaining"]), at


# ----- deals for the website (web/lib/deals.js reads these) -----
def publish_deal(item_id, data, ends_at):
    """Save (or refresh) a deal. Returns True if it's new. Never resets dispatched_at, so no alert goes out twice."""
    row = _run("INSERT INTO deal (id, data, ends_at, found_at, last_price, last_seen_at) VALUES (%s, %s, %s, now(), %s, now()) "
               "ON CONFLICT (id) DO UPDATE SET data = excluded.data, ends_at = excluded.ends_at, "
               "last_price = excluded.last_price, last_seen_at = now() RETURNING (xmax = 0)",
               (item_id, Jsonb(data), ends_at, data.get("total")), fetch=True)
    return bool(row and row is not True and row[0])


def update_last_prices(prices):
    """{item_id: current price + shipping} for deals still visible on eBay (the last bid we saw)."""
    if not prices:
        return
    _run("UPDATE deal SET last_price = v.price, last_seen_at = now() FROM "
         "(SELECT unnest(%s::text[]) AS id, unnest(%s::float8[]) AS price) v WHERE deal.id = v.id",
         (list(prices.keys()), list(prices.values())))


def heartbeat(value):
    """What the bot did on its last check (Admin → Status)."""
    value = {**value, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    _run("INSERT INTO app_setting (key, value, updated_at) VALUES ('bot_heartbeat', %s, now()) "
         "ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", (Jsonb(value),))

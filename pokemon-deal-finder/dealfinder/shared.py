"""The website's database (Postgres on this server since 2026-10-26; Neon before), shared with the bot.

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
    """Run one statement. The database closes idle connections (after ~5 minutes), so on a connection error
    reconnect and try once more before falling back to the local cache."""
    global _conn, _down_until
    for attempt in (1, 2):
        conn = _db()
        if conn is None:
            return None
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return (cur.fetchall() if fetch == "all" else cur.fetchone()) if fetch else True
        except Exception as e:  # noqa: BLE001
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass
            _conn = None
            if attempt == 2 or not isinstance(e, psycopg.OperationalError):
                log.warning("Shared database error (%s); using the local cache for now", type(e).__name__)
                _down_until = time.time() + 60
                return None
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
    return {"data": data, "fetched_at": fetched_at}


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


def heartbeat_next(next_ts, calls, budget):
    """When the next check is due and how much of today's eBay budget is used, added to the last check's heartbeat, so
    Admin -> Status can tell a bot that's pacing itself (near the daily eBay limit) from one that stopped."""
    extra = {"nextAt": datetime.fromtimestamp(next_ts, timezone.utc).isoformat(timespec="seconds"),
             "ebayCalls": int(calls), "ebayBudget": int(budget)}
    _run("UPDATE app_setting SET value = value || %s WHERE key = 'bot_heartbeat'", (Jsonb(extra),))


def log_event(source, level, message, details=None):
    """A line in the website's Logs page (Admin -> Logs), like web/lib/log.js writes."""
    _run("INSERT INTO system_log (source, level, message, details) VALUES (%s, %s, %s, %s)",
         (source, level, str(message)[:500], Jsonb(details) if details else None))


# ----- price alerts that also watch eBay (web: price_watch, watch_listing) -----
def ebay_watches():
    """Buying price alerts on cards with "also alert me when it's listed on eBay" on.
    Returns [{id, product_id, name, set_name, number, target}] (target worked out like web/lib/watches.js)."""
    conn = _db()
    if conn is None:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, product_id, name, set_name, number, mode, target_price, drop_pct, base_price FROM price_watch "
                        "WHERE also_ebay AND product_type = 'card' AND mode IN ('below', 'drop')")
            rows = cur.fetchall()
    except Exception as e:  # noqa: BLE001
        log.warning("Couldn't read price alerts (%s)", type(e).__name__)
        return []
    out = []
    for wid, pid, name, set_name, number, mode, target, drop, base in rows:
        if mode == "drop":
            target = round(base * (1 - (drop or 0) / 100), 2) if base else None
        if target and target > 0:
            out.append({"id": wid, "product_id": pid, "name": name, "set_name": set_name or "", "number": number or "", "target": float(target)})
    return out


def save_watch_listing(watch_id, item):
    """Remember an eBay listing that meets a price alert. Returns True if it's new (so it gets alerted once)."""
    row = _run("INSERT INTO watch_listing (watch_id, item_id, title, price, url, image, photo_check, flags) "
               "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (watch_id, item_id) DO NOTHING RETURNING id",
               (watch_id, item["item_id"], item["title"][:300], item["price"], item["url"], item.get("image"),
                item.get("photo_check"), Jsonb(item.get("flags") or [])), fetch=True)
    return bool(row and row is not True)


# ----- our own sales history (web: sale) -----
_sales_memo = {}


def our_sales(product_id, grader, grade, language, days=30):
    """Our own recorded sales of one card in one grade (auctions we watched end, sales members reported):
    [{"sold_date": "YYYY-MM-DD", "price": float}], newest first. Remembered for 30 minutes per card."""
    key = (str(product_id), grader, str(grade), language or "english", days)
    hit = _sales_memo.get(key)
    if hit and time.time() - hit[0] < 1800:
        return hit[1]
    rows = _run("SELECT sold_at, price FROM sale WHERE product_id = %s AND grader = %s AND grade = %s AND language = %s "
                "AND kind = 'graded' AND sold_at >= now() - make_interval(days => %s) ORDER BY sold_at DESC",
                (str(product_id), grader, str(grade), language or "english", int(days)), fetch="all")
    out = [{"sold_date": r[0].date().isoformat(), "price": float(r[1])} for r in (rows or []) if r[1]]
    if rows is not None:  # don't remember a database outage as "no sales"
        _sales_memo[key] = (time.time(), out)
    return out


def discord_id_for(email):
    """The Discord user ID connected to the member with this email, or None."""
    row = _run('SELECT a."providerAccountId" FROM account a JOIN "user" u ON u.id = a."userId" '
               "WHERE a.provider = 'discord' AND lower(u.email) = lower(%s) LIMIT 1", (email,), fetch=True)
    return row[0] if row else None


# ----- how our deals really ended (web: deal.sold / final_price / outcome_checked_at) -----
def deals_needing_outcome(limit, wait_minutes=10, max_days=30):
    """Deals that ended at least `wait_minutes` ago (and at most `max_days`) whose outcome we haven't looked up, or
    that sold before we kept the sale's details (bid, shipping, bids), newest first. Returns [item_id]."""
    rows = _run("SELECT id FROM deal WHERE (outcome_checked_at IS NULL OR (sold IS TRUE AND NOT data ? 'outcome')) "
                "AND ends_at < now() - make_interval(mins => %s) AND ends_at > now() - make_interval(days => %s) "
                "ORDER BY ends_at DESC LIMIT %s", (int(wait_minutes), int(max_days), int(limit)), fetch="all")
    return [r[0] for r in rows or []]


def save_deal_gone(item_id):
    """eBay no longer has the listing. Keep anything already known (a sale recorded earlier stays) and mark it as asked,
    so it isn't looked up again: sold stays as it was (null if never known), and an earlier sale gets an empty
    "outcome" (no bid/shipping details)."""
    _run("UPDATE deal SET outcome_checked_at = coalesce(outcome_checked_at, now()), "
         "data = CASE WHEN sold IS TRUE AND NOT data ? 'outcome' THEN data || '{\"outcome\": {}}'::jsonb ELSE data END WHERE id = %s",
         (item_id,))


def save_deal_outcome(item_id, sold, final_price, details=None):
    """Record how a deal ended: sold True/False (None = eBay no longer had it), the final price with shipping, and the
    sale's details as eBay shows them ({"bid", "shipping", "bids", "ended"}), kept in the deal's data as "outcome"."""
    if details:
        _run("UPDATE deal SET sold = %s, final_price = %s, outcome_checked_at = now(), "
             "data = data || jsonb_build_object('outcome', %s::jsonb) WHERE id = %s",
             (sold, final_price, json.dumps(details), item_id))
    else:
        _run("UPDATE deal SET sold = %s, final_price = %s, outcome_checked_at = now() WHERE id = %s",
             (sold, final_price, item_id))


def save_sale(sale):
    """A real eBay sale (an auction we identified, looked up after it ended). Returns True if it's new."""
    row = _run("INSERT INTO sale (item_id, product_id, kind, grader, grade, condition, language, price, shipping, sold_at, "
               "title, url, source) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'tracked') "
               "ON CONFLICT (item_id) DO NOTHING RETURNING id",
               (sale["item_id"], sale["product_id"], sale["kind"], sale.get("grader"), sale.get("grade"), sale.get("condition"),
                sale.get("language") or "english", sale["price"], sale.get("shipping"), sale["sold_at"], sale.get("title"),
                sale.get("url")), fetch=True)
    return bool(row and row is not True)


# ----- Topps cards' eBay asking prices (web: topps_price, see dealfinder/topps.py) -----
def topps_checked():
    """{product_id: last check as a Unix time} for every Topps card priced so far, or None if the database is down."""
    rows = _run("SELECT product_id, checked_at FROM topps_price", fetch="all")
    if rows is None:
        return None
    return {pid: at.timestamp() for pid, at in (rows if rows is not True else [])}


def topps_owned():
    """Topps cards at least one member has in their collection or wishlist (priced before the rest)."""
    rows = _run("SELECT DISTINCT product_id FROM collection_item WHERE product_id LIKE 't-%%'", fetch="all")
    return {r[0] for r in rows} if rows and rows is not True else set()


def save_topps_price(product_id, r):
    """One card's check. A new price replaces the old one and joins its history (last 26 checks); a check that found
    too few listings keeps the last price and photo, so a quiet week doesn't wipe a card's value."""
    point = Jsonb([{"date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "price": r["price"]}] if r["price"] else [])
    return _run("INSERT INTO topps_price AS t (product_id, price, low, high, listings, image, history, checked_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, now()) ON CONFLICT (product_id) DO UPDATE SET "
                "price = coalesce(excluded.price, t.price), low = CASE WHEN excluded.price IS NULL THEN t.low ELSE excluded.low END, "
                "high = CASE WHEN excluded.price IS NULL THEN t.high ELSE excluded.high END, "
                "listings = CASE WHEN excluded.price IS NULL THEN t.listings ELSE excluded.listings END, "
                "image = coalesce(excluded.image, t.image), "
                "history = (SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM (SELECT x, n FROM jsonb_array_elements("
                "coalesce(t.history, '[]'::jsonb) || excluded.history) WITH ORDINALITY AS h(x, n) ORDER BY n DESC LIMIT 26) last), "
                "checked_at = now()",
                (product_id, r["price"], r["low"], r["high"], r["listings"], r["image"], point))


# ----- Admin -> Usage (web/lib/usage.js): one row per UTC day and metric -----
def _today():
    return datetime.now(timezone.utc).date().isoformat()


def usage_set(metric, value, cap=None):
    """Today's reading of a gauge (credits used, disk...). Keeps the day's highest, so the page shows the peak."""
    _run("INSERT INTO usage_daily (day, metric, value, cap, updated_at) VALUES (%s, %s, %s, %s, now()) "
         "ON CONFLICT (day, metric) DO UPDATE SET value = GREATEST(usage_daily.value, excluded.value), "
         "cap = COALESCE(excluded.cap, usage_daily.cap), updated_at = now()",
         (_today(), metric, float(value), None if cap is None else float(cap)))


def usage_add(metric, n=1):
    """Add n to today's count of something (e.g. Claude requests)."""
    if n and n > 0:
        _run("INSERT INTO usage_daily (day, metric, value, updated_at) VALUES (%s, %s, %s, now()) "
             "ON CONFLICT (day, metric) DO UPDATE SET value = usage_daily.value + excluded.value, updated_at = now()",
             (_today(), metric, float(n)))


def usage_today():
    """[(metric, value, cap)] recorded today (UTC), from the bot and the website (e.g. emails), or None."""
    return _run("SELECT metric, value, cap FROM usage_daily WHERE day = %s", (_today(),), fetch="all")


def database_size_mb():
    row = _run("SELECT pg_database_size(current_database())", fetch=True)
    return row[0] / 1048576 if row and row is not True else None

"""Background price refresh for the website.

Prices are shared: one saved copy per card in the website's database (catalog_cache), keyed by the exact request
the website makes. Instead of a member's page view buying a fresh price when a saved one is a day old (a burst of
lookups that collides with the bot's own and hits the price service's ~60-a-minute limit), the bot refreshes them
here, a few per check, steadily through the day:
  - every card and sealed product members own, wishlist or watch, once its saved copy is older than max_age_hours
  - most valuable first, then the most owned
  - at most per_check a check and daily_lookups a day, and only through PPTClient, so the bot's credit pacing,
    reserve and "slow down" pause all apply
Cards no one has looked up yet are left to the website (it fetches a new card when someone first opens it).
"""
import logging
from datetime import date

from . import shared
from .ppt import PPTError, PPTOutOfCredits, request_key

log = logging.getLogger("dealfinder.refresh")

CARD_PARAMS = {"includeHistory": "true", "includeEbay": "true", "days": "90"}  # the website's card request


def keys_for(pid):
    """The cache entries the website may hold for a product: English card, Japanese card, sealed."""
    return {
        "english": request_key(f"/cards/{pid}", CARD_PARAMS),
        "japanese": request_key(f"/cards/{pid}", {**CARD_PARAMS, "language": "japanese"}),
        "sealed": request_key("/sealed-products", {"tcgPlayerId": str(pid), "limit": "1"}),
    }


def stale_products(max_age_hours, limit):
    """[(product_id, kind)] whose saved price is older than max_age_hours, most valuable / most owned first.
    kind is the entry to refresh ("english", "japanese" or "sealed"); products never looked up are skipped."""
    rows = shared._run(
        """
        WITH wanted AS (
            SELECT product_id, max(coalesce(unit_value, custom_value, 0)) AS value, count(*) AS owners
            FROM collection_item GROUP BY product_id
            UNION ALL
            SELECT product_id, 0, count(*) FROM price_watch GROUP BY product_id
        )
        SELECT product_id, max(value), sum(owners) FROM wanted GROUP BY product_id
        ORDER BY max(value) DESC, sum(owners) DESC
        """, (), fetch="all") or []
    if not rows:
        return []
    keys = {}
    for pid, _value, _owners in rows:
        for kind, key in keys_for(pid).items():
            keys[key] = (pid, kind)
    # Ages only (the data itself is ~85 KB a card): which entries exist, hold data, and how old they are.
    ages = shared._run(
        """SELECT key, extract(epoch FROM (now() - fetched_at)) / 3600,
                  (data->'data') IS NOT NULL AND data->'data' <> 'null'::jsonb AND data->'data' <> '[]'::jsonb
           FROM catalog_cache WHERE key = ANY(%s)""", (list(keys),), fetch="all") or []
    found = {}
    for key, hours, has in ages:
        pid, kind = keys[key]
        if has:
            found.setdefault(pid, []).append((kind, float(hours)))
    out = []
    for pid, _value, _owners in rows:
        for kind, hours in found.get(pid, []):
            if hours > max_age_hours:
                out.append((pid, kind))
                break
        if len(out) >= limit:
            break
    return out


class PriceRefresher:
    def __init__(self, cfg, ppt):
        self.cfg, self.ppt = cfg, ppt
        self.day, self.done = None, 0

    def settings(self):
        r = self.cfg.get("refresh") or {}
        return (bool(r.get("enabled", True)), int(r.get("per_check", 10)), int(r.get("daily_lookups", 3000)),
                float(r.get("max_age_hours", 20)))

    def run(self):
        """Refresh a few stale prices. Returns how many were refreshed."""
        on, per_check, daily, max_age = self.settings()
        if not on or not self.ppt or not shared.enabled():
            return 0
        if date.today() != self.day:
            self.day, self.done = date.today(), 0
        room = min(per_check, daily - self.done)
        if room <= 0:
            return 0
        n = 0
        for pid, kind in stale_products(max_age, room):
            path, params = (("/sealed-products", {"tcgPlayerId": str(pid), "limit": "1"}) if kind == "sealed"
                            else (f"/cards/{pid}", {**CARD_PARAMS, **({"language": "japanese"} if kind == "japanese" else {})}))
            try:
                # Straight from the service (the bot's own disk copy may be newer than the shared one), saved to both.
                data = self.ppt._get(path, params)
                key = request_key(path, params)
                self.ppt._local_put(key, data)
                shared.cache_put(key, data)
                n += 1
            except PPTOutOfCredits as e:
                log.info("Price refresh waiting: %s", e)
                break
            except PPTError as e:
                log.warning("Price refresh failed for %s: %s", pid, e)
        self.done += n
        if n:
            log.info("Refreshed %d saved prices for the website (%d today)", n, self.done)
        return n

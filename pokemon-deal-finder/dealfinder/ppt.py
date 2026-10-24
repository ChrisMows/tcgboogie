"""PokemonPriceTracker API client: shared caching and credit pacing.

Credits (the $9.99 API plan): 20,000 a day, reset at midnight UTC, 60 requests a minute. The bot and the website
share one key, so they share that budget. To stay inside it:
  - every response is cached, in the website's database when it can be reached (so the website's card pages and the
    bot reuse each other's lookups), else in the bot's local SQLite;
  - prices are reused for most of a day (TCGplayer and eBay graded data only update about once a day);
  - card-number searches are reused for months (the catalog rarely changes); "not found" for a few days;
  - spending is paced across the UTC day, with a reserve kept back for the website.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests

from . import db, shared

log = logging.getLogger("dealfinder.ppt")

BASE = "https://www.pokemonpricetracker.com/api/v2"


class PPTError(Exception):
    pass


class PPTOutOfCredits(PPTError):
    pass


def _now():
    return datetime.now(timezone.utc)


def request_key(path, params):
    """The cache key for a request: its full URL, built the same way as the website's (URLSearchParams order)."""
    return f"{BASE}{path}?{urlencode(params)}"


def allowed_spend(cfg, now=None):
    """Credits the bot may have used by now today: the bot's share of the day's credits, released evenly over the
    UTC day, plus a burst allowance so a busy hour isn't starved."""
    a = cfg["auto"]
    now = now or _now()
    daily, reserve, burst = int(a.get("daily_credits", 20000)), int(a.get("website_reserve", 2000)), int(a.get("pace_burst", 1500))
    day_fraction = (now - now.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds() / 86400
    return min(daily - reserve, int((daily - reserve) * day_fraction) + burst)


class PPTClient:
    def __init__(self, cfg, conn, session=None, use_shared=True):
        self.cfg = cfg
        self.conn = conn
        self.key = cfg["secrets"].get("ppt_api_key", "")
        if not self.key:
            raise PPTError("PPT_API_KEY missing from .env")
        self.session = session or requests.Session()
        self.shared = use_shared and shared.enabled()
        self.network_calls = 0  # cache misses in the current check
        self.cache_hits = 0

    # ----- credits -----
    def credits_remaining(self):
        """Daily credits left today (UTC): the freshest of what the bot and the website last saw, None if unknown."""
        memo = getattr(self, "_credits_memo", None)
        if memo and (_now() - memo[0]).total_seconds() < 20:
            return memo[1]
        best = None
        v, at = db.get_setting(self.conn, "ppt_credits_remaining"), db.get_setting(self.conn, "ppt_credits_at")
        if v is not None and at and datetime.fromisoformat(at).date() == _now().date():
            best = (int(v), datetime.fromisoformat(at))
        if self.shared:
            s = shared.credits_get()
            if s and (best is None or s[1] > best[1]):
                best = s
        self._credits_memo = (_now(), best[0] if best else None)
        return self._credits_memo[1]

    def spending_paused(self):
        """Why new (uncached) lookups should wait, or None. Cached lookups are always free."""
        until = db.get_setting(self.conn, "ppt_blocked_until")
        if until and datetime.fromisoformat(until) > _now():
            return "rate-limited by the price service"
        left = self.credits_remaining()
        if left is None:
            return None
        a = self.cfg["auto"]
        if left < int(a.get("website_reserve", 2000)):
            return f"only {left} credits left today (kept for the website)"
        used = int(a.get("daily_credits", 20000)) - left
        if used >= allowed_spend(self.cfg):
            return f"pacing: {used} credits used so far today (allowed {allowed_spend(self.cfg)} by now)"
        return None

    def out_of_credits(self):
        return self.spending_paused() is not None

    def _record_headers(self, r):
        left = r.headers.get("X-RateLimit-Daily-Remaining") or r.headers.get("X-RateLimit-Total-Remaining")
        if left is not None:
            left = int(float(left))
            db.set_setting(self.conn, "ppt_credits_remaining", left)
            db.set_setting(self.conn, "ppt_credits_at", _now().isoformat(timespec="seconds"))
            self._credits_memo = (_now(), left)
            if self.shared:
                shared.credits_put(left)

    def _get(self, path, params):
        why = self.spending_paused()
        if why:
            raise PPTOutOfCredits(why)
        r = self.session.get(f"{BASE}{path}", params=params, timeout=30,
                             headers={"Authorization": f"Bearer {self.key}"})
        self.network_calls += 1
        self._record_headers(r)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 404:
            return None
        if r.status_code == 429:
            wait = int(float(r.headers.get("Retry-After", "60")))
            db.set_setting(self.conn, "ppt_blocked_until", (_now() + timedelta(seconds=wait)).isoformat(timespec="seconds"))
            raise PPTOutOfCredits(f"PokemonPriceTracker rate limit; retry in {wait}s")
        if r.status_code == 401:
            raise PPTError("PokemonPriceTracker rejected the API key - check PPT_API_KEY in .env")
        raise PPTError(f"PokemonPriceTracker error {r.status_code}: {r.text[:200]}")

    # ----- cache: shared database first, then local -----
    def _local_get(self, key, max_age_hours):
        row = self.conn.execute("SELECT fetched_at, json FROM ppt_cache WHERE key = ?", (key,)).fetchone()
        if row and datetime.fromisoformat(row["fetched_at"]) > _now() - timedelta(hours=max_age_hours):
            return {"data": json.loads(row["json"])}
        return None

    def _local_put(self, key, data, fetched_at=None):
        when = (fetched_at or _now()).isoformat(timespec="seconds")
        self.conn.execute("INSERT INTO ppt_cache (key, fetched_at, json) VALUES (?, ?, ?) "
                          "ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json",
                          (key, when, json.dumps(data)))
        self.conn.commit()

    def _fresh(self, key, max_age_hours):
        """A fresh enough copy: this server's disk first (no network), then the shared database. A full card answer
        is ~85 KB, and reading it from the database on every check used most of the database's monthly network
        allowance; a shared copy is kept on disk with its original age, so it expires exactly when it would have."""
        hit = self._local_get(key, max_age_hours)
        if hit is None and self.shared:
            hit = shared.cache_get(key, max_age_hours * 3600)
            if hit is not None:
                self._local_put(key, hit["data"], hit.get("fetched_at"))
        return hit

    def _cached(self, path, params, max_age_hours, empty_max_age_hours=None):
        """Raw API JSON for a request, from cache when fresh enough. Empty results can expire sooner."""
        key = request_key(path, params)
        hit = self._fresh(key, max_age_hours)
        if hit is not None and empty_max_age_hours is not None and _is_empty(hit["data"]):
            # Re-check "not found" sooner (new cards get added), but still reuse it for a while.
            hit = self._fresh(key, empty_max_age_hours)
        if hit is not None:
            self.cache_hits += 1
            return hit["data"]
        data = self._get(path, params)
        self._local_put(key, data)
        if self.shared:
            shared.cache_put(key, data)
        return data

    # ----- endpoints -----
    def cards_by_number(self, query, language, set_filter=None, wide=False):
        """Catalog cards matching a card-number query like '199/165'. Costs `limit` credits even when fewer cards
        come back, so the first search is narrow (search_limit) and `wide` (search_limit_wide) is the rare retry."""
        a = self.cfg["auto"]
        limit = a.get("search_limit_wide", 8) if wide else a.get("search_limit", 3)
        params = {"search": query, "limit": limit, "language": language}
        if set_filter:
            params["set"] = set_filter
        j = self._cached("/cards", params, a["catalog_cache_days"] * 24, a.get("not_found_cache_days", 3) * 24) or {}
        d = j.get("data") or []
        return d if isinstance(d, list) else [d]

    def cards_by_name(self, name, language):
        """Every version of a card by name (e.g. all 'Pikachu ex' printings), for the look-alike check. Costs the
        limit in credits, so it's cached as long as card-number searches and only used for deals."""
        a = self.cfg["auto"]
        params = {"search": name, "limit": a.get("lookalike_limit", 15), "language": language}
        j = self._cached("/cards", params, a["catalog_cache_days"] * 24, a.get("not_found_cache_days", 3) * 24) or {}
        d = j.get("data") or []
        return d if isinstance(d, list) else [d]

    def card_prices(self, tcg_id, language, days):
        """Card with eBay graded sales + daily price history. Returns {'card': ..., 'history_days': N}.

        English cards use exactly the website's card-page request (90 days of history covers the bot's 30-day
        lookback), so the two share one cached copy.
        """
        a = self.cfg["auto"]
        params = {"includeHistory": "true", "includeEbay": "true", "days": str(max(int(days), 90))}
        if language and language != "english":
            params["language"] = language
        j = self._cached(f"/cards/{tcg_id}", params, a["price_cache_hours"]) or {}
        card = j.get("data")
        if isinstance(card, list):
            card = card[0] if card else None
        window = ((j.get("metadata") or {}).get("historyWindow") or {}).get("days", int(params["days"]))
        return {"card": card, "history_days": window}

    def sets(self):
        """Every English set, newest first - the website's exact request (cached a week, shared)."""
        j = self._cached("/sets", {"sortBy": "releaseDate", "sortOrder": "desc", "limit": "500"}, 7 * 24) or {}
        d = j.get("data") or []
        return d if isinstance(d, list) else []

    def sealed_in_set(self, set_name):
        """A set's sealed products with prices - the website's set-page request (50 credits, cached 3 days, shared)."""
        j = self._cached("/sealed-products", {"set": set_name, "limit": "50"}, 72, 24) or {}
        d = j.get("data") or []
        return d if isinstance(d, list) else []


def _is_empty(data):
    if not data:
        return True
    d = data.get("data") if isinstance(data, dict) else None
    return isinstance(d, list) and not d

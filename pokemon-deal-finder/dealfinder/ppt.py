"""PokemonPriceTracker API client with caching and credit protection."""
import json
import logging
from datetime import datetime, timedelta, timezone

import requests

from . import db

log = logging.getLogger("dealfinder.ppt")

BASE = "https://www.pokemonpricetracker.com/api/v2"


class PPTError(Exception):
    pass


class PPTOutOfCredits(PPTError):
    pass


def _now():
    return datetime.now(timezone.utc)


class PPTClient:
    def __init__(self, cfg, conn, session=None):
        self.cfg = cfg
        self.conn = conn
        self.key = cfg["secrets"].get("ppt_api_key", "")
        if not self.key:
            raise PPTError("PPT_API_KEY missing from .env")
        self.session = session or requests.Session()
        self.network_calls = 0  # cache misses in the current check

    # ----- credits -----
    def credits_remaining(self):
        """Last known daily credits left (None if unknown or from a previous UTC day)."""
        v = db.get_setting(self.conn, "ppt_credits_remaining")
        at = db.get_setting(self.conn, "ppt_credits_at")
        if v is None or not at or datetime.fromisoformat(at).date() != _now().date():
            return None
        return int(v)

    def out_of_credits(self):
        until = db.get_setting(self.conn, "ppt_blocked_until")
        if until and datetime.fromisoformat(until) > _now():
            return True
        left = self.credits_remaining()
        return left is not None and left < self.cfg["auto"]["credit_reserve"]

    def _record_headers(self, r):
        left = r.headers.get("X-RateLimit-Total-Remaining") or r.headers.get("X-RateLimit-Daily-Remaining")
        if left is not None:
            db.set_setting(self.conn, "ppt_credits_remaining", int(float(left)))
            db.set_setting(self.conn, "ppt_credits_at", _now().isoformat(timespec="seconds"))

    def _get(self, path, params):
        if self.out_of_credits():
            raise PPTOutOfCredits("PokemonPriceTracker daily credits used up")
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

    # ----- cache -----
    def _cached(self, key, max_age_hours, fetch):
        row = self.conn.execute("SELECT fetched_at, json FROM ppt_cache WHERE key = ?", (key,)).fetchone()
        if row and datetime.fromisoformat(row["fetched_at"]) > _now() - timedelta(hours=max_age_hours):
            return json.loads(row["json"])
        data = fetch()
        self.conn.execute("INSERT INTO ppt_cache (key, fetched_at, json) VALUES (?, ?, ?) "
                          "ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json",
                          (key, _now().isoformat(timespec="seconds"), json.dumps(data)))
        self.conn.commit()
        return data

    # ----- endpoints -----
    def cards_by_number(self, query, language, set_filter=None):
        """All catalog cards matching a card-number query like '199/165' (cached for weeks; the catalog rarely changes)."""
        a = self.cfg["auto"]
        params = {"search": query, "limit": a["search_limit"], "language": language}
        if set_filter:
            params["set"] = set_filter
        key = f"num:{language}:{set_filter or ''}:{query}"

        def fetch():
            j = self._get("/cards", params) or {}
            d = j.get("data") or []
            return d if isinstance(d, list) else [d]
        return self._cached(key, a["catalog_cache_days"] * 24, fetch)

    def card_prices(self, tcg_id, language, days):
        """Card with eBay graded sales + daily history. Returns {'card': ..., 'history_days': N}."""
        a = self.cfg["auto"]
        key = f"price:{language}:{tcg_id}:{days}"

        def fetch():
            j = self._get(f"/cards/{tcg_id}", {"includeEbay": "true", "includeHistory": "true",
                                                "days": days, "language": language}) or {}
            card = j.get("data")
            if isinstance(card, list):
                card = card[0] if card else None
            window = ((j.get("metadata") or {}).get("historyWindow") or {}).get("days", days)
            return {"card": card, "history_days": window}
        return self._cached(key, a["price_cache_hours"], fetch)

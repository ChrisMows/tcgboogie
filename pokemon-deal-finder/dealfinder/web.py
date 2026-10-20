"""Website mode: the bot finds deals, the website (tcgboogie.com) handles members.

Each check:
  1. ask the website how wide to scan (the loosest running filter across members, per plan) - no wider;
  2. save every qualifying deal to the website's database (shared.publish_deal), in the shape web/lib/filters.js matches;
  3. keep the last price of deals still on eBay up to date (shown as "last bid" once they end);
  4. ask the website to alert members about new deals (it sends each deal once);
  5. report a heartbeat for Admin -> Status.
"""
import copy
import logging
import time

import requests

from . import shared
from .finder import minutes_left
from .parse import Listing, RAW_CONDITIONS

log = logging.getLogger("dealfinder.web")

TCG_IMG = "https://tcgplayer-cdn.tcgplayer.com/product/{}_in_200x200.jpg"


def deal_record(rec, card):
    """A finder deal -> the website's deal shape (see web/lib/demo-deals.js)."""
    raw = card.get("kind") == "raw"
    grade = None
    if not raw:
        try:
            grade = float(str(card.get("grade") or "").split()[0])
        except ValueError:
            grade = None
    reason = rec.get("reason") or {}
    pid = card.get("product_id")
    return {
        "kind": "raw" if raw else "graded",
        "name": card.get("name") or "",
        "setName": card.get("set_name") or "",
        "number": card.get("card_number") or "",
        "printing": card.get("variants") or "",
        "language": card.get("language") or "english",
        **({"condition": card.get("grade")} if raw else {"grader": card.get("grader"), "grade": grade}),
        "total": rec.get("total"),
        "marketValue": rec.get("market_value"),
        "discountPct": round(rec.get("discount_pct") or 0),
        "comps": rec.get("comps_used") or 0,
        "sellerFeedback": rec.get("feedback_score") or 0,
        "sellerPct": rec.get("feedback_pct"),
        "country": reason.get("listing_country") or "",
        "flags": rec.get("flags") or [],
        "bidCount": rec.get("bid_count"),
        "title": rec.get("title") or "",
        "url": rec.get("url") or "",
        "image": TCG_IMG.format(pid) if pid else rec.get("image"),
        "listingImage": rec.get("image"),
        "productId": str(pid) if pid else None,
        "why": reason.get("market", {}).get("reason"),
    }


class WebLink:
    def __init__(self, cfg):
        w = cfg.get("website") or {}
        self.site = (w.get("url") or "https://tcgboogie.com").rstrip("/")
        self.scan_every = int(w.get("scan_refresh_seconds", 120))
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "TCGBoogie-DealBot/1.0"
        self._scan = (0.0, None)
        self.tracked = {}  # item_id -> end time (iso) for deals we published that haven't ended
        self.new_deals = 0

    # ----- 1. how wide to scan -----
    def scan_fn(self, cfg):
        at, body = self._scan
        if body is None or time.time() - at > self.scan_every:
            try:
                r = self.session.get(f"{self.site}/api/deals/scan", timeout=15)
                r.raise_for_status()
                body = r.json()
                self._scan = (time.time(), body)
            except (requests.RequestException, ValueError) as e:
                log.warning("Couldn't get scan settings from the website (%s); using the last ones", type(e).__name__)
                if body is None:
                    return None
        if not body.get("profiles"):
            log.info("No running deal filters on the website - nothing to scan.")
            return None
        lim = cfg.get("scan_limits") or {}
        c = copy.deepcopy(cfg)
        c["deal"]["min_discount_pct"] = max(float(body["minDiscountPct"]), lim.get("min_discount_pct", 10))
        c["deal"]["max_minutes_left"] = min(float(body["maxMinutesLeft"]), lim.get("max_minutes_left", 60))
        c["auto"]["min_market_value"] = max(float(body["minMarketValue"]), lim.get("min_market_value", 10))
        c["auto"]["min_grade"] = float(body["minGrade"])
        c["auto"]["graders"] = body["graders"]
        c["auto"]["languages"] = body["languages"]
        c["auto"]["card_types"] = body["cardTypes"]
        cond = body.get("minRawCondition", "NM")
        c["auto"]["min_raw_condition"] = cond if cond in RAW_CONDITIONS else "NM"
        return c

    # ----- 2. save deals -----
    def on_deal(self, rec, card):
        data = deal_record(rec, card)
        is_new = shared.publish_deal(rec["item_id"], data, rec["end_time"])
        self.tracked[rec["item_id"]] = rec["end_time"]
        if is_new:
            self.new_deals += 1
            log.info("DEAL saved for the website: %s | $%.2f vs $%.2f (%d%% below)", rec.get("card_label"),
                     rec.get("total") or 0, rec.get("market_value") or 0, data["discountPct"])
        return True

    # ----- 3. last prices -----
    def on_listings(self, summaries):
        if not self.tracked:
            return
        prices = {}
        for s in summaries:
            iid = s.get("itemId")
            if iid in self.tracked:
                l = Listing(s)
                if l.price() is not None:
                    prices[iid] = round(l.price() + (l.shipping()[0] or 0), 2)
        shared.update_last_prices(prices)
        # Forget deals that ended over an hour ago.
        self.tracked = {k: v for k, v in self.tracked.items() if minutes_left(v) > -60}

    # ----- 4 + 5. alerts and heartbeat -----
    def after_check(self, stats, ppt=None):
        if self.new_deals:
            try:
                r = self.session.post(f"{self.site}/api/deals/dispatch", timeout=60)
                log.info("Website alerts: %s", r.json() if r.ok else f"HTTP {r.status_code}")
            except (requests.RequestException, ValueError) as e:
                log.warning("Couldn't reach the website to send alerts (%s); it will retry next check", type(e).__name__)
                return self.heartbeat(stats, ppt)  # keep new_deals so the next check asks again
            self.new_deals = 0
        self.heartbeat(stats, ppt)

    def heartbeat(self, stats, ppt=None):
        shared.heartbeat({
            "listings": stats.get("listings", 0), "candidates": stats.get("candidates", 0),
            "deals": stats.get("alerts", 0), "lookups": stats.get("auto_lookups", 0),
            "priceCalls": stats.get("price_calls", 0), "cacheHits": stats.get("cache_hits", 0),
            "creditsLeft": ppt.credits_remaining() if ppt else None,
            "paused": (ppt.spending_paused() if ppt else None) or ("no running filters" if stats.get("idle") else None),
        })

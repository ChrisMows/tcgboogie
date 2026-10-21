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
from .auto import _base_name
from .finder import minutes_left
from .parse import Listing, RAW_CONDITIONS, norm_text
from .ppt import PPTError
from .vision import PhotoChecker

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
        self.photos = PhotoChecker(cfg)
        self.finder = None  # set by run_web.py (for the price client)
        self.held = 0  # deals the photo check stopped

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
    def lookalikes(self, card, rec):
        """Other versions of this card (same name, other sets/numbers), most similar in value first.
        Returns [(label, product_id, raw_market)]; [] if the lookup isn't possible."""
        ppt = getattr(self.finder, "ppt", None)
        name = card.get("name") or ""
        if not ppt or not name:
            return []
        try:
            found = ppt.cards_by_name(name, card.get("language") or "english")
        except PPTError as e:
            log.info("Look-alike lookup skipped (%s)", e)
            return []
        base = norm_text(name)
        out = []
        for c in found:
            if str(c.get("tcgPlayerId")) == str(card.get("product_id")) or norm_text(_base_name(c.get("name", ""))) != base:
                continue
            market = (c.get("prices") or {}).get("market")
            out.append((f"{_base_name(c.get('name', ''))} from {c.get('setName')} #{c.get('cardNumber')}", str(c["tcgPlayerId"]),
                        float(market) if market else None))
        total = rec.get("total") or 0
        out.sort(key=lambda x: abs((x[2] if x[2] is not None else 1e9) - total))
        return out

    def photo_check(self, rec, card, data):
        """Check the listing photos against the card we priced. Returns False to drop the deal."""
        if rec["item_id"] in self.tracked:
            return True  # already checked when first found
        looks = self.lookalikes(card, rec)
        total = rec.get("total") or 0
        # A cheaper version worth about what this listing costs is the classic wrong-set listing.
        cheaper = [l for l in looks if l[2] is not None and l[2] <= total * 1.3] if data["kind"] == "raw" else []
        if cheaper:
            data["lookalike"] = {"label": cheaper[0][0], "market": cheaper[0][2]}
        claimed = f"{card.get('name')} from {card.get('set_name')} #{card.get('card_number')}"
        result = self.photos.check(rec["item_id"], claimed, card.get("product_id"), rec.get("images") or [],
                                   [(l[0], l[1]) for l in looks])
        if result is None:
            note = (f"Possibly a different version: {cheaper[0][0]} is worth about ${cheaper[0][2]:,.0f}. Check the set "
                    f"symbol and number in the photos." if cheaper else "Photo not checked: confirm the set symbol and number in the listing photos.")
            data["flags"] = [note] + data["flags"]
            data["photoCheck"] = "skipped"
            return True
        data["photoCheck"] = result["verdict"]
        if result["verdict"] == "different_card":
            self.held += 1
            log.info("Deal held back by the photo check: %s (%s)", rec.get("card_label"), result.get("reason"))
            shared.log_event("alerts", "info", f"Deal held back: the photos don't show {claimed}. {result.get('reason', '')}",
                             {"item": rec["item_id"], "url": rec.get("url"), "shown": result.get("shown"), "model": result.get("model")})
            return False
        if result["verdict"] == "unclear":
            data["flags"] = [f"Photo check unclear: {result.get('reason', 'confirm the set symbol and number')}"] + data["flags"]
        return True

    def on_deal(self, rec, card):
        data = deal_record(rec, card)
        if not self.photo_check(rec, card, data):
            return False
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

    def notify_watch_listings(self):
        """Ask the website to alert members about new eBay listings that meet their price alerts."""
        try:
            r = self.session.post(f"{self.site}/api/watches/dispatch", timeout=60)
            log.info("Website price-alert listings: %s", r.json() if r.ok else f"HTTP {r.status_code}")
        except (requests.RequestException, ValueError) as e:
            log.warning("Couldn't reach the website for listing alerts (%s); they'll go out on the next round", type(e).__name__)

    def heartbeat(self, stats, ppt=None):
        shared.heartbeat({
            "listings": stats.get("listings", 0), "candidates": stats.get("candidates", 0),
            "deals": stats.get("alerts", 0), "lookups": stats.get("auto_lookups", 0),
            "priceCalls": stats.get("price_calls", 0), "cacheHits": stats.get("cache_hits", 0),
            "creditsLeft": ppt.credits_remaining() if ppt else None,
            "paused": (ppt.spending_paused() if ppt else None) or ("no running filters" if stats.get("idle") else None),
        })

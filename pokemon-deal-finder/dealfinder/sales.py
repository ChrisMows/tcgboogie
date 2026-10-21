"""Our own sales history: how the auctions we identified actually ended.

The price service misses many eBay sales, and eBay's sold-listings API is closed to us. But eBay's Browse API (the
one the bot already uses) still returns a listing for a while after it ends, with its final price and whether it
sold. So every graded auction the bot identifies (card + grade, whatever its price) is remembered, and shortly
after it ends we look it up once: if it sold, its final price goes into the website's `sale` table, where the
website merges it with the price service's sales. Official API, one call per auction, no scraping.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from . import shared

log = logging.getLogger("dealfinder.sales")


def _money(v):
    try:
        return round(float((v or {}).get("value")), 2)
    except (TypeError, ValueError):
        return None


def final_sale(item):
    """A Browse API item that has ended -> {"price", "shipping", "sold_at", "best_offer"} if it sold, else None."""
    avail = (item.get("estimatedAvailabilities") or [{}])[0]
    if int(avail.get("estimatedSoldQuantity") or 0) < 1:
        return None
    price = _money(item.get("currentBidPrice")) or _money(item.get("price"))
    if not price:
        return None
    ship = None
    for o in item.get("shippingOptions") or []:
        ship = _money(o.get("shippingCost"))
        if ship is not None:
            break
    options = item.get("buyingOptions") or []
    return {"price": price, "shipping": ship, "sold_at": item.get("itemEndDate"),
            # A Buy It Now sold through Best Offer shows the list price, not what was paid: not a trustworthy sale.
            "best_offer": "BEST_OFFER" in options and "AUCTION" not in options}


class SaleTracker:
    def __init__(self, cfg, ebay):
        self.cfg, self.ebay = cfg, ebay
        self.pending = {}  # item_id -> {"ends": datetime, "ident": {...}, "title", "url"}
        self.day, self.used = date.today(), 0
        self.saved = 0

    def settings(self):
        s = self.cfg.get("sales") or {}
        return (bool(s.get("enabled", True)), int(s.get("daily_calls", 800)), int(s.get("max_per_check", 25)),
                int(s.get("wait_minutes", 10)))

    def remember(self, summary, ident):
        """The bot identified this auction (card + grade). Look up how it ended, later."""
        item_id = summary.get("itemId")
        if not item_id or item_id in self.pending or not ident.get("product_id"):
            return
        try:
            ends = datetime.fromisoformat(summary["itemEndDate"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            return
        if len(self.pending) >= 5000:
            return
        self.pending[item_id] = {"ends": ends, "ident": dict(ident), "title": summary.get("title", ""),
                                 "url": summary.get("itemWebUrl") or ""}

    def run(self, now=None):
        """Check auctions that ended a little while ago (within the daily call budget). Returns sales saved."""
        on, daily, per_check, wait = self.settings()
        if not on or not shared.enabled():
            return 0
        now = now or datetime.now(timezone.utc)
        if date.today() != self.day:
            self.day, self.used = date.today(), 0
        # Forget auctions too old to look up reliably.
        self.pending = {k: v for k, v in self.pending.items() if now - v["ends"] < timedelta(hours=20)}
        due = sorted((k for k, v in self.pending.items() if now - v["ends"] >= timedelta(minutes=wait)),
                     key=lambda k: self.pending[k]["ends"])
        saved = 0
        for item_id in due[:per_check]:
            if self.used >= daily:
                break
            p = self.pending.pop(item_id)
            self.used += 1
            try:
                item = self.ebay.get_item(item_id)
            except Exception as e:  # noqa: BLE001 - one lookup failing must not stop the rest
                log.info("Final price lookup failed for %s: %s", item_id, e)
                continue
            sale = final_sale(item or {})
            if not sale or sale["best_offer"]:
                continue
            i = p["ident"]
            legacy = item_id.split("|")[1] if "|" in item_id else item_id
            if shared.save_sale({
                "item_id": legacy, "product_id": str(i["product_id"]), "kind": i.get("kind", "graded"),
                "grader": i.get("grader"), "grade": i.get("grade"), "condition": i.get("condition"),
                "language": i.get("language") or "english", "price": sale["price"], "shipping": sale["shipping"],
                "sold_at": sale["sold_at"] or p["ends"].isoformat(), "title": p["title"][:300], "url": p["url"],
            }):
                saved += 1
        self.saved += saved
        if saved:
            log.info("Recorded %d real eBay sale%s (final prices of auctions we identified)", saved, "" if saved == 1 else "s")
        return saved

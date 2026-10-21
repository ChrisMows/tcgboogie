"""Price alerts that also watch eBay: "tell me when this card is listed at or under my price".

For each card on a buying price alert with "also alert me when it's listed on eBay" on, search eBay's Buy It Now
listings of that exact card (name + number, ungraded) at or under the highest target anyone set for it. Each match
must pass the same checks as deals (no lots/proxies/slabs, right card number, English) and the photo check; then it is
saved to the website's watch_listing table and the website alerts each member whose own target it meets, once.

eBay calls are budgeted: `ebay_watch.daily_calls` per day, spread evenly over the watched cards (each card is searched
at most every `min_interval_minutes`).
"""
import logging
import time

from . import shared
from .auto import _base_name
from .parse import TITLE_GRADE_RE, Listing, has_phrase, norm_card_number, norm_text, title_excluded

log = logging.getLogger("dealfinder.watch_ebay")


def card_number_ok(watch_number, listing):
    want = norm_card_number(watch_number or "")
    if not want:
        return True
    for n, d in listing.card_numbers():
        if n == want[0] and (d is None or want[1] is None or d == want[1]):
            return True
    return False


def query_for(w):
    name = _base_name(w["name"])
    num = (w["number"] or "").split("/")[0].lstrip("0") or ""
    return f"{name} {w['number']}".strip() if w["number"] else name, name, num


class EbayWatcher:
    def __init__(self, cfg, ebay, photos):
        self.cfg, self.ebay, self.photos = cfg, ebay, photos
        self.last = {}  # product_id -> last search time

    def settings(self):
        s = (self.cfg.get("website") or {}).get("ebay_watch") or {}
        return int(s.get("daily_calls", 1000)), int(s.get("min_interval_minutes", 30)), int(s.get("max_per_check", 8))

    def run(self):
        """One round: search the cards that are due. Returns how many new matches were saved."""
        watches = shared.ebay_watches()
        if not watches:
            return 0
        daily, min_minutes, per_check = self.settings()
        by_product = {}
        for w in watches:
            by_product.setdefault(w["product_id"], []).append(w)
        # Spread the day's calls over every watched card.
        every = max(min_minutes * 60, 86400 * len(by_product) / max(1, daily))
        now = time.time()
        due = sorted((p for p in by_product if now - self.last.get(p, 0) >= every), key=lambda p: self.last.get(p, 0))[:per_check]
        new = 0
        for pid in due:
            self.last[pid] = now
            try:
                new += self.search(by_product[pid])
            except Exception as e:  # noqa: BLE001 - one card's search must not stop the others
                log.warning("eBay watch search failed for %s: %s", by_product[pid][0]["name"], e)
        return new

    def search(self, ws):
        w0 = ws[0]
        query, name, _ = query_for(w0)
        top = max(w["target"] for w in ws)
        results = self.ebay.search_listings(query, top, raw=True)
        name_norm = norm_text(name)
        saved = 0
        for s in results:
            listing = Listing(s)
            title = s.get("title", "")
            tnorm = norm_text(title)
            if title_excluded(title, self.cfg, raw=True) or TITLE_GRADE_RE.search(title):
                continue
            if not all(has_phrase(tnorm, tok) for tok in name_norm.split()):
                continue
            if not card_number_ok(w0["number"], listing):
                continue
            if listing.language() not in ("english", ""):
                continue
            price = listing.price()
            if price is None:
                continue
            total = round(price + (listing.shipping()[0] or 0), 2)
            item_id = s.get("itemId")
            images = [u for u in [((s.get("image") or {}).get("imageUrl"))] + [i.get("imageUrl") for i in (s.get("additionalImages") or [])] if u]
            # Photo check against the official card image (drops reprints and wrong sets listed under this name).
            check = self.photos.check(item_id, f"{name} from {w0['set_name']} #{w0['number']}", w0["product_id"], images[:3])
            if check and check.get("verdict") == "different_card":
                log.info("eBay watch: photo check rejected %s (%s)", title, check.get("reason"))
                continue
            flags = []
            if check is None:
                flags.append("Photo not checked: confirm the set symbol and number in the listing photos.")
            elif check.get("verdict") == "unclear":
                flags.append(f"Photo check unclear: {check.get('reason', '')}")
            item = {"item_id": item_id, "title": title, "price": total, "image": images[0] if images else None,
                    "url": s.get("itemAffiliateWebUrl") or s.get("itemWebUrl") or "",
                    "photo_check": (check or {}).get("verdict") or "skipped", "flags": flags}
            for w in ws:
                if total <= w["target"] and shared.save_watch_listing(w["id"], item):
                    saved += 1
                    log.info("eBay watch: %s listed at $%.2f (alert at $%.2f)", title, total, w["target"])
        return saved

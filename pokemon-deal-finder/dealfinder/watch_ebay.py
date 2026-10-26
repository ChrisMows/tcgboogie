"""Price alerts that also watch eBay: "tell me when this card is listed at or under my price".

For each card on a buying price alert with "also alert me when it's listed on eBay" on (and a plan that includes
it: the website decides, GET /api/watches/ebay), search eBay's Buy It Now listings of that exact card (name + number,
ungraded) at or under the highest target anyone set for it. Each match must pass the same checks as deals (no
lots/proxies/slabs, right card number, English) and the photo check; then it is saved to the website's watch_listing
table and the website alerts each member whose own target it meets, once.

Each search is an eBay call for one card (not shared like the deal scan), so cards are checked by how likely a listing
at the target is, with `ebay_watch.daily_calls` a day at most:
  - hot  (target at least hot_ratio of the market price, e.g. $1,100 on a $1,200 card): every hot_days
  - warm (at least warm_ratio):                                                           every warm_days
  - cold (a long shot, e.g. $150 on a $400 card):                                          every cold_days
The market price is the website's daily price check, so a card whose price falls toward a target heats up by itself.
A card with no listings at all for quiet_after searches in a row is checked half as often. Within the day's calls,
hot cards go first, then the ones the most members watch, then the longest unchecked.
"""
import json
import logging
import time

from . import db, shared
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


DAY = 86400


def tier_of(target, market, hot=0.85, warm=0.65):
    """hot / warm / cold: how close the alert's target is to the card's market price (no price yet: warm)."""
    if not market or market <= 0:
        return "warm"
    r = target / market
    return "hot" if r >= hot else "warm" if r >= warm else "cold"


class EbayWatcher:
    def __init__(self, cfg, ebay, photos, fetch=None):
        self.cfg, self.ebay, self.photos = cfg, ebay, photos
        self.fetch = fetch or shared.ebay_watches  # the website's list in website mode (run_web.py)
        self.conn = getattr(ebay, "conn", None)
        self.state = {}  # product_id -> {"last": time, "empty": searches in a row with no listings}
        self.day, self.used = None, 0

    def settings(self):
        s = (self.cfg.get("website") or {}).get("ebay_watch") or {}
        return {
            "daily": int(s.get("daily_calls", 1000)), "per_check": int(s.get("max_per_check", 8)),
            "hot_ratio": float(s.get("hot_ratio", 0.85)), "warm_ratio": float(s.get("warm_ratio", 0.65)),
            "days": {"hot": float(s.get("hot_days", 1)), "warm": float(s.get("warm_days", 3)), "cold": float(s.get("cold_days", 7))},
            "quiet_after": int(s.get("quiet_after", 3)),
        }

    # The schedule survives restarts (the bot's own settings table), so a restart doesn't search every card at once.
    def _get(self, pid):
        if pid not in self.state and self.conn is not None:
            raw = db.get_setting(self.conn, f"ebay_watch:{pid}")
            try:
                self.state[pid] = json.loads(raw) if raw else {}
            except ValueError:
                self.state[pid] = {}
        return self.state.setdefault(pid, {})

    def _put(self, pid, st):
        self.state[pid] = st
        if self.conn is not None:
            db.set_setting(self.conn, f"ebay_watch:{pid}", json.dumps(st))

    def plan(self, watches, now=None):
        """[(product_id, tier)] due for a search now, in the order to search them."""
        s = self.settings()
        now = now or time.time()
        by_product = {}
        for w in watches:
            by_product.setdefault(w["product_id"], []).append(w)
        due = []
        for pid, ws in by_product.items():
            target = max(w["target"] for w in ws)
            market = max((w.get("market") or 0) for w in ws) or None
            tier = tier_of(target, market, s["hot_ratio"], s["warm_ratio"])
            st = self._get(pid)
            every = s["days"][tier] * DAY * (2 if st.get("empty", 0) >= s["quiet_after"] else 1)
            if now - st.get("last", 0) >= every:
                due.append((pid, tier, len(ws), st.get("last", 0)))
        rank = {"hot": 0, "warm": 1, "cold": 2}
        due.sort(key=lambda d: (rank[d[1]], -d[2], d[3]))
        return [(pid, tier) for pid, tier, _, _ in due], by_product

    def run(self, now=None):
        """One round: search the cards that are due, within the day's calls. Returns how many new matches were saved."""
        watches = self.fetch()
        if not watches:
            return 0
        s = self.settings()
        today = time.strftime("%Y-%m-%d", time.gmtime(now or time.time()))
        if today != self.day:
            self.day, self.used = today, 0
        due, by_product = self.plan(watches, now)
        new = 0
        for pid, tier in due[:s["per_check"]]:
            if self.used >= s["daily"]:
                break
            self.used += 1
            st = dict(self._get(pid))
            st["last"] = now or time.time()
            try:
                saved, found = self.search(by_product[pid])
                new += saved
                st["empty"] = 0 if found else st.get("empty", 0) + 1
            except Exception as e:  # noqa: BLE001 - one card's search must not stop the others
                log.warning("eBay watch search failed for %s: %s", by_product[pid][0]["name"], e)
            self._put(pid, st)
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
        return saved, bool(results)

"""The polling loop: search eBay, match against the watchlist, value it, alert on deals."""
import logging
import time
from datetime import datetime, timezone

from . import db
from .alerts import build_discord_payload, card_label, send_discord
from .auto import (_base_name, auto_market_value, choose_printing, grade_number, mixed_printing_reason,
                   number_matches, number_queries, pick_card, raw_market_value, tcgplayer_link)
from .comps import market_value
from .config import load_config
from .ebay import EbayClient, EbayError
from .parse import (RAW_CONDITIONS, TITLE_GRADE_RE, Listing, match_card, name_in_title, norm_card_number,
                    norm_text, red_flags, title_excluded)
from .ppt import PPTClient, PPTError, PPTOutOfCredits

log = logging.getLogger("dealfinder")

DETAIL_CACHE_SECONDS = 20 * 60


def minutes_left(end_time, now=None):
    now = now or datetime.now(timezone.utc)
    end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    return (end - now).total_seconds() / 60


def evaluate(listing, card, mv, cfg, now=None):
    """Decide whether a matched listing is a deal. Returns (qualifies, record)."""
    deal = cfg["deal"]
    price = listing.price()
    ship, ship_note = listing.shipping()
    ship = ship or 0.0
    mins = minutes_left(listing.end_time, now)
    rec = {
        "item_id": listing.item_id, "card_id": card["id"], "card_label": card_label(card),
        "title": listing.title, "url": listing.url, "price": price, "shipping": ship,
        "total": None, "market_value": mv.value, "discount_pct": None, "comps_used": mv.comps_used,
        # Seller usernames are eBay user data: never stored (alerts show feedback numbers only).
        "minutes_left": mins, "end_time": listing.end_time, "seller": "", "feedback_score": listing.feedback_score,
        "feedback_pct": listing.feedback_pct, "bid_count": listing.bid_count, "flags": [],
        "image": ((listing.summary.get("image") or {}).get("imageUrl")),
        "affiliate_disclosure": (cfg["ebay"].get("affiliate_disclosure") or "")
        if ("itemAffiliateWebUrl" in listing.summary or "itemAffiliateWebUrl" in (listing.detail or {})
            or card.get("tcgplayer_affiliate")) else "",
    }
    if price is None:
        return False, {**rec, "skip": "no current price"}
    total = round(price + ship, 2)
    rec["total"] = total
    if not mv.ok:
        return False, {**rec, "skip": f"no trusted market value: {mv.reason}"}
    if "AUCTION" not in listing.buying_options:
        return False, {**rec, "skip": "not an auction"}
    if mins <= 0:
        return False, {**rec, "skip": "auction already ended"}
    if mins > deal["max_minutes_left"]:
        return False, {**rec, "skip": f"{mins:.1f} min left (> {deal['max_minutes_left']})"}
    disc = (mv.value - total) / mv.value * 100
    rec["discount_pct"] = round(disc, 1)
    if disc < deal["min_discount_pct"]:
        return False, {**rec, "skip": f"only {disc:.0f}% below market (need {deal['min_discount_pct']}%)"}
    rec["flags"] = red_flags(listing, cfg)
    rec["reason"] = {
        "rule": f"${total:,.2f} is {disc:.1f}% below market ${mv.value:,.2f} "
                f"(threshold {deal['min_discount_pct']}%), {mins:.1f} min left (limit {deal['max_minutes_left']})",
        "market": {"value": mv.value, "comps_used": mv.comps_used, "comps_in_window": mv.comps_in_window,
                   "outliers_dropped": mv.outliers_dropped, "low": mv.low, "high": mv.high,
                   "spread": mv.spread, "latest_sale": mv.latest_sale, "reason": mv.reason},
        "settings": dict(deal),
        "shipping_note": ship_note,
        "cert_number": listing.cert_number(),
        "listing_country": listing.country,
    }
    return True, rec


def search_window(cfg):
    """Always search a little past the alert window so nothing slips between checks."""
    return max(cfg["poll"]["search_window_minutes"], cfg["deal"]["max_minutes_left"] + 2)


def next_interval(cfg, calls_today):
    """Seconds until the next check; slows down near the daily eBay call budget."""
    interval = cfg["poll"]["interval_seconds"]
    if calls_today >= cfg["poll"]["daily_call_budget"] * 0.9:
        log.warning("Near daily eBay call budget (%d) - slowing checks", calls_today)
        interval *= 4
    return interval


class Finder:
    def __init__(self, dry_run=False, notifier=None, on_deal=None, scan_fn=None):
        """notifier(rec, card) -> bool sends one alert (webhook mode).
        on_deal(rec, card) -> bool hands each deal to the member dispatcher instead (bot mode).
        scan_fn(cfg) -> cfg|None widens/narrows each check to what active filter profiles need."""
        self.cfg = load_config()
        self.conn = db.connect()
        self.ebay = EbayClient(self.cfg, self.conn)
        self.dry_run = dry_run
        self.notifier = notifier
        self.on_deal = on_deal
        self.scan_fn = scan_fn
        self.detail_cache = {}  # item_id -> (fetched_at, detail json)
        self.ppt = None
        self._auto_blocked = False

    def _detail(self, item_id):
        hit = self.detail_cache.get(item_id)
        if hit and time.time() - hit[0] < DETAIL_CACHE_SECONDS:
            return hit[1]
        d = self.ebay.get_item(item_id)
        self.detail_cache[item_id] = (time.time(), d)
        return d

    def _prune_cache(self):
        cutoff = time.time() - DETAIL_CACHE_SECONDS
        self.detail_cache = {k: v for k, v in self.detail_cache.items() if v[0] >= cutoff}

    def poll_once(self):
        self.cfg = load_config()  # pick up settings changes without a restart
        stats = {"listings": 0, "candidates": 0, "alerts": 0, "paused": False, "auto_lookups": 0, "paced": 0}
        if db.is_paused(self.conn):
            stats["paused"] = True
            return stats
        if getattr(self, "scan_fn", None):
            scan_cfg = self.scan_fn(self.cfg)
            if scan_cfg is None:
                log.info("No active filter profiles - nothing to scan.")
                return stats
            self.cfg = scan_cfg
        self.ebay.cfg = self.cfg
        cards = [c for c in db.list_cards(self.conn, active_only=True) if not db.is_muted(c)]
        ppt = self._ppt()
        if not cards and not ppt:
            log.info("No watchlist cards and automatic mode is off - nothing to check.")
            return stats

        # Market values once per poll, per watchlist card.
        values = {c["id"]: market_value(db.list_comps(self.conn, c["id"]), self.cfg["deal"]) for c in cards}

        summaries = self.ebay.search_ending_auctions(search_window(self.cfg), self.cfg["poll"]["max_pages"])
        stats["listings"] = len(summaries)
        self._auto_blocked = False
        self._paused_reason = None
        # Most valuable listings first: when price-lookup credits are being paced, they get the lookups.
        summaries = sorted(summaries, key=lambda s: -(Listing(s).price() or 0))
        min_price = float((self.cfg.get("auto") or {}).get("min_listing_price", 0) or 0)

        for s in summaries:
            item_id = s.get("itemId")
            if not item_id:
                continue
            # Webhook mode alerts once per listing. Bot mode re-checks it: other members' filters may match later.
            if not getattr(self, "on_deal", None) and db.already_alerted(self.conn, item_id):
                continue
            is_raw = str(s.get("conditionId") or "") == "4000"
            if title_excluded(s.get("title", ""), self.cfg, raw=is_raw):
                continue
            try:
                mins = minutes_left(s["itemEndDate"])
            except (KeyError, ValueError):
                continue
            if mins > self.cfg["deal"]["max_minutes_left"] or mins <= 0:
                continue  # it will come back on a later check once inside the window
            price = Listing(s).price()
            if price is None:
                continue
            if price + (Listing(s).shipping()[0] or 0) < min_price:
                continue  # never a real deal; not worth a price lookup
            if is_raw:
                if ppt and not self._auto_blocked and "raw" in (self.cfg["auto"].get("card_types") or []):
                    self._raw_path(s, mins, ppt, stats)
                continue  # the watchlist and graded matching are for slabs only
            handled = self._watchlist_path(s, mins, cards, values, stats) if cards else False
            if not handled and ppt and not self._auto_blocked:
                self._auto_path(s, mins, ppt, stats)

        self._prune_cache()
        if ppt:
            stats["price_calls"] = getattr(ppt, "network_calls", 0)
            stats["cache_hits"] = getattr(ppt, "cache_hits", 0)
            ppt.cache_hits = 0
        db.set_setting(self.conn, "last_check", db.now_iso())
        db.set_setting(self.conn, "last_check_listings", stats["listings"])
        return stats

    # ----- watchlist (your own comps) -----
    def _watchlist_path(self, s, mins, cards, values, stats):
        """Returns True if the listing's title named a watchlist card (so automatic mode leaves it alone)."""
        item_id = s["itemId"]
        min_disc = self.cfg["deal"]["min_discount_pct"]
        tnorm = norm_text(s.get("title", ""))
        pre = [c for c in cards if name_in_title(c, tnorm)]
        if not pre:
            return False

        # Cheap price pre-check before spending an API call on item details.
        quick = Listing(s)
        price, ship = quick.price(), quick.shipping()[0] or 0
        cheap = [c for c in pre if values[c["id"]].ok and
                 (price + ship) <= values[c["id"]].value * (1 - min_disc / 100)]
        if not cheap:
            c = pre[0]
            mv = values[c["id"]]
            if not mv.ok:
                return False  # no trusted watchlist value - let automatic mode try
            db.upsert_candidate(self.conn, {
                "item_id": item_id, "card_id": c["id"], "card_label": card_label(c), "title": s.get("title"),
                "url": s.get("itemWebUrl"), "total": round(price + ship, 2), "market_value": mv.value,
                "discount_pct": round((mv.value - price - ship) / mv.value * 100, 1),
                "minutes_left": round(mins, 1), "status": "skipped",
                "reason": "watchlist: name matched but not cheap enough (pre-check)"})
            return True

        stats["candidates"] += 1
        listing = Listing(s, self._detail(item_id))
        reasons = []
        for c in cheap:
            ok, why = match_card(listing, c, self.cfg)
            if ok:
                self._finish(listing, c, values[c["id"]], why, stats)
                return True
            reasons.append(f"{card_label(c)}: {why}")
        db.upsert_candidate(self.conn, {
            "item_id": item_id, "title": listing.title, "url": listing.url, "card_id": cheap[0]["id"],
            "card_label": card_label(cheap[0]), "total": round(price + ship, 2),
            "market_value": values[cheap[0]["id"]].value, "minutes_left": round(mins, 1),
            "status": "skipped", "reason": "watchlist: " + "; ".join(reasons)})
        return False  # not actually this watchlist card - automatic mode may still identify it

    # ----- automatic mode (PokemonPriceTracker) -----
    def _ppt(self):
        a = self.cfg.get("auto") or {}
        if not a.get("enabled") or not self.cfg["secrets"].get("ppt_api_key"):
            return None
        if self.ppt is None:
            self.ppt = PPTClient(self.cfg, self.conn)
        self.ppt.cfg = self.cfg
        self.ppt.network_calls = 0
        return self.ppt

    def _auto_path(self, s, mins, ppt, stats):
        a = self.cfg["auto"]
        item_id = s["itemId"]
        listing = Listing(s)
        g_struct, g_title = listing.grader()
        gr_struct, gr_title = listing.grade()
        # Fetch item details only when the title lacks what we need to identify the card.
        if not (g_title and gr_title and listing.card_numbers()):
            listing = Listing(s, self._detail(item_id))
            g_struct, g_title = listing.grader()
            gr_struct, gr_title = listing.grade()
        if g_struct and g_title and g_struct != g_title:
            return
        grader, grade = g_struct or g_title, gr_struct or gr_title
        if not grader or not grade or grader not in {g.upper() for g in a["graders"]}:
            return
        if (grade_number(grade) or 0) < a["min_grade"]:
            return
        lang = listing.language()
        if lang not in [l.lower() for l in a["languages"]]:
            return

        def skip(reason, label=None, mv=None):
            price, ship = listing.price(), listing.shipping()[0] or 0
            db.upsert_candidate(self.conn, {
                "item_id": item_id, "title": listing.title, "url": listing.url, "card_id": None,
                "card_label": label or f"(auto) {grader} {grade}", "total": round(price + ship, 2),
                "market_value": mv.value if mv else None, "minutes_left": round(mins, 1),
                "status": "skipped", "reason": "auto: " + reason})

        queries = number_queries(listing.title, listing.aspects.get("card number", ""))
        if not queries:
            return skip("no card number in the listing")
        try:
            if ppt.network_calls >= a["max_lookups_per_check"]:
                return  # budget for this check used; the listing is seen again next check
            stats["auto_lookups"] += 1
            card = None
            reason = "no catalog card matched the number + name in the title"
            for q, set_filter in queries:
                found = ppt.cards_by_number(q, lang, set_filter)
                if found:
                    card, reason = pick_card(listing, found)
                    if card or reason.startswith("ambiguous"):
                        break
            if not card:
                return skip(reason)
            mixed = mixed_printing_reason(card, listing)
            if mixed:
                return skip(mixed, label=f"{card.get('name')} ({card.get('setName')}) {grader} {grade}")
            priced = ppt.card_prices(card["tcgPlayerId"], lang, int(self.cfg["deal"]["comp_lookback_days"]))
        except PPTOutOfCredits as e:
            self._note_paused(e, stats)
            return
        except PPTError as e:
            self._auto_blocked = True
            log.error("%s", e)
            return

        ident = {"id": None, "kind": "graded", "name": _base_name(card.get("name", "")), "set_name": card.get("setName", ""),
                 "card_number": card.get("cardNumber", ""), "variants": ", ".join(sorted(listing.variants())),
                 "language": lang, "grader": grader, "grade": grade}
        mv = auto_market_value(priced.get("card"), int(priced.get("history_days") or 0), grader, grade, self.cfg)
        if not mv.ok:
            return skip(mv.reason, label=card_label(ident), mv=mv)

        price, ship = listing.price(), listing.shipping()[0] or 0
        if price + ship > mv.value * (1 - self.cfg["deal"]["min_discount_pct"] / 100):
            return skip(f"not cheap enough ({(mv.value - price - ship) / mv.value * 100:.0f}% below)",
                        label=card_label(ident), mv=mv)

        # Looks like a deal: confirm against the full listing before alerting.
        stats["candidates"] += 1
        if not listing.detail:
            listing = Listing(s, self._detail(item_id))
            gs, gt = listing.grader()
            rs, rt = listing.grade()
            if (gs and gs != grader) or (rs and rs != grade) or (gs and gt and gs != gt) or (rs and rt and rs != rt):
                return skip("grader/grade in item specifics disagree with the title", label=card_label(ident), mv=mv)
            if listing.language() != lang:
                return skip("item specifics show a different language", label=card_label(ident), mv=mv)
            if not number_matches(norm_card_number(card.get("cardNumber", "")), listing.card_numbers()):
                return skip("item specifics show a different card number", label=card_label(ident), mv=mv)
        why = f"auto-identified as {card.get('name')} ({card.get('setName')}) #{card.get('cardNumber')}, {grader} {grade}, {lang}"
        self._finish(listing, ident, mv, why, stats)

    # ----- raw (ungraded) cards, valued from TCGplayer sales in the stated condition -----
    def _raw_path(self, s, mins, ppt, stats):
        a = self.cfg["auto"]
        item_id = s["itemId"]
        listing = Listing(s)
        if TITLE_GRADE_RE.search(listing.title):
            return  # title says it's a slab but it's listed as ungraded: too ambiguous to price
        lang = listing.language()
        if lang not in [l.lower() for l in a["languages"]]:
            return
        queries = number_queries(listing.title)
        if not queries:
            listing = Listing(s, self._detail(item_id))  # the card number may be in the item specifics
            queries = number_queries(listing.title, listing.aspects.get("card number", ""))

        def skip(reason, label="(auto) Raw", mv=None):
            price, ship = listing.price(), listing.shipping()[0] or 0
            db.upsert_candidate(self.conn, {
                "item_id": item_id, "title": listing.title, "url": listing.url, "card_id": None,
                "card_label": label, "total": round(price + ship, 2), "market_value": mv.value if mv else None,
                "minutes_left": round(mins, 1), "status": "skipped", "reason": "raw: " + reason})

        if not queries:
            return skip("no card number in the listing")
        try:
            if ppt.network_calls >= a["max_lookups_per_check"]:
                return
            stats["auto_lookups"] += 1
            card, reason = None, "no catalog card matched the number + name in the title"
            for q, set_filter in queries:
                found = ppt.cards_by_number(q, lang, set_filter)
                if found:
                    card, reason = pick_card(listing, found)
                    if card or reason.startswith("ambiguous"):
                        break
            if not card:
                return skip(reason)
            printing, why_not = choose_printing(card, listing.variants())
            if not printing:
                return skip(why_not, label=f"{card.get('name')} ({card.get('setName')}) raw")
            # The catalog lookup already includes the Near Mint market price of the main printing. Most raw
            # auctions are low-value cards, so skip them here instead of paying for full price history.
            hint = (card.get("prices") or {}).get("market")
            if (printing == (card.get("prices") or {}).get("primaryPrinting") and hint is not None
                    and float(hint) < a["min_market_value"]):
                return
            priced = ppt.card_prices(card["tcgPlayerId"], lang, int(self.cfg["deal"]["comp_lookback_days"]))
        except PPTOutOfCredits as e:
            self._note_paused(e, stats)
            return
        except PPTError as e:
            self._auto_blocked = True
            log.error("%s", e)
            return

        full = priced.get("card") or {}
        history_days = int(priced.get("history_days") or 0)
        tcg_url, tcg_aff = tcgplayer_link(full or card, self.cfg)

        def ident_for(condition):
            return {"id": None, "kind": "raw", "name": _base_name(card.get("name", "")), "set_name": card.get("setName", ""),
                    "card_number": card.get("cardNumber", ""), "variants": printing, "language": lang,
                    "grader": "Raw", "grade": condition, "tcgplayer_url": tcg_url, "tcgplayer_affiliate": tcg_aff}

        # Cheap check first: even at Near Mint value, is it cheap enough? Only then fetch the listing's condition.
        best = raw_market_value(full, history_days, printing, "NM", self.cfg)
        if not best.ok:
            return skip(best.reason, label=card_label(ident_for("NM")), mv=best)
        price, ship = listing.price(), listing.shipping()[0] or 0
        disc = self.cfg["deal"]["min_discount_pct"]
        if price + ship > best.value * (1 - disc / 100):
            return skip(f"not cheap enough ({(best.value - price - ship) / best.value * 100:.0f}% below Near Mint value)",
                        label=card_label(ident_for("NM")), mv=best)

        stats["candidates"] += 1
        if not listing.detail:
            listing = Listing(s, self._detail(item_id))
        if listing.language() != lang:
            return skip("item specifics show a different language", label=card_label(ident_for("NM")), mv=best)
        if not number_matches(norm_card_number(card.get("cardNumber", "")), listing.card_numbers()):
            return skip("item specifics show a different card number", label=card_label(ident_for("NM")), mv=best)
        condition = listing.raw_condition()
        if not condition:
            return skip("condition not stated", label=card_label(ident_for("NM")), mv=best)
        if RAW_CONDITIONS.index(condition) > RAW_CONDITIONS.index(a.get("min_raw_condition", "NM")):
            return skip(f"condition {condition} is below every profile's minimum", label=card_label(ident_for(condition)))
        mv = raw_market_value(full, history_days, printing, condition, self.cfg)
        ident = ident_for(condition)
        if not mv.ok:
            return skip(mv.reason, label=card_label(ident), mv=mv)
        why = (f"auto-identified as {card.get('name')} ({card.get('setName')}) #{card.get('cardNumber')}, "
               f"raw {condition} {printing}, {lang}")
        self._finish(listing, ident, mv, why, stats)

    def _note_paused(self, e, stats):
        """New price lookups are paused (credit pacing or rate limit). Cached lookups carry on; log once per check."""
        stats["paced"] = stats.get("paced", 0) + 1
        if self._paused_reason is None:
            self._paused_reason = str(e)
            log.info("New price lookups waiting (%s); cached cards are still checked", e)

    def _finish(self, listing, card, mv, why, stats):
        qualifies, rec = evaluate(listing, card, mv, self.cfg)
        cand = {k: rec.get(k) for k in ("item_id", "card_id", "card_label", "title", "url", "total",
                                         "market_value", "discount_pct", "minutes_left")}
        if not qualifies:
            db.upsert_candidate(self.conn, {**cand, "status": "skipped", "reason": rec["skip"]})
            return
        rec["reason"]["match"] = why
        if getattr(self, "on_deal", None):
            delivered = self.on_deal(rec, card)
            db.upsert_candidate(self.conn, {**cand, "status": "alerted" if delivered else "deal (no profile matched)",
                                            "reason": rec["reason"]["rule"]})
            stats["alerts"] += 1 if delivered else 0
            return
        self.alert(rec, card)
        db.upsert_candidate(self.conn, {**cand, "status": "alerted", "reason": rec["reason"]["rule"]})
        stats["alerts"] += 1

    def alert(self, rec, card):
        if not db.record_alert(self.conn, rec):
            return  # already alerted (dedupe)
        payload = build_discord_payload(rec, card)
        log.info("DEAL: %s | $%.2f vs $%.2f (%.0f%% below) | %s", rec["card_label"], rec["total"],
                 rec["market_value"], rec["discount_pct"], rec["url"])
        if self.dry_run:
            log.info("(dry run - Discord message not sent)")
            return
        try:
            if self.notifier:
                ok = self.notifier(rec, card)
            else:
                ok = send_discord(self.cfg["secrets"]["discord_webhook_url"], payload)
        except Exception:
            log.exception("Sending alert failed")
            ok = False
        db.mark_delivered(self.conn, rec["item_id"], ok)

    def run_forever(self):
        log.info("Deal finder started. Ctrl+C to stop.")
        while True:
            started = time.time()
            try:
                stats = self.poll_once()
                calls = db.api_calls_today(self.conn)
                log.info("Checked %d ending auctions, %d candidates, %d alerts | eBay calls today: %d",
                         stats["listings"], stats["candidates"], stats["alerts"], calls)
            except EbayError as e:
                log.error("%s", e)
                calls = db.api_calls_today(self.conn)
            except Exception:
                log.exception("Unexpected error during check")
                calls = db.api_calls_today(self.conn)
            time.sleep(max(5, next_interval(self.cfg, calls) - (time.time() - started)))

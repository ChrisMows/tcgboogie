"""Deal finder for the website (tcgboogie.com).

  python run_web.py          run continuously: find deals, save them for the website, let it alert members
  python run_web.py --once   run a single check and exit

Needs in .env: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, PPT_API_KEY, DATABASE_URL (the website's database).
"""
import argparse
import logging
import sys
import time

from run_finder import setup_logging

from dealfinder import db, shared
from dealfinder.config import load_config
from dealfinder.ebay import EbayError
from dealfinder.finder import Finder, next_interval
from dealfinder.health import SiteHealth
from dealfinder.sales import SaleTracker
from dealfinder.sealed import SealedScanner
from dealfinder.topps import ToppsPricer
from dealfinder.watch_ebay import EbayWatcher
from dealfinder.web import WebLink


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()
    setup_logging()
    log = logging.getLogger("dealfinder")
    if not shared.enabled():
        log.error("DATABASE_URL is missing from .env (or psycopg isn't installed): the website can't receive deals.")
        sys.exit(1)

    link = WebLink(load_config())
    try:
        finder = Finder(on_deal=link.on_deal, scan_fn=link.scan_fn, on_listings=link.on_listings)
        link.finder = finder
    except EbayError as e:
        log.error("%s", e)
        sys.exit(1)
    watcher = EbayWatcher(finder.cfg, finder.ebay, link.photos)
    sealed = SealedScanner(finder)
    tracker = SaleTracker(finder.cfg, finder.ebay, finder.conn)
    finder.on_identified = tracker.remember
    site = SiteHealth(finder.cfg)
    topps = ToppsPricer(finder.cfg, finder.ebay)

    def check():
        stats = finder.poll_once()
        if stats.get("listings", 0) == 0 and not stats.get("paused"):
            stats["idle"] = True
        # Sealed products (every few checks, see config sealed.every_n_checks), before the website sends alerts.
        if not stats.get("idle"):
            try:
                sealed.run(stats)
            except EbayError as e:
                log.warning("Sealed round skipped: %s", e)
        link.after_check(stats, finder.ppt)
        # Our own sales history: final prices of auctions we identified that have since ended.
        tracker.cfg = finder.cfg
        try:
            stats["sales_recorded"] = tracker.run()
        except EbayError as e:
            log.warning("Final-price round skipped: %s", e)
        # Price alerts that also watch eBay: search the cards that are due, then let the website alert members.
        watcher.cfg = finder.cfg
        try:
            found = watcher.run()
        except EbayError as e:
            log.warning("eBay watch round skipped: %s", e)
            found = 0
        if found:
            link.notify_watch_listings()
        stats["watch_listings"] = found
        # Topps cards' typical eBay asking prices (a few cards per check, see config topps).
        topps.cfg = finder.cfg
        try:
            stats["topps_priced"] = topps.run()
        except Exception as e:  # noqa: BLE001 - Topps prices must never stop the deal finder
            log.warning("Topps price round skipped: %s", e)
        return stats

    if args.once:
        log.info("Result: %s", check())
        return
    from dealfinder import vision
    log.info("Photo check: %s", f"on ({link.photos.model})" if vision.enabled() else "off (add ANTHROPIC_API_KEY to .env to turn it on)")
    log.info("Deal finder (website mode) started. Ctrl+C to stop.")
    per_check = None  # average eBay calls per check, to spread the daily budget evenly
    while True:
        started = time.time()
        before = db.api_calls_today(finder.conn)
        try:
            stats = check()
            log.info("Checked %d ending auctions, %d deals | price lookups: %d new, %d reused | eBay calls today: %d of %d",
                     stats.get("listings", 0), stats.get("alerts", 0), stats.get("price_calls", 0),
                     stats.get("cache_hits", 0), db.api_calls_today(finder.conn), finder.cfg["poll"]["daily_call_budget"])
        except EbayError as e:
            log.error("%s", e)
        except KeyboardInterrupt:
            log.info("Stopped.")
            return
        except Exception:
            log.exception("Unexpected error during check")
        # Is the website itself healthy? (Messages the admin on Discord if it breaks.)
        site.cfg = finder.cfg
        try:
            site.tick()
        except Exception:  # noqa: BLE001 - watching the site must never stop the deal finder
            log.exception("Website health check crashed")
        used = db.api_calls_today(finder.conn) - before
        if used > 0:
            per_check = used if per_check is None else per_check * 0.8 + used * 0.2
        calls = db.api_calls_today(finder.conn)
        wait = next_interval(finder.cfg, calls, per_check)
        pause = max(5, wait - (time.time() - started))
        try:
            shared.heartbeat_next(time.time() + pause, calls, finder.cfg["poll"]["daily_call_budget"])
        except Exception:  # noqa: BLE001 - reporting must never stop the deal finder
            log.warning("Couldn't record the next check time")
        time.sleep(pause)


if __name__ == "__main__":
    main()

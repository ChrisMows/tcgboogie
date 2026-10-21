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

    def check():
        stats = finder.poll_once()
        if stats.get("listings", 0) == 0 and not stats.get("paused"):
            stats["idle"] = True
        link.after_check(stats, finder.ppt)
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
        used = db.api_calls_today(finder.conn) - before
        if used > 0:
            per_check = used if per_check is None else per_check * 0.8 + used * 0.2
        wait = next_interval(finder.cfg, db.api_calls_today(finder.conn), per_check)
        time.sleep(max(5, wait - (time.time() - started)))


if __name__ == "__main__":
    main()

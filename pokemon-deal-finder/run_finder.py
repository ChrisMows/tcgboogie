"""Pokémon graded deal finder.

  python run_finder.py              run continuously
  python run_finder.py --once       run a single check and exit
  python run_finder.py --dry-run    find deals but don't send Discord messages
  python run_finder.py --check      verify eBay keys + show what eBay returns right now (no alerts)
  python run_finder.py --test-alert send a sample alert to Discord
"""
import argparse
import logging
import sys
from logging.handlers import RotatingFileHandler

from dealfinder import db
from dealfinder.alerts import build_discord_payload, sample_alert, send_discord
from dealfinder.config import LOG_DIR, load_config


def setup_logging():
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    fh = RotatingFileHandler(LOG_DIR / "finder.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    root.addHandler(sh)
    root.addHandler(fh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--test-alert", action="store_true")
    args = ap.parse_args()
    setup_logging()
    log = logging.getLogger("dealfinder")

    if args.test_alert:
        cfg = load_config()
        rec, card = sample_alert()
        ok = send_discord(cfg["secrets"]["discord_webhook_url"], build_discord_payload(rec, card))
        log.info("Test alert %s", "sent - check your phone" if ok else "FAILED (see message above)")
        return

    from dealfinder.ebay import EbayClient, EbayError
    from dealfinder.finder import Finder, minutes_left

    if args.check:
        cfg = load_config()
        conn = db.connect()
        try:
            client = EbayClient(cfg, conn)
            items = client.search_ending_auctions(cfg["poll"]["search_window_minutes"], 1)
        except EbayError as e:
            log.error("%s", e)
            sys.exit(1)
        log.info("eBay connection OK. %d graded Pokémon auctions ending in the next %d min (first page):",
                 len(items), cfg["poll"]["search_window_minutes"])
        for it in items[:25]:
            p = it.get("currentBidPrice") or it.get("price") or {}
            log.info("  %5.1f min | $%8s | %s", minutes_left(it["itemEndDate"]), p.get("value"), it.get("title"))
        return

    try:
        finder = Finder(dry_run=args.dry_run)
    except EbayError as e:
        log.error("%s", e)
        sys.exit(1)
    if args.once:
        log.info("Result: %s", finder.poll_once())
    else:
        try:
            finder.run_forever()
        except KeyboardInterrupt:
            log.info("Stopped.")


if __name__ == "__main__":
    main()

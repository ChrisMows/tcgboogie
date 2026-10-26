"""Admin -> Usage: every few minutes the bot records what it uses that has a daily limit (eBay calls, price-service
credits) and how full its server is (disk, memory, database size), into the website's usage_daily table.
Each reading keeps the day's highest value (shared.usage_set), so the page shows how close each day came to its limit.

It also warns the admin (a Discord DM, like the website health check) when anything reaches 75% and again at 90% of its
limit, once per level per day, with what happens at the limit and what to do. Daily limits that reset at midnight UTC
also get a warning when today's pace would run out before the reset (config usage: alert_at, pace_warning).
"""
import logging
import shutil
import time
from datetime import datetime, timezone

from dealfinder import db, shared

log = logging.getLogger("dealfinder.usage")
EBAY_DAILY_LIMIT = 5000  # eBay's Browse API limit; the bot's own budget (poll.daily_call_budget) stays under it
GB = 1024 ** 3
USAGE_PAGE = "https://tcgboogie.com/app/admin?tab=usage"

# What each limited metric is called, whether it resets daily, and what happens / what to do when it runs out.
LIMITS = {
    "ppt_credits": ("Price service credits", "credits", True,
                    "At the limit, card prices stop updating and new card searches fail until the reset. The bot already "
                    "keeps a reserve for the website; if this keeps happening, the PokemonPriceTracker plan needs an upgrade."),
    "ebay_calls": ("eBay API calls", "calls", True,
                   "At the limit, deal checks pause until the reset (the bot slows itself down near 4,800). If it's "
                   "regular, eBay can raise the limit through the Growth Check application."),
    "emails": ("Emails sent", "emails", True,
               "From 90%, alerts and recaps wait until tomorrow so the rest is kept for sign-in links. Time for a bigger "
               "plan (Resend), then set ALERT_EMAIL_DAILY_LIMIT on the website to its daily allowance."),
    "vps_disk_gb": ("Server disk", "GB", False,
                    "If the disk fills, the database and backups stop working. Clear old files or move to a bigger VPS."),
    "vps_memory_gb": ("Server memory", "GB", False,
                      "With no memory left the server slows down or stops programs. Stopping the staging site frees some; "
                      "otherwise a bigger VPS."),
}
RESET_NOTE = " today (resets at midnight UTC: 8 PM Eastern, 7 PM in winter)"


def fmt(v, unit):
    return f"{v:,.1f} {unit}" if unit == "GB" else f"{int(round(v)):,} {unit}"


def usage_alerts(rows, sent, now, levels=(75, 90), pace=True):
    """[(metric, level, text)] for today's readings that crossed a new warning level. rows: [(metric, value, cap)];
    sent: {metric: highest level already sent today, or "pace"}. A pure function, so it's easy to test."""
    day_share = (now.hour * 3600 + now.minute * 60 + now.second) / 86400
    out = []
    for metric, value, cap in rows:
        if metric not in LIMITS or not cap:
            continue
        label, unit, daily, advice = LIMITS[metric]
        share = value / cap
        crossed = [lv for lv in levels if share * 100 >= lv]
        already = sent.get(metric)
        top = max(crossed) if crossed else None
        if top and (not isinstance(already, int) or top > already):
            icon = "\U0001F534" if top >= max(levels) else "\u26A0\uFE0F"
            out.append((metric, top, f"{icon} {label} at {round(share * 100)}%: {fmt(value, unit)} of {fmt(cap, unit)}"
                                     f"{RESET_NOTE if daily else ''}.\n{advice}\n{USAGE_PAGE}"))
        elif pace and daily and not crossed and already is None and day_share >= 0.25 and share >= 0.4:
            projected = value / day_share
            if projected >= cap:
                out.append((metric, "pace", f"\u26A0\uFE0F {label}: on pace to run out before the reset. {fmt(value, unit)} used of "
                                            f"{fmt(cap, unit)} with about {round((1 - day_share) * 24)} hours to go "
                                            f"(about {fmt(projected, unit)} by midnight UTC at this rate).\n{advice}\n{USAGE_PAGE}"))
    return out


def memory_used_gb(path="/proc/meminfo"):
    """(used, total) in GB from /proc/meminfo: in use = total minus what the system could hand out right now."""
    info = {}
    with open(path) as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0]) * 1024
    return (info["MemTotal"] - info["MemAvailable"]) / GB, info["MemTotal"] / GB


class UsageRecorder:
    def __init__(self, cfg, conn, ppt=None, every_seconds=300, notify=None):
        self.cfg, self.conn, self.ppt, self.every, self.notify = cfg, conn, ppt, every_seconds, notify
        self.last = 0.0

    def readings(self):
        """[(metric, value, cap)] right now; anything that can't be read is left out."""
        out = [("ebay_calls", db.api_calls_today(self.conn), EBAY_DAILY_LIMIT)]
        try:  # the same calls by purpose (Admin -> Usage shows where the budget goes): ebay_search, ebay_listing, ...
            out += [(f"ebay_{purpose}", n, None) for purpose, n in sorted(db.api_calls_by_purpose(self.conn).items())]
        except Exception:  # noqa: BLE001 - optional detail
            pass
        daily = (self.cfg.get("auto") or {}).get("daily_credits")
        left = self.ppt.credits_remaining() if self.ppt else None
        if daily and left is not None:
            out.append(("ppt_credits", max(0, int(daily) - int(left)), int(daily)))
        disk = shutil.disk_usage("/")
        out.append(("vps_disk_gb", disk.used / GB, disk.total / GB))
        try:
            used, total = memory_used_gb()
            out.append(("vps_memory_gb", used, total))
        except (OSError, KeyError, ValueError):
            pass  # not Linux (a test run on Windows)
        size = shared.database_size_mb()
        if size is not None:
            out.append(("db_size_mb", size, None))
        return out

    def tick(self, now=None):
        """Record the readings at most once every `every_seconds`. Never raises."""
        now = time.time() if now is None else now
        if now - self.last < self.every or not shared.enabled():
            return False
        self.last = now
        try:
            for metric, value, cap in self.readings():
                shared.usage_set(metric, value, cap)
        except Exception as e:  # noqa: BLE001 - usage numbers must never stop the deal finder
            log.warning("Couldn't record usage: %s", e)
        try:
            self.check_alerts()
        except Exception as e:  # noqa: BLE001
            log.warning("Couldn't check usage alerts: %s", e)
        return True

    def check_alerts(self, now=None):
        """Warn the admin about anything near its limit today (each level once a day, remembered across restarts)."""
        u = self.cfg.get("usage") or {}
        if not self.notify or not u.get("alerts", True):
            return []
        now = now or datetime.now(timezone.utc)
        day = now.date().isoformat()
        rows = shared.usage_today() or []
        sent = {}
        for metric, *_ in rows:
            v = db.get_setting(self.conn, f"usage_alert:{day}:{metric}")
            if v is not None:
                sent[metric] = "pace" if v == "pace" else int(v)
        fired = []
        for metric, level, text in usage_alerts(rows, sent, now, tuple(u.get("alert_at", (75, 90))), u.get("pace_warning", True)):
            if self.notify(text):
                db.set_setting(self.conn, f"usage_alert:{day}:{metric}", level)
                fired.append(metric)
        return fired

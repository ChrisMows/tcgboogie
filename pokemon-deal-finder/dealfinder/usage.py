"""Admin -> Usage: every few minutes the bot records what it uses that has a daily limit (eBay calls, price-service
credits) and how full its server is (disk, memory, database size), into the website's usage_daily table.
Each reading keeps the day's highest value (shared.usage_set), so the page shows how close each day came to its limit.
"""
import logging
import shutil
import time

from dealfinder import db, shared

log = logging.getLogger("dealfinder.usage")
EBAY_DAILY_LIMIT = 5000  # eBay's Browse API limit; the bot's own budget (poll.daily_call_budget) stays under it
GB = 1024 ** 3


def memory_used_gb(path="/proc/meminfo"):
    """(used, total) in GB from /proc/meminfo: in use = total minus what the system could hand out right now."""
    info = {}
    with open(path) as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0]) * 1024
    return (info["MemTotal"] - info["MemAvailable"]) / GB, info["MemTotal"] / GB


class UsageRecorder:
    def __init__(self, cfg, conn, ppt=None, every_seconds=300):
        self.cfg, self.conn, self.ppt, self.every = cfg, conn, ppt, every_seconds
        self.last = 0.0

    def readings(self):
        """[(metric, value, cap)] right now; anything that can't be read is left out."""
        out = [("ebay_calls", db.api_calls_today(self.conn), EBAY_DAILY_LIMIT)]
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
        return True

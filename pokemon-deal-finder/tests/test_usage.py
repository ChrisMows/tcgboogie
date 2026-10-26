import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest import mock

from dealfinder import usage
from dealfinder.usage import UsageRecorder, memory_used_gb, usage_alerts


class FakePPT:
    def __init__(self, left):
        self.left = left

    def credits_remaining(self):
        return self.left


class TestUsage(unittest.TestCase):
    def test_memory_from_meminfo(self):
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as f:
            f.write("MemTotal:        4194304 kB\nMemFree:          100 kB\nMemAvailable:    3145728 kB\n")
        try:
            used, total = memory_used_gb(f.name)
        finally:
            os.unlink(f.name)
        self.assertAlmostEqual(total, 4.0)
        self.assertAlmostEqual(used, 1.0)

    def test_readings_and_tick(self):
        rec = UsageRecorder({"auto": {"daily_credits": 20000}}, conn=None, ppt=FakePPT(18500), every_seconds=300)
        saved = []
        with mock.patch.object(usage.db, "api_calls_today", return_value=1234), \
                mock.patch.object(usage.shared, "database_size_mb", return_value=150.0), \
                mock.patch.object(usage.shared, "enabled", return_value=True), \
                mock.patch.object(usage.shared, "usage_set", side_effect=lambda m, v, c=None: saved.append((m, v, c))):
            self.assertTrue(rec.tick(now=1000))
            self.assertFalse(rec.tick(now=1100))  # within 5 minutes: skipped
            self.assertTrue(rec.tick(now=1400))
        got = {m: (v, c) for m, v, c in saved}
        self.assertEqual(got["ebay_calls"], (1234, 5000))
        self.assertEqual(got["ppt_credits"], (1500, 20000))  # used = daily - left
        self.assertEqual(got["db_size_mb"], (150.0, None))
        self.assertIn("vps_disk_gb", got)
        self.assertEqual(len(saved), 2 * len(got))  # two ticks recorded

    def test_unknown_credits_left_out(self):
        rec = UsageRecorder({"auto": {"daily_credits": 20000}}, conn=None, ppt=FakePPT(None))
        with mock.patch.object(usage.db, "api_calls_today", return_value=0), \
                mock.patch.object(usage.shared, "database_size_mb", return_value=None):
            metrics = [m for m, _, _ in rec.readings()]
        self.assertNotIn("ppt_credits", metrics)
        self.assertNotIn("db_size_mb", metrics)

    def test_alert_levels_once_each(self):
        noon = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)
        rows = [("ppt_credits", 15200, 20000), ("ebay_calls", 1000, 5000), ("db_size_mb", 900, None)]
        got = usage_alerts(rows, {}, noon)
        self.assertEqual([(m, lv) for m, lv, _ in got], [("ppt_credits", 75)])
        self.assertIn("76%", got[0][2])
        self.assertIn("15,200 credits of 20,000 credits", got[0][2])
        self.assertEqual(usage_alerts(rows, {"ppt_credits": 75}, noon), [])  # already sent today
        rows[0] = ("ppt_credits", 18500, 20000)
        self.assertEqual([(m, lv) for m, lv, _ in usage_alerts(rows, {"ppt_credits": 75}, noon)], [("ppt_credits", 90)])

    def test_pace_warning(self):
        # 6 AM UTC (a quarter of the day) with 45% used: on pace for 180% by midnight.
        six = datetime(2026, 10, 26, 6, 0, tzinfo=timezone.utc)
        got = usage_alerts([("ebay_calls", 2250, 5000)], {}, six)
        self.assertEqual([(m, lv) for m, lv, _ in got], [("ebay_calls", "pace")])
        self.assertIn("on pace to run out", got[0][2])
        self.assertEqual(usage_alerts([("ebay_calls", 2250, 5000)], {"ebay_calls": "pace"}, six), [])
        # too early in the day to judge, or disk (no daily reset): no pace warning
        self.assertEqual(usage_alerts([("ebay_calls", 2250, 5000)], {}, datetime(2026, 10, 26, 3, 0, tzinfo=timezone.utc)), [])
        self.assertEqual(usage_alerts([("vps_disk_gb", 20, 47)], {}, six), [])

    def test_check_alerts_remembers_what_it_sent(self):
        sent_msgs = []
        rec = UsageRecorder({"usage": {"alert_at": [75, 90]}}, conn=object(), notify=lambda t: sent_msgs.append(t) or True)
        store = {}
        noon = datetime(2026, 10, 26, 12, 0, tzinfo=timezone.utc)
        with mock.patch.object(usage.shared, "usage_today", return_value=[("emails", 950, 1000)]), \
                mock.patch.object(usage.db, "get_setting", side_effect=lambda c, k, d=None: store.get(k, d)), \
                mock.patch.object(usage.db, "set_setting", side_effect=lambda c, k, v: store.__setitem__(k, str(v))):
            self.assertEqual(rec.check_alerts(now=noon), ["emails"])
            self.assertEqual(rec.check_alerts(now=noon), [])  # 90% already sent today
        self.assertEqual(len(sent_msgs), 1)
        self.assertIn("Resend", sent_msgs[0])
        self.assertEqual(store["usage_alert:2026-10-26:emails"], "90")

    def test_never_raises(self):
        rec = UsageRecorder({}, conn=None)
        with mock.patch.object(usage.shared, "enabled", return_value=True), \
                mock.patch.object(rec, "readings", side_effect=RuntimeError("boom")):
            self.assertTrue(rec.tick(now=10_000))


if __name__ == "__main__":
    unittest.main()

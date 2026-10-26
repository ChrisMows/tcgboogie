import os
import tempfile
import unittest
from unittest import mock

from dealfinder import usage
from dealfinder.usage import UsageRecorder, memory_used_gb


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

    def test_never_raises(self):
        rec = UsageRecorder({}, conn=None)
        with mock.patch.object(usage.shared, "enabled", return_value=True), \
                mock.patch.object(rec, "readings", side_effect=RuntimeError("boom")):
            self.assertTrue(rec.tick(now=10_000))


if __name__ == "__main__":
    unittest.main()

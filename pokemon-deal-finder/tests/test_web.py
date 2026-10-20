"""Website mode: deals are handed to the website in the shape web/lib/filters.js matches."""
import unittest

from dealfinder.web import deal_record


class DealRecordTests(unittest.TestCase):
    def rec(self, **kw):
        base = {"item_id": "v1|1|0", "total": 2180.0, "market_value": 3750.0, "discount_pct": 41.87, "comps_used": 46,
                "feedback_score": 1843, "feedback_pct": 99.8, "flags": ["seller under 50 reviews"], "bid_count": 7,
                "title": "Umbreon VMAX 215/203 PSA 10", "url": "https://www.ebay.com/itm/1", "image": "https://i.ebayimg.com/x.jpg",
                "end_time": "2026-10-20T20:00:00Z", "reason": {"listing_country": "US", "market": {"reason": "median of 46 sales"}}}
        base.update(kw)
        return base

    def test_graded(self):
        card = {"kind": "graded", "name": "Umbreon VMAX", "set_name": "SWSH07: Evolving Skies", "card_number": "215/203",
                "language": "english", "grader": "PSA", "grade": "10", "product_id": "246723"}
        d = deal_record(self.rec(), card)
        self.assertEqual((d["kind"], d["grader"], d["grade"], d["discountPct"]), ("graded", "PSA", 10.0, 42))
        self.assertEqual(d["image"], "https://tcgplayer-cdn.tcgplayer.com/product/246723_in_200x200.jpg")
        self.assertEqual((d["country"], d["comps"], d["sellerFeedback"], d["productId"]), ("US", 46, 1843, "246723"))
        self.assertNotIn("condition", d)

    def test_raw_and_half_grades(self):
        raw = deal_record(self.rec(), {"kind": "raw", "name": "Charizard ex", "grade": "LP", "language": "english"})
        self.assertEqual((raw["kind"], raw["condition"]), ("raw", "LP"))
        self.assertNotIn("grader", raw)
        self.assertEqual(raw["image"], "https://i.ebayimg.com/x.jpg")  # no product id: the listing's own photo
        half = deal_record(self.rec(), {"kind": "graded", "name": "Lugia", "grader": "BGS", "grade": "9.5"})
        self.assertEqual(half["grade"], 9.5)


class EbayPacingTests(unittest.TestCase):
    def test_checks_spread_to_last_the_day(self):
        from datetime import datetime, timezone
        from dealfinder.finder import next_interval
        cfg = {"poll": {"interval_seconds": 75, "daily_call_budget": 4800}}
        noon = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)
        # 2,400 calls left, 10 per check -> 240 checks for 12 hours -> one every 3 minutes.
        self.assertAlmostEqual(next_interval(cfg, 2400, 10, noon), 180, delta=1)
        # Plenty left: never faster than the configured interval.
        self.assertEqual(next_interval(cfg, 0, 1, noon), 75)
        # Budget used: wait for the reset.
        self.assertGreater(next_interval(cfg, 4800, 10, noon), 12 * 3600)


if __name__ == "__main__":
    unittest.main()

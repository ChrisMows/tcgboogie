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


class PhotoCheckTests(unittest.TestCase):
    """The wrong-set listing: titled as the $267 Surging Sparks Pikachu ex, photos show a ~$47 30th Celebration one."""

    def setUp(self):
        from unittest import mock
        import dealfinder.web as web
        self.web, self.mock = web, mock
        self.patch = mock.patch.multiple(web.shared, publish_deal=lambda *a: True, log_event=lambda *a, **k: None)
        self.patch.start()
        self.link = web.WebLink({"website": {}, "vision": {}})
        self.card = {"kind": "raw", "name": "Pikachu ex", "set_name": "SV08: Surging Sparks", "card_number": "238/191",
                     "language": "english", "grade": "NM", "product_id": "590027"}
        self.rec = {"item_id": "v1|9|0", "total": 85.9, "market_value": 266.98, "discount_pct": 68, "end_time": "2026-10-20T20:00:00Z",
                    "images": ["https://i.ebayimg.com/images/g/x/s-l225.jpg"], "reason": {}}

        class PPT:
            def cards_by_name(self, name, lang):
                return [{"name": "Pikachu ex - 238/191", "setName": "SV08: Surging Sparks", "cardNumber": "238/191", "tcgPlayerId": "590027", "prices": {"market": 266.98}},
                        {"name": "Pikachu ex - 149/128", "setName": "ME: 30th Celebration", "cardNumber": "149/128", "tcgPlayerId": "712953", "prices": {"market": 47.14}},
                        {"name": "Pikachu V", "setName": "Other", "cardNumber": "1", "tcgPlayerId": "1", "prices": {"market": 80}}]

        self.link.finder = type("F", (), {"ppt": PPT()})()

    def tearDown(self):
        self.patch.stop()

    def run_with(self, verdict):
        self.link.photos.check = lambda *a, **k: verdict
        return self.link.on_deal(dict(self.rec), dict(self.card))

    def test_photo_of_a_different_card_is_dropped(self):
        self.assertFalse(self.run_with({"verdict": "different_card", "shown": "B", "reason": "30th Celebration border"}))
        self.assertEqual(self.link.held, 1)

    def test_lookalikes_are_offered_and_unclear_photos_flagged(self):
        seen = {}
        def check(item, claimed, ref, photos, looks):
            seen["looks"] = looks
            return {"verdict": "unclear", "shown": "none", "reason": "photo too small"}
        self.link.photos.check = check
        captured = {}
        with self.mock.patch.object(self.web.shared, "publish_deal", lambda iid, data, end: captured.update(data) or True):
            self.assertTrue(self.link.on_deal(dict(self.rec), dict(self.card)))
        self.assertEqual([pid for _, pid in seen["looks"]], ["712953"])  # same name only, not the card itself
        self.assertTrue(captured["flags"][0].startswith("Photo check unclear"))

    def test_without_photo_check_the_cheaper_version_is_named(self):
        captured = {}
        self.link.photos.check = lambda *a, **k: None
        with self.mock.patch.object(self.web.shared, "publish_deal", lambda iid, data, end: captured.update(data) or True):
            self.link.on_deal(dict(self.rec), dict(self.card))
        self.assertIn("ME: 30th Celebration", captured["flags"][0])
        self.assertEqual(captured["photoCheck"], "skipped")


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

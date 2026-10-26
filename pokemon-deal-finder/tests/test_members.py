"""Members, plans, filter profiles and the scan-once / match-per-member dispatcher."""
import copy
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dealfinder import db, members
from test_finder import CFG

PREMIUM = CFG["plans"]["premium"]
STANDARD = CFG["plans"]["standard"]


def deal(**kw):
    end = datetime.now(timezone.utc) + timedelta(minutes=kw.pop("minutes", 6))
    rec = {"item_id": kw.pop("item_id", "v1|1|0"), "title": kw.pop("title", "2021 Evolving Skies Umbreon VMAX 215/203 PSA 10"),
           "url": "https://www.ebay.com/itm/1", "price": 2000, "shipping": 0, "total": kw.pop("total", 2000.0),
           "market_value": kw.pop("market_value", 3900.0), "discount_pct": kw.pop("discount_pct", 48.7),
           "comps_used": kw.pop("comps_used", 20), "minutes_left": 6, "end_time": end.isoformat(),
           "seller": "s", "feedback_score": kw.pop("feedback_score", 900), "feedback_pct": 99.9, "bid_count": 3,
           "flags": kw.pop("flags", []), "card_id": None, "card_label": "Umbreon VMAX PSA 10",
           "reason": {"listing_country": kw.pop("country", "US"), "market": {"reason": "x"}}}
    card = {"id": None, "name": kw.pop("name", "Umbreon VMAX"), "set_name": kw.pop("set_name", "SWSH07: Evolving Skies"),
            "card_number": "215/203", "grader": kw.pop("grader", "PSA"), "grade": kw.pop("grade", "10"),
            "language": kw.pop("language", "english"), "variants": ""}
    assert not kw, kw
    return rec, card


class FilterTests(unittest.TestCase):
    def test_defaults_respect_plan(self):
        f = members.default_filters(CFG, STANDARD)
        self.assertGreaterEqual(f["min_discount_pct"], STANDARD["min_discount_floor"])
        self.assertLessEqual(f["max_minutes_left"], STANDARD["max_window_minutes"])
        self.assertEqual(f["languages"], ["english"])  # Japanese is a Premium feature
        self.assertIn("japanese", members.default_filters(CFG, PREMIUM)["languages"])

    def test_plan_limits_enforced(self):
        f = members.default_filters(CFG, STANDARD)
        with self.assertRaisesRegex(ValueError, "Upgrade"):
            members.set_filter(CFG, f, "min_discount_pct", "20", STANDARD)
        with self.assertRaisesRegex(ValueError, "Upgrade"):
            members.set_filter(CFG, f, "max_minutes_left", "30", STANDARD)
        with self.assertRaisesRegex(ValueError, "Premium"):
            members.set_filter(CFG, f, "languages", "english, japanese", STANDARD)
        p = members.default_filters(CFG, PREMIUM)
        self.assertEqual(members.set_filter(CFG, p, "min_discount_pct", "20%", PREMIUM)["min_discount_pct"], 20)
        self.assertEqual(members.set_filter(CFG, p, "max_minutes_left", "45", PREMIUM)["max_minutes_left"], 45)

    def test_list_and_optional_values(self):
        f = members.default_filters(CFG, PREMIUM)
        f = members.set_filter(CFG, f, "pokemon", "Charizard, Umbreon", PREMIUM)
        self.assertEqual(f["pokemon"], ["Charizard", "Umbreon"])
        self.assertEqual(members.set_filter(CFG, f, "pokemon", "clear", PREMIUM)["pokemon"], [])
        self.assertEqual(members.set_filter(CFG, f, "graders", "psa, cgc", PREMIUM)["graders"], ["PSA", "CGC"])
        with self.assertRaises(ValueError):
            members.set_filter(CFG, f, "graders", "XYZ", PREMIUM)
        f = members.set_filter(CFG, f, "max_price", "$1,500", PREMIUM)
        self.assertEqual(f["max_price"], 1500)
        self.assertIsNone(members.set_filter(CFG, f, "max_price", "none", PREMIUM)["max_price"])
        self.assertTrue(members.set_filter(CFG, f, "us_only", "on", PREMIUM)["us_only"])
        with self.assertRaisesRegex(ValueError, "Lowest grade"):
            members.set_filter(CFG, {**f, "max_grade": 8}, "min_grade", "9", PREMIUM)

    def test_downgrade_clamps(self):
        f = members.set_filter(CFG, members.default_filters(CFG, PREMIUM), "min_discount_pct", "15", PREMIUM)
        c = members.clamp_to_plan(CFG, f, STANDARD)
        self.assertEqual(c["min_discount_pct"], STANDARD["min_discount_floor"])
        self.assertEqual(c["languages"], ["english"])

    def test_tier_from_roles(self):
        self.assertEqual(members.tier_from_roles(CFG, ["Standard", "Premium", "Member"]), "premium")
        self.assertEqual(members.tier_from_roles(CFG, ["standard"]), "standard")
        self.assertIsNone(members.tier_from_roles(CFG, ["Member"]))


class MatchTests(unittest.TestCase):
    def setUp(self):
        self.f = members.default_filters(CFG, PREMIUM)

    def ok(self, f=None, **kw):
        rec, card = deal(**kw)
        return members.matches(f or self.f, rec, card, members.minutes_until(rec["end_time"]))[0]

    def test_basic(self):
        self.assertTrue(self.ok())
        self.assertFalse(self.ok(discount_pct=20))
        self.assertFalse(self.ok(minutes=12))      # default window is 10 minutes
        self.assertFalse(self.ok(grade="6"))
        self.assertFalse(self.ok(grader="ACE"))
        self.assertFalse(self.ok(market_value=20))

    def test_pokemon_and_sets(self):
        f = {**self.f, "pokemon": ["Charizard"]}
        self.assertFalse(self.ok(f))
        self.assertTrue(self.ok(f, name="Charizard ex", title="151 Charizard ex 199/165 PSA 10"))
        f = {**self.f, "exclude_pokemon": ["umbreon"]}
        self.assertFalse(self.ok(f))
        f = {**self.f, "sets": ["Evolving Skies"]}
        self.assertTrue(self.ok(f))
        f = {**self.f, "exclude_sets": ["evolving skies"]}
        self.assertFalse(self.ok(f))

    def test_seller_and_flags(self):
        self.assertFalse(self.ok({**self.f, "us_only": True}, country="JP"))
        self.assertFalse(self.ok({**self.f, "hide_flagged": True}, flags=["Low seller feedback (3)"]))
        self.assertFalse(self.ok({**self.f, "min_seller_feedback": 1000}))
        self.assertFalse(self.ok({**self.f, "max_price": 1500}))
        self.assertFalse(self.ok({**self.f, "min_comps": 50}))


class DBCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.conn = db.connect(self.tmp / "t.db")

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def add(self, uid, tier, **filters):
        db.upsert_member(self.conn, uid, tier=tier, active=1, source="manual", delivery_kind="channel", delivery_id="1")
        p = CFG["plans"][tier]
        f = {**members.default_filters(CFG, p), **filters}
        return db.create_profile(self.conn, uid, "p", f)


class ScanTests(DBCase):
    def test_scan_is_widest_profile_within_limits(self):
        self.add("1", "premium", min_discount_pct=15, max_minutes_left=45, min_market_value=10, min_grade=5)
        self.add("2", "standard")
        s = members.scan_settings(CFG, members.active_profiles(self.conn, CFG))
        self.assertEqual(s["deal"]["min_discount_pct"], 15)
        self.assertEqual(s["deal"]["max_minutes_left"], 45)
        self.assertEqual(s["auto"]["min_market_value"], 30)  # a $10 filter is lifted to the $30 minimum
        self.assertEqual(s["auto"]["min_grade"], 5)
        self.assertIn("japanese", s["auto"]["languages"])

    def test_no_profiles_means_no_scan(self):
        self.assertIsNone(members.scan_settings(CFG, members.active_profiles(self.conn, CFG)))

    def test_profiles_over_plan_limit_dont_run(self):
        for _ in range(4):
            self.add("2", "standard")
        self.assertEqual(len(members.active_profiles(self.conn, CFG)), STANDARD["max_profiles"])


class DispatchTests(DBCase):
    def test_fan_out_with_delay_and_dedupe(self):
        self.add("prem", "premium")
        self.add("std", "standard")
        self.add("picky", "premium", pokemon=["Charizard"])
        db.upsert_member(self.conn, "gone", tier="premium", active=0)
        woke = []
        d = members.Dispatcher(self.conn, lambda: CFG, lambda: woke.append(1))
        rec, card = deal(discount_pct=48.7)
        self.assertTrue(d.handle(rec, card))
        q = {r["discord_id"]: r for r in self.conn.execute("SELECT * FROM deliveries")}
        self.assertEqual(set(q), {"prem", "std"})  # picky wants Charizard; "gone" is inactive
        gap = (datetime.fromisoformat(q["std"]["send_after"]) - datetime.fromisoformat(q["prem"]["send_after"])).total_seconds()
        self.assertAlmostEqual(gap, STANDARD["alert_delay_seconds"], delta=2)
        self.assertEqual(woke, [1])
        d.handle(rec, card)  # seen again on the next check
        self.assertEqual(self.conn.execute("SELECT COUNT(*) AS n FROM deliveries").fetchone()["n"], 2)
        self.assertEqual(len(db.list_alerts(self.conn)), 1)

    def test_standard_delay_cannot_outlast_the_auction(self):
        self.add("std", "standard")
        rec, card = deal(minutes=1.5)  # 2-minute delay would land after the end
        members.Dispatcher(self.conn, lambda: CFG).handle(rec, card)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) AS n FROM deliveries").fetchone()["n"], 0)


class FinderModeTests(DBCase):
    def test_bot_mode_rechecks_listings_and_uses_scan_settings(self):
        from dealfinder.finder import Finder
        from test_finder import FakeEbay, UMB_ASPECTS, UMBREON, comps_around, detail, summary
        cid = db.save_card(self.conn, {**{k: v for k, v in UMBREON.items() if k != "id"}, "active": 1})
        for c in comps_around(1000, 8):
            db.add_comp(self.conn, cid, c["sold_date"], c["price"], c["shipping"])
        s = summary("v1|5|0", "2021 Pokemon Evolving Skies Umbreon VMAX 215/203 PSA 10", price=500, minutes=25)
        f = Finder.__new__(Finder)
        f.cfg, f.conn, f.ebay, f.dry_run, f.detail_cache, f.notifier = CFG, self.conn, FakeEbay([s], {"v1|5|0": detail(aspects=UMB_ASPECTS)}), True, {}, None
        f.ppt, f._auto_blocked = None, False
        seen = []
        f.on_deal = lambda rec, card: seen.append(rec["item_id"]) or True
        wide = copy.deepcopy(CFG)
        wide["deal"]["max_minutes_left"] = 30
        f.scan_fn = lambda cfg: wide
        f.poll_once()
        f.poll_once()
        self.assertEqual(seen, ["v1|5|0", "v1|5|0"])  # 25 min left only qualifies because a profile widened the scan
        f.scan_fn = lambda cfg: None
        self.assertEqual(f.poll_once()["listings"], 0)


if __name__ == "__main__":
    unittest.main()

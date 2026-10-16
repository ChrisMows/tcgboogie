"""Raw (ungraded) card support: condition parsing, printings, TCGplayer-based value, matching, and the finder path."""
import copy
import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import dealfinder.finder as fm
from dealfinder import db, members
from dealfinder.auto import choose_printing, raw_market_value, tcgplayer_link
from dealfinder.finder import Finder
from dealfinder.parse import Listing, normalize_raw_condition, red_flags, title_excluded
from test_auto import FakePPT
from test_finder import CFG, FakeEbay, summary

TODAY = date.today()
RAW_CFG = copy.deepcopy(CFG)
RAW_CFG["auto"].update(enabled=True, card_types=["graded", "raw"], min_raw_condition="LP")
RAW_CFG["secrets"]["ppt_api_key"] = "test-key"


def history(price, days=30, volume=1):
    return [{"date": f"{(TODAY - timedelta(days=i)).isoformat()}T00:00:00.000Z", "market": price * (1 + (i % 3 - 1) * 0.01),
             "volume": volume} for i in range(days)]


# Shaped like the real response for Psyduck 175/165 (Scarlet & Violet 151)
PSYDUCK = {"name": "Psyduck - 175/165", "setName": "SV: Scarlet & Violet 151", "cardNumber": "175/165", "tcgPlayerId": "517035",
           "printingsAvailable": ["Holofoil"], "tcgPlayerUrl": "https://www.tcgplayer.com/product/517035",
           "prices": {"market": 57.93, "primaryPrinting": "Holofoil"},
           "priceHistory": {"variants": {"Holofoil": {
               "Near Mint": {"history": history(58), "latestPrice": 57.93, "latestDate": f"{TODAY}T00:00:00.000Z"},
               "Lightly Played": {"history": history(53), "latestPrice": 53.32, "latestDate": f"{TODAY}T00:00:00.000Z"},
               "Moderately Played": {"history": history(40, volume=0), "latestPrice": 40.0}}}}}
SHADOWLESS = {"name": "Charizard", "setName": "Base Set (Shadowless)", "cardNumber": "004/102", "tcgPlayerId": "106999",
              "printingsAvailable": ["Unlimited Holofoil", "1st Edition Holofoil"], "prices": {"primaryPrinting": "Unlimited Holofoil"}}
REVERSE = {"printingsAvailable": ["Reverse Holofoil", "Holofoil"], "prices": {"primaryPrinting": "Holofoil"}}


def raw_summary(item_id, title, price, minutes=5, condition_text=None):
    s = summary(item_id, title, price=price, ship=1.0, minutes=minutes)
    s["conditionId"], s["condition"] = "4000", "Ungraded"
    return s


def raw_detail(condition="Near Mint or Better", number="175/165", language="English"):
    d = {"localizedAspects": [{"name": "Card Number", "value": number}, {"name": "Language", "value": language}],
         "conditionDescriptors": [{"name": "Card Condition", "values": [{"content": condition}]}] if condition else []}
    return d


class ConditionTests(unittest.TestCase):
    def test_ebay_condition_field(self):
        for text, want in [("Near Mint or Better", "NM"), ("Lightly Played (Excellent)", "LP"), ("Excellent", "LP"),
                           ("Moderately Played (Very Good)", "MP"), ("Heavily Played (Poor)", "HP"), ("Damaged", "DMG")]:
            self.assertEqual(normalize_raw_condition(text), want, text)

    def test_title_hp_means_hit_points(self):
        self.assertIsNone(normalize_raw_condition("Charizard VSTAR 120 HP Holo", from_title=True))
        self.assertEqual(normalize_raw_condition("Charizard 4/102 NM Holo", from_title=True), "NM")
        self.assertEqual(normalize_raw_condition("Blastoise heavily played", from_title=True), "HP")

    def test_raw_words_allowed_only_for_raw(self):
        t = "Psyduck 175/165 Raw NM Pokemon 151"
        self.assertTrue(title_excluded(t, CFG))            # graded search: "raw" rules it out
        self.assertIsNone(title_excluded(t, CFG, raw=True))  # raw search: fine
        self.assertTrue(title_excluded("Psyduck proxy card", CFG, raw=True))

    def test_raw_red_flags(self):
        flags = red_flags(Listing(raw_summary("v1|1|0", "Psyduck 175/165", 20), raw_detail()), CFG)
        self.assertIn("Raw card: condition is the seller's own description", flags)
        self.assertFalse(any("cert" in f.lower() or "grader" in f.lower() for f in flags))


class PrintingAndValueTests(unittest.TestCase):
    def test_choose_printing(self):
        self.assertEqual(choose_printing(SHADOWLESS, set())[0], "Unlimited Holofoil")
        self.assertEqual(choose_printing(SHADOWLESS, {"1st edition"})[0], "1st Edition Holofoil")
        self.assertEqual(choose_printing(REVERSE, set())[0], "Holofoil")
        self.assertEqual(choose_printing(REVERSE, {"reverse holo"})[0], "Reverse Holofoil")
        self.assertIsNone(choose_printing(PSYDUCK, {"reverse holo"})[0])

    def test_value_by_condition(self):
        nm = raw_market_value(PSYDUCK, 30, "Holofoil", "NM", RAW_CFG)
        lp = raw_market_value(PSYDUCK, 30, "Holofoil", "LP", RAW_CFG)
        self.assertEqual((nm.value, nm.comps_used), (57.93, 30))
        self.assertEqual(lp.value, 53.32)
        self.assertIn("TCGplayer market for Near Mint Holofoil", nm.reason)

    def test_value_rejections(self):
        self.assertIn("limited to 3 days", raw_market_value(PSYDUCK, 3, "Holofoil", "NM", RAW_CFG).reason)
        self.assertIn("only 0 TCGplayer sales", raw_market_value(PSYDUCK, 30, "Holofoil", "MP", RAW_CFG).reason)
        self.assertIn("no TCGplayer price", raw_market_value(PSYDUCK, 30, "Holofoil", "HP", RAW_CFG).reason)
        cheap = copy.deepcopy(RAW_CFG)
        cheap["auto"]["min_market_value"] = 100
        self.assertIn("minimum", raw_market_value(PSYDUCK, 30, "Holofoil", "NM", cheap).reason)

    def test_tcgplayer_affiliate_link(self):
        self.assertEqual(tcgplayer_link(PSYDUCK, RAW_CFG), ("https://www.tcgplayer.com/product/517035", False))
        cfg = dict(RAW_CFG, tcgplayer={"affiliate_prefix": "https://tcgplayer.pxf.io/c/1/2/3?u="})
        url, aff = tcgplayer_link(PSYDUCK, cfg)
        self.assertTrue(aff)
        self.assertTrue(url.startswith("https://tcgplayer.pxf.io/c/1/2/3?u=https%3A%2F%2Fwww.tcgplayer.com"))


class RawMatchTests(unittest.TestCase):
    def test_profile_card_types_and_condition(self):
        f = members.default_filters(CFG, CFG["plans"]["premium"])
        rec = {"discount_pct": 50, "market_value": 58, "total": 29, "comps_used": 30, "feedback_score": 500, "flags": [],
               "title": "Psyduck 175/165", "reason": {"listing_country": "US"}}
        card = {"kind": "raw", "name": "Psyduck", "set_name": "151", "grader": "Raw", "grade": "LP", "language": "english"}
        self.assertTrue(members.matches({**f, "min_market_value": 30, "card_types": ["graded", "raw"], "min_raw_condition": "LP"}, rec, card, 5)[0])
        self.assertFalse(members.matches({**f, "min_market_value": 30, "card_types": ["graded"]}, rec, card, 5)[0])
        self.assertFalse(members.matches({**f, "min_market_value": 30, "card_types": ["raw"], "min_raw_condition": "NM"}, rec, card, 5)[0])

    def test_set_filter(self):
        p = CFG["plans"]["premium"]
        f = members.default_filters(CFG, p)
        self.assertEqual(members.set_filter(CFG, f, "card_types", "raw", p)["card_types"], ["raw"])
        self.assertEqual(members.set_filter(CFG, f, "min_raw_condition", "near mint", p)["min_raw_condition"], "NM")
        with self.assertRaises(ValueError):
            members.set_filter(CFG, f, "min_raw_condition", "mint-ish", p)


class RawFinderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.conn = db.connect(self.tmp / "t.db")

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def poll(self, summaries, details):
        f = Finder.__new__(Finder)
        ppt = FakePPT({"175/165": [PSYDUCK]}, {"517035": PSYDUCK})
        f.cfg, f.conn, f.ebay, f.dry_run, f.detail_cache, f.notifier = RAW_CFG, self.conn, FakeEbay(summaries, details), True, {}, None
        f.ppt, f._auto_blocked, f._ppt = ppt, False, lambda: ppt
        prev = fm.load_config
        fm.load_config = lambda: RAW_CFG
        try:
            return f.poll_once(), f.ebay
        finally:
            fm.load_config = prev

    def test_raw_deal_alerts_with_condition_value(self):
        deal = raw_summary("v1|1|0", "2023 Pokemon 151 Psyduck 175/165 Illustration Rare NM", 20)   # $21 vs $57.93 NM
        lp_deal = raw_summary("v1|2|0", "Pokemon 151 Psyduck 175/165 IR", 30)                         # $31 vs $53.32 LP
        fair = raw_summary("v1|3|0", "Psyduck 175/165 Pokemon 151", 50)                               # not cheap even at NM
        mp = raw_summary("v1|4|0", "Psyduck 175/165 151 played", 10)                                  # MP is below LP minimum
        slab = raw_summary("v1|5|0", "Psyduck 175/165 PSA 10", 10)                                    # graded title, ungraded listing
        stats, ebay = self.poll([deal, lp_deal, fair, mp, slab], {
            "v1|1|0": raw_detail("Near Mint or Better"), "v1|2|0": raw_detail("Lightly Played (Excellent)"),
            "v1|4|0": raw_detail("Moderately Played (Very Good)")})
        alerts = {a["item_id"]: a for a in db.list_alerts(self.conn)}
        self.assertEqual(set(alerts), {"v1|1|0", "v1|2|0"})
        self.assertEqual(alerts["v1|1|0"]["market_value"], 57.93)
        self.assertEqual(alerts["v1|2|0"]["market_value"], 53.32)
        self.assertIn("Raw NM", alerts["v1|1|0"]["card_label"])
        self.assertIn("Raw LP", alerts["v1|2|0"]["card_label"])
        reasons = {c["item_id"]: c["reason"] for c in db.list_candidates(self.conn)}
        self.assertIn("not cheap enough", reasons["v1|3|0"])
        self.assertIn("below every profile", reasons["v1|4|0"])
        self.assertNotIn("v1|5|0", reasons)
        self.assertEqual(ebay.detail_calls, 3)  # only the three that were cheap at Near Mint value needed details

    def test_low_value_card_skipped_before_price_lookup(self):
        bulk = {**PSYDUCK, "prices": {"market": 1.70, "primaryPrinting": "Holofoil"}}
        f = Finder.__new__(Finder)
        ppt = FakePPT({"175/165": [bulk]}, {})  # no price data: a price lookup would raise KeyError
        f.cfg, f.conn, f.ebay, f.dry_run, f.detail_cache, f.notifier = RAW_CFG, self.conn, FakeEbay(
            [raw_summary("v1|9|0", "Psyduck 175/165 151", 0.99)], {}), True, {}, None
        f.ppt, f._auto_blocked, f._ppt = ppt, False, lambda: ppt
        prev = fm.load_config
        fm.load_config = lambda: RAW_CFG
        try:
            self.assertEqual(f.poll_once()["alerts"], 0)
        finally:
            fm.load_config = prev


if __name__ == "__main__":
    unittest.main()

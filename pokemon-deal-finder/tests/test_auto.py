"""Automatic mode tests, using response shapes captured from the real PokemonPriceTracker API (no network)."""
import copy
import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

import dealfinder.finder as fm
from dealfinder import db
from dealfinder.auto import auto_market_value, grade_key, mixed_printing_reason, number_queries, pick_card
from dealfinder.finder import Finder
from dealfinder.parse import Listing
from dealfinder.ppt import PPTOutOfCredits
from test_finder import CFG, FakeEbay, detail, summary

TODAY = date.today()
AUTO_CFG = copy.deepcopy(CFG)
AUTO_CFG["auto"]["enabled"] = True
AUTO_CFG["secrets"]["ppt_api_key"] = "test-key"

# Real catalog results for the search "004/102" (trimmed to the fields we use)
BASE_004 = [
    {"name": "Charizard (Black Dot Error)", "setName": "Base Set", "cardNumber": "004/102", "tcgPlayerId": "657516", "printingsAvailable": ["Holofoil"]},
    {"name": "Charizard (Celebrations Metal Card)", "setName": "Miscellaneous Cards & Products", "cardNumber": "004/102", "tcgPlayerId": "252517", "printingsAvailable": ["Holofoil"]},
    {"name": "Charizard - 4/102 (CoroCoro Promo)", "setName": "Jumbo Cards", "cardNumber": "004/102", "tcgPlayerId": "179079", "printingsAvailable": ["Holofoil"]},
    {"name": "Charizard", "setName": "Base Set", "cardNumber": "004/102", "tcgPlayerId": "42382", "printingsAvailable": ["Holofoil"]},
    {"name": "Charizard", "setName": "Base Set (Shadowless)", "cardNumber": "004/102", "tcgPlayerId": "106999", "printingsAvailable": ["Unlimited Holofoil", "1st Edition Holofoil"]},
]
UNPADDED_4_102 = [
    {"name": "Drapion", "setName": "Triumphant", "cardNumber": "4/102", "tcgPlayerId": "84924", "printingsAvailable": ["Reverse Holofoil", "Holofoil"]},
    {"name": "Charizard", "setName": "ME: 30th Celebration Classic Collection", "cardNumber": "4/102", "tcgPlayerId": "714372", "printingsAvailable": ["Holofoil"]},
    {"name": "Charizard", "setName": "Celebrations: Classic Collection", "cardNumber": "4/102", "tcgPlayerId": "250320", "printingsAvailable": ["Holofoil"]},
]
UMBREON = {"name": "Umbreon VMAX (Alternate Art Secret)", "setName": "SWSH07: Evolving Skies", "cardNumber": "215/203",
           "tcgPlayerId": "246723", "printingsAvailable": ["Holofoil"]}
GREY_HAT = {"name": "Pikachu with Grey Felt Hat", "setName": "SV: Scarlet & Violet Promo Cards", "cardNumber": "085",
            "tcgPlayerId": "518861", "printingsAvailable": ["Holofoil"]}


def L(title, aspects=None):
    return Listing(summary(title=title), detail(aspects=aspects) if aspects else None)


def priced_card(grade="psa10", value=3900.0, days=20, per_day=1, smart=3875, confidence="high", outlier=False):
    hist = {(TODAY - timedelta(days=i)).isoformat(): {"average": value * (1 + ((i % 5) - 2) * 0.01), "count": per_day,
                                                     "totalValue": value * per_day} for i in range(days)}
    return {**UMBREON, "ebay": {
        "salesByGrade": {grade: {"count": 711, "medianPrice": value, "smartMarketPrice": {"price": smart, "confidence": confidence}}},
        "smartPriceOutlierByGrade": {grade: outlier},
        "priceHistory": {grade: hist}}}


class IdentifyTests(unittest.TestCase):
    def test_grade_key(self):
        self.assertEqual(grade_key("PSA", "10"), "psa10")
        self.assertEqual(grade_key("CGC", "9.5"), "cgc9_5")
        self.assertIsNone(grade_key("CGC", "10 PRISTINE"))

    def test_number_queries(self):
        qs = [q for q, _ in number_queries("1999 Pokemon Base Set Charizard 4/102 Holo PSA 8")]
        self.assertEqual(qs, ["4/102", "004/102"])
        promo = number_queries("Pikachu with Grey Felt Hat SVP085 Van Gogh Promo PSA 10")
        self.assertIn(("085", "Scarlet & Violet Promo"), promo)
        tg = [q for q, _ in number_queries("Charizard TG03/TG30 Brilliant Stars PSA 10")]
        self.assertIn("TG03/TG30", tg)

    def test_base_set_unlimited_picks_plain_base_set(self):
        card, why = pick_card(L("1999 Pokemon Base Set Charizard 4/102 Holo Rare PSA 8"), BASE_004)
        self.assertEqual(card["tcgPlayerId"], "42382", why)

    def test_shadowless_and_first_edition_are_skipped_as_mixed(self):
        for title in ("1999 Base Set Shadowless Charizard 4/102 PSA 8", "1999 Base Set 1st Edition Charizard 4/102 PSA 8"):
            lst = L(title)
            card, why = pick_card(lst, BASE_004)
            self.assertEqual(card["tcgPlayerId"], "106999", f"{title}: {why}")
            self.assertIn("1st Edition", mixed_printing_reason(card, lst))

    def test_black_dot_error_only_when_title_says_so(self):
        card, _ = pick_card(L("Charizard 4/102 Base Set Black Dot Error PSA 9"), BASE_004)
        self.assertEqual(card["tcgPlayerId"], "657516")

    def test_unpadded_search_does_not_grab_celebrations(self):
        card, why = pick_card(L("1999 Pokemon Base Set Charizard 4/102 Holo PSA 8"), UNPADDED_4_102)
        self.assertIsNone(card)  # Drapion fails name; Celebrations sets need the title to say so
        card, _ = pick_card(L("Celebrations Classic Collection Charizard 4/102 PSA 10"), UNPADDED_4_102)
        self.assertEqual(card["tcgPlayerId"], "250320")

    def test_modern_and_promo(self):
        self.assertEqual(pick_card(L("2021 Pokemon Evolving Skies Umbreon VMAX #215/203 Alt Art PSA 10"), [UMBREON])[0]["tcgPlayerId"], "246723")
        self.assertEqual(pick_card(L("Pikachu with Grey Felt Hat SVP085 Van Gogh Promo PSA 10"), [GREY_HAT])[0]["tcgPlayerId"], "518861")
        self.assertIsNone(pick_card(L("Umbreon VMAX 094/203 Evolving Skies PSA 10"), [UMBREON])[0])  # wrong number


class ValueTests(unittest.TestCase):
    def test_good_value(self):
        mv = auto_market_value(priced_card(), 30, "PSA", "10", AUTO_CFG)
        self.assertTrue(mv.ok, mv.reason)
        self.assertAlmostEqual(mv.value, 3900, delta=80)
        self.assertEqual(mv.comps_used, 20)
        self.assertIn("PokemonPriceTracker", mv.reason)

    def test_rejections(self):
        cases = [
            (priced_card(outlier=True), 30, "flagged"),
            (priced_card(), 3, "limited to 3 days"),
            (priced_card(smart=149, confidence="medium"), 30, "disagrees"),
            (priced_card(value=20, smart=20), 30, "minimum"),
            (priced_card(days=2), 30, "only 2"),
        ]
        for card, hist_days, expect in cases:
            mv = auto_market_value(card, hist_days, "PSA", "10", AUTO_CFG)
            self.assertFalse(mv.ok)
            self.assertIn(expect, mv.reason)
        self.assertIn("no PSA 9", auto_market_value(priced_card(), 30, "PSA", "9", AUTO_CFG).reason)

    def test_low_confidence_estimate_does_not_block(self):
        # the real CGC 10 data had a $149 'estimate' at low confidence - ignore it rather than trust it
        self.assertTrue(auto_market_value(priced_card(smart=149, confidence="low"), 30, "PSA", "10", AUTO_CFG).ok)


class FakePPT:
    def __init__(self, by_query, prices, fail=None):
        self.by_query, self.prices, self.fail = by_query, prices, fail
        self.network_calls, self.cfg, self.lookups = 0, None, []

    def cards_by_number(self, q, lang, set_filter=None):
        if self.fail:
            raise self.fail
        self.lookups.append((q, lang))
        return self.by_query.get(q, [])

    def card_prices(self, tcg_id, lang, days):
        return {"card": self.prices[tcg_id], "history_days": 30}


class AutoPollTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.conn = db.connect(self.tmp / "t.db")

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def finder(self, ebay, ppt):
        f = Finder.__new__(Finder)
        f.cfg, f.conn, f.ebay, f.dry_run, f.detail_cache, f.notifier = AUTO_CFG, self.conn, ebay, True, {}, None
        f.ppt, f._auto_blocked = ppt, False
        f._ppt = lambda: ppt  # skip the real client
        return f

    def poll(self, f):
        prev = fm.load_config
        fm.load_config = lambda: AUTO_CFG
        try:
            return f.poll_once()
        finally:
            fm.load_config = prev

    def test_alerts_on_card_not_in_watchlist(self):
        deal = summary("v1|900|0", "2021 Pokemon Evolving Skies Umbreon VMAX 215/203 Alt Art PSA 10 GEM MINT", price=2100, minutes=5)
        fair = summary("v1|901|0", "Umbreon VMAX 215/203 Evolving Skies PSA 10", price=3700, minutes=4)
        low_grade = summary("v1|902|0", "Umbreon VMAX 215/203 Evolving Skies PSA 6", price=100, minutes=4)
        wrong_grader = summary("v1|903|0", "Umbreon VMAX 215/203 Evolving Skies ACE 10", price=100, minutes=4)
        ebay = FakeEbay([deal, fair, low_grade, wrong_grader], {
            "v1|900|0": detail(aspects={"Set": "Evolving Skies", "Card Number": "215/203"})})
        ppt = FakePPT({"215/203": [UMBREON]}, {"246723": priced_card()})
        stats = self.poll(self.finder(ebay, ppt))
        self.assertEqual(stats["alerts"], 1)
        alert = db.list_alerts(self.conn)[0]
        self.assertEqual(alert["item_id"], "v1|900|0")
        self.assertIn("Umbreon VMAX", alert["card_label"])
        self.assertIn("PSA 10", alert["card_label"])
        self.assertGreater(alert["discount_pct"], 40)
        reasons = {c["item_id"]: c["reason"] for c in db.list_candidates(self.conn)}
        self.assertIn("not cheap enough", reasons["v1|901|0"])
        self.assertNotIn("v1|902|0", reasons)  # below min grade: ignored without spending credits
        self.assertNotIn("v1|903|0", reasons)  # grader not selected
        self.assertEqual({q for q, _ in ppt.lookups}, {"215/203"})

    def test_out_of_credits_stops_lookups_quietly(self):
        s = summary("v1|910|0", "Umbreon VMAX 215/203 Evolving Skies PSA 10", price=100, minutes=5)
        ppt = FakePPT({}, {}, fail=PPTOutOfCredits("used up"))
        f = self.finder(FakeEbay([s, s], {}), ppt)
        stats = self.poll(f)
        self.assertEqual(stats["alerts"], 0)
        self.assertTrue(f._auto_blocked)


if __name__ == "__main__":
    unittest.main()

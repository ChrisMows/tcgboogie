"""Topps cards' eBay asking prices: only single raw copies of exactly that card count, and the price is their median."""
import unittest
from unittest import mock

import dealfinder.topps as tp

CARDS = {c["id"]: c for c in tp.load_checklist()}


def item(title, price, fixed=True):
    return {"title": title, "price": {"value": f"{price:.2f}", "currency": "USD"},
            "buyingOptions": ["FIXED_PRICE"] if fixed else ["AUCTION"], "image": {"imageUrl": f"https://i.ebayimg.com/{price}.jpg"}}


class ChecklistTests(unittest.TestCase):
    def test_every_set_and_card_loads(self):
        self.assertGreater(len(CARDS), 900)
        self.assertEqual(len({c["code"] for c in CARDS.values()}), 12)
        self.assertEqual(CARDS["t-s1-6"]["name"], "Charizard")
        self.assertEqual(CARDS["t-j1-158"]["name"], "Totodile")  # Johto cards carry their Pokédex number


class MatchTests(unittest.TestCase):
    def ok(self, cid, title):
        return tp.listing_matches(CARDS[cid], title)

    def test_plain_copy_of_the_card(self):
        self.assertTrue(self.ok("t-s1-6", "1999 Topps Pokemon TV Animation Edition Series 1 #6 Charizard"))
        self.assertTrue(self.ok("t-s1-6", "Charizard Topps Trading Cards Series 1 1999 #6 Pokemon LP"))
        self.assertTrue(self.ok("t-s1-tv5", "Staryu Misty 1999 Topps TV Animation Edition Pokemon Card #TV5"))
        self.assertTrue(self.ok("t-c1-6", "2000 Topps Chrome Pokemon #06 Charizard Non Holo"))

    def test_graded_lots_parallels_and_worn_copies_dont_count(self):
        for title in ["1999 Topps Pokemon TV #6 Charizard PSA 8",
                      "1999 Topps Pokemon TV Animation Holographic Foil #06 Charizard",
                      "1999 TOPPS POKEMON TV RAINBOW FOIL #6 CHARIZARD",
                      "2000 Topps Pokemon TV Series 1,2,3 - Choose Your Card! #1-151",
                      "Topps Pokemon Series 1 lot of 20 cards Charizard #6",
                      "1999 Topps Pokemon Charizard #6 Series 1 Damaged",
                      "Topps Pokemon TV Animation Series 1 Italian #6 Charizard"]:
            self.assertFalse(self.ok("t-s1-6", title), title)

    def test_other_sets_with_the_same_pokemon_dont_count(self):
        self.assertFalse(self.ok("t-s1-6", "2000 Topps Chrome Pokemon Charizard #6"))
        self.assertFalse(self.ok("t-c1-6", "1999 Topps Pokemon TV Animation Series 1 #6 Charizard"))
        self.assertFalse(self.ok("t-s1-6", "1999 Pokemon Topps Charizard #06 Black Logo E6 of 12 Card"))  # First Movie insert
        self.assertFalse(self.ok("t-s1-6", "Topps Pokemon Advanced Challenge Charizard #6"))
        self.assertFalse(self.ok("t-s3-151", "2000 Topps Pokemon Series 2 #151 Mew"))
        self.assertTrue(self.ok("t-s3-151", "2000 Topps Pokemon TV Animation Series 3 #151 Mew"))

    def test_wrong_number_or_name_doesnt_count(self):
        self.assertFalse(self.ok("t-s1-6", "1999 Topps Pokemon TV Animation Series 1 #5 Charmeleon"))
        self.assertFalse(self.ok("t-s1-tv5", "1999 Topps Pokemon TV Animation Edition Series 1 #TV3 Misty"))
        self.assertFalse(self.ok("t-s1-1", "1999 Topps Pokemon TV Animation Series 1 #6 Charizard"))  # "Series 1" isn't #1


class PriceTests(unittest.TestCase):
    def test_median_of_matching_buy_it_now_listings(self):
        c = CARDS["t-s1-6"]
        r = tp.summarize(c, [
            item("1999 Topps Pokemon TV Animation Series 1 #6 Charizard", 14.0),
            item("1999 Topps Pokemon TV Animation Series 1 #6 Charizard NM", 18.0),
            item("Topps Pokemon Charizard #6 TV Animation Series 1", 20.0),
            item("Topps Pokemon Charizard #6 TV Animation Series 1 1/1 GRAIL", 900.0),  # far off the rest: ignored
            item("1999 Topps Pokemon TV #6 Charizard PSA 9", 199.0),                    # graded: not this
            item("1999 Topps Pokemon TV Animation Series 1 #6 Charizard", 5.0, fixed=False),  # auction: not an asking price
        ])
        self.assertEqual((r["price"], r["low"], r["high"], r["listings"]), (18.0, 14.0, 20.0, 3))
        self.assertTrue(r["image"].startswith("https://i.ebayimg.com/"))

    def test_one_listing_is_not_a_price(self):
        r = tp.summarize(CARDS["t-s1-6"], [item("1999 Topps Pokemon TV Animation Series 1 #6 Charizard", 14.0)])
        self.assertIsNone(r["price"])
        self.assertEqual(r["listings"], 1)


class RoundTests(unittest.TestCase):
    def test_new_cards_first_then_owned_and_daily_budget(self):
        cfg = {"topps": {"enabled": True, "daily_calls": 4, "max_per_check": 3, "refresh_days": 7}}
        ebay = mock.Mock()
        ebay._get.return_value = {"itemSummaries": []}
        p = tp.ToppsPricer(cfg, ebay)
        now = __import__("time").time()
        checked = {c: now for c in CARDS}           # everything priced just now...
        checked.pop("t-s2-77")                      # ...except one never-priced card
        checked["t-s1-6"] = now - 30 * 86400        # and one stale card someone owns
        checked["t-s1-7"] = now - 40 * 86400        # and an older one nobody owns
        saved = []
        with mock.patch.object(tp.shared, "topps_checked", return_value=checked), \
                mock.patch.object(tp.shared, "topps_owned", return_value={"t-s1-6"}), \
                mock.patch.object(tp.shared, "save_topps_price", side_effect=lambda pid, r: saved.append(pid)):
            self.assertEqual(p.run(), 3)
            self.assertEqual(saved, ["t-s2-77", "t-s1-6", "t-s1-7"])
            p.run()  # only 1 call left today
        self.assertEqual(ebay._get.call_count, 4)


if __name__ == "__main__":
    unittest.main()

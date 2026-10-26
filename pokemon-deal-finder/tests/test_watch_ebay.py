"""Price alerts that also watch eBay: only the right card, under the price, passing the photo check, saved once."""
import copy
import unittest
from unittest import mock

import dealfinder.watch_ebay as we
from test_finder import CFG


def item(iid, title, price, ship=0.0):
    return {"itemId": iid, "title": title, "price": {"value": f"{price:.2f}", "currency": "USD"},
            "shippingOptions": [{"shippingCostType": "FIXED", "shippingCost": {"value": f"{ship:.2f}", "currency": "USD"}}],
            "buyingOptions": ["FIXED_PRICE"], "itemWebUrl": f"https://www.ebay.com/itm/{iid}", "image": {"imageUrl": f"https://i.ebayimg.com/{iid}.jpg"}}


class FakeEbay:
    def __init__(self, items):
        self.items, self.queries = items, []

    def search_listings(self, query, max_price, raw=True, limit=50):
        self.queries.append((query, max_price))
        return self.items


class FakePhotos:
    def __init__(self, verdicts=None):
        self.verdicts = verdicts or {}

    def check(self, item_id, claimed, ref, photos, lookalikes=()):
        return {"verdict": self.verdicts.get(item_id, "match"), "reason": "test"}


WATCHES = [
    {"id": 1, "product_id": "590027", "name": "Pikachu ex - 238/191", "set_name": "SV08: Surging Sparks", "number": "238/191", "target": 250.0},
    {"id": 2, "product_id": "590027", "name": "Pikachu ex - 238/191", "set_name": "SV08: Surging Sparks", "number": "238/191", "target": 200.0},
]


class EbayWatchTests(unittest.TestCase):
    def run_round(self, items, verdicts=None):
        saved = []
        with mock.patch.object(we.shared, "ebay_watches", lambda: copy.deepcopy(WATCHES)), \
             mock.patch.object(we.shared, "save_watch_listing", lambda wid, it: saved.append((wid, it["item_id"], it["price"])) or True):
            ebay = FakeEbay(items)
            n = we.EbayWatcher(copy.deepcopy(CFG), ebay, FakePhotos(verdicts)).run()
        return n, saved, ebay

    def test_matches_each_alert_at_its_own_price(self):
        n, saved, ebay = self.run_round([item("a", "Pikachu ex 238/191 Surging Sparks SIR NM", 220, 4)])
        self.assertEqual(ebay.queries, [("Pikachu ex 238/191", 250.0)])  # searched once, at the highest target
        self.assertEqual(saved, [(1, "a", 224.0)])  # $224 meets the $250 alert, not the $200 one
        self.assertEqual(n, 1)

    def test_skips_wrong_number_lots_slabs_and_photo_rejects(self):
        _, saved, _ = self.run_round([
            item("b", "Pikachu ex 219/191 Surging Sparks", 30),          # different card number
            item("c", "Pokemon lot Pikachu ex 238/191 + bulk", 40),      # lot
            item("d", "Pikachu ex 238/191 PSA 10", 150),                 # a slab, not a raw card
            item("e", "Pikachu ex 238/191 Surging Sparks", 120),         # photo shows a different card
            item("f", "Pikachu ex 238/191 Surging Sparks", 180),         # good
        ], verdicts={"e": "different_card"})
        self.assertEqual(sorted({i for _, i, _ in saved}), ["f"])


def watch(pid, target, market, wid=None):
    return {"id": wid or int(pid), "product_id": pid, "name": f"Card {pid}", "set_name": "Set", "number": "1/100",
            "target": target, "market": market}


class SchedulingTests(unittest.TestCase):
    def test_tiers(self):
        self.assertEqual(we.tier_of(1100, 1200), "hot")    # 92% of market
        self.assertEqual(we.tier_of(65, 86), "warm")       # 76%
        self.assertEqual(we.tier_of(150, 400), "cold")     # 38%: a long shot
        self.assertEqual(we.tier_of(50, None), "warm")     # no price yet

    def test_hot_first_then_most_watched_and_each_tier_on_its_own_schedule(self):
        w = we.EbayWatcher(copy.deepcopy(CFG), FakeEbay([]), FakePhotos())
        watches = [watch("1", 150, 400), watch("2", 1100, 1200), watch("3", 65, 86),
                   watch("4", 60, 86, wid=40), watch("4", 62, 86, wid=41)]  # card 4: two members
        due, _ = w.plan(watches, now=10 * we.DAY)
        self.assertEqual([p for p, _ in due], ["2", "4", "3", "1"])
        # Searched a day ago: only the hot card is due again; the warm ones wait 3 days, the cold one 7.
        for pid in "1234":
            w.state[pid] = {"last": 9 * we.DAY}
        self.assertEqual([p for p, _ in w.plan(watches, now=10 * we.DAY)[0]], ["2"])
        self.assertEqual([p for p, _ in w.plan(watches, now=12 * we.DAY)[0]], ["2", "4", "3"])

    def test_quiet_cards_are_checked_half_as_often(self):
        w = we.EbayWatcher(copy.deepcopy(CFG), FakeEbay([]), FakePhotos())
        w.state["2"] = {"last": 9 * we.DAY, "empty": 3}
        self.assertEqual(w.plan([watch("2", 1100, 1200)], now=10 * we.DAY)[0], [])  # every 2 days now
        self.assertEqual(len(w.plan([watch("2", 1100, 1200)], now=11 * we.DAY)[0]), 1)

    def test_daily_cap_and_empty_streak(self):
        cfg = copy.deepcopy(CFG)
        cfg.setdefault("website", {})["ebay_watch"] = {"daily_calls": 2, "max_per_check": 10}
        ebay = FakeEbay([])
        w = we.EbayWatcher(cfg, ebay, FakePhotos(), fetch=lambda: [watch(str(i), 90, 100) for i in range(1, 6)])
        w.run(now=10 * we.DAY)
        self.assertEqual(len(ebay.queries), 2)  # the day's 2 calls, then it stops
        self.assertEqual(w.state["1"]["empty"], 1)  # nothing listed: counts toward "quiet"


if __name__ == "__main__":
    unittest.main()

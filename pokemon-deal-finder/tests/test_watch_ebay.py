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


if __name__ == "__main__":
    unittest.main()

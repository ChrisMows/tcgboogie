"""Our own sales history: final prices of auctions we identified, read from eBay's Browse API after they end."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from dealfinder import sales
from dealfinder.sales import SaleTracker, final_sale, final_total


# These tests must never reach the real database (the server runs them with its .env loaded): every shared-database
# call is stubbed out here, and the tests that check database calls patch the exact functions they look at.
_no_db = mock.patch.object(sales.shared, "_run", return_value=None)


def setUpModule():
    _no_db.start()


def tearDownModule():
    _no_db.stop()

SOLD = {"title": "Mew ex 232/091 PSA 10", "currentBidPrice": {"value": "406.00"}, "price": {"value": "406.00"},
        "itemEndDate": "2026-10-21T18:15:54.000Z", "buyingOptions": ["AUCTION"],
        "shippingOptions": [{"shippingCost": {"value": "5.00"}}],
        "estimatedAvailabilities": [{"estimatedSoldQuantity": 1}]}


class FinalSaleTests(unittest.TestCase):
    def test_sold_auction(self):
        self.assertEqual(final_sale(SOLD), {"price": 406.0, "shipping": 5.0, "sold_at": "2026-10-21T18:15:54.000Z", "best_offer": False})

    def test_unsold(self):
        self.assertIsNone(final_sale({**SOLD, "estimatedAvailabilities": [{"estimatedSoldQuantity": 0}]}))

    def test_best_offer_is_flagged(self):
        self.assertTrue(final_sale({**SOLD, "buyingOptions": ["FIXED_PRICE", "BEST_OFFER"]})["best_offer"])


class TrackerTests(unittest.TestCase):
    def setUp(self):
        self.ebay = mock.Mock()
        self.ebay.get_item.return_value = SOLD
        self.t = SaleTracker({"sales": {"min_value": 0, "daily_calls": 2, "max_per_check": 10, "wait_minutes": 10}}, self.ebay)
        self.now = datetime(2026, 10, 21, 19, 0, tzinfo=timezone.utc)
        self.ident = {"kind": "graded", "product_id": "517045", "grader": "PSA", "grade": "10", "language": "english"}

    def summary(self, n, minutes_ago):
        end = (self.now - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")
        return {"itemId": f"v1|{n}|0", "itemEndDate": end, "title": "Mew ex PSA 10", "itemWebUrl": f"https://ebay.com/itm/{n}"}

    def test_records_ended_sales_within_budget(self):
        for n, ago in ((1, 30), (2, 20), (3, 15), (4, 2)):  # #4 ended too recently
            self.t.remember(self.summary(n, ago), self.ident)
        with mock.patch.object(sales.shared, "enabled", return_value=True), \
                mock.patch.object(sales.shared, "save_sale", return_value=True) as save:
            self.assertEqual(self.t.run(now=self.now), 2)  # daily budget of 2 lookups
        saved = save.call_args_list[0].args[0]
        self.assertEqual((saved["item_id"], saved["product_id"], saved["grade"], saved["price"]), ("1", "517045", "10", 406.0))
        self.assertIn("v1|3|0", self.t.pending)  # left for tomorrow's budget
        self.assertIn("v1|4|0", self.t.pending)  # not ended long enough yet

    def test_best_offer_sales_are_skipped(self):
        self.ebay.get_item.return_value = {**SOLD, "buyingOptions": ["FIXED_PRICE", "BEST_OFFER"]}
        self.t.remember(self.summary(1, 30), self.ident)
        with mock.patch.object(sales.shared, "enabled", return_value=True), \
                mock.patch.object(sales.shared, "save_sale", return_value=True) as save:
            self.assertEqual(self.t.run(now=self.now), 0)
        save.assert_not_called()


class MinValueTests(unittest.TestCase):
    def test_cheap_cards_are_not_looked_up(self):
        t = SaleTracker({"sales": {"min_value": 25}}, mock.Mock())
        end = "2026-10-26T12:00:00Z"
        t.remember({"itemId": "v1|1|0", "itemEndDate": end, "title": "x"}, {"product_id": "1"}, value=12)
        t.remember({"itemId": "v1|2|0", "itemEndDate": end, "title": "x"}, {"product_id": "2"}, value=40)
        # No value known: the current bid decides.
        t.remember({"itemId": "v1|3|0", "itemEndDate": end, "title": "x", "currentBidPrice": {"value": "8.00"}}, {"product_id": "3"})
        t.remember({"itemId": "v1|4|0", "itemEndDate": end, "title": "x", "currentBidPrice": {"value": "60.00"}}, {"product_id": "4"})
        self.assertEqual(sorted(t.pending), ["v1|2|0", "v1|4|0"])


class PristineTests(unittest.TestCase):
    def test_cgc_pristine_10_is_its_own_grade(self):
        t = SaleTracker({"sales": {"min_value": 0}}, mock.Mock())
        end = "2030-01-01T00:00:00Z"
        t.remember({"itemId": "v1|1|0", "itemEndDate": end, "title": "Umbreon VMAX CGC 10 PRISTINE"}, {"product_id": "1", "grader": "CGC", "grade": "10"})
        t.remember({"itemId": "v1|2|0", "itemEndDate": end, "title": "Umbreon VMAX CGC 10 Gem Mint"}, {"product_id": "1", "grader": "CGC", "grade": "10"})
        self.assertEqual(t.pending["v1|1|0"]["ident"]["grade"], "10 Pristine")
        self.assertEqual(t.pending["v1|2|0"]["ident"]["grade"], "10")


class PersistenceTests(unittest.TestCase):
    def test_waiting_list_survives_a_restart(self):
        import tempfile
        from pathlib import Path

        from dealfinder import db
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        conn = db.connect(Path(tmp.name) / "bot.db")
        self.addCleanup(conn.close)
        ebay = mock.Mock()
        t = SaleTracker({"sales": {"min_value": 0}}, ebay, conn)
        end = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
        t.remember({"itemId": "v1|9|0", "itemEndDate": end, "title": "x"}, {"product_id": "1", "kind": "graded"})
        with mock.patch.object(sales.shared, "enabled", return_value=True):
            t.run()
        self.assertIn("v1|9|0", SaleTracker({"sales": {"min_value": 0}}, ebay, conn).pending)


class DealOutcomeTests(unittest.TestCase):
    """Every deal we published gets one lookup after it ends: did it sell, and for how much with shipping."""
    def setUp(self):
        self.ebay = mock.Mock()
        self.t = SaleTracker({"sales": {"min_value": 0, "daily_calls": 10, "max_per_check": 10, "wait_minutes": 10}}, self.ebay)

    def run_with(self, due, items):
        self.ebay.get_item.side_effect = lambda i, purpose=None: items[i] if not isinstance(items[i], Exception) else (_ for _ in ()).throw(items[i])
        with mock.patch.object(sales.shared, "enabled", return_value=True),                 mock.patch.object(sales.shared, "deals_needing_outcome", return_value=due),                 mock.patch.object(sales.shared, "save_deal_outcome") as save, \
                mock.patch.object(sales.shared, "save_deal_gone") as gone:
            self.t.run()
        got = {c.args[0]: c.args[1:] for c in save.call_args_list}
        got.update({c.args[0]: "gone" for c in gone.call_args_list})
        return got

    def test_final_total_includes_shipping(self):
        self.assertEqual(final_total(SOLD), 411.0)

    def test_sold_unsold_and_gone(self):
        unsold = {**SOLD, "estimatedAvailabilities": [{"estimatedSoldQuantity": 0}]}
        got = self.run_with(["v1|1|0", "v1|2|0", "v1|3|0"], {"v1|1|0": SOLD, "v1|2|0": unsold, "v1|3|0": RuntimeError("404")})
        self.assertEqual(got["v1|1|0"], (True, 411.0, {"bid": 406.0, "shipping": 5.0, "bids": None, "ended": "2026-10-21T18:15:54.000Z"}))
        self.assertEqual(got["v1|2|0"], (False, None, None))
        self.assertEqual(got["v1|3|0"], "gone")  # eBay no longer has it: marked as asked, anything known is kept

    def test_details_include_bid_count(self):
        got = self.run_with(["v1|1|0"], {"v1|1|0": {**SOLD, "bidCount": 27}})
        self.assertEqual(got["v1|1|0"][2]["bids"], 27)

    def test_a_deal_waiting_for_its_sale_is_looked_up_once(self):
        now = datetime.now(timezone.utc)
        self.t.remember({"itemId": "v1|9|0", "itemEndDate": (now - timedelta(minutes=30)).isoformat().replace("+00:00", "Z"),
                         "title": "Mew ex PSA 10", "itemWebUrl": "u"}, {"kind": "graded", "product_id": "517045", "grader": "PSA", "grade": "10"})
        self.ebay.get_item.return_value = SOLD
        with mock.patch.object(sales.shared, "enabled", return_value=True),                 mock.patch.object(sales.shared, "save_sale", return_value=True),                 mock.patch.object(sales.shared, "deals_needing_outcome", return_value=["v1|9|0"]),                 mock.patch.object(sales.shared, "save_deal_outcome") as save:
            self.t.run()
        self.assertEqual(self.ebay.get_item.call_count, 1)
        save.assert_called_once_with("v1|9|0", True, 411.0, {"bid": 406.0, "shipping": 5.0, "bids": None, "ended": "2026-10-21T18:15:54.000Z"})

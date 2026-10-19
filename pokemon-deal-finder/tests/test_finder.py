import copy
import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dealfinder import db
from dealfinder.alerts import build_discord_payload
from dealfinder.comps import market_value
from dealfinder.config import CONFIG_PATH, load_config, update_config_values
from dealfinder.compinput import parse_comp_lines
from dealfinder.finder import Finder, evaluate
from dealfinder.parse import Listing, match_card, norm_card_number, red_flags, title_excluded

CFG = load_config()
CFG["auto"]["enabled"] = False          # tests never call the real pricing service
CFG["secrets"]["ppt_api_key"] = ""
import dealfinder.finder as _finder_module  # noqa: E402
_finder_module.load_config = lambda: CFG  # poll_once must not reload the real config (real keys) during tests
TODAY = date.today()


def end_in(minutes):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def summary(item_id="v1|1|0", title="", price=100.0, ship=5.0, minutes=6, fb=2500, pct="99.9", country="US"):
    return {
        "itemId": item_id, "title": title, "itemWebUrl": f"https://www.ebay.com/itm/{item_id.split('|')[1]}",
        "currentBidPrice": {"value": f"{price:.2f}", "currency": "USD"},
        "price": {"value": f"{price:.2f}", "currency": "USD"},
        "shippingOptions": [{"shippingCostType": "FIXED", "shippingCost": {"value": f"{ship:.2f}", "currency": "USD"}}],
        "buyingOptions": ["AUCTION"], "bidCount": 4, "itemEndDate": end_in(minutes),
        "seller": {"username": "cardshop", "feedbackPercentage": pct, "feedbackScore": fb},
        "itemLocation": {"country": country}, "conditionId": "2750", "condition": "Graded",
    }


def detail(grader="Professional Sports Authenticator (PSA)", grade="10", cert="81234567", aspects=None, desc=""):
    asp = {"Game": "Pokémon TCG", "Language": "English"}
    asp.update(aspects or {})
    d = {"localizedAspects": [{"type": "STRING", "name": k, "value": v} for k, v in asp.items()],
         "conditionDescriptors": [], "description": desc}
    if grader:
        d["conditionDescriptors"].append({"name": "Professional Grader", "values": [{"content": grader}]})
    if grade:
        d["conditionDescriptors"].append({"name": "Grade", "values": [{"content": grade}]})
    if cert:
        d["conditionDescriptors"].append({"name": "Certification Number", "values": [{"content": cert}]})
    return d


UMBREON = {"id": 1, "name": "Umbreon VMAX", "set_name": "Evolving Skies", "set_aliases": "", "card_number": "215/203",
           "variants": "", "language": "english", "grader": "PSA", "grade": "10", "exclude_terms": ""}
CHARIZARD_1ST = {"id": 2, "name": "Charizard", "set_name": "Base Set", "set_aliases": "base", "card_number": "4/102",
                 "variants": "1st edition", "language": "english", "grader": "PSA", "grade": "8", "exclude_terms": "base set 2"}
UMB_ASPECTS = {"Set": "Evolving Skies", "Card Number": "215/203", "Card Name": "Umbreon VMAX"}


def comps_around(value, n=6, days_ago=3):
    return [{"sold_date": (TODAY - timedelta(days=days_ago + i)).isoformat(), "price": value + (i % 3 - 1) * value * 0.03,
             "shipping": 0, "excluded": 0} for i in range(n)]


class MatchTests(unittest.TestCase):
    def test_exact_match(self):
        l = Listing(summary(title="2021 Pokemon Evolving Skies Umbreon VMAX #215 Alt Art PSA 10 GEM MINT"),
                    detail(aspects=UMB_ASPECTS))
        ok, why = match_card(l, UMBREON, CFG)
        self.assertTrue(ok, why)

    def test_cgc_is_not_psa(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies CGC 10 Pristine"),
                    detail(grader="Certified Guaranty Company (CGC)", grade="10", aspects=UMB_ASPECTS))
        ok, why = match_card(l, UMBREON, CFG)
        self.assertFalse(ok)
        self.assertIn("grader", why)

    def test_psa9_is_not_psa10(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies PSA 9 MINT"), detail(grade="9", aspects=UMB_ASPECTS))
        ok, why = match_card(l, UMBREON, CFG)
        self.assertFalse(ok)
        self.assertIn("grade", why)

    def test_title_vs_slab_grade_mismatch(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies PSA 10"), detail(grade="8", aspects=UMB_ASPECTS))
        ok, why = match_card(l, UMBREON, CFG)
        self.assertFalse(ok)
        self.assertIn("mismatch", why)

    def test_japanese_rejected(self):
        asp = dict(UMB_ASPECTS, Language="Japanese")
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies Japanese PSA 10"), detail(aspects=asp))
        ok, why = match_card(l, UMBREON, CFG)
        self.assertFalse(ok)
        self.assertIn("language", why)

    def test_wrong_card_number(self):
        asp = dict(UMB_ASPECTS, **{"Card Number": "094/203"})
        l = Listing(summary(title="Umbreon VMAX 094/203 Evolving Skies PSA 10"), detail(aspects=asp))
        self.assertFalse(match_card(l, UMBREON, CFG)[0])

    def test_first_edition_vs_unlimited(self):
        unl = Listing(summary(title="1999 Pokemon Base Set Charizard 4/102 Holo Unlimited PSA 8"),
                      detail(grade="8", aspects={"Set": "Base Set", "Card Number": "4/102"}))
        first = Listing(summary(title="1999 Pokemon Base Set 1st Edition Charizard 004/102 Holo PSA 8 NM-MT"),
                        detail(grade="8", aspects={"Set": "Base Set", "Card Number": "004/102", "Features": "1st Edition"}))
        first_shadowless = Listing(summary(title="1999 Base Set 1st Edition Shadowless Charizard 4/102 PSA 8"),
                                   detail(grade="8", aspects={"Set": "Base Set", "Card Number": "4/102"}))
        self.assertFalse(match_card(unl, CHARIZARD_1ST, CFG)[0])
        self.assertTrue(match_card(first, CHARIZARD_1ST, CFG)[0])
        self.assertTrue(match_card(first_shadowless, CHARIZARD_1ST, CFG)[0])

    def test_card_exclude_term(self):
        l = Listing(summary(title="Charizard 4/130 Base Set 2 1st Edition PSA 8"),
                    detail(grade="8", aspects={"Set": "Base Set 2", "Card Number": "4/130"}))
        self.assertFalse(match_card(l, CHARIZARD_1ST, CFG)[0])

    def test_card_number_normalization(self):
        self.assertEqual(norm_card_number("004/102"), ("4", "102"))
        self.assertEqual(norm_card_number("SWSH050"), ("SWSH50", None))
        self.assertEqual(norm_card_number("TG05/TG30"), ("TG5", "TG30"))


class ExclusionTests(unittest.TestCase):
    def test_hard_exclusions(self):
        for t in ["Umbreon VMAX 215/203 PRE-GRADED PSA 10 READY", "Charizard Gem Mint Quality 10",
                  "Pikachu ready to grade", "Charizard RAW not PSA", "Umbreon PSA 10 cracked slab",
                  "Lot of 5 PSA 10 Pokemon", "Custom Charizard proxy card PSA 10"]:
            self.assertTrue(title_excluded(t, CFG), t)

    def test_clean_titles_not_excluded(self):
        for t in ["2021 Pokemon Evolving Skies Umbreon VMAX #215 PSA 10", "Charizard Base Set 4/102 PSA 8 NM-MT",
                  "Drawn by the Dragons Rayquaza PSA 10", "Pikachu Black Star Promo SWSH020 CGC 9.5", "Tag Team Pikachu & Zekrom GX TAG 10"]:
            self.assertIsNone(title_excluded(t, CFG), t)

    def test_red_flags(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 PSA 10", fb=3, pct="91.0", country="CN"),
                    detail(cert="", aspects=UMB_ASPECTS, desc="<p>Stock photo. Sold as is.</p>"))
        flags = " | ".join(red_flags(l, CFG))
        for expect in ["Low seller feedback", "91.0%", "CN", "No cert", "stock photo", "as is"]:
            self.assertIn(expect, flags)


class CompTests(unittest.TestCase):
    def test_median_and_outlier(self):
        comps = comps_around(1000, 6) + [{"sold_date": TODAY.isoformat(), "price": 4000, "shipping": 0, "excluded": 0}]
        mv = market_value(comps, CFG["deal"])
        self.assertTrue(mv.ok, mv.reason)
        self.assertEqual(mv.comps_used, 6)
        self.assertIn(4000.0, mv.outliers_dropped)
        self.assertAlmostEqual(mv.value, 1000, delta=40)

    def test_shipping_included(self):
        comps = [{"sold_date": TODAY.isoformat(), "price": 100, "shipping": 10, "excluded": 0}] * 3
        self.assertEqual(market_value(comps, CFG["deal"]).value, 110)

    def test_too_few_and_too_old(self):
        old = [{"sold_date": (TODAY - timedelta(days=45)).isoformat(), "price": 100, "shipping": 0, "excluded": 0}] * 5
        mv = market_value(old + comps_around(100, 2), CFG["deal"])
        self.assertFalse(mv.ok)
        self.assertIn("only 2", mv.reason)

    def test_too_varied(self):
        comps = [{"sold_date": TODAY.isoformat(), "price": p, "shipping": 0, "excluded": 0} for p in (100, 160, 220, 300, 140)]
        mv = market_value(comps, CFG["deal"])
        self.assertFalse(mv.ok)
        self.assertIn("vary", mv.reason)

    def test_lookback_setting(self):
        comps = [{"sold_date": (TODAY - timedelta(days=40)).isoformat(), "price": 100, "shipping": 0, "excluded": 0}] * 4
        self.assertFalse(market_value(comps, CFG["deal"]).ok)
        self.assertTrue(market_value(comps, dict(CFG["deal"], comp_lookback_days=60)).ok)


class EvaluateTests(unittest.TestCase):
    def setUp(self):
        self.mv = market_value(comps_around(1000, 8), CFG["deal"])

    def test_qualifies(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies PSA 10", price=600, ship=5, minutes=7),
                    detail(aspects=UMB_ASPECTS))
        ok, rec = evaluate(l, UMBREON, self.mv, CFG)
        self.assertTrue(ok, rec.get("skip"))
        self.assertEqual(rec["total"], 605)
        self.assertGreaterEqual(rec["discount_pct"], 30)

    def test_threshold_and_window(self):
        not_cheap = Listing(summary(title="x", price=750, minutes=5), detail())
        too_early = Listing(summary(title="x", price=500, minutes=14), detail())
        self.assertFalse(evaluate(not_cheap, UMBREON, self.mv, CFG)[0])
        self.assertFalse(evaluate(too_early, UMBREON, self.mv, CFG)[0])
        looser = dict(CFG, deal=dict(CFG["deal"], min_discount_pct=20, max_minutes_left=15))
        self.assertTrue(evaluate(not_cheap, UMBREON, self.mv, looser)[0])
        self.assertTrue(evaluate(too_early, UMBREON, self.mv, looser)[0])

    def test_discord_payload(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies PSA 10", price=600, minutes=7), detail(aspects=UMB_ASPECTS))
        ok, rec = evaluate(l, UMBREON, self.mv, CFG)
        p = build_discord_payload(rec, UMBREON)
        e = p["embeds"][0]
        self.assertEqual(e["url"], rec["url"])
        names = [f["name"] for f in e["fields"]]
        for n in ["Current + ship", "Market value", "Below market", "Time left", "Seller feedback", "Links"]:
            self.assertIn(n, names)
        self.assertIn("comps", e["fields"][1]["value"])


class AffiliateTests(unittest.TestCase):
    def test_affiliate_link_and_disclosure(self):
        s = summary(title="Umbreon VMAX 215/203 Evolving Skies PSA 10", price=600, minutes=7)
        s["itemAffiliateWebUrl"] = "https://www.ebay.com/itm/1?mkcid=1&campid=5338000000"
        l = Listing(s, detail(aspects=UMB_ASPECTS))
        self.assertIn("campid=", l.url)
        cfg = dict(CFG, ebay=dict(CFG["ebay"], affiliate_disclosure="Ad · eBay links may earn us a commission"))
        ok, rec = evaluate(l, UMBREON, market_value(comps_around(1000, 8), CFG["deal"]), cfg)
        self.assertTrue(ok)
        p = build_discord_payload(rec, UMBREON)
        self.assertIn("campid=", p["embeds"][0]["url"])
        self.assertTrue(p["embeds"][0]["footer"]["text"].startswith("Ad · eBay links may earn us a commission"))

    def test_no_disclosure_without_affiliate_link(self):
        l = Listing(summary(title="Umbreon VMAX 215/203 Evolving Skies PSA 10", price=600, minutes=7), detail(aspects=UMB_ASPECTS))
        ok, rec = evaluate(l, UMBREON, market_value(comps_around(1000, 8), CFG["deal"]), CFG)
        self.assertFalse(build_discord_payload(rec, UMBREON)["embeds"][0]["footer"]["text"].startswith("Ad"))

    def test_header_carries_campaign(self):
        from dealfinder.ebay import EbayClient
        c = EbayClient.__new__(EbayClient)
        c.cfg = dict(CFG, ebay=dict(CFG["ebay"], affiliate_campaign_id="5338000000"))
        c._get_token = lambda: "t"
        self.assertTrue(c._headers()["X-EBAY-C-ENDUSERCTX"].startswith("affiliateCampaignId=5338000000,"))
        c.cfg = dict(CFG, ebay=dict(CFG["ebay"], affiliate_campaign_id=""))  # no campaign -> no tracking
        self.assertNotIn("affiliate", c._headers()["X-EBAY-C-ENDUSERCTX"])


class FakeEbay:
    def __init__(self, summaries, details):
        self.summaries, self.details, self.detail_calls = summaries, details, 0
        self.cfg = None

    def search_ending_auctions(self, window, pages):
        return copy.deepcopy(self.summaries)

    def get_item(self, item_id):
        self.detail_calls += 1
        return self.details[item_id]


class PollTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.conn = db.connect(self.tmp / "t.db")
        cid = db.save_card(self.conn, {**{k: v for k, v in UMBREON.items() if k != "id"}, "active": 1})
        for c in comps_around(1000, 8):
            db.add_comp(self.conn, cid, c["sold_date"], c["price"], c["shipping"])

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def make_finder(self, ebay):
        f = Finder.__new__(Finder)
        f.cfg, f.conn, f.ebay, f.dry_run, f.detail_cache = CFG, self.conn, ebay, True, {}
        f.ppt, f._auto_blocked = None, False
        return f

    def test_poll_alerts_once_and_dedupes(self):
        good = summary("v1|111|0", "2021 Pokemon Evolving Skies Umbreon VMAX 215/203 PSA 10 GEM MINT", price=590, minutes=6)
        pricey = summary("v1|222|0", "Umbreon VMAX 215/203 Evolving Skies PSA 10", price=980, minutes=4)
        pregraded = summary("v1|333|0", "Umbreon VMAX 215/203 Pre-Graded 10 Evolving Skies", price=50, minutes=3)
        cgc = summary("v1|444|0", "Umbreon VMAX 215/203 Evolving Skies CGC 10", price=400, minutes=5)
        early = summary("v1|555|0", "Umbreon VMAX 215/203 Evolving Skies PSA 10", price=400, minutes=11.5)
        other = summary("v1|666|0", "Pikachu VMAX 044/185 PSA 10", price=20, minutes=2)
        ebay = FakeEbay([good, pricey, pregraded, cgc, early, other], {
            "v1|111|0": detail(aspects=UMB_ASPECTS),
            "v1|444|0": detail(grader="Certified Guaranty Company (CGC)", aspects=UMB_ASPECTS),
        })
        f = self.make_finder(ebay)
        s1 = f.poll_once()
        self.assertEqual(s1["alerts"], 1)
        alerts = db.list_alerts(self.conn)
        self.assertEqual([a["item_id"] for a in alerts], ["v1|111|0"])
        self.assertEqual(ebay.detail_calls, 2)  # only the two cheap name-matches needed item details
        reasons = {c["item_id"]: c["reason"] for c in db.list_candidates(self.conn)}
        self.assertIn("pre-check", reasons["v1|222|0"])
        self.assertIn("grader", reasons["v1|444|0"])
        # Second poll: same listing must not alert again.
        s2 = f.poll_once()
        self.assertEqual(s2["alerts"], 0)
        self.assertEqual(len(db.list_alerts(self.conn)), 1)


class DashboardHelpers(unittest.TestCase):
    def test_comp_lines(self):
        y = TODAY.year
        rows, errors = parse_comp_lines(f"{y}-01-02, 455.00, 4.99, auction\n01/05/{y}, $1,250, free\n"
                                        f"Jan 2, {y}, 470, 0\nJan 5, 4100, 20, auction\ngarbage")
        self.assertEqual(rows[0], (f"{y}-01-02", 455.0, 4.99, "auction"))
        self.assertEqual(rows[1], (f"{y}-01-05", 1250.0, 0.0, ""))
        self.assertEqual(rows[2], (f"{y}-01-02", 470.0, 0.0, ""))
        self.assertEqual(rows[3][1:], (4100.0, 20.0, "auction"))
        self.assertEqual(len(errors), 1)

    def test_config_update_keeps_comments(self):
        tmp = Path(tempfile.mkdtemp()) / "c.yaml"
        shutil.copy(CONFIG_PATH, tmp)
        update_config_values({("deal", "min_comps"): 4, ("ebay", "buyer_zip"): "90210", ("auto", "enabled"): False}, tmp)
        text = tmp.read_text(encoding="utf-8")
        cfg = load_config(tmp)
        self.assertEqual(cfg["deal"]["min_comps"], 4)
        self.assertEqual(cfg["ebay"]["buyer_zip"], "90210")
        self.assertIs(cfg["auto"]["enabled"], False)
        self.assertEqual(cfg["deal"]["comp_lookback_days"], 30)
        self.assertIn("# skip the card if fewer sold comps", text)
        self.assertEqual(cfg["plans"]["standard"]["max_profiles"], 2)  # nested sections untouched
        shutil.rmtree(tmp.parent, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()

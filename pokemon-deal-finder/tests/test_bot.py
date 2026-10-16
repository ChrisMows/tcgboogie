"""Offline tests for the Discord bot: command definitions, alert delivery, buttons, pause/mute."""
import asyncio
import shutil
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import discord

from dealfinder import db
from dealfinder.alerts import sample_alert
from dealfinder.config import coerce_setting, load_config
from dealfinder.discord_bot import DealBot, alert_view, handle_component, register_commands
from dealfinder.discord_members import register_member_commands
from dealfinder.finder import Finder, search_window
from test_finder import CFG, UMBREON, FakeEbay, comps_around, detail, summary, UMB_ASPECTS


def make_bot(conn):
    bot = DealBot()
    bot.conn = conn
    bot.owner_ids = {1234}
    return bot


class TempDB(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.conn = db.connect(self.tmp / "t.db")
        self.card_id = db.save_card(self.conn, {**{k: v for k, v in UMBREON.items() if k != "id"}, "active": 1})
        for c in comps_around(1000, 8):
            db.add_comp(self.conn, self.card_id, c["sold_date"], c["price"], c["shipping"])

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)


class CommandDefinitionTests(TempDB):
    def test_commands_fit_discord_limits(self):
        """Discord rejects the whole command sync if any name/description breaks its limits."""
        bot = make_bot(self.conn)
        register_commands(bot)
        register_member_commands(bot)
        names = set()

        def check(d, path):
            self.assertRegex(d["name"], r"^[-_a-z0-9]{1,32}$", path)
            self.assertTrue(1 <= len(d.get("description", "x")) <= 100, f"{path}: description too long")
            for o in d.get("options", []):
                check(o, f"{path} {o['name']}")
                for ch in o.get("choices", []):
                    self.assertLessEqual(len(ch["name"]), 100)
                self.assertLessEqual(len(o.get("choices", [])), 25)

        for cmd in bot.tree.get_commands():
            d = cmd.to_dict(bot.tree)
            names.add(d["name"])
            check(d, d["name"])
        self.assertTrue({"status", "pause", "resume", "test", "recent", "setup", "watch", "comps", "settings",
                         "profile", "plan", "member"} <= names)


class ButtonTests(TempDB):
    def test_alert_view_buttons(self):
        rec, card = sample_alert()
        card = {**card, "id": self.card_id}
        rec["item_id"] = "v1|306123456789|0"
        v = alert_view(rec, card)
        labels = [i.label for i in v.children]
        self.assertEqual(labels, ["Open listing", "Sold comps", "Good deal", "Wrong match", "Mute card 24h"])
        for i in v.children:
            if i.custom_id:
                self.assertLessEqual(len(i.custom_id), 100)

    def test_outcome_and_mute_buttons(self):
        rec, card = sample_alert()
        rec.update(item_id="v1|42|0", card_id=self.card_id, card_label="x", flags=[], reason={})
        db.record_alert(self.conn, rec)
        msg = handle_component(self.conn, "df:outcome:good:v1|42|0")
        self.assertIn("real deal", msg)
        self.assertEqual(db.list_alerts(self.conn)[0]["outcome"], "real deal")
        now = datetime.now(timezone.utc)
        handle_component(self.conn, f"df:mute:{self.card_id}:24", now=now)
        card = db.get_card(self.conn, self.card_id)
        self.assertTrue(db.is_muted(card, now + timedelta(hours=23)))
        self.assertFalse(db.is_muted(card, now + timedelta(hours=25)))


class FinderControlTests(TempDB):
    def finder(self, ebay):
        f = Finder.__new__(Finder)
        f.cfg, f.conn, f.ebay, f.dry_run, f.detail_cache, f.notifier = CFG, self.conn, ebay, False, {}, None
        f.ppt, f._auto_blocked = None, False
        return f

    def deal_ebay(self):
        s = summary("v1|111|0", "2021 Pokemon Evolving Skies Umbreon VMAX 215/203 PSA 10", price=590, minutes=6)
        return FakeEbay([s], {"v1|111|0": detail(aspects=UMB_ASPECTS)})

    def test_pause_skips_ebay_entirely(self):
        ebay = self.deal_ebay()
        ebay.search_ending_auctions = lambda *a: self.fail("should not call eBay while paused")
        db.set_setting(self.conn, "paused", "1")
        self.assertTrue(self.finder(ebay).poll_once()["paused"])

    def test_muted_card_not_alerted(self):
        db.mute_card(self.conn, self.card_id, (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat())
        f = self.finder(self.deal_ebay())
        f.dry_run = True
        self.assertEqual(f.poll_once()["alerts"], 0)
        db.mute_card(self.conn, self.card_id, None)
        self.assertEqual(f.poll_once()["alerts"], 1)

    def test_notifier_used_and_delivery_logged(self):
        sent = []
        f = self.finder(self.deal_ebay())
        f.notifier = lambda rec, card: sent.append((rec, card)) or True
        self.assertEqual(f.poll_once()["alerts"], 1)
        self.assertEqual(sent[0][1]["name"], "Umbreon VMAX")
        self.assertEqual(db.list_alerts(self.conn)[0]["delivered"], 1)

    def test_search_window_covers_alert_window(self):
        cfg = dict(CFG, deal=dict(CFG["deal"], max_minutes_left=45))
        self.assertGreaterEqual(search_window(cfg), 47)
        self.assertEqual(search_window(CFG), 12)


class FakeChannel:
    def __init__(self):
        self.sent = []

    async def send(self, **kw):
        self.sent.append(kw)


class DeliveryTests(TempDB):
    def setUp(self):
        super().setUp()
        self.bot = make_bot(self.conn)
        self.chans = {}

        async def destination(row):
            return self.chans.setdefault(row["discord_id"], FakeChannel())
        self.bot.destination = destination
        db.upsert_member(self.conn, "1234", tier="owner", active=1, source="owner", delivery_kind="channel", delivery_id="1")
        db.upsert_member(self.conn, "555", tier="standard", active=1, source="manual", delivery_kind="channel", delivery_id="2")

    def deal(self, minutes=6):
        rec, card = sample_alert()
        rec.update(item_id="v1|77|0", card_id=None, card_label="Charizard PSA 8", reason={"market": {"reason": "x"}},
                   end_time=(datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat())
        db.save_deal(self.conn, rec, card)
        return rec, card

    def test_member_alert_mentions_member_and_names_profile(self):
        rec, card = self.deal()
        card = {**card, "id": 9}  # even a watchlist card: members get no mute button
        asyncio.run(self.bot.deliver(db.get_member(self.conn, "555"), rec, card, "Vintage"))
        kw = self.chans["555"].sent[0]
        self.assertTrue(kw["content"].startswith("<@555>"))
        self.assertIn("Vintage", kw["content"])
        self.assertIsInstance(kw["embed"], discord.Embed)
        self.assertEqual(kw["embed"].url, rec["url"])
        self.assertEqual([b.label for b in kw["view"].children], ["Open listing", "Sold comps", "Good deal", "Wrong match"])

    def test_queue_sends_when_due_and_expires_ended_auctions(self):
        now = datetime.now(timezone.utc)
        self.deal()
        db.queue_delivery(self.conn, "1234", "v1|77|0", 1, "My deals", now.isoformat(timespec="seconds"))
        db.queue_delivery(self.conn, "555", "v1|77|0", 2, "Mine", (now + timedelta(seconds=120)).isoformat(timespec="seconds"))
        self.assertEqual(asyncio.run(self.bot.send_due(now)), 1)  # standard member's alert is still waiting
        self.assertIn("1234", self.chans)
        self.assertNotIn("555", self.chans)
        self.assertEqual(asyncio.run(self.bot.send_due(now + timedelta(seconds=121))), 1)
        self.assertIn("555", self.chans)
        # an alert whose auction has ended is dropped, not sent
        db.queue_delivery(self.conn, "1234", "v1|78|0", 1, "My deals", now.isoformat(timespec="seconds"))
        rec, card = sample_alert()
        rec.update(item_id="v1|78|0", end_time=(now - timedelta(minutes=1)).isoformat())
        db.save_deal(self.conn, rec, card)
        self.assertEqual(asyncio.run(self.bot.send_due(now)), 0)
        status = self.conn.execute("SELECT status FROM deliveries WHERE item_id='v1|78|0'").fetchone()["status"]
        self.assertEqual(status, "expired")


class SettingTests(unittest.TestCase):
    def test_coerce(self):
        self.assertEqual(coerce_setting("min_comps", "4"), (("deal", "min_comps"), 4))
        self.assertEqual(coerce_setting("enabled", "off"), (("auto", "enabled"), False))
        for k, v in [("min_comps", "abc"), ("buyer_zip", "1234"), ("interval_seconds", "5"), ("enabled", "maybe")]:
            with self.assertRaises(ValueError):
                coerce_setting(k, v)


if __name__ == "__main__":
    unittest.main()

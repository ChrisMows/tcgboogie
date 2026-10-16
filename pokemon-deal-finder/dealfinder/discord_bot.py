"""Discord bot: runs the finder, posts alerts with buttons, and takes slash commands from its owner."""
import asyncio
import logging
import re
import time
from datetime import datetime, timedelta, timezone

import discord
from discord import app_commands

from . import db
from .alerts import build_discord_payload, card_label, sample_alert, sold_search_url
from .compinput import GRADERS, LANGUAGES, VARIANT_CHOICES, parse_comp_lines
from .comps import market_value
from .config import EDITABLE, coerce_setting, load_config, update_config_values
from . import members
from .discord_members import (MEMBER_COMMANDS, close_space, existing_space, register_member_commands,
                              sync_from_roles)
from .ebay import EbayError
from .finder import Finder, next_interval

log = logging.getLogger("dealfinder.bot")

OUTCOMES = {"good": "real deal", "wrong": "wrong card match"}
SETTING_LABELS = {
    "min_discount_pct": "Minimum % below market",
    "max_minutes_left": "Max minutes left",
    "comp_lookback_days": "Comp lookback (days)",
    "min_comps": "Minimum comps",
    "max_comp_spread": "Max comp spread (0.35 = 35%)",
    "comp_refresh_days": "Refresh reminder (days)",
    "interval_seconds": "Check every (seconds)",
    "min_seller_feedback_score": "Flag seller feedback under",
    "min_seller_feedback_pct": "Flag seller positive % under",
    "max_shipping": "Flag shipping over ($)",
    "buyer_zip": "Your ZIP code",
    "enabled": "Automatic mode (on/off)",
    "min_market_value": "Auto: minimum card value ($)",
    "min_grade": "Auto: lowest grade",
}
GREEN, AMBER, RED, GOLD = 0x22C55E, 0xF59E0B, 0xEF4444, 0xF5C518


def discord_ts(dt, style="f"):
    return f"<t:{int(dt.timestamp())}:{style}>"


def money(v):
    return "-" if v is None else f"${v:,.2f}"


# ---------- alert buttons ----------
def alert_view(rec, card, allow_mute=True):
    view = discord.ui.View(timeout=None)
    view.add_item(discord.ui.Button(label="Open listing", style=discord.ButtonStyle.link, url=rec["url"], emoji="🛒"))
    view.add_item(discord.ui.Button(label="Sold comps", style=discord.ButtonStyle.link, url=sold_search_url(card), emoji="📊"))
    if card.get("tcgplayer_url"):
        view.add_item(discord.ui.Button(label="TCGplayer", style=discord.ButtonStyle.link, url=card["tcgplayer_url"][:512]))
    item = rec["item_id"]
    view.add_item(discord.ui.Button(label="Good deal", style=discord.ButtonStyle.success, custom_id=f"df:outcome:good:{item}"))
    view.add_item(discord.ui.Button(label="Wrong match", style=discord.ButtonStyle.danger, custom_id=f"df:outcome:wrong:{item}"))
    if allow_mute and card.get("id"):  # watchlist cards only, and only for the owner
        view.add_item(discord.ui.Button(label="Mute card 24h", style=discord.ButtonStyle.secondary,
                                        custom_id=f"df:mute:{card['id']}:24", emoji="🔕"))
    return view


def handle_component(conn, custom_id, user_id=None, is_owner=True, now=None):
    """Handle a click on an alert button. Returns the reply text.

    custom_id formats: df:outcome:<good|wrong>:<item_id>  and  df:mute:<card_id>:<hours>
    """
    parts = custom_id.split(":", 3)
    if len(parts) == 4 and parts[1] == "outcome" and parts[2] in OUTCOMES:
        if user_id is not None:
            db.set_delivery_outcome(conn, user_id, parts[3], OUTCOMES[parts[2]])
        if is_owner:
            db.set_outcome(conn, parts[3], OUTCOMES[parts[2]])
        return f"Logged as **{OUTCOMES[parts[2]]}**. Thanks, this feeds the accuracy review."
    if len(parts) == 4 and parts[1] == "mute":
        if not is_owner:
            return "Only the server owner can mute watchlist cards."
        card = db.get_card(conn, int(parts[2]))
        if not card:
            return "That card is no longer on your watchlist."
        until = (now or datetime.now(timezone.utc)) + timedelta(hours=int(parts[3]))
        db.mute_card(conn, card["id"], until.isoformat(timespec="seconds"))
        return f"🔕 Muted **{card_label(card)}** until {discord_ts(until)}. Undo with `/watch unmute`."
    return "Unknown button."


# ---------- command tree: members get /profile and /plan, everything else is owner-only ----------
class OwnerTree(app_commands.CommandTree):
    async def interaction_check(self, interaction):
        if interaction.user.id in self.client.owner_ids:
            return True
        cmd = interaction.command
        root = (cmd.root_parent or cmd).name if cmd else ""
        if root in MEMBER_COMMANDS:
            m = db.get_member(self.client.conn, interaction.user.id)
            if m and m["active"]:
                return True
            msg = "You need an active plan to use this."
        else:
            msg = "That command is for the server owner."
        if interaction.type != discord.InteractionType.autocomplete:
            await interaction.response.send_message(msg, ephemeral=True)
        return False

    async def on_error(self, interaction, error):
        err = getattr(error, "original", error)
        if isinstance(err, app_commands.CheckFailure):
            return
        if not isinstance(err, app_commands.AppCommandError):  # a bug, not a user input problem
            log.error("Command error: %r", err, exc_info=err)
        send = interaction.followup.send if interaction.response.is_done() else interaction.response.send_message
        try:
            await send(f"⚠️ {err}", ephemeral=True)
        except discord.HTTPException:
            pass


class DealBot(discord.Client):
    def __init__(self):
        cfg = load_config()
        intents = discord.Intents.default()
        # Seeing role changes needs the privileged "Server Members Intent" (Developer Portal > Bot).
        intents.members = bool((cfg.get("membership") or {}).get("roles_enabled"))
        super().__init__(intents=intents)
        self.tree = OwnerTree(self)
        self.conn = db.connect()
        self.finder = None
        self.finder_error = None
        self.owner_ids = set()
        self._recent_errors = {}
        self._main_loop = None
        self._wake = None

    # ----- lifecycle -----
    async def setup_hook(self):
        self._main_loop = asyncio.get_running_loop()
        self._wake = asyncio.Event()
        info = await self.application_info()
        self.owner_ids = {m.id for m in info.team.members} if info.team else {info.owner.id}
        register_commands(self)
        register_member_commands(self)
        self.ensure_owner()
        self._finder_task = asyncio.create_task(self.finder_loop())
        self._delivery_task = asyncio.create_task(self.delivery_loop())

    async def on_ready(self):
        for guild in self.guilds:
            await self.sync_guild(guild)
        log.info("Discord bot ready as %s in %d server(s)", self.user, len(self.guilds))
        if not db.get_setting(self.conn, "alert_channel_id"):
            log.warning("No alert channel set yet - run /setup in the channel you want alerts in. Alerts go to your DMs until then.")
        if (load_config().get("membership") or {}).get("roles_enabled"):
            n = await self.sync_all_roles()
            log.info("Checked %d server members against plan roles", n)
        await self.post_log("🟢 Deal finder bot is online.")

    def ensure_owner(self):
        """You are always a member (plan 'owner'); your alerts go to the /setup channel, or DMs if none is set."""
        cfg = load_config()
        oid = str(next(iter(self.owner_ids)))
        ch = db.get_setting(self.conn, "alert_channel_id")
        db.upsert_member(self.conn, oid, tier="owner", active=1, source="owner",
                         delivery_kind="channel" if ch else "dm", delivery_id=ch)
        if not db.list_profiles(self.conn, oid):
            db.create_profile(self.conn, oid, "My deals", members.default_filters(cfg, members.plan(cfg, "owner")))

    # ----- plan roles (set by the website) -----
    async def sync_all_roles(self):
        n = 0
        for guild in self.guilds:
            async for m in guild.fetch_members(limit=None):
                if m.bot:
                    continue
                n += 1
                try:
                    await sync_from_roles(self, m)
                except discord.HTTPException as e:
                    await self.post_error(f"Couldn't set up {m.display_name}: {e}")
            # anyone with an active role-based plan who left or lost their role while the bot was offline
            for row in db.list_members(self.conn, active_only=True):
                if row["source"] == "role" and guild.get_member(int(row["discord_id"])) is None:
                    await close_space(self, guild, row["discord_id"])
        return n

    async def on_member_update(self, before, after):
        if {r.id for r in before.roles} != {r.id for r in after.roles}:
            try:
                await sync_from_roles(self, after)
            except discord.HTTPException as e:
                await self.post_error(f"Couldn't update {after.display_name}'s plan space: {e}")

    async def on_member_join(self, member):
        await sync_from_roles(self, member)  # the website may add them with their plan role already set

    async def on_member_remove(self, member):
        row = db.get_member(self.conn, member.id)
        if row and row["source"] == "role" and row["active"]:
            await close_space(self, member.guild, member.id)

    async def on_guild_join(self, guild):
        await self.sync_guild(guild)

    async def sync_guild(self, guild):
        # Per-server sync makes slash commands appear instantly.
        self.tree.copy_global_to(guild=guild)
        await self.tree.sync(guild=guild)

    async def on_interaction(self, interaction):
        if interaction.type != discord.InteractionType.component:
            return
        cid = (interaction.data or {}).get("custom_id", "")
        if not cid.startswith("df:"):
            return
        is_owner = interaction.user.id in self.owner_ids
        m = db.get_member(self.conn, interaction.user.id)
        if not is_owner and not (m and m["active"]):
            await interaction.response.send_message("You need an active plan to use these buttons.", ephemeral=True)
            return
        await interaction.response.send_message(
            handle_component(self.conn, cid, user_id=interaction.user.id, is_owner=is_owner), ephemeral=True)

    # ----- delivery -----
    async def resolve_channel(self, key):
        cid = db.get_setting(self.conn, key)
        if not cid:
            return None
        ch = self.get_channel(int(cid))
        if ch is None:
            try:
                ch = await self.fetch_channel(int(cid))
            except discord.HTTPException:
                return None
        return ch

    async def owner_user(self):
        oid = next(iter(self.owner_ids))
        return self.get_user(oid) or await self.fetch_user(oid)

    async def destination(self, member_row):
        """Where a member's alerts go: their private channel/thread, or DMs."""
        space = await existing_space(self, member_row)
        if isinstance(space, discord.Thread) and space.archived:
            await space.edit(archived=False)
        if space:
            return space
        return self.get_user(int(member_row["discord_id"])) or await self.fetch_user(int(member_row["discord_id"]))

    async def deliver(self, member_row, rec, card, profile_name=None):
        """Send one alert to one member."""
        payload = build_discord_payload(rec, card)
        embed = discord.Embed.from_dict(payload["embeds"][0])
        is_owner = member_row["source"] == "owner"
        content = payload["content"].replace("\n", f" · {profile_name}\n", 1) if profile_name else payload["content"]
        mention = ""
        if not is_owner or db.get_setting(self.conn, "mention_me", "1") == "1":
            mention = f"<@{member_row['discord_id']}> "
        dest = await self.destination(member_row)
        view = alert_view(rec, card, allow_mute=is_owner)
        await dest.send(content=(mention + content).strip()[:2000], embed=embed, view=view,
                        allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
        view.stop()
        if is_owner and member_row["delivery_kind"] != "dm" and db.get_setting(self.conn, "dm_alerts", "0") == "1":
            view = alert_view(rec, card, allow_mute=True)
            await (await self.owner_user()).send(content=content, embed=embed, view=view)
            view.stop()

    async def send_alert(self, rec, card):
        """Send straight to you (used by /test)."""
        await self.deliver(db.get_member(self.conn, next(iter(self.owner_ids))), rec, card, "Test")
        return True

    def wake_delivery(self):
        """Called from the finder's worker thread when new alerts are queued."""
        if self._main_loop and self._wake:
            self._main_loop.call_soon_threadsafe(self._wake.set)

    async def send_due(self, now):
        """Send every queued alert whose time has come. Returns how many were sent."""
        sent = 0
        for d in db.due_deliveries(self.conn, now.isoformat(timespec="seconds")):
            row = db.get_member(self.conn, d["discord_id"])
            deal = db.get_deal(self.conn, d["item_id"])
            if not row or not row["active"] or not deal:
                db.finish_delivery(self.conn, d["discord_id"], d["item_id"], "expired")
                continue
            rec, card = deal
            mins = members.minutes_until(rec.get("end_time"), now)
            if mins is None or mins <= 0.3:
                db.finish_delivery(self.conn, d["discord_id"], d["item_id"], "expired")
                continue
            try:
                await self.deliver(row, {**rec, "minutes_left": mins}, card, d["profile_name"])
                db.finish_delivery(self.conn, d["discord_id"], d["item_id"], "sent")
                db.mark_delivered(self.conn, d["item_id"], True)
                sent += 1
            except discord.HTTPException as e:
                db.finish_delivery(self.conn, d["discord_id"], d["item_id"], "failed", str(e)[:300])
                await self.post_error(f"Couldn't deliver an alert to <@{d['discord_id']}>: {e}")
        return sent

    async def delivery_loop(self):
        """Sends queued alerts as soon as they're due (Standard-plan alerts wait out their delay here)."""
        await self.wait_until_ready()
        while not self.is_closed():
            self._wake.clear()
            try:
                await self.send_due(datetime.now(timezone.utc))
            except Exception:
                log.exception("Delivery pass failed")
            nxt = db.next_delivery_time(self.conn)
            wait = 30.0
            if nxt:
                wait = min(30.0, max(0.5, (datetime.fromisoformat(nxt) - datetime.now(timezone.utc)).total_seconds()))
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=wait)
            except asyncio.TimeoutError:
                pass

    async def post_log(self, text):
        ch = await self.resolve_channel("log_channel_id")
        if ch:
            try:
                await ch.send(text[:1900])
            except discord.HTTPException as e:
                log.warning("Couldn't post to log channel: %s", e)

    async def post_error(self, text):
        """Report a problem (at most once per 30 min per message) to the log channel, or DM if none."""
        log.error(text)
        key = text[:80]
        if self._recent_errors.get(key, 0) > time.time() - 1800:
            return
        self._recent_errors[key] = time.time()
        msg = f"⚠️ **Deal finder problem:** {text}"[:1900]
        ch = await self.resolve_channel("log_channel_id")
        try:
            if ch:
                await ch.send(msg)
            else:
                await (await self.owner_user()).send(msg)
        except discord.HTTPException:
            pass

    # ----- the finder loop -----
    def _scan_settings(self, cfg):
        """Runs in the finder's thread: one wide scan sized to every active member profile."""
        return members.scan_settings(cfg, members.active_profiles(self.finder.conn, cfg))

    async def finder_loop(self):
        await self.wait_until_ready()
        while not self.is_closed():
            started = time.monotonic()
            cfg = load_config()
            if self.finder is None:
                try:
                    self.finder = Finder(scan_fn=self._scan_settings)
                    self.finder.on_deal = members.Dispatcher(self.finder.conn, load_config, self.wake_delivery).handle
                except EbayError as e:
                    self.finder_error = str(e)
                    await self.post_error(f"{e}. Fix .env and restart the bot.")
                    await asyncio.sleep(300)
                    continue
            try:
                stats = await asyncio.to_thread(self.finder.poll_once)
                self.finder_error = None
                if not stats.get("paused"):
                    log.info("Checked %d ending auctions, %d candidates, %d alerts | eBay calls today: %d",
                             stats["listings"], stats["candidates"], stats["alerts"], db.api_calls_today(self.conn))
            except EbayError as e:
                self.finder_error = str(e)
                await self.post_error(f"eBay: {e}")
            except Exception as e:  # keep the bot alive no matter what
                log.exception("Check failed")
                self.finder_error = f"{type(e).__name__}: {e}"
                await self.post_error(f"Unexpected error ({type(e).__name__}). Details in logs/finder.log")
            wait = 30 if db.is_paused(self.conn) else next_interval(cfg, db.api_calls_today(self.conn))
            await asyncio.sleep(max(5, wait - (time.monotonic() - started)))


# ---------- slash commands ----------
async def card_autocomplete(interaction, current):
    cur = current.lower()
    out = []
    for c in db.list_cards(interaction.client.conn):
        label = card_label(c)
        if cur in label.lower():
            out.append(app_commands.Choice(name=label[:100], value=c["id"]))
        if len(out) == 25:
            break
    return out


def get_card_or_fail(conn, card_id):
    card = db.get_card(conn, card_id)
    if not card:
        raise app_commands.AppCommandError("Card not found. Pick one from the list as you type.")
    return card


class CompsModal(discord.ui.Modal, title="Add sold comps"):
    lines = discord.ui.TextInput(
        label="One sale per line: date, price, shipping", style=discord.TextStyle.paragraph,
        placeholder="2026-10-02, 455, 4.99\n10/05/2026, 470, 0\nOct 9, 512.50, 5.25, BIN", max_length=4000)

    def __init__(self, bot, card):
        super().__init__()
        self.bot, self.card = bot, card

    async def on_submit(self, interaction):
        rows, errors = parse_comp_lines(self.lines.value)
        for d, p, s, n in rows:
            db.add_comp(self.bot.conn, self.card["id"], d, p, s, n)
        mv = market_value(db.list_comps(self.bot.conn, self.card["id"]), load_config()["deal"])
        msg = f"Added **{len(rows)}** comp(s) to **{card_label(self.card)}**.\n"
        msg += f"Market value: **{money(mv.value)}** ({mv.reason})" if mv.ok else f"Not trusted yet: {mv.reason}"
        if errors:
            msg += "\nSkipped:\n" + "\n".join(f"• {e}" for e in errors[:10])
        await interaction.response.send_message(msg[:1900], ephemeral=True)


class ConfirmDelete(discord.ui.View):
    def __init__(self, bot, card):
        super().__init__(timeout=60)
        self.bot, self.card = bot, card

    @discord.ui.button(label="Delete card and its comps", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction, button):
        db.delete_card(self.bot.conn, self.card["id"])
        await interaction.response.edit_message(content=f"🗑️ Removed **{card_label(self.card)}**.", view=None)
        self.stop()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction, button):
        await interaction.response.edit_message(content="Cancelled.", view=None)
        self.stop()


def register_commands(bot):
    tree = bot.tree
    conn = bot.conn

    @tree.command(name="status", description="Is the finder running? Last check, alerts today, eBay calls used")
    async def status(interaction: discord.Interaction):
        cfg = load_config()
        paused = db.is_paused(conn)
        last = db.get_setting(conn, "last_check")
        cards = db.list_cards(conn)
        active = [c for c in cards if c["active"]]
        ready = sum(1 for c in active if market_value(db.list_comps(conn, c["id"]), cfg["deal"]).ok)
        muted = sum(1 for c in active if db.is_muted(c))
        local_midnight = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        today = db.alerts_since(conn, local_midnight.astimezone(timezone.utc).isoformat(timespec="seconds"))
        if bot.finder_error:
            color, state = RED, f"🔴 Problem: {bot.finder_error}"
        elif paused:
            color, state = AMBER, "⏸️ Paused (use /resume)"
        else:
            color, state = GREEN, "🟢 Running"
        e = discord.Embed(title="Deal finder status", description=state[:4000], color=color)
        e.add_field(name="Last check", value=discord_ts(datetime.fromisoformat(last), "R") if last else "not yet")
        e.add_field(name="Auctions in last check", value=db.get_setting(conn, "last_check_listings", "-"))
        e.add_field(name="Alerts today", value=str(today))
        e.add_field(name="eBay calls today", value=f"{db.api_calls_today(conn):,} / {cfg['poll']['daily_call_budget']:,}")
        e.add_field(name="Watchlist", value=f"{len(active)} active · {ready} with trusted value · {muted} muted")
        profs = members.active_profiles(conn, cfg)
        scan = members.scan_settings(cfg, profs)
        mems = db.list_members(conn, active_only=True)
        queued = conn.execute("SELECT COUNT(*) AS n FROM deliveries WHERE status = 'queued'").fetchone()["n"]
        e.add_field(name="Members", value=f"{len(mems)} active · {len(profs)} running profiles · {queued} alerts queued")
        if scan:
            d, a = scan["deal"], scan["auto"]
            e.add_field(name="Scan width (loosest active profile)", inline=False, value=(
                f"≥{d['min_discount_pct']:g}% below · ≤{d['max_minutes_left']:g} min left · "
                f"{d['comp_lookback_days']}d comps (min {d['min_comps']})"
                + (f"\nAuto: {', '.join(a['graders'])} {a['min_grade']:g}+ · ${a['min_market_value']:g}+ · "
                   f"{'/'.join(l.title() for l in a['languages'])}" if a.get("enabled") else "")))
        else:
            e.add_field(name="Scan width", value="No running profiles, so nothing is scanned", inline=False)
        a = cfg.get("auto") or {}
        if a.get("enabled") and cfg["secrets"].get("ppt_api_key"):
            left = db.get_setting(conn, "ppt_credits_remaining")
            at = db.get_setting(conn, "ppt_credits_at")
            fresh = at and datetime.fromisoformat(at).date() == datetime.now(timezone.utc).date()
            e.add_field(name="Automatic mode", value=f"On · price credits left today: {left if fresh else 'unknown'}",
                        inline=False)
        else:
            e.add_field(name="Automatic mode", value="Off (watchlist only)", inline=False)
        await interaction.response.send_message(embed=e, ephemeral=True)

    @tree.command(name="pause", description="Stop checking eBay and sending alerts")
    async def pause(interaction: discord.Interaction):
        db.set_setting(conn, "paused", "1")
        await interaction.response.send_message("⏸️ Paused. No eBay checks or alerts until `/resume`.", ephemeral=True)

    @tree.command(name="resume", description="Start checking eBay again")
    async def resume(interaction: discord.Interaction):
        db.set_setting(conn, "paused", "0")
        await interaction.response.send_message("▶️ Resumed. Next check within a minute or two.", ephemeral=True)

    @tree.command(name="test", description="Send a sample alert so you can see how alerts look and notify")
    async def test(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        rec, card = sample_alert()
        await bot.send_alert(rec, card)
        await interaction.followup.send("Sample alert sent. Its buttons are for show only.", ephemeral=True)

    @tree.command(name="recent", description="Your last 5 alerts")
    async def recent(interaction: discord.Interaction):
        rows = db.list_alerts(conn, 5)
        if not rows:
            await interaction.response.send_message("No alerts yet.", ephemeral=True)
            return
        lines = [f"**[{r['card_label']}]({r['url']})**\n{money(r['total'])} vs {money(r['market_value'])} · "
                 f"{r['discount_pct']:.0f}% below · {r['comps_used']} comps · "
                 f"{discord_ts(datetime.fromisoformat(r['alerted_at']), 'R')}"
                 f"{' · ' + r['outcome'] if r['outcome'] else ''}" for r in rows]
        await interaction.response.send_message(embed=discord.Embed(title="Recent alerts", description="\n\n".join(lines)[:4000],
                                                                    color=GOLD), ephemeral=True)

    @tree.command(name="setup", description="Choose where alerts and problem reports go")
    @app_commands.describe(alert_channel="Channel for deal alerts (default: this channel)",
                           log_channel="Channel for startup/problem messages",
                           dm_me="Also send every alert to your DMs",
                           mention_me="@mention you on alerts so your phone always notifies")
    async def setup(interaction: discord.Interaction, alert_channel: discord.TextChannel = None,
                    log_channel: discord.TextChannel = None, dm_me: bool = None, mention_me: bool = None):
        changed = []
        if alert_channel is None and log_channel is None and dm_me is None and mention_me is None:
            alert_channel = interaction.channel if isinstance(interaction.channel, discord.TextChannel) else None
        for ch, key, label in ((alert_channel, "alert_channel_id", "Alerts"), (log_channel, "log_channel_id", "Problem reports")):
            if ch is None:
                continue
            perms = ch.permissions_for(ch.guild.me)
            if not (perms.view_channel and perms.send_messages and perms.embed_links):
                raise app_commands.AppCommandError(f"I can't post in {ch.mention}. Give me View, Send Messages and Embed Links there.")
            db.set_setting(conn, key, ch.id)
            changed.append(f"{label} → {ch.mention}")
        bot.ensure_owner()  # your own alerts follow the alert channel
        if dm_me is not None:
            db.set_setting(conn, "dm_alerts", "1" if dm_me else "0")
            changed.append(f"DM alerts → {'on' if dm_me else 'off'}")
        if mention_me is not None:
            db.set_setting(conn, "mention_me", "1" if mention_me else "0")
            changed.append(f"@mention → {'on' if mention_me else 'off'}")

        def show(key):
            v = db.get_setting(conn, key)
            return f"<#{v}>" if v else "not set"
        summary = (f"**Alerts:** {show('alert_channel_id')}\n**Problem reports:** {show('log_channel_id')}\n"
                   f"**DM alerts:** {'on' if db.get_setting(conn, 'dm_alerts', '0') == '1' else 'off'}\n"
                   f"**@mention me:** {'on' if db.get_setting(conn, 'mention_me', '1') == '1' else 'off'}")
        head = ("Updated: " + "; ".join(changed) + "\n\n") if changed else ""
        await interaction.response.send_message(head + summary, ephemeral=True)

    # ----- /watch -----
    watch = app_commands.Group(name="watch", description="Manage the cards you're watching")

    @watch.command(name="add", description="Watch a card in a specific grade (one grader + grade per entry)")
    @app_commands.describe(name="Pokémon / card name, e.g. Umbreon VMAX", set_name="Set, e.g. Evolving Skies",
                           card_number="Number as printed, e.g. 215/203 or SWSH050", grade="e.g. 10, 9.5, 10 Pristine",
                           variants="Comma separated, e.g. 1st edition, shadowless, reverse holo, stamped, master ball",
                           set_aliases="Other spellings of the set seen in titles (comma separated)",
                           exclude_terms="Words that rule a listing out, e.g. celebrations")
    @app_commands.choices(grader=[app_commands.Choice(name=g, value=g) for g in GRADERS],
                          language=[app_commands.Choice(name=l.title(), value=l) for l in LANGUAGES])
    async def watch_add(interaction: discord.Interaction, name: str, set_name: str, card_number: str,
                        grader: app_commands.Choice[str], grade: str, variants: str = "",
                        language: app_commands.Choice[str] = None, set_aliases: str = "", exclude_terms: str = ""):
        vs = [v.strip().lower() for v in variants.split(",") if v.strip()]
        bad = [v for v in vs if v not in VARIANT_CHOICES]
        if bad:
            raise app_commands.AppCommandError(f"Unknown variant(s): {', '.join(bad)}. Choose from: {', '.join(VARIANT_CHOICES)}")
        if not re.fullmatch(r"(10|[1-9](\.5)?)( pristine| black label)?", grade.strip().lower()):
            raise app_commands.AppCommandError("Grade should look like 10, 9.5, 8, 10 Pristine or 10 Black Label.")
        cid = db.save_card(conn, {"name": name.strip(), "set_name": set_name.strip(), "card_number": card_number.strip(),
                                  "grader": grader.value, "grade": grade, "variants": ", ".join(vs),
                                  "language": language.value if language else "english", "set_aliases": set_aliases,
                                  "exclude_terms": exclude_terms, "notes": "", "active": 1})
        card = db.get_card(conn, cid)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Find sold comps on eBay", style=discord.ButtonStyle.link, url=sold_search_url(card)))
        await interaction.response.send_message(
            f"👀 Watching **{card_label(card)}**.\nNext: add recent sales with `/comps add` "
            f"(need {load_config()['deal']['min_comps']}+ from the last {load_config()['deal']['comp_lookback_days']} days).",
            view=view, ephemeral=True)

    @watch.command(name="list", description="Everything you're watching, with market values")
    async def watch_list(interaction: discord.Interaction):
        cfg = load_config()
        cards = db.list_cards(conn)
        if not cards:
            await interaction.response.send_message("Your watchlist is empty. Add a card with `/watch add`.", ephemeral=True)
            return
        lines = []
        for c in cards:
            mv = market_value(db.list_comps(conn, c["id"]), cfg["deal"])
            state = f"**{money(mv.value)}** · {mv.comps_used} comps" if mv.ok else f"⚠️ {mv.reason}"
            tags = (" · ⏸️ paused" if not c["active"] else "") + (" · 🔕 muted" if db.is_muted(c) else "")
            lines.append(f"`{c['id']}` {card_label(c)}\n   {state}{tags}")
        text = "\n".join(lines)
        if len(text) > 4000:
            text = text[:3900] + "\n… (more on the dashboard)"
        await interaction.response.send_message(embed=discord.Embed(title=f"Watchlist ({len(cards)})", description=text,
                                                                    color=GOLD), ephemeral=True)

    @watch.command(name="remove", description="Stop watching a card and delete its comps")
    @app_commands.autocomplete(card=card_autocomplete)
    async def watch_remove(interaction: discord.Interaction, card: int):
        c = get_card_or_fail(conn, card)
        await interaction.response.send_message(f"Delete **{card_label(c)}** and all its comps?",
                                                view=ConfirmDelete(bot, c), ephemeral=True)

    @watch.command(name="pause", description="Temporarily stop alerts for one card (keeps its comps)")
    @app_commands.autocomplete(card=card_autocomplete)
    async def watch_pause(interaction: discord.Interaction, card: int):
        c = get_card_or_fail(conn, card)
        db.set_card_active(conn, c["id"], False)
        await interaction.response.send_message(f"⏸️ Paused **{card_label(c)}**.", ephemeral=True)

    @watch.command(name="resume", description="Turn alerts back on for a paused card")
    @app_commands.autocomplete(card=card_autocomplete)
    async def watch_resume(interaction: discord.Interaction, card: int):
        c = get_card_or_fail(conn, card)
        db.set_card_active(conn, c["id"], True)
        await interaction.response.send_message(f"▶️ Watching **{card_label(c)}** again.", ephemeral=True)

    @watch.command(name="unmute", description="Undo a 'Mute card 24h' button press")
    @app_commands.autocomplete(card=card_autocomplete)
    async def watch_unmute(interaction: discord.Interaction, card: int):
        c = get_card_or_fail(conn, card)
        db.mute_card(conn, c["id"], None)
        await interaction.response.send_message(f"🔔 Unmuted **{card_label(c)}**.", ephemeral=True)

    # ----- /comps -----
    comps_group = app_commands.Group(name="comps", description="Sold prices that set each card's market value")

    @comps_group.command(name="add", description="Paste recent sold prices for a card")
    @app_commands.autocomplete(card=card_autocomplete)
    async def comps_add(interaction: discord.Interaction, card: int):
        await interaction.response.send_modal(CompsModal(bot, get_card_or_fail(conn, card)))

    @comps_group.command(name="show", description="Market value and recent comps for a card")
    @app_commands.autocomplete(card=card_autocomplete)
    async def comps_show(interaction: discord.Interaction, card: int):
        c = get_card_or_fail(conn, card)
        cfg = load_config()
        comps = db.list_comps(conn, c["id"])
        mv = market_value(comps, cfg["deal"])
        e = discord.Embed(title=card_label(c)[:256], color=GREEN if mv.ok else RED)
        e.add_field(name="Market value", value=money(mv.value))
        e.add_field(name="Comps used", value=f"{mv.comps_used if mv.ok else mv.comps_in_window} (last {cfg['deal']['comp_lookback_days']}d)")
        if mv.ok:
            e.add_field(name="Alerts at or under", value=money(mv.value * (1 - cfg["deal"]["min_discount_pct"] / 100)))
        e.add_field(name="Details", value=mv.reason[:1000], inline=False)
        if comps:
            rows = [f"{'~~' if x['excluded'] else ''}{x['sold_date']} · {money(x['price'])} + {money(x['shipping'])}"
                    f"{' · ' + x['note'] if x['note'] else ''}{'~~' if x['excluded'] else ''}" for x in comps[:12]]
            e.add_field(name=f"Recent comps ({len(comps)} total)", value="\n".join(rows)[:1024], inline=False)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Find more sold comps", style=discord.ButtonStyle.link, url=sold_search_url(c)))
        await interaction.response.send_message(embed=e, view=view, ephemeral=True)

    # ----- /settings -----
    settings_group = app_commands.Group(name="settings", description="Deal rules: discount, time window, comps")

    @settings_group.command(name="show", description="Current deal rules")
    async def settings_show(interaction: discord.Interaction):
        cfg = load_config()
        lines = [f"**{SETTING_LABELS[k]}:** {cfg[s][k]}" for s, k, *_ in EDITABLE]
        await interaction.response.send_message(embed=discord.Embed(title="Settings", description="\n".join(lines), color=GOLD),
                                                ephemeral=True)

    @settings_group.command(name="set", description="Change a deal rule (applies on the next check)")
    @app_commands.choices(setting=[app_commands.Choice(name=SETTING_LABELS[k], value=k) for _, k, *_ in EDITABLE])
    async def settings_set(interaction: discord.Interaction, setting: app_commands.Choice[str], value: str):
        try:
            key, val = coerce_setting(setting.value, value)
        except ValueError as e:
            raise app_commands.AppCommandError(str(e)) from None
        update_config_values({key: val})
        await interaction.response.send_message(f"✅ **{setting.name}** is now **{val}**.", ephemeral=True)

    tree.add_command(watch)
    tree.add_command(comps_group)
    tree.add_command(settings_group)

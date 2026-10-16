"""Discord side of membership: private alert spaces, plan roles, and the member-facing /profile and /plan commands."""
import logging
import re
from datetime import datetime, timedelta, timezone

import discord
from discord import app_commands

from . import db, members
from .alerts import card_label
from .config import load_config

log = logging.getLogger("dealfinder.members")
GOLD, GREEN, AMBER = 0xF5C518, 0x22C55E, 0xF59E0B
MEMBER_COMMANDS = {"profile", "plan"}  # everything else is owner-only


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "member").lower()).strip("-")
    return (s or "member")[:60]


def upgrade_view(cfg):
    url = (cfg.get("membership") or {}).get("upgrade_url")
    if not url:
        return discord.utils.MISSING
    v = discord.ui.View()
    v.add_item(discord.ui.Button(label="Upgrade / manage subscription", style=discord.ButtonStyle.link, url=url))
    return v


def plan_for_user(conn, cfg, user_id):
    m = db.get_member(conn, user_id)
    if not m or not m["active"]:
        return None, None
    return m, members.plan(cfg, m["tier"])


# ---------- private alert spaces ----------
async def _category_with_room(guild, name):
    cats = [c for c in guild.categories if c.name == name or re.fullmatch(re.escape(name) + r" \d+", c.name)]
    for c in cats:
        if len(c.channels) < 50:
            return c
    return await guild.create_category(name if not cats else f"{name} {len(cats) + 1}", overwrites={
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        guild.me: discord.PermissionOverwrite(view_channel=True, manage_channels=True)})


async def _thread_parent(guild, cfg):
    dcfg = cfg["delivery"]
    parent = discord.utils.get(guild.text_channels, name=dcfg["thread_parent"])
    if parent:
        return parent
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True, embed_links=True,
                                              create_private_threads=True, manage_threads=True,
                                              send_messages_in_threads=True),
    }
    for p in cfg["plans"].values():
        role = discord.utils.get(guild.roles, name=p.get("role") or "")
        if role:
            overwrites[role] = discord.PermissionOverwrite(view_channel=True, send_messages=False,
                                                           send_messages_in_threads=True, read_message_history=True)
    return await guild.create_text_channel(dcfg["thread_parent"], overwrites=overwrites,
                                           topic="Private deal alerts. You only see your own thread.")


async def existing_space(bot, row):
    if not row or not row.get("delivery_id") or row.get("delivery_kind") not in ("channel", "thread"):
        return None
    try:
        return bot.get_channel(int(row["delivery_id"])) or await bot.fetch_channel(int(row["delivery_id"]))
    except (discord.NotFound, discord.Forbidden, discord.HTTPException):
        return None


async def open_space(bot, guild, member, tier, source):
    """Create (or restore) a member's private alert channel/thread and activate them. Returns the member row."""
    cfg = load_config()
    conn = bot.conn
    row = db.get_member(conn, member.id)
    space = await existing_space(bot, row)
    member_ow = discord.PermissionOverwrite(view_channel=True, read_message_history=True, send_messages=False,
                                            use_application_commands=True)
    if isinstance(space, discord.Thread):
        if space.archived:
            await space.edit(archived=False)
        await space.add_user(member)
        kind = "thread"
    elif isinstance(space, discord.TextChannel):
        await space.set_permissions(member, overwrite=member_ow)
        kind = "channel"
    elif len(guild.channels) < cfg["delivery"]["max_channels"]:
        cat = await _category_with_room(guild, cfg["delivery"]["category_name"])
        space = await guild.create_text_channel(f"deals-{slug(member.name)}", category=cat, overwrites={
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            member: member_ow,
            guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True, embed_links=True,
                                                  read_message_history=True, manage_channels=True, manage_roles=True),
        }, topic=f"Private deal alerts for {member.display_name}")
        kind = "channel"
    else:
        parent = await _thread_parent(guild, cfg)
        if source == "manual":  # manual members have no plan role, so let them see the parent channel
            await parent.set_permissions(member, view_channel=True, send_messages=False,
                                         send_messages_in_threads=True, read_message_history=True)
        space = await parent.create_thread(name=f"deals-{slug(member.name)}", type=discord.ChannelType.private_thread,
                                           invitable=False, auto_archive_duration=10080)
        await space.add_user(member)
        kind = "thread"

    was_new = row is None or not row.get("delivery_id")
    row = db.upsert_member(conn, member.id, display_name=member.display_name, tier=tier, active=1, source=source,
                           delivery_kind=kind, delivery_id=str(space.id))
    p = members.plan(cfg, tier)
    if not db.list_profiles(conn, member.id):
        db.create_profile(conn, member.id, "My deals", members.default_filters(cfg, p))
    if was_new:
        await space.send(content=member.mention, embed=welcome_embed(cfg, p), view=upgrade_view(cfg),
                         allowed_mentions=discord.AllowedMentions(users=True))
    return row


async def close_space(bot, guild, discord_id):
    """Pause a member: hide their space and stop alerts (profiles are kept for if they come back)."""
    row = db.get_member(bot.conn, discord_id)
    if not row:
        return
    db.upsert_member(bot.conn, discord_id, active=0)
    space = await existing_space(bot, row)
    try:
        if isinstance(space, discord.Thread):
            await space.remove_user(discord.Object(id=int(discord_id)))
        elif isinstance(space, discord.TextChannel):
            m = guild.get_member(int(discord_id)) if guild else None
            if m:
                await space.set_permissions(m, overwrite=None)
    except discord.HTTPException as e:
        log.warning("Couldn't hide space for %s: %s", discord_id, e)


def welcome_embed(cfg, p):
    e = discord.Embed(title="Your private deal alerts", color=GOLD, description=(
        "Only you can see this space. Deals that match **your** filters show up here, and you get pinged for each one.\n\n"
        "**Get started**\n"
        "• `/profile list` - your filter profiles (you start with **My deals**)\n"
        "• `/profile show` - see exactly what a profile looks for\n"
        "• `/profile set` - change a filter, e.g. *Only these Pokémon* → `Charizard, Umbreon`\n"
        "• `/profile create` - add another profile (e.g. one for vintage, one for modern)\n"
        "• `/profile test` - see which recent deals a profile would have caught\n"
        "• `/plan` - your plan and its limits"))
    e.add_field(name="Your plan", value=plan_summary(p), inline=False)
    return e


def plan_summary(p):
    delay = int(p.get("alert_delay_seconds") or 0)
    return (f"**{p['label']}** · up to {p['max_profiles']} profiles · "
            f"{'instant alerts' if not delay else f'alerts after a {delay // 60 or 1}-minute delay'}\n"
            f"Deals {p['min_discount_floor']:g}%+ below market · up to {p['max_window_minutes']:g} min before the end · "
            f"cards worth ${p['min_value_floor']:g}+"
            f"{' · Japanese cards' if 'japanese' in p.get('features', []) else ''}")


async def sync_from_roles(bot, member):
    """Bring one member in line with their plan roles (called on role changes and at startup)."""
    cfg = load_config()
    if not (cfg.get("membership") or {}).get("roles_enabled"):
        return
    row = db.get_member(bot.conn, member.id)
    if row and row.get("source") in ("owner", "manual"):
        return
    tier = members.tier_from_roles(cfg, [r.name for r in member.roles])
    if tier:
        changed = not row or not row["active"] or row["tier"] != tier
        if changed:
            row = await open_space(bot, member.guild, member, tier, "role")
            if row and row.get("delivery_id"):
                space = await existing_space(bot, row)
                if space:
                    await space.send(embed=discord.Embed(title="Plan updated", color=GREEN,
                                                         description=plan_summary(members.plan(cfg, tier))))
    elif row and row["active"]:
        await close_space(bot, member.guild, member.id)


# ---------- commands ----------
async def profile_autocomplete(interaction, current):
    cur = current.lower()
    out = []
    for p in db.list_profiles(interaction.client.conn, interaction.user.id):
        label = f"{p['name']}{'' if p['active'] else ' (paused)'}"
        if cur in label.lower():
            out.append(app_commands.Choice(name=label[:100], value=p["id"]))
    return out[:25]


def own_profile(conn, user_id, profile_id):
    p = db.get_profile(conn, profile_id)
    if not p or p["discord_id"] != str(user_id):
        raise app_commands.AppCommandError("Profile not found. Pick one from the list as you type.")
    return p


def register_member_commands(bot):
    tree, conn = bot.tree, bot.conn

    @tree.command(name="plan", description="Your plan, its limits, and how many profiles you're using")
    async def plan_cmd(interaction: discord.Interaction):
        cfg = load_config()
        m, p = plan_for_user(conn, cfg, interaction.user.id)
        if not p:
            raise app_commands.AppCommandError("You don't have an active plan.")
        used = len(db.list_profiles(conn, interaction.user.id))
        e = discord.Embed(title="Your plan", color=GOLD, description=plan_summary(p))
        e.add_field(name="Profiles", value=f"{used} of {p['max_profiles']} used")
        await interaction.response.send_message(embed=e, view=upgrade_view(cfg), ephemeral=True)

    group = app_commands.Group(name="profile", description="Your deal filter profiles")

    @group.command(name="list", description="All your filter profiles")
    async def p_list(interaction: discord.Interaction):
        cfg = load_config()
        m, p = plan_for_user(conn, cfg, interaction.user.id)
        profs = db.list_profiles(conn, interaction.user.id)
        if not profs:
            await interaction.response.send_message("No profiles yet. Create one with `/profile create`.", ephemeral=True)
            return
        e = discord.Embed(title=f"Your profiles ({len(profs)} of {p['max_profiles']})", color=GOLD)
        for i, pr in enumerate(profs):
            over = i >= p["max_profiles"]
            state = "⏸️ paused" if not pr["active"] else ("⚠️ over your plan's limit (not running)" if over else "🟢 running")
            e.add_field(name=f"{pr['name']} · {state}", value=members.describe(members.clamp_to_plan(cfg, pr["filters"], p))[:1024],
                        inline=False)
        await interaction.response.send_message(embed=e, ephemeral=True)

    @group.command(name="create", description="Add a new filter profile (starts from the default filters)")
    async def p_create(interaction: discord.Interaction, name: str):
        cfg = load_config()
        m, p = plan_for_user(conn, cfg, interaction.user.id)
        if len(db.list_profiles(conn, interaction.user.id)) >= p["max_profiles"]:
            raise app_commands.AppCommandError(f"Your {p['label']} plan allows {p['max_profiles']} profiles. Upgrade for more.")
        name = name.strip()[:40] or "New profile"
        pid = db.create_profile(conn, interaction.user.id, name, members.default_filters(cfg, p))
        e = discord.Embed(title=f"Created “{name}”", color=GREEN,
                          description=members.describe(db.get_profile(conn, pid)["filters"]))
        e.set_footer(text="Change any filter with /profile set")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @group.command(name="show", description="Exactly what a profile looks for")
    @app_commands.autocomplete(profile=profile_autocomplete)
    async def p_show(interaction: discord.Interaction, profile: int):
        cfg = load_config()
        m, p = plan_for_user(conn, cfg, interaction.user.id)
        pr = own_profile(conn, interaction.user.id, profile)
        e = discord.Embed(title=pr["name"] + ("" if pr["active"] else " (paused)"), color=GOLD,
                          description=members.describe(members.clamp_to_plan(cfg, pr["filters"], p)))
        e.set_footer(text="Change a filter with /profile set")
        await interaction.response.send_message(embed=e, ephemeral=True)

    @group.command(name="set", description="Change one filter on a profile (takes effect on the next check)")
    @app_commands.autocomplete(profile=profile_autocomplete)
    @app_commands.choices(setting=[app_commands.Choice(name=label, value=key) for key, (_, label) in members.FILTER_SPEC.items()])
    @app_commands.describe(value="A number, on/off, or a comma-separated list. Use 'clear' to empty a list or remove a max.")
    async def p_set(interaction: discord.Interaction, profile: int, setting: app_commands.Choice[str], value: str):
        cfg = load_config()
        m, p = plan_for_user(conn, cfg, interaction.user.id)
        pr = own_profile(conn, interaction.user.id, profile)
        try:
            new = members.set_filter(cfg, members.with_defaults(cfg, pr["filters"], p), setting.value, value, p)
        except ValueError as e:
            raise app_commands.AppCommandError(str(e)) from None
        db.update_profile(conn, pr["id"], filters=new)
        e = discord.Embed(title=f"Updated “{pr['name']}”", color=GREEN, description=members.describe(new))
        await interaction.response.send_message(embed=e, ephemeral=True)

    @group.command(name="pause", description="Stop alerts from one profile (keeps its filters)")
    @app_commands.autocomplete(profile=profile_autocomplete)
    async def p_pause(interaction: discord.Interaction, profile: int):
        pr = own_profile(conn, interaction.user.id, profile)
        db.update_profile(conn, pr["id"], active=0)
        await interaction.response.send_message(f"⏸️ Paused **{pr['name']}**.", ephemeral=True)

    @group.command(name="resume", description="Turn a paused profile back on")
    @app_commands.autocomplete(profile=profile_autocomplete)
    async def p_resume(interaction: discord.Interaction, profile: int):
        pr = own_profile(conn, interaction.user.id, profile)
        db.update_profile(conn, pr["id"], active=1)
        await interaction.response.send_message(f"▶️ **{pr['name']}** is running again.", ephemeral=True)

    @group.command(name="rename", description="Rename a profile")
    @app_commands.autocomplete(profile=profile_autocomplete)
    async def p_rename(interaction: discord.Interaction, profile: int, name: str):
        pr = own_profile(conn, interaction.user.id, profile)
        db.update_profile(conn, pr["id"], name=name.strip()[:40] or pr["name"])
        await interaction.response.send_message(f"Renamed to **{name.strip()[:40]}**.", ephemeral=True)

    @group.command(name="delete", description="Delete a profile")
    @app_commands.autocomplete(profile=profile_autocomplete)
    async def p_delete(interaction: discord.Interaction, profile: int):
        pr = own_profile(conn, interaction.user.id, profile)
        db.delete_profile(conn, pr["id"])
        await interaction.response.send_message(f"🗑️ Deleted **{pr['name']}**.", ephemeral=True)

    @group.command(name="test", description="Which deals from the last 30 minutes this profile would have caught")
    @app_commands.autocomplete(profile=profile_autocomplete)
    async def p_test(interaction: discord.Interaction, profile: int):
        cfg = load_config()
        m, p = plan_for_user(conn, cfg, interaction.user.id)
        pr = own_profile(conn, interaction.user.id, profile)
        f = members.clamp_to_plan(cfg, pr["filters"], p)
        since = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat(timespec="seconds")
        deals = db.recent_deals(conn, since)
        hits = []
        for rec, card in deals:
            # judge the deal as it looked when found (its minutes-left then), so ended auctions still count here
            ok, _ = members.matches(f, rec, card, rec.get("minutes_left"))
            if ok:
                hits.append(f"[{card_label(card)}]({rec['url']}) · ${rec['total']:,.0f} vs ${rec['market_value']:,.0f} "
                            f"({rec['discount_pct']:.0f}% below)")
        if not deals:
            msg = "No deals found by the scanner in the last 30 minutes yet."
        elif not hits:
            msg = f"None of the {len(deals)} deals from the last 30 minutes match **{pr['name']}**."
        else:
            msg = f"**{pr['name']}** would have caught {len(hits)} of {len(deals)} recent deals:\n" + "\n".join(hits[:8])
        await interaction.response.send_message(msg[:1900], ephemeral=True)

    tree.add_command(group)

    # ----- owner: manual membership (for testing, comps, or before the website exists) -----
    mgroup = app_commands.Group(name="member", description="Owner: manage members")

    @mgroup.command(name="add", description="Give someone a plan and a private alert space (no website needed)")
    @app_commands.choices(tier=[app_commands.Choice(name=k.title(), value=k) for k in ("standard", "premium")])
    async def m_add(interaction: discord.Interaction, user: discord.Member, tier: app_commands.Choice[str]):
        await interaction.response.defer(ephemeral=True)
        try:
            row = await open_space(bot, interaction.guild, user, tier.value, "manual")
        except discord.Forbidden:
            raise app_commands.AppCommandError(
                "I'm missing permissions. Give the bot Manage Channels, Manage Roles, Create Private Threads "
                "and Manage Threads (see README 'Members').") from None
        await interaction.followup.send(f"✅ {user.mention} is on **{tier.name}** with their own space <#{row['delivery_id']}>.",
                                        ephemeral=True)

    @mgroup.command(name="remove", description="Pause someone's plan and hide their alert space")
    async def m_remove(interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        await close_space(bot, interaction.guild, user.id)
        await interaction.followup.send(f"Paused {user.mention}. Their profiles are kept if they come back.", ephemeral=True)

    @mgroup.command(name="list", description="All members, their plans and alert spaces")
    async def m_list(interaction: discord.Interaction):
        rows = db.list_members(conn)
        if not rows:
            await interaction.response.send_message("No members yet.", ephemeral=True)
            return
        lines = [f"{'🟢' if r['active'] else '⏸️'} <@{r['discord_id']}> · {r['tier']} · {r['source']} · "
                 f"{r['delivery_kind'] or '-'}{' <#' + r['delivery_id'] + '>' if r['delivery_id'] and r['delivery_kind'] != 'dm' else ''} · "
                 f"{len(db.list_profiles(conn, r['discord_id']))} profiles" for r in rows]
        await interaction.response.send_message(embed=discord.Embed(title=f"Members ({len(rows)})", color=GOLD,
                                                                    description="\n".join(lines)[:4000]), ephemeral=True)

    @mgroup.command(name="sync", description="Re-check everyone's plan roles now (needs roles_enabled)")
    async def m_sync(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        n = await bot.sync_all_roles()
        await interaction.followup.send(f"Checked {n} server members against plan roles.", ephemeral=True)

    tree.add_command(mgroup)

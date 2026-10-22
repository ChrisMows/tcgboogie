"""Watch the website from the bot server and tell the admin when it breaks.

On 2026-10-22 the host wiped the website's settings during a redeploy: the site stayed "up" but couldn't reach the
database or sign anyone in, and nobody knew until the admin looked. Every few minutes this asks the site's
/api/health (yes/no answers only; the details need DISPATCH_SECRET, the same value the website has). Two failures in a row send the admin a Discord message from BoogieBot; the site
recovering sends another. The bot reads the database directly, so it can still find the admin's Discord account
when the website itself can't.
"""
import logging
import os
import time

import requests

from . import shared

log = logging.getLogger("dealfinder.health")
DISCORD = "https://discord.com/api/v10"


def problem_of(resp_json, status):
    """What's wrong, in words, from /api/health's answer ("" when all is well)."""
    if status is None:
        return "the site didn't answer at all"
    j = resp_json or {}
    if status == 200 and j.get("ok"):
        return ""
    parts = []
    if j.get("database") is False:
        parts.append("it can't reach the database")
    if j.get("signIn") is False:
        parts.append("sign-in is switched off")
    if j.get("missingEssential"):
        parts.append("missing settings: " + ", ".join(j["missingEssential"]))
    return "; ".join(parts) or f"health check returned HTTP {status}"


class SiteHealth:
    def __init__(self, cfg):
        self.cfg = cfg
        self.next_at = 0
        self.fails = 0
        self.alerted = False

    def settings(self):
        h = self.cfg.get("health") or {}
        return (bool(h.get("enabled", True)), h.get("url", "https://tcgboogie.com/api/health"),
                int(h.get("every_minutes", 5)), h.get("admin_email", ""))

    def tick(self, now=None):
        """Call often; checks at most every few minutes. Returns the problem text ("" if fine, None if not due)."""
        on, url, every, _ = self.settings()
        now = now or time.time()
        if not on or now < self.next_at:
            return None
        self.next_at = now + every * 60
        try:
            secret = os.environ.get("DISPATCH_SECRET", "").strip()
            r = requests.get(url, timeout=20, headers={"Authorization": f"Bearer {secret}"} if secret else {})
            try:
                body = r.json()
            except ValueError:
                body = None
            problem = problem_of(body, r.status_code)
        except requests.RequestException:
            problem = problem_of(None, None)
        if problem:
            self.fails += 1
            log.warning("Website health check failed (%d in a row): %s", self.fails, problem)
            if self.fails >= 2 and not self.alerted:
                self.alerted = self.notify(f"⚠️ tcgboogie.com is having a problem: {problem}.\n"
                                           "If settings are missing: Hostinger → Environment variables → Import .env with your "
                                           "settings backup, then save.")
        else:
            if self.alerted:
                self.notify("✅ tcgboogie.com is working normally again.")
            self.fails, self.alerted = 0, False
        return problem

    def notify(self, text):
        """Discord DM to the admin. True if it was sent."""
        token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
        _, _, _, email = self.settings()
        discord_id = shared.discord_id_for(email) if email else None
        if not token or not discord_id:
            log.error("Can't message the admin about the website (no bot token or no Discord account for %s): %s", email, text)
            return False
        headers = {"Authorization": f"Bot {token}", "Content-Type": "application/json"}
        try:
            ch = requests.post(f"{DISCORD}/users/@me/channels", json={"recipient_id": str(discord_id)}, headers=headers, timeout=15)
            ch.raise_for_status()
            msg = requests.post(f"{DISCORD}/channels/{ch.json()['id']}/messages", json={"content": text}, headers=headers, timeout=15)
            msg.raise_for_status()
            log.info("Told the admin on Discord: %s", text.splitlines()[0])
            return True
        except requests.RequestException as e:
            log.error("Couldn't message the admin on Discord (%s): %s", e, text)
            return False

"""Runs the Discord bot, which also runs the deal finder. This is the main way to run everything.

  python run_bot.py
"""
import logging
import os
import sys

from run_finder import setup_logging


def main():
    setup_logging()
    logging.getLogger("discord").setLevel(logging.WARNING)
    logging.getLogger("discord.client").setLevel(logging.ERROR)  # hides "voice will NOT be supported" (no voice used)
    log = logging.getLogger("dealfinder")
    from dealfinder.config import load_config  # loads .env
    load_config()
    token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        log.error("DISCORD_BOT_TOKEN missing from .env - see README 'Discord bot setup'.")
        sys.exit(1)

    import discord
    from dealfinder.discord_bot import DealBot
    try:
        DealBot().run(token, log_handler=None)
    except discord.LoginFailure:
        log.error("Discord rejected the bot token. Reset it in the Developer Portal and update .env.")
        sys.exit(1)


if __name__ == "__main__":
    main()

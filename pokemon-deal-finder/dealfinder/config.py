"""Loads config.yaml plus secrets from .env."""
import os
import re
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.yaml"
DB_PATH = Path(os.getenv("DEALFINDER_DB") or ROOT / "data" / "dealfinder.db")
LOG_DIR = ROOT / "logs"

load_dotenv(ROOT / ".env")

# Bot-wide settings the dashboard and /settings may edit: (section, key, type, min, max).
# Per-person filters (discount, minutes left, value, grade, ...) live in filter profiles (/profile).
EDITABLE = [
    ("deal", "comp_lookback_days", int, 1, 365),
    ("deal", "min_comps", int, 1, 50),
    ("deal", "max_comp_spread", float, 0.01, 5),
    ("deal", "comp_refresh_days", int, 1, 365),
    ("poll", "interval_seconds", int, 30, 3600),
    ("red_flags", "min_seller_feedback_score", int, 0, 10_000_000),
    ("red_flags", "min_seller_feedback_pct", float, 0, 100),
    ("red_flags", "max_shipping", float, 0, 10_000),
    ("ebay", "buyer_zip", str, None, None),
    ("auto", "enabled", bool, None, None),
]


def coerce_setting(key, raw):
    """Validate a user-entered setting. Returns ((section, key), value) or raises ValueError."""
    for section, k, typ, lo, hi in EDITABLE:
        if k == key:
            raw = str(raw).strip().rstrip("%")
            if typ is bool:
                if raw.lower() in ("on", "true", "yes", "1"):
                    return (section, k), True
                if raw.lower() in ("off", "false", "no", "0"):
                    return (section, k), False
                raise ValueError(f"{key} must be on or off")
            if typ is str:
                if key == "buyer_zip" and not re.fullmatch(r"\d{5}", raw):
                    raise ValueError("ZIP must be 5 digits")
                return (section, k), raw
            try:
                val = typ(float(raw)) if typ is int else typ(raw)
            except ValueError:
                raise ValueError(f"{key} must be a number") from None
            if not lo <= val <= hi:
                raise ValueError(f"{key} must be between {lo} and {hi}")
            return (section, k), val
    raise ValueError(f"unknown setting {key}")


def load_config(path=CONFIG_PATH):
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    # The finder reads its scan thresholds from deal/auto. Until a check derives them from the active
    # profiles (members.scan_settings), they default to the new-profile defaults.
    d = cfg.setdefault("profile_defaults", {})
    cfg["deal"].setdefault("min_discount_pct", d.get("min_discount_pct", 30))
    cfg["deal"].setdefault("max_minutes_left", d.get("max_minutes_left", 10))
    a = cfg.setdefault("auto", {})
    for k, default in (("min_market_value", 30), ("min_grade", 7), ("graders", ["PSA", "BGS", "CGC", "SGC", "TAG"]),
                       ("languages", ["english"]), ("card_types", ["graded"]), ("min_raw_condition", "NM")):
        a.setdefault(k, d.get(k, default))
    cfg.setdefault("tcgplayer", {}).setdefault("affiliate_prefix", "")
    cfg["secrets"] = {
        "ebay_client_id": os.getenv("EBAY_CLIENT_ID", "").strip(),
        "ebay_client_secret": os.getenv("EBAY_CLIENT_SECRET", "").strip(),
        "discord_webhook_url": os.getenv("DISCORD_WEBHOOK_URL", "").strip(),
        "ppt_api_key": os.getenv("PPT_API_KEY", "").strip(),
    }
    return cfg


def update_config_values(updates, path=CONFIG_PATH):
    """Rewrite specific `key: value` lines in config.yaml, keeping comments intact.

    updates: {(section, key): value}
    """
    lines = Path(path).read_text(encoding="utf-8").splitlines(keepends=True)
    section = None
    out = []
    for line in lines:
        top = re.match(r"^([A-Za-z_]+):\s*(#.*)?$", line.rstrip("\r\n"))
        if top:
            section = top.group(1)
        m = re.match(r"^(\s+)([A-Za-z_]+):(\s*)([^#\r\n]*?)(\s*#.*)?(\r?\n)?$", line)
        if m and section and (section, m.group(2)) in updates:
            val = updates[(section, m.group(2))]
            sval = f'"{val}"' if isinstance(val, str) else str(val)
            comment = (m.group(5) or "").strip()
            line = f"{m.group(1)}{m.group(2)}: {sval}"
            if comment:
                line = line.ljust(30) + " " + comment
            line += m.group(6) or "\n"
        out.append(line)
    Path(path).write_text("".join(out), encoding="utf-8")

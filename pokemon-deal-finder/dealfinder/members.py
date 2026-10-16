"""Members, plans and filter profiles: scan wide once, then match each deal to every member's own filters."""
import copy
import logging
from datetime import datetime, timedelta, timezone

from . import db
from .auto import grade_number
from .parse import RAW_CONDITIONS, has_phrase, norm_text

CARD_TYPES = ["graded", "raw"]

log = logging.getLogger("dealfinder.members")

FILTER_LANGUAGES = ["english", "japanese"]  # what automatic identification supports

# key -> (kind, label). kind drives parsing/validation in set_filter().
FILTER_SPEC = {
    "min_discount_pct": ("number", "Min % below market"),
    "max_minutes_left": ("number", "Ends within (minutes)"),
    "min_market_value": ("number", "Min card value ($)"),
    "max_market_value": ("optional_number", "Max card value ($)"),
    "max_price": ("optional_number", "Max price incl. shipping ($)"),
    "card_types": ("card_types", "Card types (graded, raw)"),
    "min_raw_condition": ("raw_condition", "Lowest raw condition (NM/LP/MP/HP)"),
    "graders": ("graders", "Graders"),
    "min_grade": ("number", "Lowest grade"),
    "max_grade": ("number", "Highest grade"),
    "languages": ("languages", "Languages"),
    "pokemon": ("words", "Only these Pokémon / cards"),
    "exclude_pokemon": ("words", "Never these Pokémon / cards"),
    "sets": ("words", "Only these sets"),
    "exclude_sets": ("words", "Never these sets"),
    "min_comps": ("int", "Min sales behind the value"),
    "min_seller_feedback": ("int", "Min seller feedback score"),
    "us_only": ("bool", "US sellers only"),
    "hide_flagged": ("bool", "Hide listings with red flags"),
}


# ---------- plans ----------
def plan(cfg, tier):
    return (cfg.get("plans") or {}).get(tier)


def tier_from_roles(cfg, role_names):
    """Highest-rank plan whose role the member has, or None."""
    names = {r.lower() for r in role_names}
    best = None
    for key, p in (cfg.get("plans") or {}).items():
        role = (p.get("role") or "").lower()
        if role and role in names and (best is None or p.get("rank", 0) > cfg["plans"][best].get("rank", 0)):
            best = key
    return best


def allowed_graders(cfg):
    return [g for g in cfg["graders_allowed"] if g in ("PSA", "BGS", "CGC", "SGC", "TAG", "ACE")]


def default_filters(cfg, p):
    d = cfg.get("profile_defaults") or {}
    f = {
        "min_discount_pct": max(float(d.get("min_discount_pct", 30)), p["min_discount_floor"]),
        "max_minutes_left": min(float(d.get("max_minutes_left", 10)), p["max_window_minutes"]),
        "min_market_value": max(float(d.get("min_market_value", 30)), p["min_value_floor"]),
        "max_market_value": None, "max_price": None,
        "card_types": [t for t in d.get("card_types", ["graded"]) if t in CARD_TYPES] or ["graded"],
        "min_raw_condition": d.get("min_raw_condition", "NM") if d.get("min_raw_condition") in RAW_CONDITIONS else "NM",
        "graders": [g for g in d.get("graders", ["PSA"]) if g in allowed_graders(cfg)],
        "min_grade": float(d.get("min_grade", 7)), "max_grade": 10.0,
        "languages": [l for l in d.get("languages", ["english"]) if l in FILTER_LANGUAGES],
        "pokemon": [], "exclude_pokemon": [], "sets": [], "exclude_sets": [],
        "min_comps": int(cfg["deal"]["min_comps"]), "min_seller_feedback": 0,
        "us_only": False, "hide_flagged": False,
    }
    if "japanese" not in p.get("features", []):
        f["languages"] = ["english"]
    return f


def with_defaults(cfg, filters, p):
    """Fill in any keys missing from an older saved profile."""
    return {**default_filters(cfg, p), **(filters or {})}


def set_filter(cfg, filters, key, raw, p):
    """Return a copy of filters with one value changed, enforcing the member's plan. Raises ValueError."""
    if key not in FILTER_SPEC:
        raise ValueError(f"unknown filter {key}")
    kind, label = FILTER_SPEC[key]
    raw = str(raw).strip()
    f = dict(filters)

    def number(s):
        try:
            return float(s.replace("$", "").replace("%", "").replace(",", ""))
        except ValueError:
            raise ValueError(f"{label} needs a number") from None

    if kind == "number":
        v = number(raw)
        if key == "min_discount_pct":
            if v < p["min_discount_floor"]:
                raise ValueError(f"Your plan allows {p['min_discount_floor']:g}% or more. Upgrade for lower thresholds.")
            if v > 95:
                raise ValueError("Use 95% or less.")
        elif key == "max_minutes_left":
            if v > p["max_window_minutes"]:
                raise ValueError(f"Your plan allows up to {p['max_window_minutes']:g} minutes. Upgrade for earlier alerts.")
            if v < 1:
                raise ValueError("Use at least 1 minute.")
        elif key == "min_market_value":
            if v < p["min_value_floor"]:
                raise ValueError(f"Your plan covers cards worth ${p['min_value_floor']:g}+.")
        elif key in ("min_grade", "max_grade"):
            if not 1 <= v <= 10:
                raise ValueError("Grades go from 1 to 10.")
        f[key] = v
    elif kind == "optional_number":
        f[key] = None if raw.lower() in ("", "none", "off", "clear", "any") else number(raw)
    elif kind == "int":
        try:
            v = int(float(raw))
        except ValueError:
            raise ValueError(f"{label} needs a whole number") from None
        if v < 0 or (key == "min_comps" and not cfg["deal"]["min_comps"] <= v <= 200):
            raise ValueError(f"{label} must be between {cfg['deal']['min_comps']} and 200" if key == "min_comps" else f"{label} can't be negative")
        f[key] = v
    elif kind == "bool":
        if raw.lower() in ("on", "yes", "true", "1"):
            f[key] = True
        elif raw.lower() in ("off", "no", "false", "0"):
            f[key] = False
        else:
            raise ValueError(f"{label}: use on or off")
    elif kind == "raw_condition":
        v = raw.upper().replace("NEAR MINT", "NM").replace("LIGHTLY PLAYED", "LP").replace("MODERATELY PLAYED", "MP") \
            .replace("HEAVILY PLAYED", "HP").replace("DAMAGED", "DMG")
        if v not in RAW_CONDITIONS:
            raise ValueError("Use NM, LP, MP, HP or DMG")
        f[key] = v
    elif kind == "card_types":
        items = [x.strip().lower() for x in raw.split(",") if x.strip()]
        if not items or any(x not in CARD_TYPES for x in items):
            raise ValueError("Use graded, raw, or graded, raw")
        f[key] = items
    elif kind in ("graders", "languages", "words"):
        items = [] if raw.lower() in ("", "clear", "none", "any") else [x.strip() for x in raw.split(",") if x.strip()]
        if kind == "graders":
            items = [x.upper() for x in items]
            bad = [x for x in items if x not in allowed_graders(cfg)]
            if bad or not items:
                raise ValueError(f"Choose from: {', '.join(allowed_graders(cfg))}")
        elif kind == "languages":
            items = [x.lower() for x in items]
            bad = [x for x in items if x not in FILTER_LANGUAGES]
            if bad or not items:
                raise ValueError(f"Choose from: {', '.join(FILTER_LANGUAGES)}")
            if any(x != "english" for x in items) and "japanese" not in p.get("features", []):
                raise ValueError("Japanese cards are a Premium feature.")
        f[key] = items

    if f["min_grade"] > f["max_grade"]:
        raise ValueError("Lowest grade can't be above highest grade.")
    if f.get("max_market_value") is not None and f["max_market_value"] < f["min_market_value"]:
        raise ValueError("Max card value can't be below min card value.")
    return f


def clamp_to_plan(cfg, filters, p):
    """After a downgrade, pull a profile back inside the new plan's limits."""
    f = with_defaults(cfg, filters, p)
    f["min_discount_pct"] = max(f["min_discount_pct"], p["min_discount_floor"])
    f["max_minutes_left"] = min(f["max_minutes_left"], p["max_window_minutes"])
    f["min_market_value"] = max(f["min_market_value"], p["min_value_floor"])
    if "japanese" not in p.get("features", []):
        f["languages"] = ["english"]
    return f


def describe(filters):
    f = filters
    money = lambda v: "any" if v is None else f"${v:,.0f}"  # noqa: E731
    lines = [
        f"**Deal:** {f['min_discount_pct']:g}%+ below market · ends within {f['max_minutes_left']:g} min",
        f"**Card value:** {money(f['min_market_value'])} to {money(f.get('max_market_value'))} · max price {money(f.get('max_price'))}",
        f"**Card types:** {', '.join(t.title() for t in f.get('card_types', ['graded']))}"
        + (f" · raw {f.get('min_raw_condition', 'NM')} or better" if "raw" in f.get("card_types", []) else ""),
        f"**Grading:** {', '.join(f['graders'])} · grade {f['min_grade']:g}–{f['max_grade']:g}",
        f"**Languages:** {', '.join(l.title() for l in f['languages'])}",
    ]
    if f["pokemon"] or f["exclude_pokemon"]:
        lines.append(f"**Pokémon/cards:** only {', '.join(f['pokemon']) or 'any'}"
                     + (f" · never {', '.join(f['exclude_pokemon'])}" if f["exclude_pokemon"] else ""))
    if f["sets"] or f["exclude_sets"]:
        lines.append(f"**Sets:** only {', '.join(f['sets']) or 'any'}"
                     + (f" · never {', '.join(f['exclude_sets'])}" if f["exclude_sets"] else ""))
    lines.append(f"**Confidence:** {f['min_comps']}+ sales · seller feedback {f['min_seller_feedback']}+"
                 + (" · US only" if f["us_only"] else "") + (" · hide red flags" if f["hide_flagged"] else ""))
    return "\n".join(lines)


# ---------- the wide scan ----------
def active_profiles(conn, cfg):
    """[(member, plan, profile)] for every active profile of every active member."""
    out = []
    for m in db.list_members(conn, active_only=True):
        p = plan(cfg, m["tier"])
        if not p:
            continue
        for prof in db.list_profiles(conn, m["discord_id"], active_only=True)[: p["max_profiles"]]:
            prof["filters"] = clamp_to_plan(cfg, prof["filters"], p)
            out.append((m, p, prof))
    return out


def scan_settings(cfg, profiles):
    """Config for one eBay check: as wide as the loosest active profile, never wider than scan_limits."""
    if not profiles:
        return None
    lim = cfg.get("scan_limits") or {}
    fs = [prof["filters"] for _, _, prof in profiles]
    c = copy.deepcopy(cfg)
    c["deal"]["min_discount_pct"] = max(min(f["min_discount_pct"] for f in fs), lim.get("min_discount_pct", 10))
    c["deal"]["max_minutes_left"] = min(max(f["max_minutes_left"] for f in fs), lim.get("max_minutes_left", 60))
    c["auto"]["min_market_value"] = max(min(f["min_market_value"] for f in fs), lim.get("min_market_value", 10))
    c["auto"]["min_grade"] = min(f["min_grade"] for f in fs)
    c["auto"]["graders"] = sorted({g for f in fs for g in f["graders"]})
    c["auto"]["languages"] = sorted({l for f in fs for l in f["languages"]})
    c["auto"]["card_types"] = sorted({t for f in fs for t in f.get("card_types", ["graded"])})
    raw_fs = [f for f in fs if "raw" in f.get("card_types", [])]
    c["auto"]["min_raw_condition"] = (max((f.get("min_raw_condition", "NM") for f in raw_fs), key=RAW_CONDITIONS.index)
                                      if raw_fs else "NM")
    return c


def minutes_until(end_time, now=None):
    if not end_time:
        return None
    end = datetime.fromisoformat(str(end_time).replace("Z", "+00:00"))
    return (end - (now or datetime.now(timezone.utc))).total_seconds() / 60


def matches(filters, rec, card, minutes_left):
    """Does a deal pass one profile? Returns (bool, reason)."""
    f = filters
    disc = rec.get("discount_pct") or 0
    if disc < f["min_discount_pct"]:
        return False, f"{disc:.0f}% below < {f['min_discount_pct']:g}%"
    if minutes_left is None or minutes_left > f["max_minutes_left"] or minutes_left <= 0:
        return False, "outside time window"
    mv = rec.get("market_value") or 0
    if mv < f["min_market_value"] or (f.get("max_market_value") is not None and mv > f["max_market_value"]):
        return False, "card value outside range"
    if f.get("max_price") is not None and (rec.get("total") or 0) > f["max_price"]:
        return False, "over max price"
    kind = card.get("kind") or "graded"
    if kind not in f.get("card_types", ["graded"]):
        return False, f"{kind} cards not selected"
    if kind == "raw":
        cond = card.get("grade")
        lowest = f.get("min_raw_condition", "NM")
        if cond not in RAW_CONDITIONS or RAW_CONDITIONS.index(cond) > RAW_CONDITIONS.index(lowest):
            return False, "raw condition below what you chose"
    else:
        if (card.get("grader") or "").upper() not in f["graders"]:
            return False, "grader not selected"
        g = grade_number(card.get("grade"))
        if g is None or not f["min_grade"] <= g <= f["max_grade"]:
            return False, "grade outside range"
    if (card.get("language") or "english") not in f["languages"]:
        return False, "language not selected"
    name_text = norm_text(f"{card.get('name', '')} {rec.get('title', '')}")
    set_text = norm_text(f"{card.get('set_name', '')} {rec.get('title', '')}")
    if f["pokemon"] and not any(has_phrase(name_text, w) for w in f["pokemon"]):
        return False, "not one of the chosen Pokémon/cards"
    if any(has_phrase(name_text, w) for w in f["exclude_pokemon"]):
        return False, "excluded Pokémon/card"
    if f["sets"] and not any(has_phrase(set_text, w) for w in f["sets"]):
        return False, "not one of the chosen sets"
    if any(has_phrase(set_text, w) for w in f["exclude_sets"]):
        return False, "excluded set"
    if (rec.get("comps_used") or 0) < f["min_comps"]:
        return False, "too few sales behind the value"
    if (rec.get("feedback_score") or 0) < f["min_seller_feedback"]:
        return False, "seller feedback too low"
    country = ((rec.get("reason") or {}).get("listing_country") or "").upper()
    if f["us_only"] and country and country != "US":
        return False, "seller outside the US"
    if f["hide_flagged"] and rec.get("flags"):
        return False, "has red flags"
    return True, "match"


class Dispatcher:
    """Receives every deal from the wide scan and queues it for each member whose profile matches."""

    def __init__(self, conn, get_cfg, wake=None):
        self.conn, self.get_cfg, self.wake = conn, get_cfg, wake

    def handle(self, rec, card):
        cfg = self.get_cfg()
        now = datetime.now(timezone.utc)
        db.save_deal(self.conn, rec, card)
        db.record_alert(self.conn, rec)  # global log of deals found (first sighting)
        queued = 0
        seen = set()
        mins = minutes_until(rec.get("end_time"), now)
        for member, p, prof in active_profiles(self.conn, cfg):
            if member["discord_id"] in seen:
                continue
            ok, _ = matches(prof["filters"], rec, card, mins)
            if not ok:
                continue
            delay = int(p.get("alert_delay_seconds") or 0)
            if mins is not None and mins - delay / 60 < 0.5:
                continue  # would arrive after (or right as) the auction ends
            send_after = (now + timedelta(seconds=delay)).isoformat(timespec="seconds")
            if db.queue_delivery(self.conn, member["discord_id"], rec["item_id"], prof["id"], prof["name"], send_after):
                queued += 1
            seen.add(member["discord_id"])
        if queued and self.wake:
            self.wake()
        return bool(seen)  # matched at least one member (newly queued or already sent earlier)

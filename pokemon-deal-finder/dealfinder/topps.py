"""Topps Pokémon cards: the typical eBay asking price for each card, for the website's Topps catalog.

Topps cards (1999-2004) aren't Pokémon TCG cards, so PokemonPriceTracker doesn't price them, and eBay doesn't share
sold prices with apps like ours. So every few days each card gets one eBay search of current Buy It Now listings;
the listings that are really that card (raw, single, the right set, number and printing) give a median asking price,
a low-high range and a photo, saved in the website's topps_price table (web/lib/topps.js shows them).

The checklist (topps.json, the same file as web/lib/data/topps.json) comes from Bulbapedia's Topps set pages.
eBay calls are budgeted: `topps.daily_calls` a day, at most `topps.max_per_check` per bot check. Cards nobody has
priced yet go first, then cards members own, then the oldest prices.
"""
import json
import logging
import os
import re
import statistics
import time
from datetime import datetime, timezone

from . import shared
from .ebay import SEARCH_URL
from .parse import has_phrase, norm_text

log = logging.getLogger("dealfinder.topps")

_HERE = os.path.dirname(os.path.abspath(__file__))

# Never a single raw copy at its plain price: lots, graded copies, and parallels priced on their own.
NOT_SINGLE = ["lot", "lots", "complete set", "full set", "set of", "you pick", "u pick", "pick your", "pick a card", "choose",
              "select your", "bundle", "binder", "repack", "mystery", "proxy", "reprint", "custom", "fake", "empty", "sealed",
              "pack", "box", "wrapper", "album", "uncut", "sheet", "jumbo", "oversized", "tin topper", "photograph", "poster",
              # the value is for a Near Mint copy: badly worn ones would drag it down
              "damaged", "heavily played", "hp", "poor", "creased", "crease", "torn", "water damage",
              # Topps printed some sets in other languages too: the value is for the English card
              "italian", "italiano", "german", "deutsch", "french", "francais", "spanish", "espanol", "dutch", "japanese"]
GRADED = ["psa", "cgc", "bgs", "sgc", "beckett", "graded", "slab", "slabbed", "gem mint", "ace grading", "tag grading", "ags"]
PARALLELS = ["foil", "holo", "holographic", "rainbow", "silver", "spectra", "sparkle", "tekno", "refractor", "die cut",
             "diecut", "die-cut", "pop up", "pop-up", "clear", "hologram", "sunrays", "flames", "pokeballs"]
STOP = {"the", "a", "an", "of", "and", "is", "on", "in", "to", "for", "it", "s", "vs"}


def load_checklist():
    with open(os.path.join(_HERE, "topps.json"), encoding="utf8") as f:
        data = json.load(f)
    sets = {s["code"]: s for s in data["sets"]}
    return [{"id": c[0], "code": c[1], "number": c[2], "name": c[3], "section": c[4], "set": sets[c[1]]} for c in data["cards"]]


def _words(s):
    return [w for w in norm_text(s).split() if w not in STOP and re.search(r"[a-z0-9]", w)]


def number_ok(card, title_norm):
    """The card's number is in the title: "#6", "no. 6", "6/76" or a lone 6; "TV5" / "tv 5"; "Snap 01" / "snap1"."""
    t = title_norm
    t = re.sub(r"\b(series|ser)\s*\d\b", " ", t)          # "series 1" isn't card #1
    t = re.sub(r"\b(19|20)\d\d\b", " ", t)                 # years
    t = re.sub(r"\b\d(st|nd|rd|th)\b", " ", t)             # "1st print"
    num = norm_text(card["number"]).replace(" ", "")
    m = re.match(r"^([a-z]*)0*(\d+)$", num)
    if not m:
        return has_phrase(t, card["number"])
    prefix, digits = m.groups()
    if prefix:
        return re.search(rf"(?<![a-z0-9]){prefix}\s*-?\s*0*{digits}(?![0-9])", t) is not None
    return re.search(rf"(?<![a-z0-9])#?0*{digits}(?![0-9])", t) is not None


def name_ok(card, title_norm):
    """The card's name is in the title: every word for short names, most of them for long episode titles."""
    ws = [w for w in _words(card["name"]) if len(w) > 1]
    if not ws:
        return True
    found = sum(1 for w in ws if has_phrase(title_norm, w))
    return found == len(ws) if len(ws) <= 3 else found >= max(3, round(len(ws) * 0.7))


def set_ok(card, title_norm):
    """Not another Topps set's copy of the same Pokémon (Chrome, Johto, Advanced, the movies, another series)."""
    code, t = card["code"], title_norm
    chrome, johto = has_phrase(t, "chrome"), has_phrase(t, "johto")
    if (code in ("c1", "c2")) != chrome:
        return False
    if (code in ("j1", "j3", "jl")) != johto:
        return False
    if code in ("ad", "ac") and not has_phrase(t, "advanced"):
        return False
    if code == "ad" and has_phrase(t, "challenge"):
        return False
    if code == "ac" and not has_phrase(t, "challenge"):
        return False
    if code not in ("ad", "ac") and has_phrase(t, "advanced"):
        return False
    movie = has_phrase(t, "movie") or has_phrase(t, "power of one")
    if (code in ("fm", "m2")) != movie:
        return False
    if code == "fm" and (has_phrase(t, "power of one") or has_phrase(t, "movie 2000")):
        return False
    if code == "m2" and not (has_phrase(t, "2000") or has_phrase(t, "power of one")):
        return False
    series = re.findall(r"\bseries\s*([123])\b", t)
    want = {"s1": "1", "s2": "2", "s3": "3", "c1": "1", "c2": "2", "j1": "1", "j3": "3"}.get(code)
    if series and want and want not in series:
        return False
    if code == "jl" and not has_phrase(t, "league"):
        return False
    return True


def listing_matches(card, title):
    """Is this listing a single raw copy of exactly this card, in its plain printing?"""
    t = norm_text(title)
    if not has_phrase(t, "topps"):
        return False
    t = re.sub(r"(?<![a-z0-9])non\s?-?\s?(holo|foil)\b", " ", t)  # "non holo" / "non-foil" is the plain printing
    # The First Movie's "E6 of 12" evolution inserts are another card with the same Pokémon and number.
    if re.search(r"(?<![a-z0-9])e\s?\d{1,2}(?![0-9])|\bof 12\b", t) and not card["number"].lower().startswith("e"):
        return False
    own = norm_text(f"{card['name']} {card['section']}")  # a word in the card's own name or kind isn't a red flag
    banned = [w for w in NOT_SINGLE + GRADED + PARALLELS + ["sticker"] if not has_phrase(own, w)]
    if any(has_phrase(t, w) for w in banned):
        return False
    return name_ok(card, t) and number_ok(card, t) and set_ok(card, t)


def _price(item):
    try:
        p = item.get("price") or {}
        return round(float(p["value"]), 2) if p.get("currency", "USD") == "USD" else None
    except (KeyError, TypeError, ValueError):
        return None


def summarize(card, items):
    """The matching listings' typical asking price: {price, low, high, listings, image} (price None under 2)."""
    prices, image = [], None
    for it in items:
        if "FIXED_PRICE" not in (it.get("buyingOptions") or []) or not listing_matches(card, it.get("title", "")):
            continue
        p = _price(it)
        if p and p > 0:
            prices.append(p)
            image = image or (it.get("image") or {}).get("imageUrl")
    if len(prices) < 2:
        return {"price": None, "low": None, "high": None, "listings": len(prices), "image": image}
    mid = statistics.median(prices)
    kept = [p for p in prices if mid / 3 <= p <= mid * 3]  # a typo or a "best offer" placeholder doesn't move it
    return {"price": round(statistics.median(kept), 2), "low": min(kept), "high": max(kept), "listings": len(kept), "image": image}


def query_for(card):
    hint = {"c1": "chrome", "c2": "chrome", "j1": "johto", "j3": "johto", "jl": "johto league", "ad": "advanced",
            "ac": "advanced challenge", "fm": "movie", "m2": "movie 2000"}.get(card["code"], "")
    return re.sub(r"\s+", " ", f"topps pokemon {hint} {card['name']} {card['number']}").strip()


class ToppsPricer:
    def __init__(self, cfg, ebay):
        self.cfg, self.ebay = cfg, ebay
        self.cards = load_checklist()
        self.day, self.calls = None, 0

    def settings(self):
        s = self.cfg.get("topps") or {}
        return bool(s.get("enabled", True)), int(s.get("daily_calls", 300)), int(s.get("max_per_check", 3)), float(s.get("refresh_days", 7))

    def due(self, limit, refresh_days):
        """Cards to price now: never priced, then owned by a member, then the oldest, skipping fresh ones."""
        checked = shared.topps_checked()
        if checked is None:
            return []
        owned = shared.topps_owned()
        stale = time.time() - refresh_days * 86400
        todo = [c for c in self.cards if c["id"] not in checked or checked[c["id"]] < stale]
        todo.sort(key=lambda c: (c["id"] in checked, c["id"] not in owned, checked.get(c["id"], 0)))
        return todo[:limit]

    def run(self):
        """One round: price the cards that are due. Returns how many were checked."""
        enabled, daily, per_check, refresh_days = self.settings()
        today = datetime.now(timezone.utc).date()
        if self.day != today:
            self.day, self.calls = today, 0
        if not enabled or self.calls >= daily:
            return 0
        done = 0
        for card in self.due(min(per_check, daily - self.calls), refresh_days):
            self.calls += 1
            try:
                j = self.ebay._get(SEARCH_URL, {"q": query_for(card), "filter": "buyingOptions:{FIXED_PRICE},deliveryCountry:US", "limit": 100})
            except Exception as e:  # noqa: BLE001 - one card's search must not stop the others
                log.warning("Topps price search failed for %s: %s", card["id"], e)
                continue
            result = summarize(card, j.get("itemSummaries") or [])
            shared.save_topps_price(card["id"], result)
            done += 1
        return done

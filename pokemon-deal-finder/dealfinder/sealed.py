"""Sealed product deals: booster boxes, Elite Trainer Boxes, bundles, tins, collections and packs.

Every few checks (sealed.every_n_checks) the bot looks at Pokemon sealed auctions ending soon in eBay's sealed
categories and, for each one:
  1. skips what can't be priced as one sealed product: lots, cases sold as boxes, opened/empty boxes, other languages;
  2. finds the set the title names (from the catalog's set list) and the product type (box, ETB, bundle, tin...);
  3. picks the one sealed product in that set with that type (the website's set-page lookup, shared and cached);
  4. values it at the TCGplayer sealed price and hands it to the same deal checks as cards (discount, time left, photo).
Anything ambiguous is skipped: a wrong match on a $150 box is worse than a missed deal.
"""
import logging
import re
import unicodedata

from .finder import minutes_left
from .parse import Listing
from .ppt import PPTError, PPTOutOfCredits

log = logging.getLogger("dealfinder.sealed")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " ").replace("'", "")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


# Product types, most specific first. Each: (type, patterns that mark it in a listing title or a product name).
TYPES = [
    ("case", [r"\bcases?\b"]),
    ("display", [r"\bdisplay\b"]),
    ("booster box", [r"\bbooster box\b", r"\bbooster display\b", r"\b36 packs?\b"]),
    ("pokemon center etb", [r"\bpokemon center\b.*\b(elite trainer box|etb)\b", r"\b(elite trainer box|etb)\b.*\bpokemon center\b", r"\bpc etb\b"]),
    ("etb", [r"\belite trainer box\b", r"\betb\b"]),
    ("booster bundle", [r"\bbooster bundle\b"]),
    ("ultra premium collection", [r"\bultra premium collection\b", r"\bupc\b"]),
    ("premium collection", [r"\bpremium collection\b"]),
    ("mini tin", [r"\bmini tins?\b"]),
    ("tin", [r"\btins?\b"]),
    ("build battle", [r"\bbuild battle\b", r"\bprerelease\b"]),
    ("blister", [r"\bblister\b", r"\bcheck ?lane\b", r"\bsleeved booster\b"]),
    ("collection", [r"\bcollection\b", r"\bbox set\b"]),
    ("booster pack", [r"\bbooster pack\b", r"\bpack\b"]),
]

# Titles we never price as a single sealed product.
SKIP = [
    (r"\blots?\b|\blot of\b|\bbundle of\b|\bset of \d|\b\d+\s?x\b|\bx\s?\d+\b|\((?:[2-9]|1\d)\)|\b\d+ (boxes|etbs|tins|bundles)\b", "more than one item"),
    (r"\bempty\b|\bopened\b|\bunsealed\b|\bno (packs|cards)\b|\bbox only\b|\bpacks only\b|\bcards only\b|\bart only\b", "opened or incomplete"),
    (r"\bresealed\b|\brepack|\bmystery\b|\bcustom\b|\bproxy\b|\bfan made\b|\bgrab bag\b", "repack or custom product"),
    (r"\bjapanese\b|\bjapan\b|\bkorean\b|\bchinese\b|\bthai\b|\bgerman\b|\bfrench\b|\bspanish\b|\bitalian\b|\bportuguese\b|\bindonesian\b|\bjpn?\b|\bkor\b", "not English"),
    (r"\bcode cards?\b|\bdigital\b|\bonline\b", "codes only"),
]
WARN = [
    (r"\bdamaged\b|\bdent|\bcrush|\btear\b|\btorn\b|\brip\b", "Box damage mentioned: check the photos of the box and shrink wrap"),
    (r"\bno shrink\b|\bwithout shrink\b|\bshrink (missing|damaged|torn)\b", "Shrink wrap missing or damaged: higher risk it was opened and resealed"),
]


def product_type(text):
    t = norm(text)
    for kind, pats in TYPES:
        if any(re.search(p, t) for p in pats):
            return kind
    return None


def skip_reason(title):
    t = norm(title)
    for pat, why in SKIP:
        if re.search(pat, t):
            return why
    return None


def warnings(title):
    t = norm(title)
    return [w for pat, w in WARN if re.search(pat, t)]


ERA_PREFIX = ("scarlet violet ", "sword shield ", "sun moon ", "mega evolution ")
# Words that name an era rather than a set: "Mega Evolution Pitch Black" is Pitch Black, not the Mega Evolution set.
ERA_WORDS = {"scarlet", "violet", "sword", "shield", "sun", "moon", "mega", "evolution", "xy", "black", "white", "diamond",
             "pearl", "heartgold", "soulsilver", "platinum"}
NOISE = {"pokemon", "tcg", "the", "and", "of", "set", "base", "promo", "promos", "cards", "card", "collection", "trainer"}


def set_names(full):
    """Ways a title can name a set: 'SWSH09: Brilliant Stars' -> ['brilliant stars']; 'SV: Scarlet & Violet 151' ->
    ['scarlet violet 151', '151']."""
    m = re.match(r"^[A-Z]{1,5}[0-9]{0,3}[a-z]?\s*(?::|\s-\s)\s*(.+)$", full or "")
    clean = norm(m.group(1) if m else full)
    out = [clean]
    for pre in ERA_PREFIX:
        if clean.startswith(pre) and len(clean) > len(pre) + 2:
            out.append(clean[len(pre):])  # "151", "base set" stays tied to its era name below
    return [n for n in out if n and n not in ("base set",)]


# What sellers call a set, when it isn't the catalog's name.
ALIASES = {"30th anniversary": "ME: 30th Celebration"}


def find_set(title, sets):
    """The set a title names: every word of one of its names is in the title. The most specific name wins (most
    words that aren't era words, then the longest). Returns the catalog set name, or None (also on a tie)."""
    t = norm(title)
    for alias, name in ALIASES.items():
        if alias in t and any(s.get("name") == name for s in sets):
            return name
    words = set(t.split())
    best, best_score, tie = None, (0, 0), False
    for s in sets:
        for name in set_names(s.get("name", "")):
            toks = [w for w in name.split() if w not in NOISE] or name.split()
            if toks and all(w in words for w in toks):
                score = (sum(1 for w in toks if w not in ERA_WORDS), len(" ".join(toks)))
                if score > best_score:
                    best, best_score, tie = s["name"], score, False
                elif score == best_score and s["name"] != best:
                    tie = True
    return None if tie else best


def pick_product(title, set_name, products):
    """The one sealed product in the set that this title describes. Returns (product, reason)."""
    kind = product_type(title)
    if not kind:
        return None, "couldn't tell what kind of sealed product this is"
    t_norm = norm(title)
    kinds = {k for k, pats in TYPES if k not in ("collection", "booster pack", "tin") and any(re.search(p, t_norm) for p in pats)}
    # A case or display holds the item it's made of ("Booster Bundle Display"); a Pokemon Center ETB is also an ETB.
    for holder in ("case", "display"):
        if holder in kinds:
            kinds = {holder}
    if "pokemon center etb" in kinds:
        kinds.discard("etb")
    if "ultra premium collection" in kinds:
        kinds.discard("premium collection")
    if len(kinds) > 1:
        return None, "the title names more than one product"
    t = set(norm(title).split())
    same = [p for p in products if product_type(p.get("name")) == kind and "bulk" not in norm(p.get("name"))]
    if not same:
        return None, f"no {kind} found for {set_name}"
    if len(same) == 1:
        return same[0], f"{kind} from {set_name}"
    # Several of that type (e.g. collections with different Pokemon): the product's own words must pick one.
    set_words = set(norm(set_name).split())
    type_words = {"elite", "trainer", "box", "etb", "booster", "bundle", "collection", "premium", "ultra", "tin", "mini", "pack",
                  "blister", "display", "case", "pokemon", "center", "sleeved", "build", "battle"}
    scored = []
    for p in same:
        own = [w for w in norm(p.get("name")).split() if w not in set_words and w not in type_words and len(w) > 2]
        hits = sum(1 for w in own if w in t)
        scored.append((hits, len(own), p))
    scored.sort(key=lambda x: (-x[0], x[1]))
    if scored[0][0] == 0:
        # The title names no special version: that's the plain product ("Prismatic Evolutions Elite Trainer Box", not
        # the Dollar General Exclusive or the Pack Art Bundle), when the set has exactly one.
        plain = [p for hits, n_own, p in scored if n_own == 0]
        if len(plain) == 1:
            return plain[0], f"{kind} from {set_name}"
        return None, f"several {kind} products in {set_name}; the title doesn't say which"
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        return None, f"several {kind} products in {set_name}; the title doesn't say which"
    return scored[0][2], f"{kind} from {set_name}"


class SealedValue:
    """The market value of a sealed product, shaped like comps.market_value's result (what evaluate() reads)."""
    def __init__(self, price, name):
        self.ok = bool(price)
        self.value = float(price) if price else None
        self.comps_used = 0
        self.comps_in_window = 0
        self.outliers_dropped = 0
        self.low = self.high = self.value
        self.spread = 0
        self.latest_sale = None
        self.reason = f"TCGplayer sealed market price for {name}" if price else "no TCGplayer sealed price"


class SealedScanner:
    def __init__(self, finder):
        self.finder = finder
        self.checks = 0

    def settings(self):
        s = self.finder.cfg.get("sealed") or {}
        return bool(s.get("enabled", True)), int(s.get("every_n_checks", 3)), [str(c) for c in s.get("categories", [261044, 183456])]

    def due(self):
        on, every, _ = self.settings()
        types = ((self.finder.cfg.get("auto") or {}).get("card_types")) or []
        self.checks += 1
        return on and "sealed" in types and self.checks % max(1, every) == 0

    def run(self, stats):
        """One sealed round (only on every Nth check). Adds to the check's stats."""
        if not self.due():
            return
        f = self.finder
        ppt = f._ppt()
        if not ppt:
            return
        try:
            sets = ppt.sets()
        except (PPTOutOfCredits, PPTError) as e:
            log.info("Sealed round skipped: %s", e)
            return
        _, _, categories = self.settings()
        window = max(f.cfg["poll"]["search_window_minutes"], f.cfg["deal"]["max_minutes_left"] + 2)
        seen = 0
        for cat in categories:
            for s in f.ebay.search_ending_sealed(cat, window):
                seen += 1
                try:
                    self.check_one(s, sets, ppt, stats)
                except PPTOutOfCredits as e:
                    f._note_paused(e, stats)
                    return
                except PPTError as e:
                    log.warning("Sealed price lookup failed: %s", e)
                    return
        stats["sealed_listings"] = seen
        log.info("Sealed round: %d ending auctions checked", seen)

    def check_one(self, s, sets, ppt, stats):
        f = self.finder
        title = s.get("title", "")
        try:
            mins = minutes_left(s["itemEndDate"])
        except (KeyError, ValueError):
            return
        if mins <= 0 or mins > f.cfg["deal"]["max_minutes_left"]:
            return
        listing = Listing(s)
        price = listing.price()
        if price is None or skip_reason(title):
            return
        set_name = find_set(title, sets)
        if not set_name:
            return
        product, why = pick_product(title, set_name, ppt.sealed_in_set(set_name))
        if not product:
            log.debug("Sealed skip: %s (%s)", title, why)
            return
        value = product.get("unopenedPrice") or (product.get("prices") or {}).get("market")
        a = f.cfg["auto"]
        if not value or float(value) < float(a.get("min_market_value", 10)):
            return
        total = price + (listing.shipping()[0] or 0)
        if total > float(value) * (1 - f.cfg["deal"]["min_discount_pct"] / 100):
            return  # not cheap enough: no need for item details
        stats["candidates"] += 1
        listing = Listing(s, f._detail(s["itemId"]))  # all photos and the seller details, for the checks
        pid = str(product.get("tcgPlayerId"))
        ident = {"id": None, "kind": "sealed", "name": product.get("name", ""), "set_name": set_name, "card_number": "",
                 "variants": "", "language": "english", "grader": "Sealed", "grade": "product",
                 "tcgplayer_url": product.get("tcgPlayerUrl") or f"https://www.tcgplayer.com/product/{pid}",
                 "tcgplayer_affiliate": False, "product_id": pid, "extra_flags": warnings(title)}
        f._finish(listing, ident, SealedValue(value, product.get("name")), f"identified as {why}: {product.get('name')}", stats)

"""Turns an eBay listing (Browse API JSON) into structured card facts and checks it against a watchlist card."""
import re
import unicodedata

# Order matters: more specific Beckett labels before the generic "beckett".
GRADER_PATTERNS = [
    ("BVG", [r"\bbvg\b", r"beckett vintage"]),
    ("BCCG", [r"\bbccg\b", r"beckett collectors club"]),
    ("BGS", [r"\bbgs\b", r"beckett grading services", r"\bbeckett\b"]),
    ("CSG", [r"\bcsg\b", r"certified sports guaranty"]),
    ("CGC", [r"\bcgc\b", r"certified guaranty"]),
    ("SGC", [r"\bsgc\b", r"sportscard guaranty"]),
    ("PSA", [r"\bpsa\b", r"professional sports authenticator"]),
    ("TAG", [r"\btag\b", r"technical authentication"]),
    ("ACE", [r"\bace\b"]),
]

# Grader + grade in a title, e.g. "PSA 10", "CGC Pristine 10", "BGS 9.5", "PSA GEM MT 10"
TITLE_GRADE_RE = re.compile(
    r"\b(psa|bgs|bvg|beckett|cgc|csg|sgc|tag|ace)\s*"
    r"(?:gem\s*mint|gem\s*mt|gem|mint|mt|pristine|perfect|nm-mt\+?|nm\s*mint|nm|black\s*label)?\s*"
    r"(10|[1-9](?:\.5)?)(?![\d/.])", re.I)

VARIANT_PATTERNS = {
    "1st edition": [r"\b1st\s*ed(ition)?\b", r"\bfirst\s*ed(ition)?\b", r"\b1st\s*edt\b"],
    "shadowless": [r"\bshadowless\b"],
    "reverse holo": [r"\brev(erse)?\.?\s*holo\b", r"\breverse\s*foil\b"],
    "staff": [r"\bstaff\b"],
    "prerelease": [r"\bpre-?release\b"],
    "stamped": [r"\bstamp(ed)?\b"],
    "master ball": [r"\bmaster\s*ball\b"],
    "poke ball": [r"\bpoke\s*ball\b"],
    "error": [r"\berror\b", r"\bmisprint\b", r"\bmiscut\b"],
}

LANGUAGE_PATTERNS = {
    "japanese": [r"\bjapanese\b", r"\bjapan\b", r"\bjpn\b", r"\bjp\b"],
    "korean": [r"\bkorean\b", r"\bkor\b"],
    "chinese": [r"\bchinese\b", r"\bs-?chinese\b", r"\bt-?chinese\b", r"\bchn\b"],
    "german": [r"\bgerman\b", r"\bdeutsch\b"],
    "french": [r"\bfrench\b", r"\bfrancais\b"],
    "italian": [r"\bitalian\b", r"\bitaliano\b"],
    "spanish": [r"\bspanish\b", r"\bespanol\b"],
    "portuguese": [r"\bportuguese\b"],
    "thai": [r"\bthai\b"],
    "indonesian": [r"\bindonesian\b"],
    "dutch": [r"\bdutch\b"],
}

# Raw (ungraded) card conditions, best first, with the names the pricing service uses.
RAW_CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"]
RAW_CONDITION_NAMES = {"NM": "Near Mint", "LP": "Lightly Played", "MP": "Moderately Played",
                       "HP": "Heavily Played", "DMG": "Damaged"}


def normalize_raw_condition(text, from_title=False):
    """eBay's 'Card Condition' field or title words -> NM / LP / MP / HP / DMG (None if unclear).

    In titles, a bare "HP" usually means hit points ("120 HP"), so it only counts in eBay's condition field.
    """
    t = norm_text(text)
    if not t:
        return None
    if "damaged" in t or re.search(r"\bdmg\b", t):
        return "DMG"
    if "heavily" in t or (not from_title and re.search(r"\b(hp|poor)\b", t)):
        return "HP"
    if "moderately" in t or "very good" in t or re.search(r"\bmp\b", t):
        return "MP"
    if "lightly" in t or "light play" in t or "excellent" in t or re.search(r"\blp\b", t):
        return "LP"
    if "near mint" in t or re.search(r"\bnm(-?mt|/m)?\b", t) or re.search(r"\bmint\b", t):
        return "NM"
    return None


CARD_NUM_SLASH_RE =re.compile(r"(?<![\w.])#?\s*([a-z]{0,4}\d{1,3}[a-z]?)\s*/\s*([a-z]{0,4}\d{1,3})(?![\w])", re.I)
CARD_NUM_HASH_RE = re.compile(r"#\s*([a-z]{0,5}\d{1,4}[a-z]?)\b", re.I)
PROMO_RE = re.compile(r"\b(swsh|svp|sv|sm|xy|bw|dp|hgss|np|ex)\s*-?\s*(\d{2,3})\b", re.I)


def norm_text(s):
    """Lowercase, strip accents (Pokémon -> pokemon), collapse punctuation to spaces."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9./#+-]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def has_phrase(text_norm, phrase):
    p = norm_text(phrase)
    return bool(p) and re.search(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])", text_norm) is not None


def split_list(s):
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def norm_number_part(p):
    p = p.strip().upper().lstrip("#")
    m = re.match(r"^([A-Z]*)0*(\d+)([A-Z]*)$", p)
    return f"{m.group(1)}{m.group(2)}{m.group(3)}" if m else p


def norm_card_number(s):
    """'004/102' -> ('4', '102'); 'SWSH050' -> ('SWSH50', None); 'TG05/TG30' -> ('TG5', 'TG30')."""
    s = (s or "").strip()
    if not s:
        return None
    if "/" in s:
        a, b = s.split("/", 1)
        return norm_number_part(a), norm_number_part(b)
    m = PROMO_RE.fullmatch(s.replace(" ", ""))
    if m:
        return norm_number_part(m.group(1) + m.group(2)), None
    return norm_number_part(s), None


def normalize_grader(text):
    t = norm_text(text)
    for code, pats in GRADER_PATTERNS:
        if any(re.search(p, t) for p in pats):
            return code
    return None


def normalize_grade(value, text_for_labels=""):
    """'10' -> '10', 'Gem Mint 10' -> '10', '9.5' -> '9.5'; adds PRISTINE / BLACK LABEL for 10s."""
    m = re.search(r"(10|[1-9](?:\.5)?)(?![\d.])", str(value or ""))
    if not m:
        return None
    g = m.group(1)
    labels = norm_text(f"{value} {text_for_labels}")
    if g == "10":
        if "black label" in labels:
            g = "10 BLACK LABEL"
        elif "pristine" in labels:
            g = "10 PRISTINE"
    return g


class Listing:
    """Normalized view of one eBay auction."""

    def __init__(self, summary, detail=None):
        self.summary = summary
        self.detail = detail or {}
        src = self.detail or summary
        self.item_id = summary.get("itemId") or src.get("itemId")
        self.title = summary.get("title") or src.get("title", "")
        self.title_norm = norm_text(self.title)
        # Prefer the eBay Partner Network link when eBay returns one (affiliate_campaign_id is set).
        self.url = (summary.get("itemAffiliateWebUrl") or src.get("itemAffiliateWebUrl")
                    or summary.get("itemWebUrl") or src.get("itemWebUrl", ""))
        self.end_time = summary.get("itemEndDate") or src.get("itemEndDate")
        self.bid_count = summary.get("bidCount", src.get("bidCount", 0)) or 0
        self.buying_options = summary.get("buyingOptions") or src.get("buyingOptions") or []
        self.condition_id = str(summary.get("conditionId") or src.get("conditionId") or "")
        seller = summary.get("seller") or src.get("seller") or {}
        self.seller = seller.get("username", "")
        self.feedback_score = int(seller.get("feedbackScore") or 0)
        try:
            self.feedback_pct = float(seller.get("feedbackPercentage") or 0)
        except ValueError:
            self.feedback_pct = 0.0
        loc = summary.get("itemLocation") or src.get("itemLocation") or {}
        self.country = (loc.get("country") or "").upper()

        # Item specifics (detail only) and graded-card condition descriptors.
        self.aspects = {}
        for a in self.detail.get("localizedAspects", []) or []:
            self.aspects[a.get("name", "").strip().lower()] = a.get("value", "")
        self.descriptors = {}
        for d in self.detail.get("conditionDescriptors", []) or []:
            vals = d.get("values") or []
            v = vals[0].get("content", "") if vals and isinstance(vals[0], dict) else ""
            self.descriptors[d.get("name", "").strip().lower()] = v
        self.description_norm = norm_text(
            re.sub(r"<[^>]+>", " ", self.detail.get("description", "") or "") + " " +
            (self.detail.get("shortDescription", "") or ""))

    # -- money --
    def price(self):
        p = self.summary.get("currentBidPrice") or self.summary.get("price") or \
            self.detail.get("currentBidPrice") or self.detail.get("price") or {}
        return float(p.get("value")) if p.get("value") is not None else None

    def shipping(self):
        """Returns (cost or None, note)."""
        for src in (self.summary, self.detail):
            for opt in src.get("shippingOptions", []) or []:
                cost = opt.get("shippingCost")
                if cost and cost.get("value") is not None:
                    return float(cost["value"]), ""
        return None, "shipping not shown (calculated); assumed $0"

    # -- card facts --
    def grader(self):
        structured = self.descriptors.get("professional grader") or self.aspects.get("professional grader")
        g = normalize_grader(structured) if structured else None
        title_g = TITLE_GRADE_RE.search(self.title)
        t = normalize_grader(title_g.group(1)) if title_g else None
        return g, t

    def grade(self):
        label_text = self.title + " " + self.aspects.get("grade", "")
        structured = self.descriptors.get("grade") or self.aspects.get("grade")
        g = normalize_grade(structured, label_text) if structured else None
        m = TITLE_GRADE_RE.search(self.title)
        t = normalize_grade(m.group(2), label_text) if m else None
        return g, t

    def is_raw(self):
        """eBay condition 4000 = Ungraded (raw card); 2750 = Graded (slab)."""
        return self.condition_id == "4000"

    def raw_condition(self):
        """The seller's stated condition for a raw card, from eBay's field first, then the title."""
        field = self.descriptors.get("card condition") or self.aspects.get("card condition") or ""
        return normalize_raw_condition(field) or normalize_raw_condition(self.title, from_title=True)

    def cert_number(self):
        return (self.descriptors.get("certification number") or self.aspects.get("certification number") or "").strip()

    def card_numbers(self):
        nums = set()
        asp = self.aspects.get("card number")
        if asp:
            n = norm_card_number(asp)
            if n:
                nums.add(n)
        for m in CARD_NUM_SLASH_RE.finditer(self.title):
            nums.add((norm_number_part(m.group(1)), norm_number_part(m.group(2))))
        for m in CARD_NUM_HASH_RE.finditer(self.title):
            nums.add((norm_number_part(m.group(1)), None))
        for m in PROMO_RE.finditer(self.title):
            nums.add((norm_number_part(m.group(1) + m.group(2)), None))
        return nums

    def variant_text(self):
        parts = [self.title] + [self.aspects.get(k, "") for k in ("features", "finish", "edition", "speciality", "parallel/variety")]
        return norm_text(" ".join(parts))

    def variants(self):
        txt = self.variant_text()
        return {v for v, pats in VARIANT_PATTERNS.items() if any(re.search(p, txt) for p in pats)}

    def language(self):
        asp = norm_text(self.aspects.get("language", ""))
        if asp:
            for lang, pats in LANGUAGE_PATTERNS.items():
                if any(re.search(p, asp) for p in pats):
                    return lang
            if "english" in asp:
                return "english"
        for lang, pats in LANGUAGE_PATTERNS.items():
            if any(re.search(p, self.title_norm) for p in pats):
                return lang
        return "english"


def title_excluded(title, cfg, raw=False):
    """Return the first hard-exclusion keyword found in the title, or None.

    Words like "raw" or "ungraded" only rule out listings in the graded search, not raw-card listings.
    """
    t = norm_text(title)
    rf = cfg["red_flags"]
    words = list(rf["exclude_title_keywords"]) + ([] if raw else list(rf.get("graded_only_exclude_keywords") or []))
    for kw in words:
        if has_phrase(t, kw):
            return kw
    return None


def name_in_title(card, title_norm):
    return all(has_phrase(title_norm, tok) for tok in norm_text(card["name"]).split())


def match_card(listing, card, cfg):
    """Strictly check that a listing is the same card/grader/grade as a watchlist entry.

    Returns (ok, reason). reason explains the first mismatch, or summarizes the match.
    """
    t = listing.title_norm
    names_text = norm_text(" ".join([listing.title, listing.aspects.get("card name", ""), listing.aspects.get("character", "")]))
    if not all(has_phrase(names_text, tok) for tok in norm_text(card["name"]).split()):
        return False, "card name not in listing"

    for term in split_list(card.get("exclude_terms")):
        if has_phrase(t, term):
            return False, f"excluded term for this card: '{term}'"

    # Set
    set_names = [card["set_name"]] + split_list(card.get("set_aliases"))
    set_text = norm_text(listing.title + " " + listing.aspects.get("set", ""))
    if not any(has_phrase(set_text, s) for s in set_names):
        return False, f"set '{card['set_name']}' not found in title/item specifics"

    # Card number
    want = norm_card_number(card["card_number"])
    found = listing.card_numbers()
    if not found:
        return False, "no card number found in listing"
    if not any(n == want[0] and (d is None or want[1] is None or d == want[1]) for n, d in found):
        return False, f"card number mismatch (listing {sorted(f'{a}/{b}' if b else a for a, b in found)}, want {card['card_number']})"

    # Grader
    allowed = {g.upper() for g in cfg["graders_allowed"]}
    g_struct, g_title = listing.grader()
    if g_struct and g_title and g_struct != g_title:
        return False, f"grader mismatch: item specifics say {g_struct}, title says {g_title}"
    grader = g_struct or g_title
    if not grader:
        return False, "no grading company found"
    if grader not in allowed:
        return False, f"grader {grader} not in allowed list"
    if grader != card["grader"].upper():
        return False, f"different grader ({grader} vs {card['grader']})"

    # Grade
    gr_struct, gr_title = listing.grade()
    if gr_struct and gr_title and gr_struct.split()[0] != gr_title.split()[0]:
        return False, f"grade mismatch: item specifics say {gr_struct}, title says {gr_title}"
    grade = gr_struct or gr_title
    if not grade:
        return False, "no grade found"
    if grade != card["grade"].upper():
        return False, f"different grade ({grader} {grade} vs {card['grader']} {card['grade']})"

    # Variants must match exactly
    want_v = {v.lower() for v in split_list(card.get("variants"))}
    have_v = listing.variants()
    tracked = set(VARIANT_PATTERNS)
    if "1st edition" in want_v and "1st edition" in have_v:
        tracked.discard("shadowless")  # 1st Edition Base cards are shadowless; sellers often say both
    if (want_v & tracked) != (have_v & tracked):
        return False, f"variant mismatch (listing {sorted(have_v) or ['none']}, want {sorted(want_v) or ['none']})"

    # Language
    lang = listing.language()
    if lang != (card.get("language") or "english").lower():
        return False, f"language mismatch ({lang} vs {card.get('language') or 'english'})"

    return True, f"matched {grader} {grade}, #{card['card_number']}, {card['set_name']}, variants {sorted(want_v) or 'none'}, {lang}"


def red_flags(listing, cfg, sealed=False):
    """Warnings shown in the alert (they don't block it)."""
    rf = cfg["red_flags"]
    flags = []
    if listing.feedback_score < rf["min_seller_feedback_score"]:
        flags.append(f"Low seller feedback ({listing.feedback_score})")
    if listing.feedback_pct and listing.feedback_pct < rf["min_seller_feedback_pct"]:
        flags.append(f"Seller positive feedback only {listing.feedback_pct:.1f}%")
    if listing.country and listing.country != "US":
        flags.append(f"Ships from {listing.country} (international)")
    if sealed:
        if listing.feedback_score < 100:
            flags.append("Newer seller: resealed boxes are a known scam, so check the shrink wrap in the photos")
    elif listing.is_raw():
        flags.append("Raw card: condition is the seller's own description")
    else:
        if listing.condition_id and listing.condition_id != "2750":
            flags.append("Listing condition is not 'Graded'")
        if not listing.cert_number():
            flags.append("No cert number listed")
        g_struct, g_title = listing.grader()
        if not g_title:
            flags.append("Grader not in title (only in item specifics)")
        if not g_struct:
            flags.append("No grader in eBay's graded fields (title only)")
    ship, note = listing.shipping()
    if note:
        flags.append("Shipping not shown, assumed $0")
    elif ship is not None and ship > rf["max_shipping"]:
        flags.append(f"High shipping (${ship:.2f})")
    for kw in rf["flag_description_keywords"]:
        if has_phrase(listing.description_norm, kw):
            flags.append(f"Description mentions '{kw}'")
    return flags

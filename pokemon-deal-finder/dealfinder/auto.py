"""Automatic mode: identify any graded listing's card via PokemonPriceTracker and value it from graded sales."""
import re
from datetime import date, timedelta
from urllib.parse import quote

from .comps import MarketValue, market_value
from .parse import (CARD_NUM_SLASH_RE, PROMO_RE, RAW_CONDITION_NAMES, has_phrase, norm_card_number,
                    norm_number_part, norm_text)

# Promo code prefix -> the catalog's promo set name (partial match).
PROMO_SETS = {
    "SVP": "Scarlet & Violet Promo", "SV": "Scarlet & Violet Promo", "SWSH": "Sword & Shield Promo",
    "SM": "Sun & Moon Promo", "XY": "XY Promo", "BW": "Black and White Promo",
    "HGSS": "HGSS Promo", "DP": "Diamond and Pearl Promo", "NP": "Nintendo Promo",
}

# Words in a catalog card/set name that mark a special version. A candidate carrying one is only accepted
# if the listing title mentions it too (e.g. don't price a normal Base Set Charizard as the Black Dot Error).
SPECIAL_WORDS = ["error", "black dot", "metal", "jumbo", "oversize", "corocoro", "staff", "prerelease",
                 "stamp", "stamped", "league", "prize pack", "trick or trade", "mcdonald", "celebrations",
                 "classic collection", "30th celebration", "shadowless", "miscellaneous", "cosmos", "theme deck",
                 "world championship", "championship", "w stamp", "pokemon center"]

# Reprint sets (Celebrations Classic Collection, ME: 30th Celebration Classic Collection...). A reprint card's set name
# carries several of these, but sellers usually write only one ("Blastoise 2/102 Celebrations"), so one is enough to
# match the reprint. And a listing that names any of them is a reprint: it's never valued as the original card (a $15
# reprint priced as a $230 Base Set Blastoise looked like a 91%-off deal).
REPRINT_WORDS = ["celebrations", "classic collection", "30th celebration"]
# How sellers also write them.
TITLE_ALIASES = [("30th anniversary", "30th celebration"), ("25th anniversary", "celebrations")]


def grade_key(grader, grade):
    """('PSA', '9.5') -> 'psa9_5'. Special labels (Pristine / Black Label) aren't priced separately -> None."""
    if not grader or not grade or " " in grade:
        return None
    return f"{grader.lower()}{grade.replace('.', '_')}"


def number_queries(title, aspect_number=""):
    """Card-number search strings to try, as written and zero-padded. Returns [(query, set_filter)]."""
    out = []

    def add(q, set_filter=None):
        if q and (q, set_filter) not in out:
            out.append((q, set_filter))

    texts = [aspect_number or "", title]
    for t in texts:
        for m in CARD_NUM_SLASH_RE.finditer(t):
            a, b = m.group(1).upper(), m.group(2).upper()
            add(f"{a}/{b}")
            na, nb = norm_number_part(a), norm_number_part(b)
            add(f"{na}/{nb}")
            if na.isdigit() and nb.isdigit():
                add(f"{na.zfill(3)}/{nb.zfill(3)}")
            pa, pb = re.match(r"([A-Z]*)(\d+)", na), re.match(r"([A-Z]*)(\d+)", nb)
            if pa and pb and pa.group(1):  # TG5/TG30 -> TG05/TG30
                add(f"{pa.group(1)}{pa.group(2).zfill(2)}/{pb.group(1)}{pb.group(2).zfill(2)}")
        for m in PROMO_RE.finditer(t):
            prefix, digits = m.group(1).upper(), m.group(2)
            set_filter = PROMO_SETS.get(prefix)
            if set_filter:
                add(digits.zfill(3), set_filter)
                add(f"{prefix}{digits.zfill(3)}", set_filter)
    return out


def _base_name(name):
    """'Charizard ex - 199/165' -> 'Charizard ex'; 'Umbreon VMAX (Alternate Art Secret)' -> 'Umbreon VMAX'."""
    name = re.split(r"\s+-\s+", name or "")[0]
    return re.sub(r"\(.*?\)", " ", name).strip()


def _set_words(set_name):
    """'SWSH07: Evolving Skies' -> 'evolving skies'."""
    return norm_text(re.sub(r"^[A-Za-z0-9]+:\s*", "", set_name or ""))


def number_matches(cn, nums):
    """Catalog number vs numbers found in the listing. Promo codes (SVP085) match plain catalog numbers (085)."""
    for n, d in nums:
        if cn[0] == n and (d is None or cn[1] is None or d == cn[1]):
            return True
        digits = re.sub(r"\D", "", n)
        if cn[1] is None and d is None and digits and digits == re.sub(r"\D", "", cn[0]):
            return True
    return False


def pick_card(listing, candidates):
    """Choose the one catalog card a listing is for. Returns (card, None) or (None, reason)."""
    names_text = norm_text(" ".join([listing.title, listing.aspects.get("card name", ""),
                                     listing.aspects.get("character", "")]))
    title_ctx = norm_text(" ".join([listing.title, listing.aspects.get("set", ""), listing.aspects.get("features", "")]))
    for said, means in TITLE_ALIASES:
        if has_phrase(title_ctx, said):
            title_ctx += " " + means
    reprint_listing = any(has_phrase(title_ctx, w) for w in REPRINT_WORDS)
    nums = listing.card_numbers()
    ok = []
    for c in candidates:
        cn = norm_card_number(c.get("cardNumber", ""))
        if not cn or not number_matches(cn, nums):
            continue
        base = norm_text(_base_name(c.get("name", "")))
        if not base or not all(has_phrase(names_text, tok) for tok in base.split()):
            continue
        special_text = norm_text(f"{c.get('name', '')} {c.get('setName', '')}")
        specials = [w for w in SPECIAL_WORDS if has_phrase(special_text, w)]
        in_title = [w for w in specials if has_phrase(title_ctx, w)
                    or (w == "shadowless" and "1st edition" in listing.variants())]
        reprint = [w for w in specials if w in REPRINT_WORDS]
        # Every other special word must be in the title; for a reprint set, one of its words is enough.
        if any(w not in in_title for w in specials if w not in REPRINT_WORDS):
            continue
        if reprint and not any(w in in_title for w in reprint):
            continue
        if reprint_listing and not reprint:
            continue  # the listing is a reprint: never the original card
        ok.append((len(in_title), c))
    if not ok:
        return None, "no catalog card matched the number + name in the title"
    # If the title names a special version (e.g. "Black Dot Error", "Shadowless"), prefer that over the plain card.
    best = max(score for score, _ in ok)
    ok = [c for score, c in ok if score == best]
    if len(ok) > 1:
        by_set = [c for c in ok if _set_words(c.get("setName")) and has_phrase(title_ctx, _set_words(c.get("setName")))]
        if len(by_set) == 1:
            return by_set[0], None
        return None, "ambiguous: " + "; ".join(f"{c.get('name')} ({c.get('setName')})" for c in ok[:4])
    return ok[0], None


def mixed_printing_reason(card, listing):
    """The service combines graded sales across printings of one product; skip when that distorts value."""
    printings = [p.lower() for p in (card.get("printingsAvailable") or [])]
    if any("1st edition" in p for p in printings):
        return "price data mixes 1st Edition and unlimited sales for this card (use the watchlist for it)"
    if "reverse holo" in listing.variants():
        return "reverse holo is priced together with the regular holo for this card"
    return None


def merge_our_sales(comps, ours):
    """Add our own recorded sales to the service's comps, skipping ones the service already counted
    (same day, a lone sale that day, within $1). Same rule as the website. Returns (comps, how many we added)."""
    singles = {}
    for c in comps:
        singles.setdefault(c["sold_date"], []).append(c["price"])
    added = []
    for s in ours or []:
        day = singles.get(s["sold_date"], [])
        if len(day) == 1 and abs(day[0] - s["price"]) < 1:
            continue
        added.append({"sold_date": s["sold_date"], "price": s["price"], "shipping": 0, "excluded": 0})
    return comps + added, len(added)


def auto_market_value(card, history_days, grader, grade, cfg, today=None, our_sales=None):
    """30-day market value for one grader+grade from the service's daily graded-sales history, plus our own
    recorded eBay sales of that card and grade (our_sales: [{"sold_date", "price"}]). The usual safety checks
    (enough sales, outliers dropped, prices not swinging too much) apply to the combined list."""
    deal, auto = cfg["deal"], cfg["auto"]
    key = grade_key(grader, grade)
    if not key:
        return MarketValue(None, reason=f"{grader} {grade} isn't priced separately")
    ebay = (card or {}).get("ebay") or {}
    g = (ebay.get("salesByGrade") or {}).get(key)
    if not g and not our_sales:
        return MarketValue(None, reason=f"no {grader} {grade} sales on record")
    if g and (ebay.get("smartPriceOutlierByGrade") or {}).get(key):
        return MarketValue(None, reason=f"{grader} {grade} price data is flagged as unreliable by the service")
    lookback = int(deal["comp_lookback_days"])
    if history_days < lookback:
        return MarketValue(None, reason=f"price history limited to {history_days} days on this plan (need {lookback})")

    comps = []
    for day, d in ((ebay.get("priceHistory") or {}).get(key) or {}).items():
        try:
            n, avg = int(d.get("count") or 0), float(d.get("average"))
        except (TypeError, ValueError):
            continue
        comps += [{"sold_date": day[:10], "price": avg, "shipping": 0, "excluded": 0}] * min(n, 50)
    comps, ours = merge_our_sales(comps, our_sales)
    mv = market_value(comps, deal, today or date.today())
    if not mv.ok:
        return mv

    smart = (g or {}).get("smartMarketPrice") or {}
    sp = smart.get("price")
    if sp and smart.get("confidence") in ("medium", "high"):
        gap = abs(mv.value - sp) / sp
        if gap > auto["max_disagreement"]:
            return MarketValue(None, comps_in_window=mv.comps_in_window,
                               reason=f"30-day value ${mv.value:,.0f} disagrees with the service's estimate ${sp:,.0f}")
    if mv.value < auto["min_market_value"]:
        return MarketValue(None, comps_in_window=mv.comps_in_window,
                           reason=f"worth ${mv.value:,.0f}, under the ${auto['min_market_value']:,.0f} minimum")
    mv.reason = (f"median of {mv.comps_used} sales (${mv.low:,.2f}-${mv.high:,.2f}) in the last {lookback} days "
                 f"via PokemonPriceTracker (eBay + Fanatics, shipping not included)"
                 + (f", including {ours} eBay sales we recorded" if ours else ""))
    return mv


# ---------- raw (ungraded) cards ----------
def choose_printing(card, listing_variants):
    """Which TCGplayer printing a raw listing is (Holofoil, Reverse Holofoil, 1st Edition Holofoil, ...).

    Returns (printing, None) or (None, reason).
    """
    printings = list(card.get("printingsAvailable") or (card.get("variants") or {}).keys())
    primary = (card.get("prices") or {}).get("primaryPrinting")
    if not printings and primary:
        printings = [primary]
    if not printings:
        return None, "no printing data for this card"
    low = {p: p.lower() for p in printings}
    if "reverse holo" in listing_variants:
        hits = [p for p in printings if "reverse" in low[p]]
        return (hits[0], None) if hits else (None, "listing says reverse holo but this card has no reverse holo price")
    if "1st edition" in listing_variants:
        hits = [p for p in printings if "1st edition" in low[p]]
        return (hits[0], None) if hits else (None, "listing says 1st Edition but this card has no 1st Edition price")
    plain = [p for p in printings if "reverse" not in low[p] and "1st edition" not in low[p]]
    if len(plain) == 1:
        return plain[0], None
    unlimited = [p for p in plain if "unlimited" in low[p]]
    if len(unlimited) == 1:
        return unlimited[0], None
    if primary in plain:
        return primary, None
    return None, f"can't tell which printing ({', '.join(printings)})"


def raw_market_value(card, history_days, printing, condition, cfg, today=None):
    """Market value for a raw card in one printing + condition, from TCGplayer's daily market price and sales."""
    deal, auto = cfg["deal"], cfg["auto"]
    lookback = int(deal["comp_lookback_days"])
    if history_days < lookback:
        return MarketValue(None, reason=f"price history limited to {history_days} days on this plan (need {lookback})")
    cond = RAW_CONDITION_NAMES.get(condition)
    ph = (card or {}).get("priceHistory") or {}
    series = ((ph.get("variants") or {}).get(printing) or {}).get(cond)
    if not series and printing == ((card or {}).get("prices") or {}).get("primaryPrinting"):
        series = (ph.get("conditions") or {}).get(cond)
    if not series or not series.get("latestPrice"):
        return MarketValue(None, reason=f"no TCGplayer price for {printing} in {cond}")
    cutoff = ((today or date.today()) - timedelta(days=lookback)).isoformat()
    window = [h for h in series.get("history") or [] if str(h.get("date", ""))[:10] >= cutoff and h.get("market")]
    sales = sum(int(h.get("volume") or 0) for h in window)
    value = float(series["latestPrice"])
    markets = [float(h["market"]) for h in window] or [value]
    if sales < int(deal["min_comps"]):
        return MarketValue(None, comps_in_window=sales,
                           reason=f"only {sales} TCGplayer sales of {printing} {cond} in the last {lookback} days")
    mean = sum(markets) / len(markets)
    spread = (sum((m - mean) ** 2 for m in markets) / len(markets)) ** 0.5 / mean if mean else 0
    if len(markets) >= 3 and spread > float(deal["max_comp_spread"]):
        return MarketValue(None, comps_in_window=sales, reason=f"TCGplayer price moved too much ({spread:.0%} spread)")
    if value < auto["min_market_value"]:
        return MarketValue(None, comps_in_window=sales,
                           reason=f"worth ${value:,.0f}, under the ${auto['min_market_value']:,.0f} minimum")
    return MarketValue(round(value, 2), comps_used=sales, comps_in_window=sales, low=min(markets), high=max(markets),
                       spread=spread, latest_sale=str(series.get("latestDate", ""))[:10],
                       reason=f"TCGplayer market for {cond} {printing}: ${value:,.2f} from {sales} sales in the last "
                              f"{lookback} days (shipping not included)")


def tcgplayer_link(card, cfg):
    """The card's TCGplayer page, wrapped in your affiliate link if one is set. Returns (url, is_affiliate)."""
    url = (card or {}).get("tcgPlayerUrl") or ""
    prefix = ((cfg.get("tcgplayer") or {}).get("affiliate_prefix") or "").strip()
    if url and prefix:
        return prefix + quote(url, safe=""), True
    return url, False


def grade_number(grade):
    m = re.match(r"(\d+(?:\.5)?)", grade or "")
    return float(m.group(1)) if m else None

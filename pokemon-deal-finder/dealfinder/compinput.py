"""User input shared by the dashboard and the Discord bot: card choices and pasted sold comps."""
import re
from datetime import date, datetime

GRADERS = ["PSA", "BGS", "BVG", "CGC", "CSG", "SGC", "TAG", "ACE"]
VARIANT_CHOICES = ["1st edition", "shadowless", "reverse holo", "staff", "prerelease", "stamped",
                   "master ball", "poke ball", "error"]
LANGUAGES = ["english", "japanese", "korean", "chinese", "german", "french", "italian", "spanish",
             "portuguese", "thai", "indonesian", "dutch"]


def parse_date(s, today=None):
    today = today or date.today()
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%d %b %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    for fmt in ("%b %d", "%B %d", "%m/%d"):
        try:
            d = datetime.strptime(f"{s} {today.year}", fmt + " %Y").date()
            return d.replace(year=today.year - 1) if d > today else d
        except ValueError:
            pass
    raise ValueError(f"can't read date '{s}'")


def parse_money(s):
    s = (s or "").strip().replace("$", "").replace(",", "")
    if s.lower() in ("", "free"):
        return 0.0
    return float(s)


def parse_comp_lines(text):
    """Each line: date, price, shipping[, note]   e.g. '2026-10-02, 450, 4.99, auction'"""
    rows, errors = [], []
    for i, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in re.split(r"\t|,(?!\d{3}\b)|;", line)]
        # Re-join "Oct 2, 2026" style dates that got split on the comma.
        # Only treat it as a year if it's this year or last (so "Oct 5, 2026, 470" is a date but "Oct 5, 4100" is a price).
        if (len(parts) >= 3 and re.match(r"[A-Za-z]", parts[0]) and parts[1].isdigit()
                and int(parts[1]) in (date.today().year, date.today().year - 1)):
            parts = [parts[0] + ", " + parts[1]] + parts[2:]
        try:
            d = parse_date(parts[0])
            price = parse_money(parts[1])
            ship = parse_money(parts[2]) if len(parts) > 2 else 0.0
            note = ", ".join(parts[3:]) if len(parts) > 3 else ""
            rows.append((d.isoformat(), price, ship, note))
        except (ValueError, IndexError) as e:
            errors.append(f"line {i}: {line} ({e})")
    return rows, errors

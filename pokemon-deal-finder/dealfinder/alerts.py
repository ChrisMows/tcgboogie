"""Discord webhook alerts."""
import logging
import time
from urllib.parse import quote_plus

import requests

log = logging.getLogger("dealfinder.alerts")


def sold_search_url(card):
    if card.get("kind") == "raw":  # raw: leave graded slabs out of the comps
        q = f"{card['name']} {card['card_number']} -psa -bgs -cgc -sgc -tag -graded"
    else:
        q = f"{card['name']} {card['card_number']} {card['grader']} {card['grade']}"
    if card.get("variants") and card.get("kind") != "raw":
        q += " " + card["variants"].replace(",", " ")
    if (card.get("language") or "english") != "english":
        q += " " + card["language"]
    return ("https://www.ebay.com/sch/i.html?_nkw=" + quote_plus(q) +
            "&_sacat=183454&LH_Sold=1&LH_Complete=1&rt=nc")


def card_label(card):
    v = f" ({card['variants']})" if card.get("variants") else ""
    lang = f" [{card['language'].title()}]" if (card.get("language") or "english") != "english" else ""
    return f"{card['name']}{v}{lang} - {card['set_name']} #{card['card_number']} - {card['grader']} {card['grade']}"


def fmt_minutes(m):
    m = max(m, 0)
    return f"{int(m)}m {int(round((m % 1) * 60)):02d}s"


def build_discord_payload(rec, card):
    flags = rec["flags"]
    color = 0xF59E0B if flags else 0x22C55E  # amber if red flags, green if clean
    fields = [
        {"name": "Current + ship", "value": f"**${rec['total']:,.2f}**\n(${rec['price']:,.2f} + ${rec['shipping']:,.2f})", "inline": True},
        {"name": "Market value", "value": f"${rec['market_value']:,.2f}\n{rec['comps_used']} comps", "inline": True},
        {"name": "Below market", "value": f"**{rec['discount_pct']:.0f}%**", "inline": True},
        {"name": "Time left", "value": fmt_minutes(rec["minutes_left"]), "inline": True},
        {"name": "Bids", "value": str(rec["bid_count"]), "inline": True},
        {"name": "Seller feedback", "value": f"{rec['feedback_score']:,} ({rec['feedback_pct']:.1f}% positive)", "inline": True},
    ]
    if flags:
        fields.append({"name": "⚠️ Red flags", "value": "\n".join(f"• {f}" for f in flags)[:1000], "inline": False})
    links = f"[Open listing]({rec['url']}) · [Check sold comps]({sold_search_url(card)})"
    if card.get("tcgplayer_url"):
        links += f" · [Compare on TCGplayer]({card['tcgplayer_url']})"
    fields.append({"name": "Links", "value": links[:1024], "inline": False})
    embed = {
        "title": card_label(card)[:256],
        "url": rec["url"],
        "description": rec["title"][:300],
        "color": color,
        "fields": fields,
        "footer": {"text": f"eBay item {rec['item_id']} · {rec['reason']['market']['reason']} · Estimate only: check the listing before you buy"[:2048]},
    }
    if rec.get("affiliate_disclosure"):  # EPN requires the disclosure right next to the link
        embed["footer"]["text"] = f"{rec['affiliate_disclosure']} · {embed['footer']['text']}"[:2048]
    image = rec.get("image")
    if image:
        embed["thumbnail"] = {"url": image}
    # The plain-text line is what shows in the phone notification itself.
    content = (f"🔥 {rec['discount_pct']:.0f}% below market · {card['name']} {card['grader']} {card['grade']} · "
               f"${rec['total']:,.0f} vs ${rec['market_value']:,.0f} · {fmt_minutes(rec['minutes_left'])} left"
               f"{' · ⚠️ ' + str(len(flags)) + ' flag(s)' if flags else ''}\n<{rec['url']}>")
    return {"username": "Pokémon Deal Finder", "content": content, "embeds": [embed],
            "allowed_mentions": {"parse": []}}


def sample_alert():
    """A realistic fake alert for testing delivery."""
    card = {"name": "Charizard", "set_name": "Base Set", "card_number": "4/102", "variants": "",
            "language": "english", "grader": "PSA", "grade": "8"}
    rec = {"item_id": "TEST-000000", "title": "TEST ALERT - 1999 Pokemon Base Set Charizard 4/102 Holo PSA 8",
           "url": "https://www.ebay.com/", "price": 610.00, "shipping": 5.00, "total": 615.00,
           "market_value": 1020.00, "discount_pct": 39.7, "comps_used": 9, "minutes_left": 6.67,
           "seller": "example_seller", "feedback_score": 1843, "feedback_pct": 99.8, "bid_count": 7,
           "flags": ["This is a test message"],
           "reason": {"market": {"reason": "median of 9 sold comps from last 30 days"}}}
    return rec, card


def send_discord(webhook_url, payload):
    if not webhook_url:
        log.warning("DISCORD_WEBHOOK_URL not set; alert not sent")
        return False
    for attempt in range(3):
        try:
            r = requests.post(webhook_url, json=payload, timeout=15)
        except requests.RequestException as e:
            log.warning("Discord send failed: %s", e)
            time.sleep(1 + attempt)
            continue
        if r.status_code in (200, 204):
            return True
        if r.status_code == 429:
            time.sleep(float(r.json().get("retry_after", 1)))
            continue
        log.warning("Discord returned %s: %s", r.status_code, r.text[:300])
        return False
    return False

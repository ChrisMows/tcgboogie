"""Photo check: does the listing's photo show the card we priced?

Sellers sometimes type the wrong set or number (e.g. list a $47 ME: 30th Celebration Pikachu ex as the $267 Surging
Sparks one). The text then looks like a huge deal. Before a deal goes out we show Claude the listing photos next to the
official image of the card we identified - plus look-alike versions of the same card when there are any - and ask which
one it is.

Verdicts: "match" (send it, marked photo-checked), "different_card" (drop it), "unclear" (send it with a warning).
Needs ANTHROPIC_API_KEY in .env; without it the check is skipped and deals carry a "check the photo" note instead.
"""
import json
import logging
import os
import re

log = logging.getLogger("dealfinder.vision")

try:
    import anthropic
except ImportError:  # optional dependency
    anthropic = None

TCG_IMG = "https://tcgplayer-cdn.tcgplayer.com/product/{}_in_1000x1000.jpg"

SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["match", "different_card", "unclear"]},
        "shown": {"type": "string", "description": "Letter of the reference card the listing shows (A, B, C...), or none"},
        "reason": {"type": "string", "description": "One short sentence a collector would understand"},
    },
    "required": ["verdict", "shown", "reason"],
    "additionalProperties": False,
}

PROMPT = """You check eBay trading-card listings before a deal alert goes out to collectors.

The seller says this listing is: {claimed}.
Reference A is the official image of that card. {others}
After the references come the seller's own listing photos (they may show a graded slab, glare, sleeves or angles).

Which reference card do the listing photos show? Compare the artwork, the card name, the set symbol, the card number and
the frame/border style. A reprint or a different set's version of the same Pokemon is a DIFFERENT card even if the art
is similar.

- "match": the photos clearly show reference A.
- "different_card": the photos clearly show another reference, or a card that isn't reference A.
- "unclear": the photos are too small, blurry, cropped or generic (stock photo, back of the card only) to tell.

Set "shown" to the letter you see, or "none"."""


def enabled():
    return bool(anthropic and os.getenv("ANTHROPIC_API_KEY"))


def big_ebay_image(url):
    """eBay image URLs carry a size (s-l225); ask for the large version so details like the set symbol are visible."""
    return re.sub(r"/s-l\d+\.", "/s-l1600.", url or "")


class PhotoChecker:
    def __init__(self, cfg):
        v = cfg.get("vision") or {}
        self.model = v.get("model", "claude-opus-5-5")
        self.effort = v.get("effort", "low")
        self.max_photos = int(v.get("max_listing_photos", 3))
        self.client = anthropic.Anthropic() if enabled() else None
        self.done = {}  # item_id -> result, so an auction seen on several checks is only checked once

    def check(self, item_id, claimed, reference_id, listing_photos, lookalikes=()):
        """Returns {"verdict", "shown", "reason", "model"} or None when the check couldn't run."""
        if not self.client or not reference_id or not listing_photos:
            return None
        if item_id in self.done:
            return self.done[item_id]
        refs = [("A", claimed, reference_id)] + [(chr(66 + i), label, pid) for i, (label, pid) in enumerate(lookalikes[:3])]
        others = ("Other versions of this card that exist: " + "; ".join(f"Reference {k} is {label}" for k, label, _ in refs[1:]) + ".") if len(refs) > 1 else ""
        content = [{"type": "text", "text": PROMPT.format(claimed=claimed, others=others)}]
        for key, label, pid in refs:
            content += [{"type": "text", "text": f"Reference {key}: {label}"},
                        {"type": "image", "source": {"type": "url", "url": TCG_IMG.format(pid)}}]
        for i, url in enumerate(listing_photos[: self.max_photos]):
            content += [{"type": "text", "text": f"Listing photo {i + 1}"},
                        {"type": "image", "source": {"type": "url", "url": big_ebay_image(url)}}]
        try:
            request = dict(
                model=self.model,
                max_tokens=2000,
                output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content": content}],
            )
            if self.model.startswith("claude-haiku"):
                r = self.client.messages.create(**request)  # Haiku has no server-side refusal fallback
            else:
                r = self.client.beta.messages.create(**request, betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        except anthropic.BadRequestError as e:
            # Usually an image eBay or TCGplayer wouldn't serve; don't retry this listing.
            log.warning("Photo check couldn't run for %s: %s", item_id, e.message)
            self.done[item_id] = None
            return None
        except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APIStatusError) as e:
            log.warning("Photo check unavailable right now (%s); sending the deal with a note", type(e).__name__)
            return None
        if r.stop_reason == "refusal":
            result = None
        else:
            text = next((b.text for b in r.content if b.type == "text"), "")
            try:
                result = {**json.loads(text), "model": r.model}
            except ValueError:
                result = None
        self.done[item_id] = result
        if len(self.done) > 5000:  # forget the oldest
            self.done = dict(list(self.done.items())[-2000:])
        return result

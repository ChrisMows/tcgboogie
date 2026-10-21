"""eBay Browse API client (official API only - no scraping)."""
import base64
import logging
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import requests

from . import db

log = logging.getLogger("dealfinder.ebay")

TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
ITEM_URL = "https://api.ebay.com/buy/browse/v1/item/{}"
SCOPE = "https://api.ebay.com/oauth/api_scope"


class EbayError(Exception):
    pass


def iso_z(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class EbayClient:
    def __init__(self, cfg, conn):
        self.cfg = cfg
        self.conn = conn
        self.client_id = cfg["secrets"]["ebay_client_id"]
        self.client_secret = cfg["secrets"]["ebay_client_secret"]
        if not self.client_id or not self.client_secret:
            raise EbayError("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing from .env")
        self._token = None
        self._token_expires = 0
        self.session = requests.Session()

    def _get_token(self):
        if self._token and time.time() < self._token_expires - 120:
            return self._token
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        r = self.session.post(TOKEN_URL, timeout=20, headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        }, data={"grant_type": "client_credentials", "scope": SCOPE})
        if r.status_code != 200:
            raise EbayError(f"eBay auth failed ({r.status_code}): {r.text[:300]}")
        j = r.json()
        self._token = j["access_token"]
        self._token_expires = time.time() + int(j.get("expires_in", 7200))
        return self._token

    def _headers(self):
        e = self.cfg["ebay"]
        loc = quote(f"country=US,zip={e.get('buyer_zip', '')}", safe="")
        ctx = f"contextualLocation={loc}"
        campaign = str(e.get("affiliate_campaign_id") or "").strip()
        if campaign:
            # eBay Partner Network: responses then include itemAffiliateWebUrl (a tracked link to the listing)
            ctx = f"affiliateCampaignId={campaign},affiliateReferenceId=dealalerts,{ctx}"
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "X-EBAY-C-MARKETPLACE-ID": e["marketplace_id"],
            "X-EBAY-C-ENDUSERCTX": ctx,
            "Accept": "application/json",
        }

    def _get(self, url, params=None):
        for attempt in range(3):
            r = self.session.get(url, params=params, headers=self._headers(), timeout=25)
            db.count_api_call(self.conn)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 401:
                self._token = None
                continue
            if r.status_code == 429:
                raise EbayError("eBay rate limit reached (429) - daily call limit used up")
            if r.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            raise EbayError(f"eBay API error {r.status_code}: {r.text[:400]}")
        raise EbayError(f"eBay API failed after retries: {url}")

    def search_ending_auctions(self, window_minutes, max_pages):
        """Graded Pokémon single-card auctions ending within the next `window_minutes`, soonest first."""
        e = self.cfg["ebay"]
        now = datetime.now(timezone.utc)
        end = now + timedelta(minutes=window_minutes)
        types = (self.cfg.get("auto") or {}).get("card_types") or ["graded"]
        if not (self.cfg.get("auto") or {}).get("enabled"):
            types = ["graded"]  # the watchlist only covers graded cards
        conditions = "|".join(c for t, c in (("graded", "2750"), ("raw", "4000")) if t in types) or "2750"
        filters = [
            "buyingOptions:{AUCTION}",
            f"conditionIds:{{{conditions}}}",  # 2750 = Graded, 4000 = Ungraded (raw)
            # Upper bound only: a lower bound of "now" is already in the past when eBay reads it, and eBay
            # then rejects the WHOLE date filter (returning every auction). Ended items aren't returned anyway.
            f"itemEndDate:[..{iso_z(end)}]",
            "deliveryCountry:US",
        ]
        params = {
            "category_ids": e["category_id"],
            "filter": ",".join(filters),
            "sort": "endingSoonest",
            "limit": 200,
        }
        if e.get("aspect_filter"):
            params["aspect_filter"] = e["aspect_filter"]
        items = []
        for page in range(max_pages):
            params["offset"] = page * 200
            j = self._get(SEARCH_URL, params)
            for w in j.get("warnings", []) or []:
                log.warning("eBay search warning: %s", w.get("message"))
            batch = j.get("itemSummaries", []) or []
            items.extend(batch)
            total = j.get("total", 0)
            if len(batch) < 200 or params["offset"] + 200 >= total:
                break
        return items

    def search_listings(self, query, max_price, raw=True, limit=50):
        """Buy It Now listings matching a card search, at or under max_price (item price), newest first.
        Used for price alerts' "also alert me when it's listed on eBay"."""
        e = self.cfg["ebay"]
        filters = [
            "buyingOptions:{FIXED_PRICE}",
            f"conditionIds:{{{'4000' if raw else '2750'}}}",  # 4000 = Ungraded, 2750 = Graded
            f"price:[..{max(0.0, float(max_price)):.2f}],priceCurrency:USD",
            "deliveryCountry:US",
        ]
        params = {"q": query, "category_ids": e["category_id"], "filter": ",".join(filters), "sort": "newlyListed", "limit": limit}
        if e.get("aspect_filter"):
            params["aspect_filter"] = e["aspect_filter"]
        j = self._get(SEARCH_URL, params)
        return j.get("itemSummaries", []) or []

    def get_item(self, item_id):
        return self._get(ITEM_URL.format(quote(item_id, safe="")))

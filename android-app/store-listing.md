# Google Play store listing: what to paste where

Images for the listing are in `store-assets/`: `feature-graphic.png` (1024x500), `phone-1.png` ... (1080x1920) and the
app icon `../android-app/store_icon.png` (512x512).

## Create app

- App name: **TCG Boogie**
- Default language: English (United States)
- App or game: **App** - Free or paid: **Free**

## Main store listing (Grow users -> Store presence -> Store listings)

**App name** (30 max): `TCG Boogie`

**Short description** (80 max):

```
Catch underpriced Pokémon cards on eBay and track what your collection is worth.
```

**Full description** (4,000 max):

```
Your next grail. Your kind of price. That's Boogie.

TCG Boogie is the toolkit for Pokémon card collectors. Catch underpriced cards on eBay before the auction ends, know what your collection is worth every day, and check any trade in seconds.

DEALS BEFORE THE AUCTION ENDS
• We scan eBay auctions ending soon and price every card against real sales
• Get an alert when a card you want is going for less than it's worth
• Set your own filters: cards, sets, grades, price and discount
• Alerts by push notification, email, Discord or text

YOUR COLLECTION, VALUED DAILY
• Add raw cards, graded slabs and sealed product
• Daily values from TCGplayer market prices and real graded sales
• See your total, your gains, and a chart of your collection over time
• Import from a spreadsheet or another app, export anytime
• Pick up to 3 signature cards for your profile, and share it if you like

SNAP IT, AND WE FIND IT
• Point your camera at a card and we pull up the exact card and price
• English and Japanese built in, more languages on request

PRICE ALERTS
• Watch any card and get told when the price drops to your number
• Get an alert when a watched card is listed on eBay at or under your price

IS IT A FAIR TRADE?
• Add what you'd give and what you'd get, in any condition or grade
• We price both sides at today's market and grade the trade out of 10

REAL SALES, NOT GUESSES
• Raw cards and sealed: TCGplayer market prices, updated daily
• Graded cards: real sales of that exact grade in the last 90 days
• Thin data is marked "Few sales", so you know when to double-check

Free forever, no card needed. Premium unlocks more alerts, faster deals and more scans.

Questions? support@tcgboogie.com

TCG Boogie is an independent collector tool. It is not affiliated with, endorsed or sponsored by Nintendo, The Pokémon Company, Creatures, GAME FREAK or eBay. Pokémon and card names are trademarks of their respective owners. Some eBay links are affiliate links: we may earn a commission at no cost to you.
```

**App icon**: `android-app/store_icon.png`  
**Feature graphic**: `store-assets/feature-graphic.png`  
**Phone screenshots**: `store-assets/phone-*.png` (in order)

## Store settings (Grow users -> Store presence -> Store settings)

- App category: **Shopping**
- Tags: Collectibles, Shopping, Price comparison (pick what's offered)
- Email: `support@tcgboogie.com`
- Website: `https://tcgboogie.com`

## App content (Policy and programs -> App content)

**Privacy policy**: `https://tcgboogie.com/privacy`

**App access**: "All or some functionality is restricted". Instructions: *Sign in with an email link: enter any email
on the sign-in screen and open the link we send. Most features are inside the signed-in app.* (Google's reviewers can
use their own email. If they ask for a fixed login, make a reviewer account on the site and give them its email.)

**Ads**: **No, my app does not contain ads.** (Deal listings and eBay affiliate links are the app's own content, not
ads from an ad network.)

**Content rating** (IARC questionnaire):
- Email: support@tcgboogie.com - Category: **All other app types** (not a game)
- Violence, fear, sexuality, language, controlled substances, crude humor: **No**
- Gambling or simulated gambling: **No** (it shows card prices; nobody bets or plays for money)
- Can users interact or exchange content with each other: **No** (no chat; a shared profile link is read-only)
- Shares the user's current location: **No**
- Allows users to purchase digital goods: **Yes** (Premium subscription)
- Unrestricted web access: **No** (it opens only tcgboogie.com; eBay links leave the app)

Expected result: Everyone / PEGI 3 (maybe "In-app purchases" noted).

**Target audience and content**: age groups **18 and over** only. (Simplest: anything under 18 brings Google's
Families rules. The site itself is 13+, so you can add 13-17 later.) "Could the app unintentionally appeal to children?"
**No**.

**News app**: No. **Government app**: No. **Financial features**: None. **Health**: None.

**Data safety**: see below.

**Account deletion**: in-app (Settings -> Delete account) and on the web:
`https://tcgboogie.com/app/account#delete` (signed-in). It deletes the account, collection, filters, alerts, history and
eBay connection, and cancels the subscription. Backups age out within 30 days (monthly copies 12 months).

## Data safety answers

Overview:
- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes**
- Do you provide a way for users to request that their data is deleted? **Yes** (in-app and by emailing support)

Note on "shared": Google doesn't count service providers that process data for you (Stripe, Hostinger, Resend, Twilio,
Discord, Anthropic, PokemonPriceTracker, eBay when you list) as sharing. The X (Twitter) ad pixel does count, because
X uses it for its own ad targeting, so those rows are marked Shared.

| Data type | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|
| Personal info -> **Name** | Yes | No | Required | Account management, App functionality |
| Personal info -> **Email address** | Yes | No | Required | Account management, App functionality, Developer communications |
| Personal info -> **User IDs** (Discord / Google account ID) | Yes | No | Optional | Account management |
| Personal info -> **Phone number** | Yes | No | Optional (text alerts) | App functionality |
| Financial info -> **Purchase history** (Premium status, renewal) | Yes | **Yes** (X: purchase event) | Required | Account management, App functionality; shared: Advertising or marketing |
| Photos and videos -> **Photos** (card scanner) | Yes, not stored (processed and discarded) | No | Optional | App functionality |
| App activity -> **App interactions** (page views, alerts sent) | Yes | **Yes** (X pixel) | Required | Analytics, App functionality; shared: Advertising or marketing |
| App activity -> **Other user-generated content** (collection, notes, ideas, Boogie Bot questions) | Yes | No | Optional | App functionality |
| App info and performance -> **Crash logs / Diagnostics** (error logs, 60 days) | Yes | No | Required | App functionality, Analytics |
| Device or other IDs (X pixel cookie) | Yes | **Yes** (X) | Required | Advertising or marketing |

For "Photos": mark **"Data is processed ephemerally"** (sent to identify the card, then discarded).
Not collected: location, contacts, messages, audio, files, calendar, health, web browsing outside the app, payment card
numbers (Stripe handles them on its own page).

## Countries (Test and release -> Production -> Countries / regions)

Start with **United States only**. Premium is paid on the website (Stripe), and Google allows linking out to web
payments in the US. In most other countries Google requires its own billing for digital subscriptions bought from an
app. Check Google's current "Payments" policy before adding other countries.

## Closed testing (needed before production, personal account)

1. Test and release -> Testing -> **Closed testing** -> Create track (or use "Alpha").
2. Countries: United States. Testers: create an email list with **12 or more** Google account emails.
3. Upload `android-app/app-release-bundle.aab`, release name `1.0.0`, notes: "First test build."
4. Send testers the opt-in link (shown on the Testers tab). Each must accept and install from Google Play.
5. Keep 12+ opted in for **14 days**, then Dashboard -> **Apply for production**.
6. After the first upload: Test and release -> App integrity -> App signing -> copy the **SHA-256** of the
   *App signing key certificate* and add it to `web/app/api/assetlinks/route.js` (FINGERPRINTS).

# Pokémon Graded Deal Finder

Watches eBay.com for graded Pokémon card auctions ending in ≤10 minutes that are ≥30% below what the same card
(same set, number, variant, language, grader and grade) has sold for in the last 30 days, and pushes an alert to
your phone through your own Discord bot.

**This version uses your own watchlist and sold comps** (entered in the dashboard). A paid pricing API can be
plugged in later without changing the rest.

## One-time setup (about 20 minutes)

### 1. eBay developer keys (free)
1. Go to https://developer.ebay.com and click **Register**. Sign up with your normal eBay account.
2. Approval of the developer account can take up to a day.
3. Open **Hi <name> > Application Keys**, enter an app name (e.g. "deal-finder") and click **Create a keyset** under **Production**.
4. eBay will ask you to either subscribe to "Marketplace Account Deletion" notifications or opt out. Choose
   **opt out / "I do not persist eBay data"**: this app doesn't store eBay user accounts.
5. Copy the Production **App ID (Client ID)** and **Cert ID (Client Secret)**.

### 2. Your Discord server and bot (free, about 10 minutes)
1. Install Discord on your phone and computer and sign in.
2. Create a private server: **+ > Create My Own > For me and my friends**, name it e.g. "Deals".
   Add two text channels: `#deal-alerts` and `#bot-log`.
3. Go to https://discord.com/developers/applications > **New Application**, name it e.g. "Deal Finder".
4. Open the **Bot** tab > **Reset Token** > copy the token. Treat it like a password.
   On the same tab, turn **Public Bot** off so nobody else can add it.
5. Open **OAuth2 > URL Generator**. Tick the scopes **bot** and **applications.commands**, then the bot permissions
   **View Channels**, **Send Messages**, **Embed Links** and **Read Message History**. Open the generated URL and
   add the bot to your server.
6. On your phone, make sure notifications for Discord are allowed. Alerts @mention you, so they push even with
   the server on the default "Only @mentions" setting.

### 3. Fill in `.env`
Open `.env` and paste in your eBay Client ID and Secret plus the Discord bot token. Keep this file private.

### 4. Start it and finish setup in Discord
1. Double-click **`start_bot.bat`**. Leave the window open. It runs the bot *and* the deal finder.
2. In Discord, go to `#deal-alerts` and type `/setup`. That channel now gets the alerts.
   Then run `/setup log_channel:#bot-log` to get startup and problem messages there.
3. Type `/test`. A sample alert should arrive and buzz your phone.

## Daily use (from Discord)
| Command | What it does |
|---|---|
| `/watch add` | Watch a card in a specific grader + grade |
| `/comps add` | Paste recent sold prices (one per line: `date, price, shipping`) |
| `/comps show` | A card's market value, comps and the price that triggers an alert |
| `/watch list` | Everything you watch, with market values and status |
| `/watch pause` / `resume` / `unmute` / `remove` | Manage individual cards |
| `/settings show` / `set` | Change the discount %, time window, comp lookback, etc. |
| `/status` | Running? Last check, alerts today, eBay calls used |
| `/pause` / `/resume` | Stop/start all checking |
| `/recent` | Last 5 alerts |
| `/setup` | Alert channel, log channel, DM copies, @mention on/off |

Every alert has buttons: **Open listing**, **Sold comps**, **Good deal** / **Wrong match** (logged for accuracy
review) and **Mute card 24h**. Only you (the bot's owner) can use commands and buttons.

The bot only runs while your PC is on and awake. If something breaks, like expired eBay keys, it posts in `#bot-log`.

## Dashboard (optional, for bigger edits)
- **`start_dashboard.bat`** opens http://127.0.0.1:5000 (dark mode). It's handy for bulk-pasting comps,
  reviewing the full alert log and the **Near misses** page (listings that matched a card name but didn't alert, and why).
- For best-offer sales where eBay hides the real price, 130point.com shows the accepted price.
- `start_finder.bat` is the older webhook-only mode. Don't run it at the same time as the bot.

## Automatic mode (no watchlist needed)
With `PPT_API_KEY` in `.env` and `auto: enabled: true` in `config.yaml`, the finder values **every** graded
auction it sees, not just watchlist cards:
1. Reads the grader, grade and card number from the listing (filters: PSA/BGS/CGC/SGC/TAG, grade 7+, English or Japanese).
2. Looks up every catalog card with that number on PokemonPriceTracker and keeps the one whose name and version
   (e.g. Black Dot Error, Shadowless, Celebrations) match the title. Ambiguous listings are skipped.
3. Market value = median of that grader+grade's sales over the last 30 days (eBay + Fanatics; shipping not included,
   which makes comparisons slightly conservative). Skipped if there are too few sales, if the service flags the data,
   if it disagrees with the service's own estimate by 40%+, or if the card is worth under $30.
4. Cards whose sales the service mixes across printings (1st Edition vs unlimited Base Set, reverse holos) are skipped.
   Put those on your watchlist with your own comps.
- Card-number lookups are cached 30 days and prices 6 hours to save credits. `/status` shows credits left today.
- **The free plan only has 3 days of price history**, so it identifies cards but never alerts. The $9.99 API plan is needed.
- Turn it on/off or change filters with `/settings set` (Automatic mode, Auto: minimum card value, Auto: lowest grade).

## Members, plans and filter profiles
Everyone's alerts come from **one** eBay scan. Each check is as wide as the loosest running profile
(capped by `scan_limits` in `config.yaml`), then every deal is matched against each member's own profiles.
Changing a filter never triggers a rescan. It applies from the next check (about 75 seconds).

- **You** are always a member on the `owner` plan. Your alerts go to the `/setup` channel. Your old settings became your profile "My deals".
- **Plans** (`plans:` in `config.yaml`) set each tier's profile count, alert delay (Standard waits 2 minutes),
  lowest % below market, longest time window, minimum card value, and Japanese access.
- **Members' commands** (in Discord): `/profile list | show | create | set | test | pause | resume | rename | delete`, `/plan`.
- **Private spaces:** each member gets a private channel in "Deal Alerts" categories. Past `delivery.max_channels`
  (450, under Discord's 500-channel limit), new members get a private thread in `#member-alerts` instead.
  Each member gets a listing at most once.
- **Adding members without the website:** `/member add @user tier` (also `/member remove`, `/member list`).
- **When the website is ready:** it only needs to give paying members the **Premium** or **Standard** role
  (names in `plans`). Then set `membership: roles_enabled: true` and `upgrade_url`, and turn on
  **Server Members Intent** (Developer Portal → Bot). Gaining a role opens their space. Losing it (cancel or failed payment)
  hides it and pauses alerts, with their profiles kept for if they return.
- **Bot permissions needed:** View Channels, Send Messages, Embed Links, Read Message History, Manage Channels,
  Manage Roles, Create Private Threads, Manage Threads, Send Messages in Threads, Use Application Commands
  (permission integer `363193256976`).
- **Licensing reminder:** showing PokemonPriceTracker values to other people, and charging for it, needs their
  Business plan, and paid use of eBay data needs eBay's approval.

## Settings
Change these with `/settings set`, on the dashboard's **Settings** page, or in `config.yaml`. The finder picks them up within a minute:
- `min_discount_pct` (30): how far below market the price must be
- `max_minutes_left` (10): the auction time window
- `comp_lookback_days` (30): which sold comps count
- `min_comps` (3) and `max_comp_spread` (0.35): confidence gates
- Title exclusion keywords, description red-flag words and allowed graders are edited in `config.yaml`

## How a listing qualifies
1. The eBay Browse API (official) returns graded (condition 2750) Pokémon single-card auctions ending within 12 minutes.
2. The title is not hard-excluded (pre-graded, "gem mint quality", ready to grade, raw, proxy, lot, cracked slab, ...).
3. The listing's price + shipping is ≥30% under a watchlist card's market value (quick check, no extra API call).
4. Item details are fetched and must match exactly: name, set, card number, variant, language, grader and grade.
   Title and slab info must agree with each other.
5. Market value = median of price + shipping for comps in the lookback window, outliers removed. The card is skipped
   if there are too few comps or they vary too much.
6. Red flags (low or new seller feedback, international, no cert number, suspicious description, high shipping) are
   shown in the alert.
7. Each listing alerts at most once, ever. Everything is logged in `data/dealfinder.db` and `logs/finder.log`.

## eBay API usage
Checks run every 75 seconds, which uses roughly 1,200–2,500 of the 5,000 free daily calls. The finder slows down
automatically if it nears the limit. eBay will raise the limit for free through its "Application Growth Check" if needed.

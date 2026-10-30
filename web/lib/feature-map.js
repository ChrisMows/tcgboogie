import "server-only";
import { eq } from "drizzle-orm";
import { appraiserReady } from "@/lib/appraise";
import { billingLive } from "@/lib/billing";
import { db, schema } from "@/lib/db";
import { emailCap, emailSender } from "@/lib/mail";
import { channelsReady } from "@/lib/notify";
import { effectivePlans } from "@/lib/plan-copy";
import { xReady } from "@/lib/x";

// Admin -> Feature map: every feature with what it costs, who provides it, its Free and Premium limits and what makes
// it grow. The plan limits are read from the plans (Admin -> Plans), today's numbers from Admin -> Usage, and what's
// switched on from the site's settings, so the page stays true as those change. When a feature or a vendor is added,
// add it here.

const n = (v) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const per = (v, unit) => (v === null || v === undefined ? "Unlimited" : v === 0 ? "—" : `${n(v)} ${unit}`);
const yes = (on, text = "✓") => (on ? text : "—");
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);

// Haiku 5.5: $0.10 per million input tokens, $0.50 per million output. The site only counts total tokens, and most
// are input (photos), so the estimate assumes 90% input.
const CLAUDE_PER_TOKEN = (0.9 * 0.1 + 0.1 * 0.5) / 1e6;

/** The services we use. metric: the Admin -> Usage metric for today's use. */
function vendors(on) {
  return [
    { key: "ebay", name: "eBay Browse API", what: "Finding auctions, opening listings, final prices, eBay listing alerts, reported sales",
      price: "Free", limit: "5,000 calls a day (bot 4,500, website 500)", metric: "ebay_calls", cap: 5000, status: "live" },
    { key: "ppt", name: "PokemonPriceTracker", what: "Card and sealed prices, graded sales, card search",
      price: "$9.99 a month", limit: "20,000 credits a day (2,000 kept for the website)", metric: "ppt_credits", cap: 20000, status: "live" },
    { key: "claude", name: "Anthropic Claude (Haiku 5.5)", what: "Deal photo checks, photo appraiser, search by picture, Boogie Bot, import columns",
      price: "Pay per use: about $0.001–0.002 a photo", limit: "No daily limit (Premium photo caps keep it in check)",
      metric: "claude_tokens", cost: true, status: on.claude ? "live" : "off" },
    { key: "resend", name: "Resend", what: "Every email: sign-in links, alerts, recaps, release notes",
      price: "$20 a month (Pro)", limit: `50,000 a month; daily safety limit ${on.emailCap ? n(on.emailCap) : "none"}`, metric: "emails", cap: on.emailCap,
      status: on.sender === "Resend" ? "live" : "off", note: on.sender === "Resend" ? null : `Sending through ${on.sender}` },
    { key: "hostinger", name: "Hostinger (website)", what: "Runs tcgboogie.com and the support@ mailbox", price: "Your Hostinger plan", limit: "—", status: "live" },
    { key: "vps", name: "Bot server (VPS)", what: "The deal bot, the database and nightly backups",
      price: "Your VPS plan", limit: "47 GB disk, 3.8 GB memory", metric: "vps_disk_gb", cap: 47.3, unit: "GB", status: "live" },
    { key: "discord", name: "Discord (BoogieBot)", what: "Deal and price alerts by DM (members must join the TCG Boogie server), your admin warnings", price: "Free", limit: "Discord's sending rate", status: on.discord ? "live" : "off" },
    { key: "push", name: "Web push", what: "Phone and computer notifications", price: "Free", limit: "—", status: "live" },
    { key: "twilio", name: "Twilio", what: "Text message alerts", price: "Per text", limit: "Per member daily cap (SMS_DEALS_PER_DAY)", status: on.sms ? "live" : "off" },
    { key: "stripe", name: "Stripe", what: "Premium subscriptions and the free trial", price: "Stripe's fee per payment", limit: "—", status: on.stripe ? "live" : "off" },
    { key: "x", name: "X (Twitter) API", what: "Posting Market Movers and release notes; the X ad pixel (ri3dv) and its Sign up / Start trial / Purchase events", price: "Per post (pixel free)", limit: "—", status: on.x ? "live" : "off" },
    { key: "tcgdex", name: "TCGdex", what: "Pictures for cards TCGplayer has none for", price: "Free", limit: "—", status: "live" },
    { key: "epn", name: "eBay Partner Network", what: "Commission on eBay links (earns money)", price: "Pays you", limit: "—", status: "live" },
  ];
}

// grows: what makes a feature's cost go up. shared = the same for 10 members or 10,000.
export const GROWS = {
  shared: { label: "Shared", help: "Costs the same however many members use it" },
  member: { label: "Per member", help: "Grows with every member who uses it" },
  card: { label: "Per card", help: "Grows with every card watched or owned" },
  use: { label: "Per use", help: "Each use costs something (capped by the plan)" },
};

/** Every feature: { area, name, what, vendors, grows, free, premium, link }. free / premium: what each plan gets. */
function features(free, premium, sms) {
  const ch = (p) => ["Email", p.watchAlertChannels.includes("push") && "push", p.watchAlertChannels.includes("discord") && "Discord",
    p.watchAlertChannels.includes("sms") && (sms ? "text" : "text (soon)")].filter(Boolean).join(", ");
  return [
    { area: "Deals", name: "Deal finder", link: "/app/deals", grows: "shared", vendors: ["ebay", "ppt", "claude", "vps"],
      what: "Scans eBay auctions ending soon, prices each card, photo-checks likely deals. One scan serves every member.",
      free: `After the auction ends · ${free.minDiscountFloor}%+ off · $${free.minValueFloor}+ cards`,
      premium: `Live, while you can bid · ${premium.minDiscountFloor}%+ off · $${premium.minValueFloor}+ cards` },
    { area: "Deals", name: "Deal filters", link: "/app/deals", grows: "shared", vendors: [],
      what: "Which deals reach a member: cards, grades, discount, value.",
      free: `${free.maxProfiles} filter, ${per(free.maxCardsPerFilter, "cards")}`, premium: `${premium.maxProfiles} filters, ${per(premium.maxCardsPerFilter, "cards")}` },
    { area: "Deals", name: "Deal alerts", link: "/app/account#alerts", grows: "member", vendors: ["resend", "discord", "push", "twilio", "epn"],
      what: "Each matching deal sent to the member (bundled in email, capped per day).", free: ch(free), premium: ch(premium) },
    { area: "Deals", name: "Market Movers", link: "/sales", grows: "shared", vendors: ["ebay", "ppt", "x", "epn"],
      what: "Public page of caught deals, new highs and big sales; ready-made X posts.", free: "✓ (public)", premium: "✓" },

    { area: "Price alerts", name: "Price alerts", link: "/app/watches", grows: "card", vendors: ["ppt", "resend", "discord", "push", "twilio"],
      what: "A member's target price on a card, or a new high / new low (each time it beats the record we've seen), checked daily against the market. Set from the bell on a card page in one tap.",
      free: per(free.maxPriceWatches, "alert"), premium: per(premium.maxPriceWatches, "alerts") },
    { area: "Price alerts", name: "eBay listing alerts", link: "/app/watches", grows: "card", vendors: ["ebay"],
      what: "Also searches eBay Buy It Now for the card: daily when the target is close to market, every 3 days, or weekly for long shots.",
      free: yes(free.ebayListingAlerts), premium: yes(premium.ebayListingAlerts, "✓ (1,000 searches a day max)") },
    { area: "Price alerts", name: "Sell-high and set alerts", link: "/app/collection", grows: "card", vendors: ["ppt", "resend"],
      what: "Collection cards up 25%+ in a week; deals on cards missing from a set.", free: yes(free.collectionAlerts), premium: yes(premium.collectionAlerts) },

    { area: "Collection", name: "Collection tracker", link: "/app/collection", grows: "card", vendors: ["ppt"],
      what: "Every card's value, updated daily, with the value chart and top movers.",
      free: `✓ · ${free.collectionHistoryDays === null ? "all-time" : `${free.collectionHistoryDays}-day`} chart`,
      premium: `✓ · ${premium.collectionHistoryDays === null ? "all-time" : `${premium.collectionHistoryDays}-day`} chart` },
    { area: "Collection", name: "Photo appraiser", link: "/app/collection/photo", grows: "use", vendors: ["claude", "ppt"],
      what: "A photo of up to 20 cards: each one found, valued and ready to add.",
      free: per(free.photoAppraiser ? free.appraisePerMonth : 0, "photos a month"), premium: per(premium.photoAppraiser ? premium.appraisePerMonth : 0, "photos a month") },
    { area: "Collection", name: "Search by picture", link: "/app/collection", grows: "use", vendors: ["claude", "ppt"],
      what: "The 📷 in Add cards: photograph cards to find them.",
      free: free.photoSearch && free.photoSearchTotal != null ? `${n(free.photoSearchTotal)} photos in total, then Premium` : per(free.photoSearch ? free.photoSearchPerMonth : 0, "photos a month"),
      premium: premium.photoSearch && premium.photoSearchTotal != null ? `${n(premium.photoSearchTotal)} photos in total` : per(premium.photoSearch ? premium.photoSearchPerMonth : 0, "photos a month") },
    { area: "Collection", name: "Import from other apps", link: "/app/collection/import", grows: "use", vendors: ["claude", "ppt"],
      what: "CSV files from other apps; Claude reads columns we don't recognise.", free: yes(free.collectionImport), premium: yes(premium.collectionImport) },
    { area: "Collection", name: "Sell on eBay", link: "/app/collection", grows: "use", vendors: ["ebay"],
      what: "Lists a member's card on their own eBay account (eBay's Inventory API: its own limits, not the Browse budget).",
      free: per(free.sellOnEbay ? free.sellPerMonth : 0, "a month"), premium: per(premium.sellOnEbay ? premium.sellPerMonth : 0, "a month") },
    { area: "Collection", name: "Worth grading?", link: "/app/collection", grows: "card", vendors: ["ppt"],
      what: "Which raw cards would gain the most from grading.", free: free.gradingCheck ? "✓" : "Top 3", premium: premium.gradingCheck ? "✓" : "Top 3" },
    { area: "Collection", name: "Trade analyzer", link: "/app/collection/trade", grows: "use", vendors: ["ppt"],
      what: "Prices both sides of a trade and grades its fairness.", free: yes(free.tradeAnalyzer), premium: yes(premium.tradeAnalyzer) },
    { area: "Collection", name: "Export", link: "/app/collection", grows: "shared", vendors: [],
      what: "Download the collection as a CSV.", free: yes(free.collectionExport), premium: yes(premium.collectionExport) },

    { area: "Cards", name: "Card pages", link: "/app/collection", grows: "card", vendors: ["ppt", "ebay", "epn"],
      what: "Prices by condition, graded sales and value history for any card. New lookups: 400 a day per member, 2,000 a day site-wide, saved prices when under 1,000 credits are left.", free: "✓", premium: "✓" },
    { area: "Cards", name: "Report a sale", link: "/app/collection", grows: "use", vendors: ["ebay"],
      what: "A member pastes an eBay sale we're missing; we verify it with eBay.", free: yes(free.reportSales, "15 a day"), premium: yes(premium.reportSales, "15 a day") },
    { area: "Cards", name: "Request a card", link: "/app/collection", grows: "use", vendors: ["ppt"],
      what: "Add a card or sealed product we don't list yet.", free: yes(free.cardRequests, "20 a day"), premium: yes(premium.cardRequests, "20 a day") },
    { area: "Cards", name: "Missing picture?", link: "/app/admin?tab=requests&kind=picture", grows: "use", vendors: ["tcgdex", "discord"],
      what: "Finds a picture on TCGdex, or DMs you to add one.", free: "30 a day", premium: "30 a day" },

    { area: "Email and help", name: "Sign-in links", link: "/login", grows: "member", vendors: ["resend"],
      what: "Passwordless email sign-in. 10% of the daily email limit is always kept for these; 4 links an hour per address, 20 a day per IP.", free: "✓", premium: "✓" },
    { area: "Email and help", name: "Email recap", link: "/app/account#alerts", grows: "member", vendors: ["resend", "ppt"],
      what: "Collection value, biggest movers, deals and alerts.", free: cap1(free.emailRecap || "monthly"), premium: cap1(premium.emailRecap || "monthly") },
    { area: "Email and help", name: "Release emails", link: "/app/admin?tab=releases", grows: "member", vendors: ["resend"],
      what: "What's new, sent from Admin -> Release emails to members with product updates on.", free: "✓", premium: "✓" },
    { area: "Email and help", name: "Boogie Bot", link: "/app/admin?tab=helper", grows: "use", vendors: ["claude"],
      what: "The site helper that answers members' questions (visitors 8 a day per IP; 2,000 a day site-wide).", free: "25 a day", premium: "80 a day" },

    { area: "Running the site", name: "Premium billing", link: "/app/admin", grows: "member", vendors: ["stripe"],
      what: `Subscriptions at $${premium.price} a month${premium.trialDays ? `, ${premium.trialDays}-day free trial` : ""}.`, free: "—", premium: "✓" },
    { area: "Running the site", name: "Usage and warnings", link: "/app/admin?tab=usage", grows: "shared", vendors: ["discord", "vps"],
      what: "Admin -> Usage, and Discord DMs to you at 75% and 90% of any limit, for each new member and for Premium trials, upgrades, cancels and ends.", free: "—", premium: "—" },
    { area: "Running the site", name: "Website and database", link: "/app/admin", grows: "shared", vendors: ["hostinger", "vps"],
      what: "tcgboogie.com on Hostinger; the database, bot and backups on the VPS.", free: "—", premium: "—" },
  ];
}

/** Everything the Feature map page shows. */
export async function featureMap() {
  const { free, premium, sms } = await effectivePlans();
  const ready = channelsReady();
  const on = { claude: appraiserReady(), discord: ready.discord, sms, stripe: billingLive(), x: xReady(), sender: emailSender(), emailCap: emailCap() };
  const today = {};
  if (db) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      for (const r of await db.select().from(schema.usageDaily).where(eq(schema.usageDaily.day, day))) today[r.metric] = Number(r.value);
    } catch { /* Usage table missing: no numbers */ }
  } else {
    Object.assign(today, { ebay_calls: 3936, ppt_credits: 10994, claude_tokens: 1092492, emails: 27, vps_disk_gb: 4.7 }); // demo
  }
  const list = features(free, premium, sms);
  const vs = vendors(on).map((v) => {
    const used = v.metric ? today[v.metric] ?? null : null;
    return { ...v, used, cost: v.cost && used !== null ? used * CLAUDE_PER_TOKEN : null, features: list.filter((f) => f.vendors.includes(v.key)).length };
  });
  return { vendors: vs, features: list, areas: [...new Set(list.map((f) => f.area))] };
}

import "server-only";
import { refreshFeatures } from "@/lib/features";
import { channelsReady } from "@/lib/notify";
import { planFor } from "@/lib/plans";

// Everything the site says about what each plan includes (pricing cards, comparison table, Premium page, Settings,
// FAQ), worked out from the plans as Admin → Features left them, so no page promises a feature a plan doesn't have.
// Until texting is set up (Twilio), plans that include text alerts say "text alerts coming soon" instead.

const yes = (on) => (on ? "✓" : "—");
/** A monthly allowance cell: "—" (not included), "Unlimited", or "5 a month". */
const allowance = (on, perMonth) => (!on || perMonth === 0 ? "—" : perMonth === null || perMonth === undefined ? "Unlimited" : `${perMonth} a month`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The plans in effect right now (Admin → Features applied) and which alert channels really work. */
export async function effectivePlans() {
  await refreshFeatures();
  const ready = channelsReady();
  return { free: planFor("free"), premium: planFor("premium"), sms: Boolean(ready.sms) };
}

/** "email", "email and Discord", "email, Discord and text": the channels a plan's alerts can use. */
export function channels(p, sms) {
  const names = ["email", ...(p.watchAlertChannels.includes("push") ? ["push notification"] : []),
    ...(p.watchAlertChannels.includes("discord") ? ["Discord"] : []), ...(sms && p.watchAlertChannels.includes("sms") ? ["text"] : [])];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** " (text alerts coming soon)" when this plan includes texts but texting isn't set up yet, else "". */
export const textSoon = (p, sms) => (!sms && p.watchAlertChannels.includes("sms") ? " (text alerts coming soon)" : "");

/** Rows of the Free vs Premium comparison table: [what, free, premium]. */
export function planRows({ free, premium, sms }) {
  const rows = [
    ["Deals", (p) => (p.liveFeed ? "Live, while you can still bid" : "After the auction ends, with the last bid")],
    ["How early you hear about a deal", (p) => (p.liveFeed ? `Up to ${p.maxWindowMinutes} minutes before it ends` : "—")],
    ["Smallest discount we alert", (p) => `${p.minDiscountFloor}% below market`],
    ...(free.minValueFloor || premium.minValueFloor ? [["Card values covered", (p) => (p.minValueFloor ? `$${p.minValueFloor}+` : "Any value")]] : []),
    ["Deal filters", (p) => String(p.maxProfiles)],
    ["Cards per deal filter (\"any card named …\" counts as one)", (p) => (p.maxCardsPerFilter === null ? "Unlimited" : String(p.maxCardsPerFilter))],
    ["Japanese cards in deal alerts", (p) => yes(p.japanese)],
    ["Price alerts (buying or selling)", (p) => (p.maxPriceWatches === null ? "Unlimited" : String(p.maxPriceWatches))],
    ["Alerts by", (p) => `${channels(p, sms).replace(/^e/, "E")}${textSoon(p, sms)}`],
    ["eBay listing alerts: a watched card listed at or under your price", (p) => yes(p.ebayListingAlerts)],
    ["Photo check on deals (listing photos compared with the card)", () => "✓"],
    ["Collection tracker: unlimited cards, daily values, sets, wishlist", () => "✓"],
    ["Every language: English and Japanese, plus Korean, Chinese and more on request", () => "✓"],
    ["Collection value history", (p) => (p.collectionHistoryDays === null ? "All time" : `Last ${p.collectionHistoryDays} days`)],
    ["Import a collection from any app", (p) => yes(p.collectionImport)],
    ["Export your collection as CSV", (p) => yes(p.collectionExport)],
    ["Trade Analyzer, with a fairness grade", (p) => yes(p.tradeAnalyzer)],
    ["Worth Grading?", (p) => (p.gradingCheck ? "Full list" : "Top 3")],
    ["Search by picture (camera or upload)", (p) => allowance(p.photoSearch, p.photoSearchPerMonth)],
    ["Photo appraiser: a binder page, every card found", (p) => allowance(p.photoAppraiser, p.appraisePerMonth)],
    ["Sell on eBay from your collection", (p) => allowance(p.sellOnEbay, p.sellPerMonth).replace(/a month$/, "listings a month")],
    ["Set-completion deals and sell-high alerts", (p) => yes(p.collectionAlerts)],
    ["Email recap", (p) => (p.emailRecap === "daily" ? "Daily or weekly" : "Weekly")],
  ];
  return rows.map(([what, cell]) => [what, cell(free), cell(premium)]);
}

/** Short lines for one plan's card: what it includes. */
function lines(p, sms) {
  return [
    ["tracker", true, "Collection tracker, unlimited cards"],
    ["watches", p.maxPriceWatches !== 0, p.maxPriceWatches === null ? "Unlimited price alerts" : plural(p.maxPriceWatches, "price alert")],
    ["deals", true, p.liveFeed ? "Every deal live, before the auction ends" : "See the deals you missed, after they end"],
    ["channels", p.watchAlertChannels.length > 1, `Instant alerts by ${channels(p, sms)}${textSoon(p, sms)}`],
    ["filters", true, `${plural(p.maxProfiles, "deal filter")}${p.maxCardsPerFilter === null ? ", any number of cards" : ` (up to ${plural(p.maxCardsPerFilter, "card")} each)`}${p.japanese ? ", Japanese cards" : ""}`],
    ["trade", p.tradeAnalyzer, "Trade Analyzer"],
    ["import", p.collectionImport, "Import from any app"],
    ["photoSearch", p.photoSearch && p.photoSearchPerMonth !== 0, p.photoSearchPerMonth == null ? "Unlimited search by picture" : `Search by picture (${p.photoSearchPerMonth} photos a month)`],
    ["appraiser", p.photoAppraiser && p.appraisePerMonth !== 0, p.appraisePerMonth == null ? "Photo appraiser" : `Photo appraiser (${p.appraisePerMonth} photos a month)`],
    ["grading", true, p.gradingCheck ? "Every Worth Grading? pick" : "Worth Grading? top 3 picks"],
    ["history", true, p.collectionHistoryDays === null ? "Full collection history" : `${p.collectionHistoryDays}-day collection history`],
    ["export", p.collectionExport, "CSV export"],
    ["collectionAlerts", p.collectionAlerts, "Set-completion deals and sell-high alerts"],
    ["sell", p.sellOnEbay && p.sellPerMonth !== 0, p.sellPerMonth == null ? "Sell on eBay, unlimited listings" : `Sell on eBay (${plural(p.sellPerMonth, "listing")} a month)`],
  ].filter(([, on]) => on).map(([key, , text]) => ({ key, text }));
}

/**
 * The pricing cards' lists: Free's lines, and Premium's "Everything in Free, plus" lines (only what's different,
 * most important first). Both capped so the cards stay short.
 */
export function planHighlights({ free, premium, sms }) {
  const f = lines(free, sms);
  const p = lines(premium, sms);
  const freeText = new Map(f.map((x) => [x.key, x.text]));
  return {
    free: f.filter((x) => x.key !== "history").slice(0, 8).map((x) => x.text),
    premium: p.filter((x) => freeText.get(x.key) !== x.text).slice(0, 8).map((x) => x.text),
  };
}

/** Free-trial days for new Premium members (Admin → Plans → Billing); 0 = no trial. */
export const trialDays = ({ premium }) => Math.max(0, Number(premium.trialDays) || 0);

import "server-only";
import { refreshFeatures } from "@/lib/features";
import { channelsReady } from "@/lib/notify";
import { planFor } from "@/lib/plans";

// Everything the site says about what each plan includes (pricing cards, comparison table, Premium page, Settings,
// FAQ), worked out from the plans as Admin → Features left them, so no page promises a feature a plan doesn't have.
// Text alerts are only mentioned once texting is actually set up.

const yes = (on) => (on ? "✓" : "—");

/** The plans in effect right now (Admin → Features applied) and which alert channels really work. */
export async function effectivePlans() {
  await refreshFeatures();
  const ready = channelsReady();
  return { free: planFor("free"), premium: planFor("premium"), sms: Boolean(ready.sms) };
}

/** "email", "email and Discord", "email, Discord and text": the channels a plan's alerts can use. */
export function channels(p, sms) {
  const names = ["email", ...(p.watchAlertChannels.includes("discord") ? ["Discord"] : []), ...(sms && p.watchAlertChannels.includes("sms") ? ["text"] : [])];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** Rows of the Free vs Premium comparison table: [what, free, premium]. */
export function planRows({ free, premium, sms }) {
  const rows = [
    ["Deals", (p) => (p.liveFeed ? "Live, while you can still bid" : "After the auction ends, with the last bid")],
    ["How early you hear about a deal", (p) => (p.liveFeed ? `Up to ${p.maxWindowMinutes} minutes before it ends` : "—")],
    ["Smallest discount we alert", (p) => `${p.minDiscountFloor}% below market`],
    ["Card values covered", (p) => `$${p.minValueFloor}+`],
    ["Deal filters", (p) => String(p.maxProfiles)],
    ["Japanese cards in deal alerts", (p) => yes(p.japanese)],
    ["Price alerts (buying or selling)", (p) => (p.maxPriceWatches === null ? "Unlimited" : String(p.maxPriceWatches))],
    ["Alerts by", (p) => channels(p, sms).replace(/^e/, "E")],
    ["eBay listing alerts: a watched card listed at or under your price", () => "✓"],
    ["Photo check on deals (listing photos compared with the card)", () => "✓"],
    ["Collection tracker: unlimited cards, daily values, sets, wishlist", () => "✓"],
    ["Every language: English and Japanese, plus Korean, Chinese and more on request", () => "✓"],
    ["Collection value history", (p) => (p.collectionHistoryDays === null ? "All time" : `Last ${p.collectionHistoryDays} days`)],
    ["Import a collection from any app", (p) => yes(p.collectionImport)],
    ["Export your collection as CSV", (p) => yes(p.collectionExport)],
    ["Trade Analyzer, with a fairness grade", (p) => yes(p.tradeAnalyzer)],
    ["Worth Grading?", (p) => (p.gradingCheck ? "Full list" : "Top 3")],
    ["Search by picture (camera or upload)", (p) => yes(p.photoSearch)],
    ["Photo appraiser: a binder page, every card found", (p) => yes(p.photoAppraiser)],
    ["Sell on eBay from your collection", (p) => yes(p.sellOnEbay)],
    ["Set-completion deals and sell-high alerts", (p) => yes(p.collectionAlerts)],
    ["Email recap", (p) => (p.emailRecap === "daily" ? "Daily or weekly" : "Weekly")],
  ];
  return rows.map(([what, cell]) => [what, cell(free), cell(premium)]);
}

/** Short lines for one plan's card: what it includes. */
function lines(p, sms) {
  return [
    ["tracker", true, "Collection tracker, unlimited cards"],
    ["watches", true, p.maxPriceWatches === null ? "Unlimited price alerts" : `${p.maxPriceWatches} price alerts`],
    ["deals", true, p.liveFeed ? "Every deal live, before the auction ends" : "See the deals you missed, after they end"],
    ["channels", p.watchAlertChannels.length > 1, `Instant alerts by ${channels(p, sms)}`],
    ["filters", true, `${p.maxProfiles} deal filter${p.maxProfiles === 1 ? "" : "s"}${p.japanese ? ", Japanese cards" : ""}`],
    ["trade", p.tradeAnalyzer, "Trade Analyzer"],
    ["import", p.collectionImport, "Import from any app"],
    ["photoSearch", p.photoSearch, "Search by picture"],
    ["appraiser", p.photoAppraiser, "Photo appraiser"],
    ["grading", true, p.gradingCheck ? "Every Worth Grading? pick" : "Worth Grading? top 3 picks"],
    ["history", true, p.collectionHistoryDays === null ? "Full collection history" : `${p.collectionHistoryDays}-day collection history`],
    ["export", p.collectionExport, "CSV export"],
    ["collectionAlerts", p.collectionAlerts, "Set-completion deals and sell-high alerts"],
    ["sell", p.sellOnEbay, "Sell your cards on eBay in a minute"],
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
    free: f.filter((x) => !["filters", "history"].includes(x.key)).slice(0, 7).map((x) => x.text),
    premium: p.filter((x) => freeText.get(x.key) !== x.text).slice(0, 7).map((x) => x.text),
  };
}

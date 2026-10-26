import "server-only";
import { billingLive } from "@/lib/billing";
import { channels, effectivePlans, planHighlights, textSoon, trialDays } from "@/lib/plan-copy";

// The FAQ (app/faq) and the site helper (lib/helper.js) both read these. Questions grouped by topic. Answers that describe what each plan includes are
// built from the plans as Admin → Features set them (lib/plan-copy.js), so the FAQ never promises a feature a plan
// doesn't have.
export const faqGroups = ({ free, premium, sms, lists, trial }) => {
  const premiumOnly = (flag) => (premium[flag] && !free[flag] ? " (Premium)" : "");
  return [
    ["start", "Getting started", [
      ["Is it really free?",
        `Yes. Free is free forever, no card needed, and includes: ${lists.free.join(" · ")}. Premium is $${premium.price}/month plus sales tax.`],
      ["What's the difference between Free and Premium?",
        `Free includes: ${lists.free.join(" · ")}. Premium adds: ${lists.premium.join(" · ")}.`],
      ["Will you add Magic, Lorcana, One Piece or Yu-Gi-Oh!?",
        "They're on the way. Tap a game on the homepage to vote for it: the most-wanted game comes first, and we'll email you when it's live."],
      ["Are you affiliated with eBay or TCGplayer?",
        "No, we're independent. Some eBay links earn us a small commission if you buy. It never changes your price."],
    ]],
    ["finding", "Finding and adding cards", [
      ["What's the best way to search?",
        "Type the card's name, then its number: \"Black Kyurem 020/027\" or \"Charizard ex 199\". English and Japanese cards come up together, and the card matching both name and number comes first. For a TAG TEAM card, type one Pokémon and \"&\" or \"tag team\" (\"Buneary &\" finds Mega Lopunny & Jigglypuff GX). Small typos are fine. Very short numbers like \"4\" don't help, so type the full number with the slash (\"4/102\")."],
      ["What's the difference between search by picture and \"Photo of many cards\"?",
        `Search by picture${premiumOnly("photoSearch")} is the 📷 in the Add cards search: take or upload a photo of one card and we find it. Photo of many cards${premiumOnly("photoAppraiser")} reads a whole binder page or spread at once, values every card, and adds the ones you tick.`],
      ["Do you cover Japanese, Korean and Chinese cards, promos and sealed product?",
        "Yes. Search covers English and Japanese cards, including promos, plus sealed product like booster boxes, Elite Trainer Boxes and bundles. Korean, Chinese and other cards are added by request (below). The same artwork is often printed in several languages with different set names and numbers: a Chinese card can be 037/061 while the Japanese one is 066/095, so check the number to pick the right one."],
      ["I can't find a card or sealed product. Can you add it?",
        "Yes, usually on the spot. Under any search (and on set pages) tap Request a card or sealed product, choose which it is, and paste a link to it. TCGplayer links and eBay listings of Pokémon cards are added straight away, and so are links from other sites when we can tell which Pokémon card it is. Anything else our team checks before adding it. Once added, search finds it for everyone."],
      ["Can I import my collection from another app?",
        "Yes. Export a CSV from TCGplayer, Collectr, PriceCharting, any other app or a spreadsheet and open Import on your collection. If we don't recognise the columns, we work out which is which and you can correct them before anything is added. A card name is enough; set, number or a TCGplayer ID make matches more exact. You review every match before importing."],
    ]],
    ["prices", "Prices and values", [
      ["How do you know what a card is worth?",
        "In your collection and on card pages: raw cards and sealed product use TCGplayer's market price, updated daily, and graded cards use sales of that exact card and grade over the last 90 days (eBay and Fanatics Collect sales, auctions our deal finder watched end, and sales members report), newer sales counting more. Deal alerts compare a listing with what that exact card sold for on eBay in the last 30 days, so a deal reflects today's market. Cards our price service doesn't cover say \"No pricing data available\" instead of guessing."],
      ["Why does a graded price say \"Few sales\" or \"No sales in the last 90 days\"?",
        "Some grades barely sell. With three or more recent sales we use the typical price; with one or two we still show a value but mark it \"Few sales\" so you know it's thin. If nothing sold in 90 days we say so instead of guessing."],
      ["Why does a card say \"No pricing data available\"?",
        "It was added by a member and our price service doesn't cover it yet, which is common for Korean and Chinese cards. You can still add it to your collection with your own value, set price alerts, and report eBay sales, which build its graded values. If the price service adds it later, prices appear by themselves."],
      ["What does an amber value with \"✎ Your value\" mean?",
        "It's a value you typed in yourself (Edit → Your value) for a copy we have no market price for, like a card our price service doesn't cover or a graded copy with no recent sales. We show it in amber so you always know which totals rest on your own numbers. As soon as a market price turns up, it replaces your value automatically."],
      ["A price looks wrong. Can I fix it?",
        "Yes. On the card page, tap Price wrong? (or Report a sale we're missing) and paste the eBay link of a sale. It has to be a sold, finished eBay listing for that card. We check it with eBay and add it to the card's sales right away."],
      ["Can I check sold prices myself?",
        "Yes. Every card page lists its latest graded sales, which you can filter to one grade, with links to the eBay listings and to all sold listings on eBay."],
    ]],
    ["deals", "Deals and alerts", [
      ["Where do the deals come from?",
        "Public eBay auctions for graded slabs, raw cards and sealed product (auctions only, not Buy It Now or Best Offer listings). We flag the ones priced well below what the same item has really sold for, before they end, and compare the listing photos with the card to catch the wrong card or version."],
      ["Are the deals on the homepage real?",
        "Yes. They're real eBay auctions our deal finder caught that actually sold below market. The price shown is the winning bid plus shipping (for example \"Won at $455.00 + $6.25 shipping · 27 bids\"), compared with what that card usually sells for. \"See this sale on eBay\" finds that exact sale by its item number; eBay may ask you to sign in to see sold listings."],
      ["Do deals include reprints like Celebrations or Classic Collection?",
        "A reprint is matched to the reprint version and valued as the reprint, never as the original card, so a $15 Celebrations Blastoise won't show up as a 90%-off Base Set one. If we can't tell which version a listing is, we skip it."],
      ["Why don't I get deals on cheaper cards?",
        `Deals cover cards worth $${free.minValueFloor} or more. A deal on a $5 card saves you a dollar or two, and checking every cheap auction would use up our daily eBay allowance. Skipping them lets us check eBay more often, so you hear about the cards that matter sooner. Price alerts and your collection cover every card, whatever it's worth.`],
      ["How do I pick which cards I get deals on?",
        "In Deals → My filters, open a filter and tap + Add cards: search by name or number and tick the ones you want, or choose \"Any card named …\" to cover every version of a Pokémon. The cards show as pictures on the filter, and if nothing has matched yet, the filter suggests ways to widen it. Tap Update this filter to save."],
      ["What's the History tab?",
        "On Premium, every deal alert we've sent you, newest first. On Free, the deals your filters caught this week, shown after they ended, so you can see what you would have caught."],
      ["What's a price alert?",
        `Pick any card or sealed product and your price. Buying? We tell you when it drops to your price${premium.ebayListingAlerts && !free.ebayListingAlerts ? ", and on Premium (for cards) when someone lists it on eBay at or under your price" : ", and (for cards) when someone lists it on eBay at or under your price"}. Selling? We tell you when it climbs to it. The Performance tab shows how close each alert is.`],
      ["How often do you check eBay for my price alerts?",
        "Every price is checked daily. For eBay listings we check each card by how likely a listing at your price is: if your price is close to what the card sells for, every day; a little below, every few days; far below, about once a week. If the card's price drops toward yours, we start checking it more often by ourselves."],
      ["How do alerts reach me? Do I need Discord?",
        `No. On Free, alerts come by ${channels(free, sms)}${textSoon(free, sms)}; on Premium, by ${channels(premium, sms)}${textSoon(premium, sms)}. Switch each one on or off at the top of the Price alerts page or in Settings. You also get a ${free.emailRecap} email recap${premium.emailRecap !== free.emailRecap ? ` (${premium.emailRecap} on Premium)` : ""} that you can turn off in Settings.`],
      ["How do I get push notifications on my phone?",
        "Push notifications pop up on your phone or computer the moment we send an alert, even when TCG Boogie isn't open (Premium). Go to Settings → How we reach you → Push notifications and tap \"Turn on for this device\", then allow notifications. On iPhone, add TCG Boogie to your home screen first (Share → Add to Home Screen) and open it from there: Apple only allows push for apps on the home screen. Switch on each phone or computer you want alerts on, and use \"Send a test\" to check."],
      ["Do you bid or buy for me?",
        "No. We send the alert; you decide whether to bid or buy. We never bid, buy or message sellers for you. If you connect eBay to sell your own cards, we only create the listings you review and post, and you can disconnect it anytime in Settings."],
    ]],
    ["tools", "Collection tools", [
      ["What does the collection tracker do?",
        `Keeps every card you own in one place with what it's worth, updated daily. The value chart (open when you arrive) shows its value and what you paid over time, and Top Movers shows the cards that moved most this week. Add cards by search, open a set and tap the ones you have, import from any app, request cards we don't list yet, search by picture${premiumOnly("photoSearch")}, or photograph a whole binder page${premiumOnly("photoAppraiser")} and we find every card. The eye button hides your totals for screenshots.`],
      ["Which of my cards are worth grading?",
        `Open Worth Grading? from your collection. For each raw Near Mint card we compare today's raw price with recent graded sales at PSA, BGS, CGC, SGC or TAG, take off the grading cost you pick, and show the profit. ${free.gradingCheck ? "Every plan shows the full list." : "Free shows the top 3; Premium shows them all."}`],
      ["What's the Trade Analyzer?",
        "Put in what you'd give (from your collection or any card) and what you'd get, in any condition or grade, plus cash. We price both sides at today's market and grade the trade out of 10 for fairness: 10 is even, and the grade is the same whichever side you're on."],
      ["Can I sell my cards on eBay from here?",
        "Yes. Connect your eBay seller account in Settings, then tap Sell on eBay on any card in your collection. We fill in the title, set, number, grade or condition, cert number and a price from recent sales; you add photos and post. We never see your eBay password, and eBay's normal selling fees apply."],
    ]],
    ["billing", "Plans and billing", [
      ["How does billing work?",
        `Premium is $${premium.price} a month plus any sales tax where you live, shown before you pay. It renews monthly until you cancel. Payments go through Stripe; we never see your card number. Settings → Billing shows your next charge, the card on file and every past payment with its receipt.`],
      ...(trial > 0 ? [["Is there a free trial?",
        `Yes. New members get ${trial} days of Premium free. You add a card at checkout but pay $0 that day; your first $${premium.price} charge is when the trial ends. We email you 3 days before, and if you cancel in Settings → Billing before the trial ends, you're never charged. One trial per member.`]] : []),
      ["Can I cancel anytime?",
        "Yes, in one click from Settings → Billing. You keep Premium until the end of the month you paid for (or the end of your free trial), then you're back on Free with your collection and settings intact. Anything over the Free limits is paused, not deleted. Months aren't refunded part-way, and deleting your account cancels your subscription too."],
      ["What are the limits on Free?",
        `Free includes ${free.photoSearchTotal != null ? `${free.photoSearchTotal} search-by-picture photos to try it (in total, not monthly; after that it's part of Premium)` : `${free.photoSearchPerMonth === null ? "unlimited" : free.photoSearchPerMonth} search-by-picture photos`} and ${free.sellPerMonth === null ? "unlimited" : free.sellPerMonth} Sell on eBay listings a month, counted from the 1st. The Add cards box and the Sell page show how many you have left. Premium includes ${premium.photoSearchPerMonth === null ? "unlimited" : premium.photoSearchPerMonth} search-by-picture and ${premium.appraisePerMonth === null ? "unlimited" : premium.appraisePerMonth} photo appraiser photos a month, and ${premium.sellPerMonth === null ? "unlimited" : premium.sellPerMonth} Sell on eBay listings. A photo can hold up to 20 cards (a whole binder page) and counts as one.`],
    ]],
    ["account", "Your account and data", [
      ["Who can see my collection?",
        "Only you. Your collection, alerts and settings are private. Cards you add by request join the shared catalog so others can find them, but your name isn't shown with them."],
      ["How do I delete my account or my data?",
        "Settings → Delete account removes your account, collection, alerts and history for good, and cancels any subscription. You can also email support@tcgboogie.com for a copy of your data. The Privacy policy has the details."],
    ]],
  ];
};

/** The FAQ for today's plans: [[id, title, [[question, answer], ...]], ...]. */
export async function currentFaq() {
  const plans = await effectivePlans();
  return faqGroups({ ...plans, lists: planHighlights(plans), trial: billingLive() ? trialDays(plans) : 0 });
}

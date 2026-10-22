import Link from "next/link";
import { channels, effectivePlans, planHighlights } from "@/lib/plan-copy";

export const metadata = { title: "FAQ" };

// Questions grouped by topic, with a row of jump links at the top. Answers that describe what each plan includes are
// built from the plans as Admin → Features set them (lib/plan-copy.js), so the FAQ never promises a feature a plan
// doesn't have.
const groups = ({ free, premium, sms, lists }) => {
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
        "It's a value you typed in yourself (Edit → Your value), not a market price. We show it in amber so you always know which totals rest on your own numbers. Clear the field to go back to the market value."],
      ["A price looks wrong. Can I fix it?",
        "Yes. On the card page, tap Price wrong? (or Report a sale we're missing) and paste the eBay link of a sale. It has to be a sold, finished eBay listing for that card. We check it with eBay and add it to the card's sales right away."],
      ["Can I check sold prices myself?",
        "Yes. Every card page lists its latest graded sales, which you can filter to one grade, with links to the eBay listings and to all sold listings on eBay."],
    ]],
    ["deals", "Deals and alerts", [
      ["Where do the deals come from?",
        "Public eBay auctions for graded slabs, raw cards and sealed product. We flag the ones priced well below what the same item has really sold for, before they end, and compare the listing photos with the card to catch the wrong card or version."],
      ["What's a price alert?",
        "Pick any card or sealed product and your price. Buying? We tell you when it drops to your price, and (for cards) when someone lists it on eBay at or under your price. Selling? We tell you when it climbs to it. The Performance tab shows how close each alert is."],
      ["How do alerts reach me? Do I need Discord?",
        `No. On Free, alerts come by ${channels(free, sms)}; on Premium, by ${channels(premium, sms)}. Switch each one on or off at the top of the Price alerts page or in Settings. You also get a ${free.emailRecap} email recap${premium.emailRecap !== free.emailRecap ? ` (${premium.emailRecap} on Premium)` : ""} that you can turn off in Settings.`],
      ["Do you bid or buy for me?",
        "No. We send the alert; you decide whether to bid or buy. We never bid, buy or message sellers for you. If you connect eBay to sell your own cards, we only create the listings you review and post, and you can disconnect it anytime in Settings."],
    ]],
    ["tools", "Collection tools", [
      ["What does the collection tracker do?",
        `Keeps every card you own in one place with what it's worth, updated daily, and charts its value and what you paid over time. Add cards by search, open a set and tap the ones you have, import from any app, request cards we don't list yet, search by picture${premiumOnly("photoSearch")}, or photograph a whole binder page${premiumOnly("photoAppraiser")} and we find every card. The eye button hides your totals for screenshots.`],
      ["Which of my cards are worth grading?",
        `Open Worth Grading? from your collection. For each raw Near Mint card we compare today's raw price with recent graded sales at PSA, BGS, CGC, SGC or TAG, take off the grading cost you pick, and show the profit. ${free.gradingCheck ? "Every plan shows the full list." : "Free shows the top 3; Premium shows them all."}`],
      ["What's the Trade Analyzer?",
        "Put in what you'd give (from your collection or any card) and what you'd get, in any condition or grade, plus cash. We price both sides at today's market and grade the trade out of 10 for fairness: 10 is even, and the grade is the same whichever side you're on."],
      ["Can I sell my cards on eBay from here?",
        "Yes. Connect your eBay seller account in Settings, then tap Sell on eBay on any card in your collection. We fill in the title, set, number, grade or condition, cert number and a price from recent sales; you add photos and post. We never see your eBay password, and eBay's normal selling fees apply."],
    ]],
    ["billing", "Plans and billing", [
      ["How does billing work?",
        `Premium is $${premium.price} a month plus any sales tax where you live, shown before you pay. It renews monthly until you cancel. Payments go through Stripe; we never see your card number.`],
      ["Can I cancel anytime?",
        "Yes, in one click from Settings → Plan. You keep Premium until the end of the month you paid for, then you're back on Free with your collection and settings intact. Months aren't refunded part-way, and deleting your account cancels your subscription too."],
    ]],
    ["account", "Your account and data", [
      ["Who can see my collection?",
        "Only you. Your collection, alerts and settings are private. Cards you add by request join the shared catalog so others can find them, but your name isn't shown with them."],
      ["How do I delete my account or my data?",
        "Settings → Delete account removes your account, collection, alerts and history for good, and cancels any subscription. You can also email support@tcgboogie.com for a copy of your data. The Privacy policy has the details."],
    ]],
  ];
};

export default async function FAQ() {
  const plans = await effectivePlans();
  const list = groups({ ...plans, lists: planHighlights(plans) });
  return (
    <div className="wrap doc">
      <h1>Questions? Answers.</h1>
      <p className="updated">Still stuck? Email support@tcgboogie.com.</p>
      <nav className="faq-topics" aria-label="FAQ topics">
        {list.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}
      </nav>
      {list.map(([id, title, items]) => (
        <section key={id} id={id} className="faq-group">
          <h2>{title}</h2>
          {items.map(([q, a]) => (
            <details className="faq" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      ))}
      <p className="hint" style={{ marginTop: 20 }}>
        Values are estimates from past sales, not financial advice. More in our <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </div>
  );
}

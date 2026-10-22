import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "FAQ" };

const { free, premium } = PLANS;

const FAQS = [
  ["Is it really free?",
    `Yes. Free includes the collection tracker, ${free.maxPriceWatches} price alerts, the trade analyzer and a look at the deals you missed. No card needed. Premium is $${premium.price}/month plus sales tax when you want deals live.`],
  ["Where do the deals come from?",
    "Public eBay auctions for graded slabs, raw cards and sealed product. We flag the ones priced well below what the same item has really sold for, before they end."],
  ["How do you know what a card is worth?",
    "Raw cards and sealed product use TCGplayer's market price, updated daily. Graded cards use sales of that exact card and grade over the last 90 days: eBay and Fanatics Collect sales, auctions our deal finder watched end, and sales members report. Newer sales count more than older ones."],
  ["Why does a graded price say \"Few sales\" or \"No sales in the last 90 days\"?",
    "Some grades barely sell. With three or more recent sales we use the typical price; with one or two we still show a value but mark it \"Few sales\" so you know it's thin. If nothing sold in 90 days we say so instead of guessing."],
  ["A price looks wrong. Can I fix it?",
    "Yes. On the card page, tap Price wrong? (or Report a sale we're missing) and paste the eBay link of a sale. It has to be a sold, finished eBay listing for that card. We check it with eBay and add it to the card's sales right away."],
  ["Can I check sold prices myself?",
    "Yes. Every card page lists its latest graded sales, which you can filter to one grade, with links to the eBay listings and to all sold listings on eBay."],
  ["Do you cover Japanese cards, promos and sealed product?",
    "Yes. Search finds English and Japanese cards, including promos, plus sealed product like booster boxes, Elite Trainer Boxes and bundles. Sealed prices are tracked over time, and each set page shows its sealed products. Korean, Chinese and other cards can be added by request (see below)."],
  ["I can't find a card or sealed product. Can you add it?",
    "Yes, usually on the spot. Under any search (and on set pages) tap Request a card or sealed product, choose which it is, and paste a link to it: TCGplayer, an eBay listing or a card database all work. If we can tell what it is, it's added straight away and search finds it from then on. If we can't, our team reviews it."],
  ["Why does a card say \"No pricing data available\"?",
    "It was added by a member and our price service doesn't cover it yet, which is common for Korean and Chinese cards. You can still add it to your collection with your own value, set price alerts, and report eBay sales, which build its graded values. If the price service adds it later, prices appear by themselves."],
  ["Can I import my collection from another app?",
    "Yes. Export a CSV from TCGplayer, Collectr, PriceCharting, any other app or a spreadsheet and open Import on your collection. If we don't recognise the columns, we work out which is which and you can correct them before anything is added. A card name is enough; set, number or a TCGplayer ID make matches more exact. You review every match before importing."],
  ["Will you add Magic, Lorcana, One Piece or Yu-Gi-Oh!?",
    "They're on the way. Tap a game on the homepage to vote for it: the most-wanted game comes first, and we'll email you when it's live."],
  ["What's a price alert?",
    "Pick any card or sealed product and your price. Buying? We tell you when it drops to your price, and (for cards) when someone lists it on eBay at or under your price. Selling? We tell you when it climbs to it. The Performance tab shows how close each alert is."],
  ["What does the collection tracker do?",
    "Keeps every card you own in one place with what it's worth, updated daily, and charts its value and what you paid over time. Add cards by search, open a set and tap the ones you have, import a CSV from any app, request cards we don't list yet, or (Premium) snap a photo and we find the cards for you. The eye button hides your totals for screenshots."],
  ["Which of my cards are worth grading?",
    "Open Worth Grading? from your collection. For each raw Near Mint card we compare today's raw price with recent graded sales at PSA, BGS, CGC, SGC or TAG, take off the grading cost you pick, and show the profit. Free shows the top 3; Premium shows them all."],
  ["What's the trade analyzer?",
    "Put in what you'd give (from your collection or any card) and what you'd get, in any condition or grade, plus cash. We price both sides at today's market and tell you if the trade is fair."],
  ["What's the difference between Free and Premium?",
    `Free shows deals after the auction ends, so you can see what you missed. Premium gets them to you live, with text and Discord alerts, unlimited price alerts, ${premium.maxProfiles} deal filters, Japanese cards and the full collection tools: all-time history, CSV export, the full grading check, the photo appraiser, sell-high alerts and deals on cards missing from your sets.`],
  ["How do alerts reach me? Do I need Discord?",
    "No. Alerts come by email on every plan. Premium adds text messages and Discord. Switch each one on or off at the top of the Price alerts page or in Settings. You also get a weekly email recap (daily on Premium) that you can turn off in Settings."],
  ["How does billing work?",
    `Premium is $${premium.price} a month plus any sales tax where you live, shown before you pay. It renews monthly until you cancel. Payments go through Stripe; we never see your card number.`],
  ["Can I cancel anytime?",
    "Yes, in one click from Settings → Plan. You keep Premium until the end of the month you paid for, then you're back on Free with your collection and settings intact. Months aren't refunded part-way, and deleting your account cancels your subscription too."],
  ["Can I sell my cards on eBay from here?",
    "Yes. Connect your eBay seller account in Settings, then tap Sell on eBay on any card in your collection. We fill in the title, set, number, grade or condition, cert number and a price from recent sales; you add photos and post. We never see your eBay password, and eBay's normal selling fees apply."],
  ["Do you bid or buy for me?",
    "No. We send the alert. You decide whether to bid or buy, and we never touch your eBay or TCGplayer account."],
  ["Are you affiliated with eBay or TCGplayer?",
    "No, we're independent. Some eBay links earn us a small commission if you buy. It never changes your price."],
];

export default function FAQ() {
  return (
    <div className="wrap doc">
      <h1>Questions? Answers.</h1>
      <p className="updated">Still stuck? Email support@tcgboogie.com.</p>
      {FAQS.map(([q, a]) => (
        <details className="faq" key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <p className="hint" style={{ marginTop: 20 }}>
        Values are estimates from past sales, not financial advice. More in our <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </div>
  );
}

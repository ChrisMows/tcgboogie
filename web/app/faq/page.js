import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "FAQ" };

const { free, premium } = PLANS;

const FAQS = [
  ["Is it really free?",
    `Yes. Free includes the collection tracker, ${free.maxPriceWatches} price alerts and a look at the deals you missed. No card needed. Premium is $${premium.price}/month plus sales tax when you want deals live.`],
  ["Where do the deals come from?",
    "Public eBay auctions for graded slabs and raw cards. We flag the ones priced well below what the same card has really sold for, before they end."],
  ["How do you know what a card is worth?",
    "Raw cards use TCGplayer's market price for each condition, updated daily. Graded cards use recent eBay sales of that exact card and grade. If there aren't enough recent sales to trust, we say so instead of guessing."],
  ["Why does a graded price say \"Not enough data\"?",
    "Some grades barely sell, so one old sale isn't a real value. We only show a graded price when there are enough recent sales, and we show how many sales it's based on. Tap any price to see the actual sold listings."],
  ["Can I check sold prices myself?",
    "Yes. Every card page has Recent eBay Sales (sold listings, newest first) and Live listings buttons, and each condition price opens that condition's listings on TCGplayer."],
  ["What's a price alert?",
    "Pick any card or sealed product and your price. Buying? We tell you when it drops to your price, and (for cards) when someone lists it on eBay at or under your price. Selling? We tell you when it climbs to it."],
  ["What does the collection tracker do?",
    "Keeps every card you own in one place with what it's worth, updated daily, and charts its value over time. Add cards by search, or open a set and tap the ones you have."],
  ["What's the difference between Free and Premium?",
    `Free shows deals after the auction ends, so you can see what you missed. Premium gets them to you live, with text and Discord alerts, unlimited price alerts, ${premium.maxProfiles} deal filters and the full collection tools.`],
  ["How do alerts reach me? Do I need Discord?",
    "No. Alerts come by email on every plan. Premium adds text messages and Discord. Pick what you want under Settings → Where alerts go."],
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

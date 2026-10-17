import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "FAQ" };

const { free, premium } = PLANS;

const FAQS = [
  ["Is it really free?",
    `Yes. Free includes the collection tracker, ${free.maxPriceWatches} price alerts and a look at the deals you missed. No card needed. Premium is $${premium.price}/month when you want deals live.`],
  ["Where do the deals come from?",
    "Public eBay auctions for graded slabs and raw cards. We flag the ones priced well below what the same card has really sold for, before they end."],
  ["How do you know what a card is worth?",
    "From real sales of that exact card in the last 30 days: same set, number, printing, and grade or condition. If there aren't enough sales to trust, we stay quiet."],
  ["What's a price alert?",
    "Pick any card or sealed product and your price. Buying? We tell you when it drops there, or when it's listed on eBay at or under it. Selling? We tell you when it climbs to your price."],
  ["What does the collection tracker do?",
    "Keeps every card you own in one place with what it's worth, updated daily. Add cards by search, or open a set and tap the ones you have."],
  ["What's the difference between Free and Premium?",
    `Free shows deals after the auction ends, so you can see what you missed. Premium gets them to you live, with instant alerts, unlimited price alerts and ${premium.maxProfiles} deal filters.`],
  ["Do I need Discord?",
    "No. Discord is the fastest way to get alerts on your phone, but email and the website work too. Connect Discord anytime from your Account page."],
  ["Do you bid or buy for me?",
    "No. We send the alert. You decide whether to bid or buy, and we never touch your eBay or TCGplayer account."],
  ["Can I cancel anytime?",
    "Yes, from Plan and billing, and you keep Premium until the end of the month you paid for. Deleting your account cancels your subscription too."],
  ["Are you affiliated with eBay or TCGplayer?",
    "No, we're independent. Some eBay and TCGplayer links earn us a small commission. They're labeled, and they never change your price."],
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

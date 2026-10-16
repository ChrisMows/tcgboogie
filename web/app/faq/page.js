import Link from "next/link";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "FAQ" };

const { free, premium } = PLANS;

const sections = [
  {
    title: "Deal alerts",
    items: [
      ["Where do the deals come from?",
        "Public eBay.com auctions for graded slabs and raw (ungraded) cards. We check them as they approach the end and only flag listings priced well below what the same card recently sold for."],
      ["How is market value calculated?",
        "From what the exact card sold for over the last 30 days: same set, card number, and printing (holo, reverse holo, 1st Edition), and the same grader and grade. Raw cards are valued by their stated condition and printing using TCGplayer market prices. If there aren't enough recent sales to trust a number, we stay quiet rather than guess."],
      ["What's the difference between graded and raw deals?",
        "Graded slabs have a grade set by a grading company (PSA, BGS, CGC, SGC, TAG). Raw cards are ungraded, so their condition (Near Mint, Lightly Played, and so on) is the seller's own description, and every raw alert says so. Your filter profiles can include graded, raw, or both, and a lowest acceptable raw condition."],
      ["What are filter profiles?",
        `Saved sets of filters that decide which deals reach you: Pokémon, sets, graders and grades, raw condition, card value, your maximum price, how far below market, how close to the end, language, and seller safety. Free includes ${free.maxProfiles} profile; Premium includes ${premium.maxProfiles}, so you can track vintage, modern, and raw cards separately.`],
      ["Why do some deals end up selling higher?",
        "Auctions often jump in the final seconds. Alerts show the current price when we found the deal, so set a maximum bid you're comfortable with."],
      ["How do you spot risky listings?",
        "We skip listings that say things like \"pre-graded\" or \"proxy\", and we flag new or low-feedback sellers, international shipping, missing cert numbers, and suspicious wording right on the alert. You can also hide flagged listings or limit alerts to US sellers in your filters."],
    ],
  },
  {
    title: "Price watches",
    items: [
      ["What is a price watch?",
        "Pick any card or sealed product on TCGplayer, set a target price (or a percent drop), and we alert you when its TCGplayer price reaches it. Paste the product's TCGplayer link, or search by name."],
      ["Which price do you track?",
        "Your choice: the market price (TCGplayer's price based on recent sales, best for trends) or the lowest listing (the cheapest copy listed right now, closest to what you'd pay). For cards you also pick the printing and condition."],
      ["How often are TCGplayer prices checked?",
        "A few times a day. TCGplayer prices themselves update about once a day, so price watches are best for tracking a card or product drifting down to your target, not for catching a single listing within minutes."],
      ["Can you watch eBay for that card too?",
        "Yes, on both plans. Tick \"Also alert me when this card is listed on eBay at or below this price\" and we'll watch eBay live, around the clock, for listings of that exact card at or under your target. eBay listing alerts cover single cards for now, not sealed products."],
      ["How many price watches do I get?",
        `Free includes ${free.maxPriceWatches} watches, always active. If you're using all ${free.maxPriceWatches} and remove one, you can add another right away. Premium is unlimited.`],
      ["Will I get alerted over and over?",
        "No. A watch alerts once when the price reaches your target, then stays quiet until the price climbs back above it. You can also re-arm it yourself from the Price watches page."],
    ],
  },
  {
    title: "Your collection",
    items: [
      ["What is the collection tracker?",
        "A free place to keep every card and sealed product you own, with what each is worth today, what you paid, and how your whole collection's value changes over time. It's included on every plan, with no limit on cards."],
      ["How do I add cards?",
        "Search by name, set, or card number and tap + Add, or open a set and tap each card you own. That's the quickest way to enter a binder. For slabs, pick the grading company and grade; for raw cards, the condition. What you paid is optional, but it's how we show your gain or loss."],
      ["How are my cards valued?",
        "Raw cards use TCGplayer's market price for that printing and condition. Slabs use recent eBay sales for that exact grader and grade. Sealed products use TCGplayer's market price. Values update about once a day. If a card has no reliable recent price, you can enter your own value for it."],
      ["What's the wishlist for?",
        "Cards you want but don't own yet. One tap turns any of them into a price watch, and when you get one, \"Got it\" moves it into your collection."],
      ["What do I get with Premium?",
        "Your full value history (Free shows the last 30 days), CSV export of your whole collection, deal alerts on cards missing from sets you've started or on your wishlist, and a heads-up when a card you own jumps in value."],
    ],
  },
  {
    title: "Plans",
    items: [
      ["What's the difference between Free and Premium?",
        `Free shows you deals after their auctions end, along with what they actually sold for, so you can see what you're missing. It includes ${free.maxProfiles} filter profile, ${free.maxPriceWatches} price watches, and a weekly email recap. Premium ($${premium.price}/month) gets deals to you live while you can still bid, with instant alerts, ${premium.maxProfiles} filter profiles, unlimited price watches, deals from ${premium.minDiscountFloor}% below market and up to ${premium.maxWindowMinutes} minutes before the end, Japanese cards, and a daily recap.`],
      ["How do I upgrade or cancel?",
        "From Plan and billing in your account. Card payments are launching soon. When they do, you can cancel anytime and keep Premium until the end of the period you paid for."],
      ["What happens to my profiles and watches if I downgrade?",
        "Nothing is deleted. Free runs your first filter profile and keeps the rest saved for when you upgrade again. Settings outside Free's limits are pulled back to the nearest allowed value."],
    ],
  },
  {
    title: "Alerts and Discord",
    items: [
      ["How do alerts reach me?",
        "Premium alerts arrive instantly in your private Discord channel and by email; phone and browser notifications are coming soon. Free members get price-watch alerts by email and a weekly recap of the deals they missed."],
      ["Do I need Discord?",
        "No. Discord is the fastest way to get alerts on your phone, but you can use the website's live feed and email instead. If you want Discord alerts, connect Discord from your Account page."],
      ["Does TCG Boogie bid or buy for me?",
        "No. We alert you, and you decide whether to bid or buy. We never touch your eBay or TCGplayer account."],
    ],
  },
  {
    title: "Your account",
    items: [
      ["How do I sign in?",
        "With Google, with Discord, or with a one-time sign-in link sent to your email. There's no password to remember or leak."],
      ["What data do you keep?",
        <>Only what's needed to run the service: your email and name, your connected sign-ins, your filters, price watches, collection, and alert history. See the <Link href="/privacy">privacy policy</Link> for details.</>],
      ["How do I delete my account?",
        "Account → Delete account. It permanently removes your account, filter profiles, price watches, collection, and alert history."],
    ],
  },
  {
    title: "About TCG Boogie",
    items: [
      ["Is TCG Boogie affiliated with eBay, TCGplayer, or The Pokémon Company?",
        "No. We're independent. Some links to eBay and TCGplayer are affiliate links that may earn us a commission. They're labeled, and they don't change the price you pay."],
      ["Are the values guaranteed?",
        "No. Values are estimates based on past sales, not financial advice, and past prices don't guarantee future ones."],
    ],
  },
];

export default function FAQ() {
  return (
    <div className="wrap doc">
      <h1>Frequently asked questions</h1>
      <p className="updated">Still stuck? Email support@tcgboogie.com.</p>
      {sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.items.map(([q, a]) => (
            <details className="faq" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

import { PLANS } from "@/lib/plans";

export const metadata = { title: "FAQ" };

const faqs = [
  ["Where do the deals come from?", "Public eBay.com listings. We only alert on auctions, and we value each card from its actual recent sales."],
  ["How is market value calculated?", "From what the same card sold for over the last 30 days: same set, number and printing, and the same grader and grade (or raw condition). We need enough sales to trust the number; otherwise we stay quiet."],
  ["Does TCG Boogie buy or bid for me?", "No. We alert you, and you decide whether to bid on eBay. We never touch your eBay account."],
  ["What's the difference between Free and Premium?", `Free shows you deals after the auction has ended, along with what they sold for, so you can see what you're missing. Premium ($${PLANS.premium.price}/month) gets deals to you live, with instant alerts, 15 filter profiles, and Japanese cards.`],
  ["Do I need Discord?", "No. Discord is the fastest way to get alerts on your phone, but you can also use the live feed on the website."],
  ["Why do some deals end up selling higher?", "Auctions often jump in the last seconds. Our alerts show the current price; set a maximum bid you're comfortable with."],
  ["Are raw card conditions reliable?", "Raw conditions are the seller's description, and every raw alert says so. Graded slabs are more reliable since a grading company set the grade."],
  ["How do I cancel?", "Anytime from your account's billing page. You keep Premium until the end of the period you paid for."],
  ["Is TCG Boogie affiliated with eBay or The Pokémon Company?", "No. We're independent. Some links may earn us a commission, and we always label those."],
];

export default function FAQ() {
  return (
    <div className="wrap doc">
      <h1>Frequently asked questions</h1>
      <p className="updated">Still stuck? Email support@tcgboogie.com.</p>
      {faqs.map(([q, a]) => (
        <details className="faq" key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}

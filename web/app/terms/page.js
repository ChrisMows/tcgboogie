import Link from "next/link";
import { PLANS, planFor } from "@/lib/plans";
import { TERMS_UPDATED } from "@/lib/terms";

export const metadata = { title: "Terms of Service | TCG Boogie" };

export default function Terms() {
  const price = PLANS.premium.price;
  const trial = Math.max(0, Number(planFor("premium").trialDays) || 0);
  return (
    <div className="wrap doc">
      <h1>Terms of Service</h1>
      <p className="updated">Last updated {TERMS_UPDATED}</p>
      <p>
        These terms cover your use of TCG Boogie (tcgboogie.com, our Discord bot and our alerts). By creating an account or
        using the site, you agree to them. If you don&apos;t agree, please don&apos;t use TCG Boogie.
      </p>

      <h2 id="service">1. What TCG Boogie is</h2>
      <p>
        TCG Boogie helps collectors find underpriced trading cards, track card prices, set price alerts and keep track of
        their collection. We show prices and listings from other marketplaces (such as eBay and TCGplayer). We don&apos;t
        sell cards, hold payments for card purchases, or take part in any purchase you make on another site.
      </p>

      <h2 id="accounts">2. Your account</h2>
      <ul>
        <li>You must be at least 13 to use TCG Boogie, and at least 18 (or have a parent or guardian&apos;s permission) to buy Premium.</li>
        <li>You sign in with Google, Discord or an email link. Keep access to those accounts secure; you&apos;re responsible for activity on your TCG Boogie account.</li>
        <li>Give us accurate information, including the phone number you use for text alerts.</li>
      </ul>

      <h2 id="premium">3. Premium subscription</h2>
      <ul>
        <li><b>Price.</b> Premium costs ${price} per month, plus any sales tax that applies where you live. The total is shown before you pay.</li>
        {trial > 0 && (
          <li><b>Free trial.</b> If you&apos;ve never subscribed before, Premium starts with a {trial}-day free trial. You add a payment card at
            checkout but aren&apos;t charged that day. Unless you cancel before the trial ends, the trial turns into a paid subscription and your
            card is charged ${price} plus tax on the day it ends, then monthly. We email you about 3 days before the first charge. Cancel during
            the trial in Settings → Billing and you&apos;re never charged; Premium stays on until the trial&apos;s last day. One trial per member;
            we may decline a trial if it looks like it&apos;s being repeated.</li>
        )}
        <li><b>Billing.</b> You&apos;re charged when you subscribe (or when your free trial ends), then automatically every month on the same date until you cancel. Payments are processed securely by Stripe; we never see or store your full card number.</li>
        <li><b>Cancelling.</b> You can cancel anytime in Settings → Billing, in one click. When you cancel, Premium stays on through the end of the period you&apos;ve already paid for, then your account returns to the Free plan automatically. You won&apos;t be charged again.</li>
        <li><b>Refunds.</b> Payments aren&apos;t refunded for partial months, including the month you cancel in, except where the law requires it. If you believe you were charged in error, email <a href="mailto:support@tcgboogie.com">support@tcgboogie.com</a> and we&apos;ll make it right.</li>
        <li><b>Failed payments.</b> If a renewal payment fails, Stripe retries it over the following days and Premium stays on meanwhile. If it still can&apos;t be collected, the subscription ends and your account returns to Free.</li>
        <li><b>Price changes.</b> If the price of Premium changes, we&apos;ll email you at least 30 days before your next renewal at the new price. You can cancel before then.</li>
        <li><b>Back to Free.</b> When Premium ends, your account, collection and settings are kept. Features the Free plan doesn&apos;t include stop working; the pricing page&apos;s &quot;Compare every feature&quot; table shows which those are.</li>
        <li><b>Complimentary Premium.</b> Premium we give you for free (for example in a giveaway) is never charged and ends on the date we tell you.</li>
      </ul>

      <h2 id="cancel-delete">4. Deleting your account</h2>
      <p>
        You can delete your account anytime from Settings. Deleting it cancels any subscription at the same moment, so
        you&apos;re not charged again, and permanently removes your collection, filters, alerts and history. If we can&apos;t
        confirm the cancellation with our payment provider, your account is not deleted until it is.
      </p>

      <h2 id="alerts">5. Alerts and messages</h2>
      <p>
        Alerts go to the channels you turn on (email, Discord direct message, and text message on Premium). Text messages
        need your consent and a confirmed number; message frequency depends on your alerts, message and data rates may
        apply, reply STOP to any text to stop them and HELP for help. Every alert and recap email has a one-click unsubscribe link.
        Alerts can arrive late or not at all (for example if a marketplace or messaging service is down), so don&apos;t rely
        on them for anything time-critical.
      </p>

      <h2 id="prices">6. Prices, deals and other sites</h2>
      <ul>
        <li>Card values, &quot;deals&quot; and discounts are estimates based on recent sales and listings. They can be wrong, out of date, or change quickly. They are not financial or investment advice.</li>
        <li>Listings belong to the marketplaces and sellers who post them. Check every listing yourself before you buy. Any purchase is between you and the seller, under that marketplace&apos;s rules.</li>
        <li>Some links to eBay and other sites are affiliate links, which means we may earn a commission if you buy. It doesn&apos;t change your price.</li>
      </ul>

      <h2 id="tools">7. Estimates and tools</h2>
      <ul>
        <li>The grading check, trade analyzer, photo appraiser, search by picture and collection values are estimates to help you decide. A grade is never guaranteed, grading fees and turnaround change, and our AI features can misidentify a card. Check before you act on them.</li>
        <li><b>Cards you add.</b> When you request a card we don&apos;t list, we may add it to the catalog for every member, using details read (by AI) from the page you link, which can be wrong. Member-added cards may have no market price; any value you type in is your own. We may edit or remove member-added cards, and limit accounts that add misleading or inappropriate ones.</li>
        <li><b>Selling on eBay.</b> When you list a card through TCG Boogie, the listing is yours: you&apos;re responsible for it, for the item, and for following eBay&apos;s rules and fees. We only fill in the listing for you to review and post.</li>
        <li><b>What you give us.</b> When you report a sale, request a card or upload a photo, you let us use it to run TCG Boogie, for example to value that card or add it to the catalog for every member. Only report real eBay sales and real cards; we may remove submissions and limit accounts that abuse them.</li>
      </ul>

      <h2 id="use">8. Fair use</h2>
      <p>
        Don&apos;t misuse TCG Boogie: no scraping or reselling our data, no automated access beyond normal use, no attempts
        to break or overload the site, and no sharing accounts to get around plan limits. We may suspend or close accounts
        that do. If we close a paid account for reasons other than misuse, we&apos;ll refund the unused part of your current month.
      </p>

      <h2 id="changes">9. Changes to TCG Boogie and these terms</h2>
      <p>
        We may add, change or remove features. If we change these terms in a way that matters, we&apos;ll update the date
        above and tell you by email or on the site before the change takes effect. Continuing to use TCG Boogie after that
        means you accept the new terms.
      </p>

      <h2 id="liability">10. Disclaimers and limits</h2>
      <p>
        TCG Boogie is provided &quot;as is&quot;. We do our best to keep it accurate and running, but we can&apos;t promise it will
        be error-free or always available. To the fullest extent the law allows, we aren&apos;t liable for indirect or
        consequential losses (such as a missed deal or a purchase that lost value), and our total liability to you is
        limited to what you paid us in the 12 months before the claim.
      </p>

      <h2 id="law">11. Governing law</h2>
      <p>These terms are governed by the laws of the State of Ohio, USA, and disputes go to the state or federal courts in Ohio, unless the law where you live gives you the right to bring them locally.</p>

      <h2 id="trademarks">12. Trademarks</h2>
      <p>
        TCG Boogie is independent and not affiliated with or endorsed by eBay, TCGplayer, Nintendo, The Pokémon Company,
        or any grading company. All trademarks belong to their owners.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        Questions about these terms or your subscription: <a href="mailto:support@tcgboogie.com">support@tcgboogie.com</a>.
        See also our <Link href="/privacy">Privacy policy</Link>.
      </p>
    </div>
  );
}

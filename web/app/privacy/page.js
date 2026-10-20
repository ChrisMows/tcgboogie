import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="wrap doc">
      <h1>Privacy</h1>
      <p className="updated">Last updated October 20, 2026</p>
      <p>
        This page explains what TCG Boogie collects, why, who it&apos;s shared with, and how to remove it. We keep it to the
        minimum needed to run the service.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your email address, name and profile picture, from the sign-in method you choose (email link, Google or Discord), and an ID for each sign-in method you connect (for example your Discord user ID).</li>
        <li><b>Your settings and activity:</b> deal filters, price alerts, alert preferences, and the alerts we sent you.</li>
        <li><b>Your collection and wishlist:</b> the cards you add and any details you enter (condition or grade, cert number, what you paid, dates, notes), plus a daily total of your collection&apos;s value for your chart.</li>
        <li><b>Phone number (optional):</b> only if you turn on text alerts. We keep it to send your alerts and the code that confirms it. Reply STOP to any text to stop them.</li>
        <li><b>Your plan and billing status:</b> whether you&apos;re on Premium and when it renews. Payments are handled by Stripe; we never see or store your card number.</li>
        <li><b>eBay connection (optional):</b> if you connect eBay to sell from your collection, eBay gives us an access key (stored encrypted) and your eBay username. We use it only to create the listings you ask for, upload the photos you choose, and read your shipping, payment and return policies. We never see your eBay password, and we don&apos;t read your messages, orders or purchases.</li>
        <li><b>Basic logs:</b> records of sign-ins, alerts and errors, kept 60 days, so we can fix problems.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>Only the services that run TCG Boogie, and only what each needs:</p>
      <ul>
        <li><b>Stripe</b> (payments), <b>Neon</b> (our database) and <b>Hostinger</b> (our servers and email).</li>
        <li><b>Discord</b> and <b>Twilio</b> to deliver your Discord and text alerts, if you turn them on.</li>
        <li><b>eBay</b>, when you connect it and list a card.</li>
        <li><b>Anthropic</b> (Claude) checks eBay listing photos against card images so we don&apos;t alert you about the wrong card. Only public listing photos and card images are sent, never your personal information.</li>
      </ul>
      <p>We don&apos;t sell your data or share it with advertisers.</p>

      <h2>Cookies</h2>
      <p>
        We use essential cookies only: one to keep you signed in, and short-lived ones for security while you connect an
        account. No advertising or tracking cookies.
      </p>

      <h2>Links that may earn us a commission</h2>
      <p>Some links to eBay are affiliate links: if you buy, we may earn a commission. It doesn&apos;t change the price you pay.</p>

      <h2>Deleting your data</h2>
      <p>
        You can delete your account anytime from Settings → Delete account. That permanently removes your account, filters,
        price alerts, collection, alert history and any eBay connection, and cancels any subscription. You can also disconnect
        eBay on its own in Settings. Copies in our nightly backups are removed as the backups expire (within 30 days, or
        12 months for monthly copies).
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <a href="mailto:support@tcgboogie.com">support@tcgboogie.com</a>. See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </div>
  );
}

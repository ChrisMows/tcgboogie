import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="wrap doc">
      <h1>Privacy</h1>
      <p className="updated">Last updated October 22, 2026</p>
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
        <li><b>Sales you report:</b> if you report an eBay sale we&apos;re missing, we keep the listing link, its sold price and date, and that you reported it (so we can stop misuse). The sale itself is public eBay information and is used to value that card for everyone.</li>
        <li><b>Photos you upload (Premium photo appraiser):</b> sent to our AI provider to identify the cards, then discarded. We don&apos;t store them.</li>
        <li><b>Basic logs:</b> records of sign-ins, alerts and errors, kept 60 days, so we can fix problems.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>Only the services that run TCG Boogie, and only what each needs:</p>
      <ul>
        <li><b>Stripe</b> (payments), <b>Neon</b> (our database), <b>Hostinger</b> (our servers and email) and <b>Amazon Web Services</b> (sending alert emails).</li>
        <li><b>Discord</b> and <b>Twilio</b> to deliver your Discord and text alerts, if you turn them on.</li>
        <li><b>eBay</b>, when you connect it and list a card.</li>
        <li><b>Anthropic</b> (Claude), our AI provider: it checks public eBay listing photos against card images so we don&apos;t alert you about the wrong card, and identifies the cards in photos you upload to the photo appraiser. It gets the images only, never your name, email or other account details, and under its business terms it doesn&apos;t train its models on them.</li>
      </ul>
      <p>We don&apos;t sell your data or share it with advertisers.</p>

      <h2>Cookies and browser storage</h2>
      <p>
        We use essential cookies only: one to keep you signed in, and short-lived ones for security while you connect an
        account. Your browser also remembers a few display choices on your device (such as hiding your collection value or
        grid vs list view); those never leave your device. No advertising or tracking cookies.
      </p>

      <h2>Emails we send</h2>
      <p>
        Sign-in links, the alerts you turn on, and a collection recap (weekly unless you change it). Every alert and recap
        email has a one-click unsubscribe link, and you can turn each one off in Settings. We don&apos;t send marketing
        email from anyone else.
      </p>

      <h2>Links that may earn us a commission</h2>
      <p>Some links to eBay are affiliate links: if you buy, we may earn a commission. It doesn&apos;t change the price you pay.</p>

      <h2>Your choices and rights</h2>
      <p>
        You can see and change your information in Settings, export your collection as a spreadsheet (Premium), and delete your account. You can also
        email us to get a copy of your data, correct it, or delete it, and we&apos;ll respond within 30 days. Depending on
        where you live (for example California or the EU/UK) you may have further rights under local law; we honor them for
        every member. We don&apos;t sell or &quot;share&quot; personal information for advertising.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Everything travels over encrypted connections. Connected-account keys (such as eBay&apos;s) are stored encrypted, only
        the people who run TCG Boogie can reach the database, and we keep nightly backups so a mistake can&apos;t wipe your
        collection. Our providers may store data in the United States or other countries.
      </p>

      <h2>Children</h2>
      <p>
        TCG Boogie isn&apos;t meant for children under 13, and we don&apos;t knowingly collect their information. If you think a
        child under 13 has an account, email us and we&apos;ll delete it.
      </p>

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

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="wrap doc">
      <h1>Privacy</h1>
      <p className="updated">Last updated October 2026 · Draft pending legal review</p>
      <p>
        This page explains what TCG Boogie collects when you create an account, why, and how to remove it. We keep it
        to the minimum needed to run the service.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Your email address and name, from the sign-in method you choose (email link, Google, or Discord).</li>
        <li>An ID for each sign-in method you connect (for example your Discord user ID), so we can sign you in and deliver Discord alerts.</li>
        <li>Your filter profiles, price alerts, alert preferences, and the alerts we sent you.</li>
        <li>Your collection and wishlist: the cards and products you add, and any details you choose to enter (what you paid, dates, notes), plus a daily total of your collection&apos;s value for your chart.</li>
        <li>Your plan. When paid plans launch, payments are handled by our payment processor; we never see or store card numbers.</li>
      </ul>
      <h2>Cookies</h2>
      <p>We use one essential cookie to keep you signed in. We don't use advertising or tracking cookies.</p>
      <h2>What we don't do</h2>
      <p>We don't sell your data or share it with advertisers. We never ask for or store your eBay password.</p>
      <h2>Links that may earn us a commission</h2>
      <p>Some links to eBay or TCGplayer are affiliate links. They are labeled, and they don't change the price you pay.</p>
      <h2>Deleting your data</h2>
      <p>
        You can delete your account at any time from Account → Delete account. That permanently removes your account,
        filter profiles, price alerts, collection, and alert history.
      </p>
      <h2>Contact</h2>
      <p>Questions about privacy can be sent to support@tcgboogie.com.</p>
    </div>
  );
}

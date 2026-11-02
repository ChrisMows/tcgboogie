import Link from "next/link";
import AskHelper from "@/components/AskHelper";
import HideValues from "@/components/HideValues";
import { SuggestIdea } from "@/components/IdeaBox";
import ProfileTabs from "@/components/ProfileTabs";
import ShareLink from "@/components/ShareLink";
import SignatureCards from "@/components/SignatureCards";
import { avatarFor, initials } from "@/lib/avatar";
import { money } from "@/lib/collection";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import { collectionCounts, showcaseItem, signatureCards } from "@/lib/showcase";
import * as store from "@/lib/store";
import { setShareValues, setSharing } from "./actions";

export const metadata = { title: "Profile" };

const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const since = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" });

// Settings tab: the sections of Settings (app/app/account), linked rather than repeated here.
const TABS = [["showcase", "Showcase"], ["settings", "Settings"], ["support", "Support"]];
const SETTINGS = [
  ["/app/account#plan", "💳", "Plan & billing", "Your plan, payment method and receipts"],
  ["/app/account#alerts", "🔔", "How we reach you", "Discord, push, email and the recap email"],
  ["/app/account#phone", "💬", "Text alerts", "Your phone number for alerts by text"],
  ["/app/account#connections", "🔗", "Connected accounts", "Google, Discord and eBay"],
  ["/app/account#profile", "👤", "Name & picture", "What your profile shows"],
];

/** Profile: who you are as a collector, your signature cards, and the way into Settings and help. */
export default async function ProfilePage({ searchParams }) {
  const user = await requireUser("/app/profile");
  const params = await searchParams;
  const [c, showcase] = await Promise.all([loadCollection(user), store.getShowcase(user.id)]);
  const avatar = avatarFor(user);
  const counts = collectionCounts(c.owned);
  const picks = signatureCards(c.owned, showcase.items);
  // The picker's list: most valuable first, one entry per copy.
  const choices = c.owned.map(showcaseItem).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const premium = user.tier === "premium";
  const shareUrl = showcase.shareToken ? `${SITE}/p/${showcase.shareToken}` : null;
  const tab = TABS.some(([key]) => key === params?.tab) ? params.tab : "showcase";

  return (
    <>
      <h1 className="sr-only">Profile</h1>
      <section className="prof-head">
        <div className="prof-face">
          <span className="avatar-btn prof-avatar" aria-hidden="true">
            {avatar.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar.url} alt="" referrerPolicy="no-referrer" />
              : <span>{initials(user)}</span>}
          </span>
          <Link href="/app/account#picture" className="small">Edit</Link>
        </div>
        <div className="prof-who">
          <div className="prof-name">
            <h2>{user.name || "Your profile"}</h2>
            {premium ? <span className="home-pro">PREMIUM</span> : <Link href="/app/premium?from=profile" className="prof-free small">Free plan · Upgrade</Link>}
          </div>
          <span className="small muted">Collector since {since(user.createdAt || Date.now())}</span>
        </div>
      </section>

      <div className="prof-stats">
        <div><span className="muted">Cards</span><b>{counts.cards.toLocaleString("en-US")}</b></div>
        <div><span className="muted">Graded</span><b>{counts.graded.toLocaleString("en-US")}</b></div>
        <div><span className="muted">Sealed</span><b>{counts.sealed.toLocaleString("en-US")}</b></div>
        <div><span className="muted">Value <HideValues className="prof-eye" /></span><b className="sensitive">{money(c.summary.value)}</b></div>
      </div>

      <ProfileTabs initial={tab} tabs={TABS} panes={{
        showcase: (
          <>
            <SignatureCards picks={picks} choices={choices} />
            <div className="panel prof-share">
              <div className="prof-share-head">
                <div>
                  <h3>Share my profile</h3>
                  <p className="small muted">A private link to your picture, first name and signature cards. Only people you send it to can open it, and your email and the rest of your collection stay private.</p>
                </div>
                <form action={setSharing}>
                  <input type="hidden" name="on" value={shareUrl ? "0" : "1"} />
                  <button className={`prof-switch ${shareUrl ? "on" : ""}`} role="switch" aria-checked={Boolean(shareUrl)} aria-label="Share my profile">
                    <span aria-hidden="true" />{shareUrl ? "On" : "Off"}
                  </button>
                </form>
              </div>
              {shareUrl && (
                <>
                  <ShareLink url={shareUrl} />
                  <form action={setShareValues} className="prof-share-row">
                    <input type="hidden" name="on" value={showcase.showValues ? "0" : "1"} />
                    <span className="small">Show card values on my shared profile</span>
                    <button className={`prof-switch ${showcase.showValues ? "on" : ""}`} role="switch" aria-checked={showcase.showValues} aria-label="Show card values on my shared profile">
                      <span aria-hidden="true" />{showcase.showValues ? "On" : "Off"}
                    </button>
                  </form>
                  <p className="hint" style={{ margin: "8px 0 0" }}>Turning sharing off stops this link working right away. Turning it back on makes a new link.</p>
                </>
              )}
            </div>
          </>
        ),
        settings: (
          <ul className="prof-links">
            {SETTINGS.map(([href, icon, label, note]) => (
              <li key={href}><Link href={href}><span aria-hidden="true">{icon}</span><span><b>{label}</b><span className="small muted">{note}</span></span><span aria-hidden="true">›</span></Link></li>
            ))}
            <li><Link href="/app/account#delete" className="prof-danger"><span aria-hidden="true">⚠️</span><span><b>Delete account</b><span className="small muted">Remove your account and everything in it</span></span><span aria-hidden="true">›</span></Link></li>
          </ul>
        ),
        support: (
          <ul className="prof-links">
            <li><Link href="/faq"><span aria-hidden="true">❓</span><span><b>FAQ</b><span className="small muted">Answers to common questions</span></span><span aria-hidden="true">›</span></Link></li>
            <li className="prof-link-btn"><span aria-hidden="true">🤖</span><span><AskHelper /><span className="small muted">Our helper, any time</span></span></li>
            <li className="prof-link-btn"><span aria-hidden="true">💡</span><span><SuggestIdea source="profile" label="Suggest an idea" /><span className="small muted">Tell us what to build next</span></span></li>
            <li><Link href="/updates"><span aria-hidden="true">✨</span><span><b>What&apos;s new</b><span className="small muted">Recent updates to TCG Boogie</span></span><span aria-hidden="true">›</span></Link></li>
            <li><a href="mailto:support@tcgboogie.com"><span aria-hidden="true">✉️</span><span><b>Email support</b><span className="small muted">support@tcgboogie.com</span></span><span aria-hidden="true">›</span></a></li>
          </ul>
        ),
      }} />
    </>
  );
}

import DiscordReachNotice from "@/components/DiscordReachNotice";
import XEvents from "@/components/XEvents";
import PackReveal from "@/components/PackReveal";
import PushPrompt from "@/components/PushPrompt";
import SideNav from "@/components/SideNav";
import { catalogLive } from "@/lib/catalog";
import { requireUser } from "@/lib/session";

export const metadata = { title: "My collection", robots: { index: false } };

export default async function MemberLayout({ children }) {
  const user = await requireUser();
  return (
    <div className="wrap app-shell">
      <SideNav planLabel={user.plan.label} premium={user.tier === "premium"} isAdmin={Boolean(user.isAdmin)} />
      <section>
        {!user.demo && !catalogLive() && (
          <div className="notice warn">Preview: card search, sets and prices use a small sample catalog until the price service is connected.</div>
        )}
        <DiscordReachNotice user={user} />
        {/* X ads: Sign up, once, on a new member's first pages (components/XEvents.js). */}
        <XEvents userId={user.demo ? null : user.id} newMember={Boolean(user.createdAt) && Date.now() - new Date(user.createdAt).getTime() < 30 * 60000} />
        {children}
      </section>
      <PackReveal />
      <PushPrompt canPush={!user.demo && user.plan.watchAlertChannels.includes("push")} />
    </div>
  );
}

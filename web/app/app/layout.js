import DiscordReachNotice from "@/components/DiscordReachNotice";
import XEvents from "@/components/XEvents";
import PackReveal from "@/components/PackReveal";
import PushPrompt from "@/components/PushPrompt";
import SideNav from "@/components/SideNav";
import { catalogLive, listSets } from "@/lib/catalog";
import { newestSets } from "@/lib/sets";
import { requireUser } from "@/lib/session";
import { tabAccess } from "@/lib/tab-access";

export const metadata = { title: "My collection", robots: { index: false } };

export default async function MemberLayout({ children }) {
  const user = await requireUser();
  // The side menu's Sets opens a menu of the newest sets on hover (the set list is cached for a week).
  const recentSets = await listSets().then((s) => newestSets(s).map((x) => ({ id: x.id, name: x.name, releaseDate: x.releaseDate, image: x.image }))).catch(() => []);
  return (
    <div className="wrap app-shell">
      <SideNav planLabel={user.plan.label} premium={user.tier === "premium"} isAdmin={Boolean(user.isAdmin)} access={tabAccess(user)} recentSets={recentSets} />
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

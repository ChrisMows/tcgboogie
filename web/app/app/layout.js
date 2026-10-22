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
        {children}
      </section>
    </div>
  );
}

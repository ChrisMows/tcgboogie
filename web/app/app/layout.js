import SideNav from "@/components/SideNav";
import { requireUser } from "@/lib/session";
import { logOut } from "./actions";

export const metadata = { title: "Dashboard", robots: { index: false } };

export default async function MemberLayout({ children }) {
  const user = await requireUser();
  return (
    <div className="wrap app-shell">
      <SideNav planLabel={user.plan.label} premium={user.tier === "premium"} onLogOut={logOut} />
      <section>{children}</section>
    </div>
  );
}

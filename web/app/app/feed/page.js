import Link from "next/link";
import DealCard from "@/components/DealCard";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { clampToPlan, matches } from "@/lib/filters";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Deal feed" };

export default async function Feed() {
  const user = await requireUser();
  const premium = user.tier === "premium";
  const profiles = (await store.listProfiles(user.id)).filter((p) => p.active).slice(0, user.plan.maxProfiles);
  const deals = SAMPLE_DEALS.filter((d) => profiles.some((p) => matches(clampToPlan(p.filters, user.plan), d)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Deal feed</h1>
          <p>
            {premium
              ? "Deals matching your filters, live while the auctions are still open."
              : "Deals matching your filters, shown after their auctions ended, with what they actually sold for."}
          </p>
        </div>
        <Link href="/app/filters" className="btn">Edit filters</Link>
      </div>
      {user.demo && <div className="notice">Sample deals. Real deals appear here once the scanner is connected to your account.</div>}
      {!premium && (
        <div className="notice warn">
          You're seeing these too late to bid. <Link href="/app/billing">Premium</Link> shows them live and alerts you
          instantly.
        </div>
      )}
      {deals.length === 0 ? (
        <div className="panel muted">No deals match your filters yet. Try a lower discount or a wider value range.</div>
      ) : (
        <div className="grid">
          {deals.map((d) => <DealCard key={d.id} deal={d} mode={premium ? "live" : "missed"} />)}
        </div>
      )}
    </>
  );
}

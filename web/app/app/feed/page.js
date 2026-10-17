import Link from "next/link";
import { DealGrid } from "@/components/DealTile";
import { withLinks } from "@/lib/deal-links";
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
            {premium ? "Deals that match your filters, live." : "Deals that match your filters, after they end."}
          </p>
        </div>
        <Link href="/app/filters" className="btn">Edit filters</Link>
      </div>
      {user.demo && <div className="notice">Sample deals. Real deals appear here once the scanner is connected to your account.</div>}
      {!premium && (
        <div className="notice warn">
          Too late to bid on these. <Link href="/app/billing">Premium</Link> gets them to you live.
        </div>
      )}
      <DealGrid deals={withLinks(deals, "deal-feed")} mode={premium ? "live" : "missed"}
        empty={<>No deals yet. <Link href="/app/filters">Widen your filters</Link> to catch more.</>} />
    </>
  );
}

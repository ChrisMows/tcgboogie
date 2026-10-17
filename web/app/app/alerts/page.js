import Link from "next/link";
import { DealGrid } from "@/components/DealTile";
import { withLinks } from "@/lib/deal-links";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Alert history" };

export default async function Alerts() {
  const user = await requireUser();
  const premium = user.tier === "premium";
  const rows = premium ? withLinks(SAMPLE_DEALS.slice(0, 6), "alert-history") : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alert history</h1>
          <p>Every deal we sent you, and what it sold for.</p>
        </div>
      </div>
      {user.demo && premium && <div className="notice">Sample alerts.</div>}
      {!premium ? (
        <div className="panel empty-state">
          Instant alerts come with Premium, so there&apos;s no alert history on Free yet.
          <div style={{ marginTop: 14 }}><Link className="btn primary" href="/app/billing">See Premium</Link></div>
        </div>
      ) : (
        <DealGrid deals={rows} mode="missed" empty="No alerts yet. They'll show up here as they're sent." />
      )}
    </>
  );
}

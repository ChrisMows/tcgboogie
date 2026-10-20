import Link from "next/link";
import FilterStudio from "@/components/FilterStudio";
import { DealGrid } from "@/components/DealTile";
import { listSets } from "@/lib/catalog";
import { withLinks } from "@/lib/deal-links";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Deals" };

// Deals = your filters (each one opens to show the deals it catches) + the history of deals we sent you.
export default async function DealsPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = sp?.tab === "history" ? "history" : "filters";
  const premium = user.tier === "premium";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Deals</h1>
          <p>Underpriced eBay auctions that match your filters.</p>
        </div>
      </div>
      <div className="tabs-row" role="tablist">
        <Link href="/app/deals" role="tab" aria-selected={tab === "filters"} className={tab === "filters" ? "on" : ""}>My filters</Link>
        <Link href="/app/deals?tab=history" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "on" : ""}>History</Link>
      </div>
      {tab === "filters" ? <Filters user={user} sp={sp} /> : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Every deal we sent you, and what it sold for.</p>
          {!premium ? (
            <div className="panel empty-state">
              Deal alerts come with Premium, so there&apos;s no history on Free yet.
              <div style={{ marginTop: 14 }}><Link className="btn primary" href="/app/premium?from=deals">See Premium</Link></div>
            </div>
          ) : (
            <>
              {user.demo && <div className="notice">Sample alerts.</div>}
              <DealGrid deals={withLinks(SAMPLE_DEALS.slice(0, 6), "alert-history")} mode="missed" empty="No alerts yet. They'll show up here as they're sent." />
            </>
          )}
        </>
      )}
    </>
  );
}

async function Filters({ user, sp }) {
  const profiles = await store.ensureStarterProfile(user);
  const clean = (v) => String(v || "").trim().slice(0, 60) || null;
  const prefill = sp?.pokemon || sp?.set ? { pokemon: clean(sp.pokemon), set: clean(sp.set) } : null;
  const sets = (await listSets().catch(() => [])).map((s) => ({ name: s.name, releaseDate: s.releaseDate || null }));
  return (
    <FilterStudio
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, active: p.active, filters: p.filters }))}
      plan={user.plan}
      deals={withLinks(SAMPLE_DEALS, "deals")}
      isDemo={user.demo}
      prefill={prefill}
      allSets={sets}
    />
  );
}

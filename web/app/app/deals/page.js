import Link from "next/link";
import FilterStudio from "@/components/FilterStudio";
import { DealGrid } from "@/components/DealTile";
import { listSets } from "@/lib/catalog";
import { withLinks } from "@/lib/deal-links";
import { dealsFor, sentDeals } from "@/lib/deals";
import { clampToPlan, matches } from "@/lib/filters";
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
          <History user={user} premium={premium} />
        </>
      )}
    </>
  );
}

async function Filters({ user, sp }) {
  const profiles = await store.ensureStarterProfile(user);
  const clean = (v) => String(v || "").trim().slice(0, 60) || null;
  const prefill = sp?.pokemon || sp?.set ? { pokemon: clean(sp.pokemon), set: clean(sp.set) } : null;
  const [sets, found] = await Promise.all([
    listSets().catch(() => []).then((all) => all.map((s) => ({ name: s.name, releaseDate: s.releaseDate || null }))),
    dealsFor(user),
  ]);
  return (
    <FilterStudio
      profiles={profiles.map((p) => ({ id: p.id, name: p.name, active: p.active, filters: p.filters }))}
      plan={user.plan}
      deals={withLinks(found.deals, "deals")}
      sample={found.sample}
      prefill={prefill}
      allSets={sets}
    />
  );
}

// Premium: the deals we alerted you about. Free: recent deals your filters would have caught, after they ended.
async function History({ user, premium }) {
  if (premium) {
    const sent = await sentDeals(user.id);
    return (
      <>
        <p className="muted" style={{ marginTop: 0 }}>Every deal we sent you, newest first.</p>
        <DealGrid deals={withLinks(sent, "alert-history")} mode="missed" empty="No deal alerts yet. They'll show up here as they're sent." />
      </>
    );
  }
  const found = await dealsFor(user);
  const running = (await store.listProfiles(user.id)).filter((p) => p.active).slice(0, user.plan.maxProfiles);
  const missed = found.sample ? [] : found.deals.filter((d) => running.some((p) => matches(clampToPlan(p.filters, user.plan), d)));
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Deals your filters caught this week, after they ended. On Premium you get them live, while you can still bid.</p>
      <DealGrid deals={withLinks(missed, "missed-history")} mode="missed"
        empty={found.sample ? "No deals caught yet. They'll show up here as the deal finder catches them." : "None of this week's deals matched your filters. Try widening one."} />
      <div style={{ marginTop: 14 }}><Link className="btn primary" href="/app/premium?from=deals">Get them live with Premium</Link></div>
    </>
  );
}

import Link from "next/link";
import SetBrowser from "@/components/SetBrowser";
import { listSets } from "@/lib/catalog";
import { toppsSets } from "@/lib/topps";
import { allTcgSets } from "@/lib/tcg-games";
import { requireUser } from "@/lib/session";
import { ERA_NAMES, eraSlug } from "@/lib/sets";
import * as store from "@/lib/store";

export const metadata = { title: "Sets" };

export default async function SetsPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const era = ERA_NAMES.map(eraSlug).includes(String(sp?.era || "")) ? String(sp.era) : null; // from the side menu's Sets
  const [sets, items] = await Promise.all([listSets().catch(() => null), store.listItems(user.id)]);
  const have = {};
  for (const it of items) {
    if (it.list === "owned" && it.productType === "card") (have[it.setName] ||= new Set()).add(it.productId);
  }
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/app/collection">Collection</Link> / Sets</div>
          <h1>Sets</h1>
          <p>Open a set and tap the cards you own.</p>
        </div>
      </div>
      {sets === null ? (
        <div className="notice warn">The set list didn&apos;t load from the price service. Please try again in a minute.</div>
      ) : (
        <SetBrowser key={era || "all"} openEra={era} sets={[...sets, ...toppsSets().map((t) => ({ id: t.code, name: t.name, series: "Topps", releaseDate: `${t.year}-06-01`, total: t.cards, image: null })), ...(await allTcgSets())]
          .map((s) => ({ ...s, have: have[s.name]?.size || 0 }))} />
      )}
    </>
  );
}

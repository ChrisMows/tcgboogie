import Link from "next/link";
import SetBrowser from "@/components/SetBrowser";
import { listSets } from "@/lib/catalog";
import { eraSlug, ERA_NAMES } from "@/lib/sets";
import { toppsSets } from "@/lib/topps";
import { swuSets } from "@/lib/swu";

export const metadata = {
  title: "All card sets",
  description: "Every Pokémon TCG set by era, from Base Set to Mega Evolution, plus every Star Wars: Unlimited set: open a set to see its cards and prices.",
  alternates: { canonical: "/sets" },
};

/**
 * Every set, by era, whatever you collect (the header's Sets menu opens here). The collection's Sets page
 * (/app/collection/sets) is the same list with your progress. ?era= opens that era.
 */
export default async function AllSets({ searchParams }) {
  const sp = await searchParams;
  const era = ERA_NAMES.map(eraSlug).includes(String(sp?.era || "")) ? String(sp.era) : null;
  const sets = await listSets().catch(() => null);
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <h1>All sets</h1>
          <p>Every Pokémon and Star Wars: Unlimited set. Pick a game and an era, or search, then open a set to see its cards and prices{" "}
            <span className="muted">(your progress on each is in <Link href="/app/collection/sets">Collection → Sets</Link>)</span>.</p>
        </div>
      </div>
      {sets === null ? (
        <div className="notice warn">The set list didn&apos;t load from the price service. Please try again in a minute.</div>
      ) : (
        <SetBrowser openEra={era} hrefBase="/sets/" sets={[...sets, ...toppsSets().map((t) => ({ id: t.code, name: t.name, series: "Topps", releaseDate: `${t.year}-06-01`, total: t.cards, image: null })), ...(await swuSets().catch(() => []))]} />
      )}
    </div>
  );
}

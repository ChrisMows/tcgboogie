import Link from "next/link";
import SetBrowser from "@/components/SetBrowser";
import { listSets } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/session";
import { eraSlug, ERA_NAMES } from "@/lib/sets";
import { toppsSets } from "@/lib/topps";
import { swuSets } from "@/lib/swu";

export const metadata = {
  title: "Browse card sets",
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
  const [sets, user] = await Promise.all([listSets().catch(() => null), getCurrentUser().catch(() => null)]);
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="page-head sb-page-head">
        <h1>Browse sets</h1>
        <Link href={user ? "/app/collection/sets" : `/login?next=${encodeURIComponent("/app/collection/sets")}`} className="sb-progress-link">My set progress ↗</Link>
      </div>
      {sets === null ? (
        <div className="notice warn">The set list didn&apos;t load from the price service. Please try again in a minute.</div>
      ) : (
        <SetBrowser key={era || "all"} openEra={era} hrefBase="/sets/" sets={[...sets, ...toppsSets().map((t) => ({ id: t.code, name: t.name, series: "Topps", releaseDate: `${t.year}-06-01`, total: t.cards, image: null })), ...(await swuSets().catch(() => []))]} />
      )}
    </div>
  );
}

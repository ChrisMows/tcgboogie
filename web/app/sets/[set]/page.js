import Link from "next/link";
import { notFound } from "next/navigation";
import CardThumb from "@/components/CardThumb";
import { getSetCards, listSets } from "@/lib/catalog";
import { cardMoney, money, nmPrice } from "@/lib/collection";
import { memberCardsInSet } from "@/lib/member-cards";
import { SLOW_DOWN, allow } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { eraOf, setLabel } from "@/lib/sets";
import { toppsSetByName, toppsSetCards } from "@/lib/topps";

const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
const nameOf = async (params) => decodeURIComponent((await params).set).slice(0, 120);

export async function generateMetadata({ params }) {
  const name = await nameOf(params);
  const { name: label } = setLabel(name);
  return {
    title: `${label.slice(0, 70)}: card list and prices`,
    description: `Every card in Pokémon ${label} with its current Near Mint price, from recent sales.`,
    alternates: { canonical: `/sets/${encodeURIComponent(name)}` },
    openGraph: { url: `${SITE}/sets/${encodeURIComponent(name)}` },
  };
}

// "4/102", "SV047", "TG05" -> sortable: numbers in order, letters after.
const numberKey = (n) => { const m = String(n || "").match(/\d+/); return m ? Number(m[0]) : 1e9; };

/**
 * A set's cards and prices for anyone, signed in or not (the header's Sets menu and /sets open here). Visitors and
 * search engines only ever see prices we've already saved: loading a set costs a credit per card, so a set nobody has
 * opened yet asks them to sign in, and a member's visit loads it (rate-limited like the collection's set page).
 * Members get a button to the collection's set page, where they tap the cards they own.
 */
export default async function PublicSet({ params }) {
  const name = await nameOf(params);
  const topps = toppsSetByName(name);
  const sets = topps ? [] : await listSets().catch(() => []);
  const set = topps ? { name, series: "Topps", releaseDate: `${topps.year}-06-01` } : sets.find((s) => s.name === name);
  if (!set) notFound(); // only real set names reach the price service
  const user = await getCurrentUser();
  let cards = topps ? await toppsSetCards(name) : await getSetCards(name, { savedOnly: true }).catch(() => null);
  let busy = false;
  if (cards === undefined && user && !user.demo) {
    if (await allow("setLoad", user.id)) cards = await getSetCards(name).catch(() => null);
    else busy = true;
  }
  if (cards) {
    const added = topps ? [] : await memberCardsInSet(name);
    cards = [...cards, ...added.filter((m) => !cards.some((c) => c.id === m.id))]
      .sort((a, b) => numberKey(a.number) - numberKey(b.number) || String(a.number).localeCompare(String(b.number)));
  }
  const { name: label, code } = setLabel(name);
  const released = set.releaseDate ? new Date(`${String(set.releaseDate).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;
  const total = (cards || []).reduce((s, c) => s + (nmPrice(c) ?? 0), 0);
  const cardHref = (id) => (user ? `/app/cards/${id}` : `/login?next=${encodeURIComponent(`/app/cards/${id}`)}`);
  const top = (cards || []).filter((c) => nmPrice(c)).sort((a, b) => nmPrice(b) - nmPrice(a)).slice(0, 3);

  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/sets">All sets</Link> / {label}</div>
          <h1>{label}</h1>
          <p>{topps ? `Topps Pokémon cards, ${topps.year} · not part of the Pokémon TCG` : [code, `${eraOf(set)} era`, released ? `Released ${released}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        {user ? (
          <Link href={`/app/collection/sets/${encodeURIComponent(name)}`} className="btn primary">Track this set in your collection →</Link>
        ) : (
          <Link href={`/login?mode=signup&next=${encodeURIComponent(`/app/collection/sets/${encodeURIComponent(name)}`)}`} className="btn primary">Track this set free →</Link>
        )}
      </div>

      {busy ? <div className="notice warn">{SLOW_DOWN}</div>
        : cards === null ? <div className="notice warn">This set didn&apos;t load from the price service. Please try again in a minute.</div>
          : cards === undefined ? (
            <div className="notice">
              We haven&apos;t loaded {label}&apos;s prices yet. {user ? "Please try again in a minute." : <><Link href={`/login?next=${encodeURIComponent(`/sets/${encodeURIComponent(name)}`)}`}>Sign in</Link> and it loads for everyone.</>}
            </div>
          ) : (
            <>
              <div className="stats">
                <div className="stat"><b>{cards.length}</b><span>{cards.length === 1 ? "card" : "cards"} in this set</span></div>
                <div className="stat"><b>{money(total)}</b><span>for one of every card in Near Mint</span></div>
                {top[0] && <div className="stat"><b>{cardMoney(nmPrice(top[0]))}</b><span>top card: {top[0].name.replace(/\s+-\s+\S+$/, "")}</span></div>}
              </div>
              <ul className="pub-set-grid">
                {cards.map((c) => {
                  const price = nmPrice(c);
                  return (
                    <li key={c.id}>
                      <Link href={cardHref(c.id)} title={c.name}>
                        <CardThumb item={c} width={150} />
                        <span className="pub-set-name">{c.name.replace(/\s+-\s+\S+$/, "")}</span>
                        <span className="small muted">{[c.number ? `#${c.number}` : null, c.rarity].filter(Boolean).join(" · ")}</span>
                        <b>{price ? cardMoney(price) : <span className="muted small">No price yet</span>}</b>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="hint">Near Mint prices from recent TCGplayer sales, plus eBay sales we verify ourselves.{user ? "" : " Sign in to open a card's graded values and sales."}</p>
            </>
          )}
    </div>
  );
}

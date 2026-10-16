import "server-only";

// TCGplayer card and sealed product prices, via the PokemonPriceTracker API (prices update about once a day).
// Without PPT_API_KEY (local demo) a small sample catalog is used instead.

const PPT = "https://www.pokemonpricetracker.com/api/v2";
const img = (id) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_200x200.jpg`;
const today = new Date();
const series = (base, wobble, days = 30) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 86400000);
    const v = base * (1 + Math.sin(i / 4) * wobble + (days - i) * 0.002);
    return { date: d.toISOString().slice(0, 10), price: Math.round(v * 100) / 100 };
  });
const conds = (nm, low) => ({
  "Near Mint": { market: nm, low },
  "Lightly Played": { market: Math.round(nm * 0.92 * 100) / 100, low: Math.round(low * 0.92 * 100) / 100 },
  "Moderately Played": { market: Math.round(nm * 0.78 * 100) / 100, low: Math.round(low * 0.78 * 100) / 100 },
});

const SAMPLE = [
  { id: "246723", type: "card", name: "Umbreon VMAX (Alternate Art Secret)", setName: "Evolving Skies", number: "215/203",
    image: img("246723"), prices: { Holofoil: conds(2264.7, 1499.99) }, history: series(2264.7, 0.04) },
  { id: "517045", type: "card", name: "Charizard ex", setName: "Scarlet & Violet 151", number: "199/165",
    image: img("517045"), prices: { Holofoil: conds(325, 247.99) }, history: series(325, 0.05) },
  { id: "42382", type: "card", name: "Charizard", setName: "Base Set", number: "004/102",
    image: img("42382"), prices: { Holofoil: conds(489.99, 410) }, history: series(489.99, 0.03) },
  { id: "517035", type: "card", name: "Psyduck", setName: "Scarlet & Violet 151", number: "175/165",
    image: img("517035"), prices: { Holofoil: conds(57.93, 40) }, history: series(57.93, 0.06) },
  { id: "84186", type: "card", name: "Charizard", setName: "Skyridge", number: "146/144",
    image: img("84186"), prices: { Holofoil: conds(1850, 1600) }, history: series(1850, 0.02) },
  { id: "demo-151-bundle", type: "sealed", name: "Scarlet & Violet 151 Booster Bundle", setName: "Scarlet & Violet 151",
    number: null, image: null, prices: { market: 61.5, low: 54.99 }, history: series(61.5, 0.05) },
  { id: "demo-evs-etb", type: "sealed", name: "Evolving Skies Elite Trainer Box", setName: "Evolving Skies",
    number: null, image: null, prices: { market: 189.99, low: 172.5 }, history: series(189.99, 0.04) },
];
for (const p of SAMPLE) {
  p.tcgplayerUrl = p.type === "card"
    ? `https://www.tcgplayer.com/product/${p.id}`
    : `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(p.name)}`;
}

export const catalogLive = () => Boolean(process.env.PPT_API_KEY);

const cache = globalThis.__tcgCatalog ?? (globalThis.__tcgCatalog = new Map());
async function ppt(path, params) {
  const url = `${PPT}${path}?${new URLSearchParams(params)}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.PPT_API_KEY}` }, cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Price service error ${r.status}`);
  const data = await r.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

function fromCard(c) {
  const prices = {};
  for (const [printing, byCond] of Object.entries(c.prices?.variants || {})) {
    prices[printing] = {};
    for (const [cond, v] of Object.entries(byCond || {})) {
      prices[printing][cond] = {
        market: v?.price ?? null,
        low: cond === "Near Mint" ? c.variants?.[printing]?.lowPrice ?? null : null,
      };
    }
  }
  const primary = c.prices?.primaryPrinting || Object.keys(prices)[0];
  const hist = c.priceHistory?.variants?.[primary]?.["Near Mint"]?.history || [];
  return {
    id: String(c.tcgPlayerId), type: "card", name: c.name, setName: c.setName, number: c.cardNumber,
    image: c.imageCdnUrl200 || c.imageCdnUrl || null, tcgplayerUrl: c.tcgPlayerUrl || `https://www.tcgplayer.com/product/${c.tcgPlayerId}`,
    prices, history: hist.map((h) => ({ date: String(h.date).slice(0, 10), price: h.market })),
  };
}

function fromSealed(s) {
  return {
    id: String(s.tcgPlayerId), type: "sealed", name: s.name, setName: s.setName, number: null,
    image: s.imageCdnUrl200 || s.imageCdnUrl || null, tcgplayerUrl: s.tcgPlayerUrl || `https://www.tcgplayer.com/product/${s.tcgPlayerId}`,
    prices: { market: s.prices?.market ?? s.marketPrice ?? null, low: s.prices?.low ?? s.lowPrice ?? null }, history: [],
  };
}

/** Look up one TCGplayer product (card or sealed) by its TCGplayer product ID. */
export async function getProduct(id) {
  if (!catalogLive()) return SAMPLE.find((p) => p.id === String(id)) || null;
  const card = await ppt(`/cards/${encodeURIComponent(id)}`, { includeHistory: "true", days: "30" });
  if (card?.data) return fromCard(Array.isArray(card.data) ? card.data[0] : card.data);
  const sealed = await ppt("/sealed-products", { tcgPlayerId: String(id), limit: "1" });
  const s = Array.isArray(sealed?.data) ? sealed.data[0] : sealed?.data;
  return s ? fromSealed(s) : null;
}

/** Search cards and sealed products by name (a few results each, to keep lookups cheap). */
export async function searchProducts(q) {
  const term = String(q || "").trim().slice(0, 80);
  if (term.length < 2) return [];
  if (!catalogLive()) {
    const words = term.toLowerCase().split(/\s+/);
    return SAMPLE.filter((p) => words.every((w) => `${p.name} ${p.setName} ${p.number || ""}`.toLowerCase().includes(w))).slice(0, 8);
  }
  const [cards, sealed] = await Promise.all([
    ppt("/cards", { search: term, limit: "6" }),
    ppt("/sealed-products", { search: term, limit: "3" }).catch(() => null),
  ]);
  return [
    ...(cards?.data || []).map(fromCard),
    ...(sealed?.data || []).map(fromSealed),
  ];
}

export const sampleIds = () => SAMPLE.map((p) => p.id);

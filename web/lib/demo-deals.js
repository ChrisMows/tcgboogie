// Sample deals for previews and the "would have caught" estimate until the bot feeds real data in.
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const img = (id) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_200x200.jpg`;
// TCGplayer product for each sample (gives it a picture and a card page).
const PRODUCTS = { d1: "246723", d2: "517045", d3: "42382", d4: "518861", d5: "517035", d7: "86903", d8: "253266" };

export const SAMPLE_DEALS = [
  { id: "d1", kind: "graded", name: "Umbreon VMAX", setName: "Evolving Skies", number: "215/203", grader: "PSA", grade: 10,
    language: "english", total: 2180, marketValue: 3750, discountPct: 42, minutesLeft: 6, comps: 46, sellerFeedback: 1843,
    country: "US", flags: [], soldFor: 3410, foundAt: minutesAgo(18), title: "2021 Evolving Skies Umbreon VMAX #215 Alt Art PSA 10" },
  { id: "d2", kind: "raw", name: "Charizard ex", setName: "Scarlet & Violet 151", number: "199/165", condition: "NM",
    language: "english", total: 196, marketValue: 325, discountPct: 40, minutesLeft: 4, comps: 31, sellerFeedback: 412,
    country: "US", flags: ["Raw card: condition is the seller's own description"], soldFor: 301, foundAt: minutesAgo(41),
    title: "Pokemon 151 Charizard ex 199/165 SIR NM" },
  { id: "d3", kind: "graded", name: "Charizard", setName: "Base Set", number: "4/102", grader: "PSA", grade: 8,
    language: "english", total: 640, marketValue: 1020, discountPct: 37, minutesLeft: 3, comps: 9, sellerFeedback: 12,
    country: "US", flags: ["Low seller feedback (12)", "No cert number listed"], soldFor: 990, foundAt: minutesAgo(63),
    title: "1999 Pokemon Base Set Charizard 4/102 Holo PSA 8" },
  { id: "d4", kind: "graded", name: "Pikachu with Grey Felt Hat", setName: "SV Black Star Promos", number: "085", grader: "CGC",
    grade: 10, language: "english", total: 304, marketValue: 475, discountPct: 36, minutesLeft: 8, comps: 5, sellerFeedback: 512,
    country: "JP", flags: ["Ships from JP (international)"], soldFor: 462, foundAt: minutesAgo(95),
    title: "Pikachu with Grey Felt Hat SVP 085 Van Gogh Promo CGC 10" },
  { id: "d5", kind: "raw", name: "Psyduck", setName: "Scarlet & Violet 151", number: "175/165", condition: "LP",
    language: "english", total: 31, marketValue: 53, discountPct: 42, minutesLeft: 5, comps: 30, sellerFeedback: 2210,
    country: "US", flags: ["Raw card: condition is the seller's own description"], soldFor: 49, foundAt: minutesAgo(130),
    title: "Pokemon 151 Psyduck 175/165 Illustration Rare" },
  { id: "d6", kind: "graded", name: "Umbreon VMAX", setName: "Eevee Heroes", number: "095/069", grader: "PSA", grade: 10,
    language: "japanese", total: 410, marketValue: 690, discountPct: 41, minutesLeft: 7, comps: 22, sellerFeedback: 980,
    country: "US", flags: [], soldFor: 655, foundAt: minutesAgo(170), title: "Japanese Umbreon VMAX HR 095/069 Eevee Heroes PSA 10" },
  { id: "d7", kind: "graded", name: "Lugia", setName: "Neo Genesis", number: "9/111", grader: "BGS", grade: 9,
    language: "english", total: 2950, marketValue: 4400, discountPct: 33, minutesLeft: 9, comps: 6, sellerFeedback: 3021,
    country: "US", flags: [], soldFor: 4120, foundAt: minutesAgo(220), title: "2000 Neo Genesis Lugia 9/111 Holo BGS 9" },
  { id: "d8", kind: "raw", name: "Gengar VMAX", setName: "Fusion Strike", number: "271/264", condition: "NM",
    language: "english", total: 118, marketValue: 205, discountPct: 42, minutesLeft: 2, comps: 18, sellerFeedback: 77,
    country: "US", flags: ["Raw card: condition is the seller's own description"], soldFor: 192, foundAt: minutesAgo(260),
    title: "Gengar VMAX 271/264 Alt Art Fusion Strike" },
];
// Japanese cards: picture only (our price service covers English cards, so no card page).
const IMAGE_ONLY = { d6: "570557" };
for (const d of SAMPLE_DEALS) {
  d.sample = true; // tiles say "Example"
  if (PRODUCTS[d.id]) Object.assign(d, { productId: PRODUCTS[d.id], image: img(PRODUCTS[d.id]) });
  else if (IMAGE_ONLY[d.id]) d.image = img(IMAGE_ONLY[d.id]);
}

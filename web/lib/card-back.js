// Which card back a Pokémon card has, for the pack-opening reveal when a card is added to a collection.
//   english       every English card since 1999 (the WOTC-era back is the same design)
//   japanese      Japanese cards from the e-Card era (late 2001) on, and modern Korean and Chinese cards (same back)
//   japanese-old  the original Japanese back (Base Expansion Pack to Neo and the old promos/vending)

// Japanese sets that still used the original back.
const OLD_JAPANESE = /\b(expansion pack|base set|jungle|fossil|mystery of the fossils|rocket|gym|leaders'? stadium|challenge from the darkness|neo|vending|southern islands|old back|pocket monsters|intro pack|cd promo|bandai)\b/i;
const MODERN = /\b(glory|sv\d*|scarlet|violet|sword|shield|sun & moon|sm\d|xy|black|white|bw\d|legend|dp\d|diamond|pearl|platinum|adv|pcg|ex\b|vstar|vmax|gx|mega)\b/i;

/** "english" | "japanese" | "japanese-old" for a card's language and set. */
export function cardBack({ language, setName } = {}) {
  const lang = String(language || "english").toLowerCase();
  const set = String(setName || "");
  // Modern sets that reuse an old name (e.g. "Glory of Team Rocket") keep the modern back.
  if (lang === "japanese") return OLD_JAPANESE.test(set) && !MODERN.test(set) ? "japanese-old" : "japanese";
  if (lang === "korean" || lang === "chinese") return "japanese";
  return "english";
}

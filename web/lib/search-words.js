import { setLabel } from "@/lib/sets";

// How typed words match product names, for search (lib/catalog.js). Kept apart from the catalog (no database or price
// service here) so it can be tested on its own.

export const NAME_SKIP = new Set(["ex", "gx", "v", "the", "of"]);
/** A card's name words: "Charizard EX - XY29 (Jumbo)" -> ["charizard"]. */
export const nameWords = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|\s-\s.*$/g, " ").split(/[^a-z0-9']+/).filter((w) => w.length > 1 && !NAME_SKIP.has(w));
/** Every word of a product name, nothing dropped: "Mini Tins 5-Pack" -> ["mini", "tins", "5", "pack"]. */
export const allWords = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/** Edit distance between two short words (for typos like "nagandel" -> "naganadel"). */
export function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** A typed word matches a name word: the same, the start of it (still typing), or a small typo in a longer word. */
export const wordMatches = (typed, word) => typed === word || word.startsWith(typed)
  || (typed.length >= 5 && editDistance(typed, word) <= (typed.length >= 8 ? 2 : 1));

/**
 * The sets a search names, in any word order and with the last word maybe half typed: "heroes ascended pa" names
 * Ascended Heroes. A set counts when every word of its name (without the code, "ME: ") is typed; best first (more of
 * its words typed), at most two. Returns [{ set, rest }]: rest is the typed words that weren't part of the set's name.
 */
export function setsInSearch(term, sets) {
  const typed = allWords(term);
  if (!typed.length) return [];
  const found = [];
  for (const set of sets) {
    const words = allWords(setLabel(set.name).name).filter((w) => w !== "and");
    if (!words.length || (words.length === 1 && words[0].length < 4)) continue; // "151", "XY": too easy to type by chance
    const used = new Set();
    const all = words.every((w) => {
      // A whole word, or the last word still being typed (2+ letters; 4+ for a one-word set, so "ex" isn't
      // Expedition), or a typo in a long word.
      const i = typed.findIndex((t, k) => !used.has(k) && (t === w
        || (k === typed.length - 1 && t.length >= (words.length > 1 ? 2 : 4) && w.startsWith(t))
        || (t.length >= 5 && editDistance(t, w) <= 1)));
      if (i < 0) return false;
      used.add(i);
      return true;
    });
    if (all) found.push({ set, size: words.length, rest: typed.filter((_, k) => !used.has(k)) });
  }
  // Only the sets that use the most typed words: "mega evolution" is Mega Evolution, not also XY Evolutions.
  const most = Math.max(0, ...found.map((f) => f.size));
  return found.filter((f) => f.size === most).slice(0, 2).map(({ set, rest }) => ({ set, rest }));
}

/** Products whose name has every one of these words (in any order; the last may be half typed). */
export function withWords(products, words) {
  if (!words.length) return products;
  return products.filter((p) => {
    const have = allWords(p.name);
    return words.every((w) => have.some((h) => wordMatches(w, h)));
  });
}

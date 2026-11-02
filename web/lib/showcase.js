import { unitValue } from "@/lib/collection";

// Profile signature cards (lib/store.js getShowcase): what each pick shows, from the member's collection copies.

/** What the picker and the profile need about a copy (no purchase price, notes or cert number). */
export const showcaseItem = (it) => ({
  id: it.id, productId: it.productId, productType: it.productType, name: it.name, setName: it.setName || null,
  number: it.number || null, image: it.image || null, kind: it.kind, grader: it.grader || null, grade: it.grade || null,
  printing: it.printing || null, condition: it.condition || null, value: unitValue(it),
});

/** The signature picks still in the collection, in the member's order. */
export function signatureCards(owned, ids) {
  const byId = new Map(owned.map((it) => [it.id, it]));
  return (ids || []).map((id) => byId.get(Number(id))).filter(Boolean).map(showcaseItem);
}

/** Cards / graded / sealed counts (copies, so 3 of one card count 3). */
export function collectionCounts(owned) {
  const n = (kind) => owned.filter((it) => kind(it.kind)).reduce((s, it) => s + (it.quantity || 1), 0);
  return { cards: n((k) => k !== "sealed"), graded: n((k) => k === "graded"), sealed: n((k) => k === "sealed") };
}

/** "Riley" from "Riley Smith": a shared profile shows a first name only. */
export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "A collector";

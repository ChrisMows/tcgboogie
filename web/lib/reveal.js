// The pack-opening reveal (components/PackReveal.js) listens for this event; anything that adds a card calls
// revealCard() with the `reveal` an add action returns.
export const REVEAL_EVENT = "tcgb:reveal";

export function revealCard(reveal) {
  if (!reveal || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: reveal }));
}

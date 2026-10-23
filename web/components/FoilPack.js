/**
 * The booster pack for the pack-opening reveal (public/brand/foil-pack.webp), cut in two along a jagged tear line just
 * under the top crimp: the strip that rips off, and the body the card rises out of. Both layers show the same picture,
 * so before the rip it looks like one pack (components/PackReveal.js does the moving).
 */

// The tear line across the pack, in % from the top: zig-zags between about 8% and 10.5%.
const TEAR = [0, 9.4, 6, 8.2, 11, 10.2, 17, 8.4, 23, 10.4, 29, 8.6, 35, 10.6, 41, 8.3, 47, 10.1, 53, 8.5, 59, 10.5, 65, 8.2,
  71, 10.3, 77, 8.6, 83, 10.4, 89, 8.3, 95, 10.1, 100, 9];
const points = [];
for (let i = 0; i < TEAR.length; i += 2) points.push(`${TEAR[i]}% ${TEAR[i + 1]}%`);

export const TOP_CLIP = `polygon(0 0, 100% 0, ${[...points].reverse().join(", ")})`;
export const BODY_CLIP = `polygon(${points.join(", ")}, 100% 100%, 0 100%)`;

export function PackTop() {
  return <div className="fp-layer" style={{ clipPath: TOP_CLIP }} />;
}

export function PackBody() {
  return <div className="fp-layer" style={{ clipPath: BODY_CLIP }}><span className="rp-shine" /></div>;
}

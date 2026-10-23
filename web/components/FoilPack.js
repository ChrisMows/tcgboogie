/**
 * A plain, unbranded booster pack in shiny silver foil for the pack-opening reveal: the body, and the crimped top
 * strip that tears off along a jagged line. Each part is its own layer so the top can rip away and the card can rise
 * out of the opening (components/PackReveal.js does the moving).
 */

// The tear line, shared by the strip's bottom edge and the body's top edge so the two fit together.
const TEAR = "0,30 6,27 11,31 17,26 23,30 29,27 35,32 41,26 47,30 53,27 59,31 65,26 71,30 77,27 83,31 89,26 95,30 100,28";
const tearPoints = TEAR.split(" ");

function Foil({ id }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stopColor="#7d8590" />
      <stop offset="0.14" stopColor="#eef1f5" />
      <stop offset="0.3" stopColor="#a7afb9" />
      <stop offset="0.46" stopColor="#ffffff" />
      <stop offset="0.62" stopColor="#8d96a1" />
      <stop offset="0.8" stopColor="#e3e7ec" />
      <stop offset="1" stopColor="#6c7480" />
    </linearGradient>
  );
}

// Little vertical ridges along a crimped seal.
const crimps = (y1, y2) => Array.from({ length: 24 }, (_, i) => (
  <line key={i} x1={2 + i * 4.15} y1={y1} x2={2 + i * 4.15} y2={y2} stroke="#5d6570" strokeOpacity="0.35" strokeWidth="0.7" />
));

export function PackTop() {
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="fp-svg" aria-hidden="true">
      <defs><Foil id="fpTop" /></defs>
      <polygon points={`0,0 100,0 ${[...tearPoints].reverse().join(" ")}`} fill="url(#fpTop)" stroke="#4d545e" strokeWidth="0.6" />
      {crimps(2, 14)}
      <rect x="0" y="15" width="100" height="1.2" fill="#ffffff" fillOpacity="0.55" />
    </svg>
  );
}

export function PackBody() {
  return (
    <svg viewBox="0 26 100 112" preserveAspectRatio="none" className="fp-svg" aria-hidden="true">
      <defs>
        <Foil id="fpBody" />
        <radialGradient id="fpGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon points={`${TEAR} 100,124 0,124`} fill="url(#fpBody)" stroke="#4d545e" strokeWidth="0.6" />
      {/* crimped bottom seal */}
      <rect x="0" y="124" width="100" height="14" fill="url(#fpBody)" stroke="#4d545e" strokeWidth="0.6" />
      {crimps(125, 137)}
      {/* soft folds and an embossed star in the middle */}
      <path d="M8 34 Q6 80 9 122" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.4" fill="none" />
      <path d="M92 34 Q94 80 91 122" stroke="#59616b" strokeOpacity="0.45" strokeWidth="1.4" fill="none" />
      <circle cx="50" cy="78" r="26" fill="url(#fpGlow)" opacity="0.35" />
      <polygon points="50,52 56,72 76,78 56,84 50,104 44,84 24,78 44,72" fill="#ffffff" fillOpacity="0.55" stroke="#7b838e" strokeWidth="0.8" />
      <polygon points="50,62 53,75 64,78 53,81 50,94 47,81 36,78 47,75" fill="#d3ff66" fillOpacity="0.85" />
    </svg>
  );
}

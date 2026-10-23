"use client";

import { useState } from "react";

/**
 * The back of a Pokémon card for the pack-opening reveal. Uses a real scan when one is in public/card-backs
 * (english.webp, japanese.webp, japanese-old.webp); until then, a drawn stand-in in the same colors and layout.
 */
export default function CardBackArt({ back = "english" }) {
  const [scan, setScan] = useState(true);
  if (scan) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cb-img" src={`/card-backs/${back}.webp`} alt="" draggable={false} onError={() => setScan(false)} />;
  }
  return back === "japanese" ? <ModernAsian /> : <Swirl old={back === "japanese-old"} />;
}

// The English back (and, with a red band, the original Japanese one): blue swirls, the ball up and to the left.
function Swirl({ old }) {
  return (
    <svg viewBox="0 0 63 88" className="cb-svg" aria-hidden="true">
      <defs>
        <radialGradient id="cbSwirl" cx="40%" cy="40%" r="75%">
          <stop offset="0" stopColor="#5d8fd8" />
          <stop offset="0.55" stopColor="#2a5aa8" />
          <stop offset="1" stopColor="#132f66" />
        </radialGradient>
      </defs>
      <rect width="63" height="88" rx="3.2" fill="#2b5fae" />
      <rect x="2.6" y="2.6" width="57.8" height="82.8" rx="2" fill="url(#cbSwirl)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${-8 + i * 6} ${96 - i * 4} C ${12 + i * 4} ${60 - i * 6}, ${30 + i * 3} ${68 - i * 8}, ${72} ${10 + i * 9}`}
          fill="none" stroke="#9cc1f2" strokeOpacity={0.18 + i * 0.04} strokeWidth="3.2" />
      ))}
      <g transform="translate(22 30) rotate(-18)">
        <circle r="13" fill="#f4f4f4" stroke="#111" strokeWidth="1.4" />
        <path d="M-13 0 A13 13 0 0 1 13 0 Z" fill="#e3262d" stroke="#111" strokeWidth="1.4" />
        <rect x="-13" y="-1.1" width="26" height="2.2" fill="#111" />
        <circle r="4.2" fill="#f4f4f4" stroke="#111" strokeWidth="1.4" />
        <circle r="2" fill="#fff" stroke="#bbb" strokeWidth="0.5" />
      </g>
      {old ? (
        <g>
          <rect x="8" y="58" width="47" height="11" rx="5.5" fill="#d92f2f" stroke="#ffd84a" strokeWidth="1" />
          <text x="31.5" y="65.6" textAnchor="middle" fontSize="5" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="0.3">POCKET MONSTERS</text>
        </g>
      ) : (
        <g transform="translate(36 60) rotate(-12)">
          <ellipse rx="22" ry="7.5" fill="#ffcb05" stroke="#2a5aa8" strokeWidth="1.6" />
          <ellipse rx="17" ry="4" fill="none" stroke="#c7a008" strokeWidth="0.6" />
        </g>
      )}
    </svg>
  );
}

// Modern Japanese, Korean and Chinese back: a big silver-and-red ball on deep navy with rings.
function ModernAsian() {
  return (
    <svg viewBox="0 0 63 88" className="cb-svg" aria-hidden="true">
      <defs>
        <radialGradient id="cbNavy" cx="50%" cy="50%" r="70%">
          <stop offset="0" stopColor="#2a3d8f" />
          <stop offset="1" stopColor="#0b1235" />
        </radialGradient>
        <linearGradient id="cbSilver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a9b3c4" />
        </linearGradient>
      </defs>
      <rect width="63" height="88" rx="3.2" fill="#d7dbe2" />
      <rect x="2.4" y="2.4" width="58.2" height="83.2" rx="2" fill="url(#cbNavy)" />
      {[30, 24, 18].map((r) => <circle key={r} cx="31.5" cy="44" r={r} fill="none" stroke="#6f86d6" strokeOpacity="0.35" strokeWidth="0.8" />)}
      <g transform="translate(31.5 44)">
        <circle r="15" fill="url(#cbSilver)" stroke="#0b1235" strokeWidth="1.6" />
        <path d="M-15 0 A15 15 0 0 1 15 0 Z" fill="#d8232a" stroke="#0b1235" strokeWidth="1.6" />
        <rect x="-15" y="-1.3" width="30" height="2.6" fill="#0b1235" />
        <circle r="5" fill="url(#cbSilver)" stroke="#0b1235" strokeWidth="1.6" />
      </g>
    </svg>
  );
}

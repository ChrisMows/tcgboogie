"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A card picture that gives way to `fallback` when it won't load: some products have a picture address that leads
 * nowhere (TCGplayer has no image for a few newer Japanese cards), which would otherwise leave an empty frame.
 */
export default function CardPicture({ src, fallback = null, ...props }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef(null);
  // A picture can fail before the page is interactive, when onError isn't listening yet: check once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, [src]);
  if (!src || broken) return fallback;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img ref={ref} src={src} loading="lazy" onError={() => setBroken(true)} {...props} />;
}

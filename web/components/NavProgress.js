"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A lime bar across the top of the screen from the moment a link is tapped until the next page is on screen, so the
 * site never looks stuck. Covers every link inside the site, including ones that only change the page's options
 * (like ?add=1), which the full-page pack loader doesn't. Gives up after 15 seconds.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState("idle"); // idle | loading | done
  const timer = useRef(null);

  // The new page arrived: finish the bar, then hide it.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 350);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page, or only a jump to a section of it: nothing to load.
      if (url.pathname === location.pathname && url.search === location.search) return;
      clearTimeout(timer.current);
      setState("loading");
      timer.current = setTimeout(() => setState("idle"), 15000);
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); clearTimeout(timer.current); };
  }, []);

  if (state === "idle") return null;
  return <div className={`nav-progress ${state}`} aria-hidden="true"><span /></div>;
}

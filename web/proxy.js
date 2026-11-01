import { NextResponse } from "next/server";

// Start on Home: an iPhone or iPad home-screen icon opens the exact page it was saved from, and many members saved
// theirs on Collection. Apple doesn't let a site change a saved icon, so when one opens Collection straight from
// outside the site, the server answers with Home before building the Collection page at all.
// "Opened from outside the site" is the browser's own Sec-Fetch-Site: none (an icon, a bookmark or a typed address);
// reloads (which ask for a fresh copy), links inside the site (same-origin) and our own email, text and push links
// (they carry ?from=...) stay on Collection. A saved icon may carry other extras (?tab=...), so those still move on.
// Android installs pick up the app's start page (app/manifest.js) on their own, and computers keep Collection.
const APPLE = /iphone|ipad|ipod/i;

export function proxy(request) {
  const h = request.headers;
  const opened = request.method === "GET" && h.get("sec-fetch-site") === "none" && h.get("sec-fetch-dest") === "document"
    && !h.get("rsc") && !/max-age=0|no-cache/i.test(h.get("cache-control") || "");
  const apple = APPLE.test(h.get("user-agent") || "") || (/macintosh/i.test(h.get("user-agent") || "") && /mobile/i.test(h.get("user-agent") || ""));
  if (opened && apple && !request.nextUrl.searchParams.has("from")) return NextResponse.redirect(new URL("/app/home", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/app/collection"] };

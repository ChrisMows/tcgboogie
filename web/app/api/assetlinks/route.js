import { NextResponse } from "next/server";

// Digital Asset Links for the Android app (android-app/, a Trusted Web Activity around this site), served at
// /.well-known/assetlinks.json (next.config.mjs rewrite). Android checks it to open the site full-screen, without
// Chrome's address bar. FINGERPRINTS: the SHA-256 of each key that signs the app: the upload key (android-app/README.md)
// and Google's app signing key (Play Console -> Test and release -> App integrity). Empty = the app shows an address bar.
const PACKAGE = "com.tcgboogie.app";
const FINGERPRINTS = [
  // Upload key (C:\Users\Chris\.tcgboogie\android-upload.jks, alias upload).
  "E6:28:2E:D2:B5:90:9E:E1:9A:19:4C:34:CC:D4:23:01:5E:44:0C:7C:C7:66:32:9D:C5:EE:D9:03:F4:4C:23:7E",
  // Google's app signing key (what installs from Google Play are signed with).
  "CB:51:A5:F6:C4:4B:8B:51:5A:F0:08:15:46:D6:5E:72:AD:AF:3A:65:47:F9:20:13:82:8C:45:C1:DB:F6:58:21",
];

export function GET() {
  const links = FINGERPRINTS.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: FINGERPRINTS } }]
    : [];
  return NextResponse.json(links, { headers: { "Cache-Control": "public, max-age=3600" } });
}

"use client";

import { usePathname } from "next/navigation";
import PackLoader from "@/components/PackLoader";

// Shown instantly inside the member area while a page loads (Collection, Deals, Price alerts, Settings…); the side
// menu stays put. The address has already changed to the page being opened, so the label says what's on its way.
const LABELS = [
  ["/app/collection/photo", "Opening the photo appraiser…"],
  ["/app/collection/grading", "Checking what's worth grading…"],
  ["/app/collection/import", "Opening import…"],
  ["/app/collection/sell", "Getting your listing ready…"],
  ["/app/collection/sets", "Loading your sets…"],
  ["/app/collection/trade", "Opening the trade analyzer…"],
  ["/app/collection", "Loading your collection…"],
  ["/app/cards", "Loading the card's prices…"],
  ["/app/deals", "Finding your deals…"],
  ["/app/watches", "Loading your price alerts…"],
  ["/app/account", "Loading your settings…"],
  ["/app/premium", "Loading Premium…"],
  ["/app/admin", "Loading the admin panel…"],
  ["/app/logs", "Loading the logs…"],
];

export default function Loading() {
  const path = usePathname() || "";
  const label = LABELS.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] || "Loading…";
  return <PackLoader label={label} />;
}

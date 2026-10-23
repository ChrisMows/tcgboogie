import PackLoader from "@/components/PackLoader";

// Shown instantly inside the member area while a page loads (Collection, Deals, Price alerts, Settings…); the side
// menu stays put.
export default function Loading() {
  return <PackLoader />;
}

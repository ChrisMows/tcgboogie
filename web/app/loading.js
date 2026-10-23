import PackLoader from "@/components/PackLoader";

// Shown instantly while a page loads (homepage, FAQ, sign in and the other public pages).
export default function Loading() {
  return <div className="wrap"><PackLoader label="Loading…" /></div>;
}

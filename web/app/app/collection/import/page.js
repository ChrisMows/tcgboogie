import Link from "next/link";
import ImportCollection from "@/components/ImportCollection";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Import collection" };

export default async function ImportPage() {
  await requireUser("/app/collection/import");
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Import</div>
      <div className="page-head">
        <div>
          <h1>Import your collection</h1>
          <p>Moving from another app? Bring your cards over from a CSV file.</p>
        </div>
      </div>
      <ImportCollection />
    </>
  );
}

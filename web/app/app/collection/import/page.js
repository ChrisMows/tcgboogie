import Link from "next/link";
import ImportCollection from "@/components/ImportCollection";
import FeatureLocked from "@/components/FeatureLocked";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Import collection" };

export default async function ImportPage() {
  const user = await requireUser("/app/collection/import");
  if (!user.plan.collectionImport) {
    return <><div className="crumbs"><Link href="/app/collection">Collection</Link> / Import</div><FeatureLocked name="CSV import" flag="collectionImport" from="import" /></>;
  }
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

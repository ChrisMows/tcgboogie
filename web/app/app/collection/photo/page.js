import Link from "next/link";
import PhotoAppraiser from "@/components/PhotoAppraiser";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Photo appraiser" };

export default async function PhotoPage() {
  const user = await requireUser("/app/collection/photo");
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Photo appraiser</div>
      <div className="page-head">
        <div>
          <h1>Photo appraiser</h1>
          <p>Snap your cards: we name them, price them, and add them to your collection.</p>
        </div>
      </div>
      <PhotoAppraiser allowed={Boolean(user.plan.photoAppraiser)} />
    </>
  );
}

import Link from "next/link";
import PhotoAppraiser from "@/components/PhotoAppraiser";
import { quotaStatus } from "@/lib/quota";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Card scanner" };

export default async function PhotoPage() {
  const user = await requireUser("/app/collection/photo");
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Card scanner</div>
      <div className="page-head">
        <div>
          <h1>Card scanner</h1>
          <p>Snap your cards: we name them, price them, and add them to your collection.</p>
        </div>
      </div>
      <PhotoAppraiser allowed={Boolean(user.plan.photoAppraiser)} quota={user.plan.photoAppraiser ? await quotaStatus("appraise", user) : null} />
    </>
  );
}

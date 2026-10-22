import Link from "next/link";
import GradingCheck from "@/components/GradingCheck";
import { gradingCandidates } from "@/lib/grading";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Worth grading?" };

export default async function GradingPage() {
  const user = await requireUser("/app/collection/grading");
  const c = await loadCollection(user);
  const candidates = gradingCandidates(c.owned, c.products);
  // Raw Near Mint cards we couldn't check (no reliable PSA sales yet).
  const rawNm = new Set(c.owned.filter((it) => it.kind === "raw" && it.productType === "card" && it.condition === "Near Mint").map((it) => `${it.productId}:${it.printing || ""}`));
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Worth grading?</div>
      <div className="page-head">
        <div>
          <h1>Worth grading?</h1>
          <p>Which of your raw cards would make money in a PSA slab.</p>
        </div>
      </div>
      <GradingCheck candidates={candidates} unchecked={Math.max(0, rawNm.size - candidates.length)} full={Boolean(user.plan.gradingCheck)} />
    </>
  );
}

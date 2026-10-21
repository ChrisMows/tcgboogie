import Link from "next/link";
import GradingCheck from "@/components/GradingCheck";
import { gradingCandidates } from "@/lib/grading";
import { loadCollection } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Grading check" };

export default async function GradingPage() {
  const user = await requireUser("/app/collection/grading");
  const c = await loadCollection(user);
  const candidates = gradingCandidates(c.owned, c.products);
  return (
    <>
      <div className="crumbs"><Link href="/app/collection">Collection</Link> / Grading check</div>
      <div className="page-head">
        <div>
          <h1>Grading check</h1>
          <p>Which of your raw Near Mint cards are worth sending to PSA, and what you&apos;d make.</p>
        </div>
      </div>
      <GradingCheck candidates={candidates} full={Boolean(user.plan.gradingCheck)} />
    </>
  );
}

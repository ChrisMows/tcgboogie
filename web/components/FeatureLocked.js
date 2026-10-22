import Link from "next/link";
import { planFor } from "@/lib/plans";

/** Shown instead of a feature the member's plan doesn't include (Admin → Features decides which plan gets what). */
export default function FeatureLocked({ name, flag, from }) {
  const premiumHas = Boolean(planFor("premium")[flag]);
  return (
    <div className="panel empty-state">
      <h2>🔒 {name}</h2>
      {premiumHas ? (
        <>
          <p className="muted">{name} is part of Premium.</p>
          <Link href={`/app/premium?from=${encodeURIComponent(from || flag)}`} className="btn primary">See Premium</Link>
        </>
      ) : (
        <p className="muted">{name} is switched off right now. Check back soon.</p>
      )}
    </div>
  );
}

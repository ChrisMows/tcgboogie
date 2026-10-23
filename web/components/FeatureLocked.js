import Link from "next/link";
import { billingLive } from "@/lib/billing";
import { planFor } from "@/lib/plans";

/** Shown instead of a feature the member's plan doesn't include (Admin → Features decides which plan gets what). */
export default function FeatureLocked({ name, flag, from }) {
  const premium = planFor("premium");
  const premiumHas = Boolean(premium[flag]);
  const trial = billingLive() ? Math.max(0, Number(premium.trialDays) || 0) : 0;
  return (
    <div className="panel empty-state">
      <h2>🔒 {name}</h2>
      {premiumHas ? (
        <>
          <p className="muted">{name} is part of Premium.</p>
          <Link href={`/app/premium?from=${encodeURIComponent(from || flag)}`} className="btn primary">{trial > 0 ? `Try Premium free for ${trial} days` : "See Premium"}</Link>
        </>
      ) : (
        <p className="muted">{name} is switched off right now. Check back soon.</p>
      )}
    </div>
  );
}

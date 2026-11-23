/** What the phone tab bar's Premium menu needs to know about a member's plan (components/SideNav.js PREMIUM). */
export function tabAccess(user) {
  const plan = user?.plan || {};
  return { plan: plan.key || "free", liveDeals: Boolean(plan.liveFeed), gradeFlip: Boolean(plan.gradingFinder) };
}

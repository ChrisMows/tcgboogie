import FilterEditor from "@/components/FilterEditor";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Filters" };

export default async function FiltersPage() {
  const user = await requireUser();
  const profiles = await store.ensureStarterProfile(user);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Filters</h1>
          <p>Choose exactly which deals reach you. Each profile is checked separately against every ending auction.</p>
        </div>
      </div>
      <FilterEditor
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, active: p.active, filters: p.filters }))}
        plan={user.plan}
        sampleDeals={SAMPLE_DEALS}
        isDemo={user.demo}
      />
    </>
  );
}

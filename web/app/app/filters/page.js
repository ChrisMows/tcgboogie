import FilterEditor from "@/components/FilterEditor";
import { SAMPLE_DEALS } from "@/lib/demo-deals";
import { requireUser } from "@/lib/session";
import * as store from "@/lib/store";

export const metadata = { title: "Filters" };

export default async function FiltersPage({ searchParams }) {
  const user = await requireUser();
  const profiles = await store.ensureStarterProfile(user);
  const sp = await searchParams;
  const clean = (v) => String(v || "").trim().slice(0, 60) || null;
  const prefill = sp?.pokemon || sp?.set ? { pokemon: clean(sp.pokemon), set: clean(sp.set) } : null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Filters</h1>
          <p>Choose which deals reach you.</p>
        </div>
      </div>
      <FilterEditor
        profiles={profiles.map((p) => ({ id: p.id, name: p.name, active: p.active, filters: p.filters }))}
        plan={user.plan}
        sampleDeals={SAMPLE_DEALS}
        isDemo={user.demo}
        prefill={prefill}
      />
    </>
  );
}

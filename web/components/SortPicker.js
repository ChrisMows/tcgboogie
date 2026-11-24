"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DIR_LABEL, SET_SORTS } from "@/lib/set-sort";

/**
 * A set's sort: a menu (Card number, Price, Name, Rarity) and a button that flips the direction. Picking a new field
 * starts it in its usual direction (price high to low, names A to Z...).
 * Either controlled (onChange({ field, dir })) or, with `url`, kept in the address (?sort=&dir=) for the public pages.
 */
export default function SortPicker({ field, dir, onChange, url = false }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const set = (next) => {
    if (!url) return onChange(next);
    const q = new URLSearchParams(params.toString());
    q.delete("sort"); q.delete("dir");
    if (next.field !== "number" || next.dir !== "asc") { q.set("sort", next.field); q.set("dir", next.dir); }
    router.replace(q.size ? `${path}?${q}` : path, { scroll: false });
  };
  const flip = dir === "asc" ? "desc" : "asc";
  return (
    <div className="sort-picker">
      <select value={field} aria-label="Sort by"
        onChange={(e) => set({ field: e.target.value, dir: SET_SORTS.find(([k]) => k === e.target.value)[2] })}>
        {SET_SORTS.map(([k, label]) => <option key={k} value={k}>Sort: {label}</option>)}
      </select>
      <button type="button" className="sort-dir" onClick={() => set({ field, dir: flip })}
        aria-label={`Sorted ${DIR_LABEL[field][dir]}. Switch to ${DIR_LABEL[field][flip]}`} title={`Switch to ${DIR_LABEL[field][flip]}`}>
        <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span> {DIR_LABEL[field][dir]}
      </button>
    </div>
  );
}

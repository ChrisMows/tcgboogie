"use client";

import { useSyncExternalStore } from "react";

// The value chart's range (1D, 7D, 30D, 90D, 1Y, All), shared with the collection list so each card's small % change
// follows the range the member picked on the chart. Days, or null for All.
let range = 30;
const subs = new Set();
export const RANGE_LABEL = { 1: "1D", 7: "7D", 30: "30D", 90: "90D", 365: "1Y" };
export const rangeLabel = (r) => (r ? RANGE_LABEL[r] || `${r}D` : "All");
export function setChartRange(r) {
  range = r;
  subs.forEach((f) => f());
}
export function useChartRange() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => range, () => 30);
}

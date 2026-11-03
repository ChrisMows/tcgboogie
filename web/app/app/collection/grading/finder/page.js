import { redirect } from "next/navigation";

// Grade & Flip was here for its first few hours (Nov 3, 2026), as "Grading finder"; it has its own page now.
export default async function OldGradingFinder({ searchParams }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/app/grade-and-flip${q ? `?${q}` : ""}`);
}

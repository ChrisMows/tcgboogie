import { redirect } from "next/navigation";

// Grade & Flip's address on its first day (Nov 3, 2026), when it was called "Grading finder".
export default async function OldGradingFinder({ searchParams }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/app/grade-and-flip${q ? `?${q}` : ""}`);
}

import { redirect } from "next/navigation";

// The Grading finder was here for its first few hours (Nov 3, 2026); it has its own page in the side menu now.
export default async function OldGradingFinder({ searchParams }) {
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/app/grading-finder${q ? `?${q}` : ""}`);
}

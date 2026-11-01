import { redirect } from "next/navigation";

// The member area opens on Home (old links, bookmarks and sign-ins to /app land there).
export default function Home() {
  redirect("/app/home");
}

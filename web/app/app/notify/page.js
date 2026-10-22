import { redirect } from "next/navigation";
import { GAMES, voteGame } from "@/lib/game-interest";
import { log } from "@/lib/log";
import { requireUser } from "@/lib/session";

// Homepage "Notify me" on a game we don't cover yet: sign in if needed, count the vote, back to the homepage.
// (Plain links, never prefetched; a repeat vote does nothing.)
export default async function Notify({ searchParams }) {
  const game = String((await searchParams)?.game || "");
  if (!GAMES[game]) redirect("/?home=1#games");
  const user = await requireUser(`/app/notify?game=${game}`);
  if (!user.demo) {
    await voteGame(user.id, game);
    await log("website", "info", `Game interest: ${GAMES[game]}`, null, user.id);
  }
  redirect(`/?home=1&voted=${game}#games`);
}

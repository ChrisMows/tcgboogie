import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// "Notify me" for games we don't cover yet (homepage). Each member counts once per game. Admin → Requests shows the
// totals (which game to add next) and who asked (who to tell when it's live).
export const GAMES = { magic: "Magic: The Gathering", lorcana: "Disney Lorcana", onepiece: "One Piece", yugioh: "Yu-Gi-Oh!" };
const { gameInterest } = schema;

/** Record a member's vote. Returns false for an unknown game. */
export async function voteGame(userId, game) {
  if (!GAMES[game]) return false;
  if (db) await db.insert(gameInterest).values({ userId, game }).onConflictDoNothing();
  return true;
}

/** Games this member asked for. */
export async function myGames(userId) {
  if (!db || !userId) return [];
  try { return (await db.select({ game: gameInterest.game }).from(gameInterest).where(eq(gameInterest.userId, userId))).map((r) => r.game); } catch { return []; }
}

/** Admin: { game, label, votes, emails } per game, most wanted first. */
export async function gameTotals() {
  if (!db) return [];
  try {
    const rows = await db.select({ game: gameInterest.game, email: schema.users.email }).from(gameInterest)
      .leftJoin(schema.users, eq(schema.users.id, gameInterest.userId)).orderBy(desc(gameInterest.createdAt));
    return Object.entries(GAMES).map(([game, label]) => {
      const mine = rows.filter((r) => r.game === game);
      return { game, label, votes: mine.length, emails: mine.map((r) => r.email).filter(Boolean) };
    }).sort((a, b) => b.votes - a.votes);
  } catch { return []; }
}

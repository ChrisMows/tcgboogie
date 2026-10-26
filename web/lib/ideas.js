import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { discordAdmins } from "@/lib/admin-alerts";
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/notify";
import { noteClaude } from "@/lib/usage";

// "Suggest an idea": what members (and visitors) wanted to do but couldn't. They come from the menu and footer, and
// from the dead ends where people get stuck: a search that finds nothing, a filter that's missing, Boogie Bot not
// knowing, an error page. The site attaches where they were, so a few words are enough. Admins see them in
// Admin → Ideas (with a BoogieBot Discord message for each new one), set a status, and when one is marked Done,
// everyone who asked for it gets a "you asked, it's live" email.
const { ideas, users } = schema;
const SITE = (process.env.AUTH_URL || "https://tcgboogie.com").replace(/\/$/, "");
export const STATUSES = [["new", "New"], ["planned", "Planned"], ["building", "Building"], ["done", "Done"], ["declined", "Not now"]];
export const SOURCES = { header: "Header button", menu: "Menu", footer: "Footer", faq: "FAQ", helper: "Boogie Bot", search: "Search found nothing", filters: "Deal filters", error: "Error page", notfound: "Page not found" };

const clean = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/** Save one idea and tell the admins. Returns { ok } or { error }. */
export async function submitIdea(user, { text, source, page, context }) {
  const body = clean(text, 1000);
  if (body.length < 3) return { error: "Tell us a little about what you were trying to do." };
  if (!db) return { ok: true }; // demo: nothing is saved
  const src = SOURCES[source] ? source : "menu";
  const ctx = context && typeof context === "object"
    ? Object.fromEntries(Object.entries(context).slice(0, 8).map(([k, v]) => [clean(k, 40), clean(v, 200)])) : null;
  await db.insert(ideas).values({ userId: user?.id || null, source: src, page: clean(page, 120) || null, plan: user ? user.tier : "visitor", text: body, context: ctx });
  await discordAdmins({
    title: "💡 New idea from a member",
    description: body.slice(0, 1500),
    url: `${SITE}/app/admin?tab=ideas`,
    fields: [
      { name: "From", value: `${user ? `${user.name || user.email || "A member"} (${user.tier === "premium" ? "Premium" : "Free"})` : "A visitor"} · ${SOURCES[src]}${page ? ` · ${clean(page, 80)}` : ""}` },
      ...(ctx && Object.keys(ctx).length ? [{ name: "Context", value: Object.entries(ctx).map(([k, v]) => `${k}: ${v}`).join("\n").slice(0, 1000) }] : []),
      { name: "Review", value: `[Open Admin → Ideas](${SITE}/app/admin?tab=ideas)` },
    ],
  });
  return { ok: true };
}

/** Admin → Ideas: newest first, with who sent each one. */
export async function listIdeas({ status = "open", limit = 200 } = {}) {
  if (!db) return [];
  const where = status === "open" ? inArray(ideas.status, ["new", "planned", "building"]) : status === "all" ? undefined : eq(ideas.status, status);
  return db.select({ idea: ideas, email: users.email, name: users.name }).from(ideas).leftJoin(users, eq(users.id, ideas.userId))
    .where(where).orderBy(desc(ideas.at)).limit(limit);
}

export async function ideaCounts() {
  if (!db) return {};
  try {
    const rows = await db.select({ status: ideas.status }).from(ideas);
    return rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  } catch { return {}; }
}

/**
 * Set the status of some ideas. Marking them done emails each member who sent one (once per idea), so asking is
 * worth it. note: an optional line from the admin about what changed. Returns how many emails went out.
 */
export async function setIdeaStatus(ids, status, note = "") {
  if (!db || !ids.length || !STATUSES.some(([k]) => k === status)) return 0;
  await db.update(ideas).set({ status, updatedAt: new Date() }).where(inArray(ideas.id, ids));
  if (status !== "done") return 0;
  const rows = await db.select({ idea: ideas, email: users.email }).from(ideas).innerJoin(users, eq(users.id, ideas.userId))
    .where(and(inArray(ideas.id, ids), isNull(ideas.notifiedAt)));
  let sent = 0;
  for (const { idea, email } of rows) {
    if (!email) continue;
    try {
      await sendEmail(email, {
        subject: "You asked, we built it ✨",
        heading: "Your idea is live on TCG Boogie",
        lines: [
          `You told us: "${idea.text.slice(0, 300)}"`,
          ...(clean(note, 500) ? [clean(note, 500)] : []),
          "Thanks for helping us make TCG Boogie better. Keep the ideas coming: Suggest an idea is in the menu.",
        ],
        button: { label: "Take a look", url: `${SITE}${idea.page && idea.page.startsWith("/") ? idea.page : "/app/collection"}` },
        footer: "You're getting this because you suggested this idea on TCG Boogie.",
      });
      await db.update(ideas).set({ notifiedAt: new Date() }).where(eq(ideas.id, idea.id));
      sent++;
    } catch (e) {
      await log("admin", "warn", `Couldn't email idea #${idea.id} as done: ${e.message}`);
    }
  }
  return sent;
}

/**
 * Admin → Ideas → "Group similar": Claude sorts the open ideas into themes ("Yu-Gi-Oh! support · 12"), so the most
 * wanted things stand out. Returns [{ theme, ids }] or throws.
 */
export async function groupIdeas() {
  const rows = (await listIdeas({ status: "open", limit: 300 })).map((r) => r.idea);
  if (rows.length < 2) return rows.map((i) => ({ theme: i.text.slice(0, 60), ids: [i.id] }));
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 8000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: {
        type: "object", additionalProperties: false, required: ["groups"],
        properties: { groups: { type: "array", items: { type: "object", additionalProperties: false, required: ["theme", "ids"],
          properties: { theme: { type: "string" }, ids: { type: "array", items: { type: "integer" } } } } } },
      } },
    },
    messages: [{ role: "user", content: `These are feature ideas and "I couldn't do this" notes from users of TCG Boogie, a Pokémon card deal-alert and collection site. Group the ones that ask for the same thing. Give each group a short theme (under 8 words, e.g. "Yu-Gi-Oh! support" or "Sort collection by set"). Every id goes in exactly one group; an idea unlike the others is a group of one. Order groups from most ideas to fewest.\n\n${rows.map((i) => `#${i.id}: ${i.text.slice(0, 300)}`).join("\n")}` }],
  });
  noteClaude(response); // Admin -> Usage
  if (response.stop_reason === "refusal") throw new Error("Claude declined to group these.");
  const parsed = JSON.parse(response.content.find((b) => b.type === "text")?.text || "{}");
  const known = new Set(rows.map((i) => i.id));
  return (parsed.groups || []).map((g) => ({ theme: clean(g.theme, 80), ids: [...new Set(g.ids)].filter((id) => known.has(id)) })).filter((g) => g.ids.length);
}

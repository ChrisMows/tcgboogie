import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { findCardOptions } from "@/lib/catalog";
import { GRADERS, gradeKey, nmPrice } from "@/lib/collection";
import { log } from "@/lib/log";

// Photo appraiser: a photo of cards (a binder page, a spread, a few slabs) -> which cards they are and what they're
// worth. Claude Haiku 5.5 reads what's printed on each card; the price service finds the matching product.
// Env: ANTHROPIC_API_KEY (same key the deal bot's photo check uses).
const MODEL = "claude-haiku-5-5";
const MAX_CARDS = 20;

export const appraiserReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "number", "set_hint", "language", "graded", "grader", "grade", "confidence"],
        properties: {
          name: { type: "string", description: "The card's English name, e.g. 'Charizard ex' or 'Umbreon VMAX'. For Japanese or other-language cards, give the English card name (ブラックキュレム -> 'Black Kyurem'), never the printed script" },
          number: { type: "string", description: "Collector number as printed, with the set total, e.g. '199/165', '020/027', 'SWSH180', 'TG01/TG30'; empty if not readable" },
          set_hint: { type: "string", description: "Set name if you can tell (set symbol, slab label), else empty" },
          language: { type: "string", enum: ["english", "japanese", "other"] },
          graded: { type: "boolean", description: "true if the card is in a grading slab" },
          grader: { type: "string", description: "PSA, CGC, BGS, SGC, TAG or empty" },
          grade: { type: "string", description: "Grade on the slab label, e.g. '10' or '9.5', else empty" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
  },
};

const PROMPT = `This photo shows Pokémon trading cards. List every card you can see (at most ${MAX_CARDS}), reading what is printed on it:
the card name, the collector number at the bottom (e.g. 199/165), the set if you can tell, and the language.
If a card is in a grading slab, read the grader and grade from the label.
Use "low" confidence when the name or number is hard to read. Skip card backs, energy cards you can't tell apart, and anything that isn't a Pokémon card.`;

/** What the photo shows, as Claude read it. image: { data (base64), mediaType }. */
async function readPhoto(image) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: PROMPT },
      ],
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("The photo couldn't be read.");
  const text = response.content.find((b) => b.type === "text")?.text || "";
  const parsed = JSON.parse(text);
  return { cards: (parsed.cards || []).slice(0, MAX_CARDS), usage: response.usage };
}

/** Read the photo, then match and price each card. Returns { cards: [...], total }. */
export async function appraisePhoto(image, userId) {
  const { cards, usage } = await readPhoto(image);
  const out = [];
  for (const c of cards) {
    const language = c.language === "japanese" ? "japanese" : "english";
    // Every version that fits (best first); the member picks when there's more than one.
    // Versions that fit the name and number; when the read isn't certain (or nothing fits the number), also every
    // other version with that name, so a misread number is one tap to fix. Only a fit is ever preselected.
    let found = [];
    try { found = c.name ? await findCardOptions({ name: c.name, number: c.number, language, setName: c.set_hint }) : []; } catch { found = []; }
    const fits = c.number ? found.length : 0; // without a number, every version "fits": that's a guess, so don't pick one
    if (c.name && (c.confidence !== "high" || !c.number || !fits)) {
      const more = await findCardOptions({ name: c.name, number: "", language }).catch(() => []);
      for (const p of more) if (!found.some((x) => x.id === p.id)) found.push(p);
      found = found.slice(0, 8);
    }
    const grader = c.graded ? GRADERS.find((g) => g.toLowerCase() === String(c.grader).toLowerCase()) || null : null;
    const grade = c.graded && /^\d+(\.5)?$/.test(String(c.grade)) ? String(c.grade) : null;
    const valueOf = (p) => {
      const g = grader && grade ? p.graded?.[gradeKey(grader, grade)] : null;
      return grader && grade ? (g && g.reliable !== false ? g.price : null) : nmPrice(p);
    };
    const options = found.map((p) => ({ id: p.id, name: p.name, setName: p.setName, number: p.number, image: p.image,
      language: p.language || "english", value: valueOf(p) }));
    out.push({
      read: { name: c.name, number: c.number, setHint: c.set_hint, language, confidence: c.confidence },
      graded: Boolean(grader && grade), grader, grade,
      product: fits ? options[0] : null, // nothing fits what was read: the member picks
      options,
      value: fits ? options[0].value : null,
    });
  }
  const total = out.reduce((s, c) => s + (c.value || 0), 0);
  await log("website", "info", `Photo appraiser: ${out.length} card${out.length === 1 ? "" : "s"} read, ${out.filter((c) => c.product).length} matched`,
    { inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens, total: Math.round(total) }, userId);
  return { cards: out, total };
}

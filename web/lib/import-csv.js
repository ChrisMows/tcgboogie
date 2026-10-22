// Collection import: read a CSV from TCG Boogie, TCGplayer, Collectr, PriceCharting (or a hand-made sheet) and turn each
// row into { name, set, number, quantity, condition, grader, grade, paid, productId, language, list }.
// Runs in the browser (parsing and column detection) and on the server (re-checking rows).
// Files from apps we don't know (other column names, no header row, ; or tab separated) aren't turned away: the
// browser asks the server to guess the columns (Claude reads the header and a few rows), and the member can correct
// each column before anything is matched.

export const MAX_ROWS = 1000;

/** The separator a file uses: comma, semicolon (European spreadsheets) or tab, whichever the first line has most of. */
export function sniffDelimiter(text) {
  const first = String(text || "").split(/\r?\n/, 1)[0];
  const n = (ch) => first.split(ch).length - 1;
  return [",", ";", "\t"].reduce((best, ch) => (n(ch) > n(best) ? ch : best), ",");
}

/** CSV text -> array of rows (arrays of strings). Handles quotes, escaped quotes, separators and newlines in cells. */
export function parseCsv(text, delimiter = sniffDelimiter(text)) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Column names each app uses, normalized (lowercase letters and digits only).
const COLUMNS = {
  name: ["name", "productname", "cardname", "card", "title", "product", "simplename"],
  set: ["set", "setname", "group", "groupname", "expansion", "consolename", "series"],
  number: ["number", "cardnumber", "collectornumber", "no", "num", "cardno"],
  quantity: ["quantity", "qty", "count", "totalquantity", "copies", "amount"],
  condition: ["condition", "conditionorgrade", "conditionstring", "cardcondition"],
  printing: ["printing", "variant", "finish", "foil"],
  grader: ["grader", "gradingcompany", "company", "gradedby"],
  grade: ["grade", "gradevalue"],
  paid: ["paideach", "purchaseprice", "pricepaid", "paid", "cost", "averagecostpaid", "costbasis", "buyprice"],
  productId: ["tcgplayerid", "productid", "tcgplayerproductid", "tcgproductid", "tcgid"],
  language: ["language", "lang"],
  list: ["list", "collection"],
  type: ["type", "kind", "producttype", "category"],
};
const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header row -> { field: column index } for the columns we recognise. */
export function detectColumns(header) {
  const map = {};
  const keys = header.map(norm);
  for (const [field, names] of Object.entries(COLUMNS)) {
    const i = keys.findIndex((k) => names.includes(k));
    if (i >= 0) map[field] = i;
  }
  return map;
}

const CONDITIONS = { nm: "Near Mint", nearmint: "Near Mint", mint: "Near Mint", lp: "Lightly Played", lightlyplayed: "Lightly Played",
  excellent: "Lightly Played", mp: "Moderately Played", moderatelyplayed: "Moderately Played", played: "Moderately Played",
  hp: "Heavily Played", heavilyplayed: "Heavily Played", dmg: "Damaged", damaged: "Damaged", poor: "Damaged" };
const GRADERS = ["PSA", "CGC", "BGS", "SGC", "TAG", "BVG", "ACE"];

/** One CSV row -> a clean import row, or null when it has no name or product ID. */
export function toRow(cells, map) {
  const get = (f) => (map[f] !== undefined ? String(cells[map[f]] ?? "").trim() : "");
  let name = get("name");
  let number = get("number");
  // PriceCharting style "Charizard #4": the number is in the name.
  const hash = name.match(/\s#\s*([\w/-]+)\s*$/);
  if (hash) { if (!number) number = hash[1]; name = name.slice(0, hash.index).trim(); }
  const productId = get("productId").replace(/\D/g, "");
  if (!name && !productId) return null;

  // Condition, or a grade written as "PSA 10" in the condition column.
  const condRaw = get("condition");
  let grader = get("grader").toUpperCase(), grade = get("grade");
  const slab = condRaw.match(/^(PSA|CGC|BGS|SGC|TAG|BVG|ACE)\s*(\d+(?:\.5)?)/i);
  if (slab) { grader = slab[1].toUpperCase(); grade = slab[2]; }
  if (grader && !GRADERS.includes(grader)) grader = "";
  if (grade && !/^\d+(\.5)?$/.test(grade)) grade = "";
  const graded = Boolean(grader && grade);
  const condKey = norm(condRaw.replace(/\b(holofoil|reverse holofoil|normal|1st edition|unlimited|foil)\b/gi, ""));
  const condition = CONDITIONS[condKey] || "Near Mint";

  const q = Math.round(Number(get("quantity").replace(/[^\d.]/g, "")) || 1);
  const paid = Number(get("paid").replace(/[$,\s]/g, ""));
  const type = get("type").toLowerCase();
  return {
    name, set: get("set"), number, productId: productId || null,
    quantity: Math.min(9999, Math.max(1, q)),
    graded, grader: graded ? grader : null, grade: graded ? grade : null, condition: graded ? null : condition,
    printing: get("printing") || null,
    paid: Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) / 100 : null,
    language: /japan|^jp$|^ja$/i.test(get("language")) ? "japanese" : "english",
    list: /wish/i.test(get("list")) ? "wishlist" : "owned",
    sealed: type === "sealed",
  };
}

/** Parsed file rows + a column map -> { rows, skipped } (at most MAX_ROWS rows). */
export function rowsFrom(all, columns, hasHeader = true) {
  const rows = [];
  let skipped = 0;
  for (const cells of all.slice(hasHeader ? 1 : 0)) {
    const r = toRow(cells, columns);
    if (r) rows.push(r); else skipped++;
  }
  return { rows: rows.slice(0, MAX_ROWS), skipped: skipped + Math.max(0, rows.length - MAX_ROWS) };
}

/**
 * Whole file -> { rows, columns, skipped, all }. When no name or TCGplayer ID column is recognised by name it returns
 * needsColumns: true (and no rows) so the columns can be guessed and checked first.
 */
export function readCollectionCsv(text) {
  const all = parseCsv(text);
  if (all.length < 1 || (all.length < 2 && !all[0]?.length)) return { rows: [], columns: {}, skipped: 0, all, error: "That file has no rows." };
  const columns = detectColumns(all[0]);
  // A "name" column that mostly holds numbers ("Card #" -> 4/102) is the wrong column: let the columns be checked.
  const sample = all.slice(1, 11).map((r) => String(r[columns.name] ?? "").trim()).filter(Boolean);
  const numbery = columns.name !== undefined && sample.length && sample.filter((v) => /^[\d\s/#-]+$/.test(v)).length > sample.length / 2;
  if (numbery) delete columns.name;
  if ((columns.name === undefined && columns.productId === undefined) || numbery) return { rows: [], columns, skipped: 0, all, needsColumns: true };
  return { ...rowsFrom(all, columns), columns, all };
}

// What each of our fields means, for the column guess (server) and the column picker (browser).
export const FIELDS = {
  name: "Card or product name", set: "Set", number: "Card number", quantity: "Quantity", condition: "Condition",
  printing: "Printing (Holofoil, Reverse…)", grader: "Grading company", grade: "Grade", paid: "Price paid each",
  productId: "TCGplayer product ID", language: "Language", list: "List (owned / wishlist)", type: "Type (card / sealed)",
};

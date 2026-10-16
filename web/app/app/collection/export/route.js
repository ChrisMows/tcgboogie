import { NextResponse } from "next/server";
import { itemLabel, unitValue } from "@/lib/collection";
import { getCurrentUser } from "@/lib/session";
import * as store from "@/lib/store";

const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote when needed, and stop spreadsheet apps treating a value as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Premium: the whole collection and wishlist as a CSV file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.AUTH_URL || "https://tcgboogie.com"));
  if (!user.plan.collectionExport) return new NextResponse("CSV export is a Premium feature.", { status: 403 });
  const [items, binders] = await Promise.all([store.listItems(user.id), store.listBinders(user.id)]);
  const binderName = Object.fromEntries(binders.map((b) => [b.id, b.name]));
  const head = ["List", "Name", "Set", "Number", "Type", "Printing", "Condition or grade", "Cert number", "Quantity",
    "Value each", "Total value", "Paid each", "Date bought", "Binder", "Notes", "TCGplayer ID"];
  const rows = items.map((it) => {
    const v = unitValue(it);
    return [it.list === "wishlist" ? "Wishlist" : "Collection", it.name, it.setName, it.number, it.kind, it.printing,
      it.kind === "sealed" ? "" : itemLabel(it).split(" · ").pop(), it.certNumber, it.quantity,
      v, v !== null ? Math.round(v * it.quantity * 100) / 100 : null, it.purchasePrice, it.purchaseDate,
      binderName[it.binderId], it.notes, it.productId];
  });
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tcg-boogie-collection-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { scanSettings } from "@/lib/deals";

// The deal bot asks this how widely to scan: the loosest running filter across members (no personal data).
export const dynamic = "force-dynamic";
let memo = { at: 0, body: null };

export async function GET() {
  if (!memo.body || Date.now() - memo.at > 60000) memo = { at: Date.now(), body: await scanSettings() };
  return NextResponse.json(memo.body);
}

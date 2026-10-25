import { marketItem } from "@/lib/market";
import { saleImage } from "@/lib/sale-image";

// tcgboogie.com/sales/image/high-123.png: a market feed item's share image (lib/sale-image.js).
export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const x = await marketItem(String((await params).id || "").replace(/\.png$/, ""));
  if (!x) return new Response("Not found", { status: 404 });
  return saleImage(x);
}

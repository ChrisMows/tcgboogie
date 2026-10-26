import { getCurrentUser } from "@/lib/session";
import { releaseByVersion, releasePreviewHtml } from "@/lib/release-email";

// Admin -> Release emails -> Preview: the release email exactly as members will get it (admins only).
export async function GET(req, { params }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.isAdmin) return new Response("Not found", { status: 404 });
  const r = releaseByVersion((await params).version);
  if (!r) return new Response("No such release", { status: 404 });
  return new Response(releasePreviewHtml(r), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

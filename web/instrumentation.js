// Any error a page, server action or API route throws ends up in Admin → Logs (Website tab).
export async function register() {}

export async function onRequestError(err, request, context) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (err?.digest === "NEXT_NOT_FOUND" || String(err?.digest || "").startsWith("NEXT_REDIRECT")) return; // not errors
  const { log } = await import("@/lib/log");
  await log("website", "error", `${context?.routeType || "request"} error on ${request?.path || "?"}: ${err?.message || err}`, {
    method: request?.method,
    route: context?.routePath,
    digest: err?.digest,
    stack: String(err?.stack || "").split("\n").slice(0, 8).join("\n"),
  });
}

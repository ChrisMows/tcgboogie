import { authEnabled, handlers } from "@/auth";

const unavailable = () => Response.json({ error: "Accounts are not open yet." }, { status: 503 });

export const GET = authEnabled ? handlers.GET : unavailable;
export const POST = authEnabled ? handlers.POST : unavailable;

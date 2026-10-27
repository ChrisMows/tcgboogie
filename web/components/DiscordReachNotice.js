import Link from "next/link";
import { discordReach } from "@/lib/discord-reach";
import { DISCORD_INVITE } from "@/lib/social";

/** On every member page while Discord alerts are on but can't reach the member (lib/discord-reach.js). */
export default async function DiscordReachNotice({ user }) {
  const r = await discordReach(user).catch(() => null);
  if (!r) return null;
  return (
    <div className="notice warn discord-reach" role="status">
      <div>
        <b>Your Discord alerts can&apos;t reach you.</b>{" "}
        {r.kind === "not-member"
          ? "Discord only lets BoogieBot message people in the TCG Boogie server. Join it (it's free) and your next alert arrives in your DMs."
          : "Your Discord settings block messages from the TCG Boogie server. Open the server, tap its name, then Privacy Settings, and turn on Direct Messages."}
        {" "}Your other alerts keep working meanwhile.
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
        <a className="btn sm primary" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">{r.kind === "not-member" ? "Join the Discord" : "Open the Discord"}</a>
        <Link className="btn sm ghost" href="/app/account#alerts">Alert settings</Link>
      </div>
    </div>
  );
}

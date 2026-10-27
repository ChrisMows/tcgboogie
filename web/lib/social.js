// TCG Boogie's social accounts, linked from the footer, Market Movers, What's new and every email, and named in link
// previews (twitter:site) so X credits the account when someone shares a TCG Boogie link.
export const X_HANDLE = "@TCGBoogie";
export const X_URL = "https://x.com/TCGBoogie";

// Our Discord server. BoogieBot can only DM people who are in it (Discord's rule), so every place Discord alerts are
// offered says to join, and lib/discord-reach.js checks membership. DISCORD_GUILD_ID overrides the server ID.
export const DISCORD_INVITE = "https://discord.gg/3gMrub2KUh";
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "1559731178242703400";

// Which profile picture to show for a member: their chosen source, else Google, else Discord, else initials.
export const AVATAR_SOURCES = { google: "Google", discord: "Discord", initials: "Initials" };

export function avatarOptions(user) {
  return {
    google: user.googleImage || (user.providers?.includes("google") ? user.image : null) || null,
    discord: user.discordImage || null,
  };
}

export function avatarFor(user) {
  const opts = avatarOptions(user);
  const chosen = user.avatarSource;
  if (chosen === "initials") return { source: "initials", url: null };
  if (chosen && opts[chosen]) return { source: chosen, url: opts[chosen] };
  if (opts.google) return { source: "google", url: opts.google };
  if (opts.discord) return { source: "discord", url: opts.discord };
  return { source: "initials", url: null };
}

export function initials(user) {
  const base = String(user.name || user.email || "?").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 && user.name ? parts[1][0] : "")).toUpperCase();
}

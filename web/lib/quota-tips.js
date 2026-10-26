// Shared by the photo screens (client) and lib/quota.js. A photo can hold several cards (up to 20), and the monthly
// allowance counts photos, not cards: when one runs low, say so.
export const PHOTO_TIP = "Tip: one photo can hold up to 20 cards (a whole binder page) and still counts as one, so fit several cards in each.";

/** True once a limited allowance ({ limit, left }) is down to its last fifth (and at least 3 left to warn about). */
export const runningLow = (s) => s?.limit != null && s.limit > 0 && s.left > 0 && s.left <= Math.max(3, Math.round(s.limit * 0.2));

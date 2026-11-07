// The Android app (android-webview/) shows this site in a WebView and adds "TCGBoogieApp/<version>" to its user agent.
// Shared by the server and the browser. The app's native features only answer on tcgboogie.com, so nothing here is a
// security check: a browser pretending to be the app only gets the app's buttons, which then don't work for it.

const APP_UA = /\bTCGBoogieApp\/\d/;

export const isAppUA = (ua) => APP_UA.test(String(ua || ""));
export const inAppShell = () => typeof navigator !== "undefined" && isAppUA(navigator.userAgent);

/** A member page to open in the app: /app or below, with an optional query and #section. Anything else opens Home. */
export function safeAppPath(path) {
  const p = String(path || "");
  return /^\/app(\/[\w\-/%.]*)?(\?[\w\-=&%.]*)?(#[\w-]*)?$/.test(p) && !p.includes("..") ? p : "/app/home";
}

/** Where Stripe sends an app member back to: a page that reopens the app on `path` (app/app-return/route.js). */
export const appReturnPath = (path) => `/app-return?to=${encodeURIComponent(path)}`;

const sent = new Map(); // waiting replies from the app, by id
let nextId = 1;
let listening = false;

/**
 * Ask the Android app to do something ("push-enable", "push-status", "push-disable"). Resolves with its reply, or
 * { state: "unsupported" } when there's no app to ask or it doesn't answer in time.
 */
export function askApp(cmd, timeoutMs = 10000) {
  const bridge = typeof window !== "undefined" ? window.TCGBoogieNative : null;
  if (!bridge) return Promise.resolve({ state: "unsupported" });
  if (!listening) {
    listening = true;
    bridge.addEventListener("message", (e) => {
      let reply;
      try { reply = JSON.parse(e.data); } catch { return; }
      const done = sent.get(reply?.id);
      if (done) { sent.delete(reply.id); done(reply); }
    });
  }
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => { sent.delete(id); resolve({ state: "unsupported" }); }, timeoutMs);
    sent.set(id, (reply) => { clearTimeout(timer); resolve(reply); });
    bridge.postMessage(JSON.stringify({ id, cmd }));
  });
}

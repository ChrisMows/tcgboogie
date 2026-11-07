"use client";

import { pushKey, savePush } from "@/app/app/actions";
import { install } from "@/components/InstallApp";
import { askApp, inAppShell } from "@/lib/app-shell";

// Switching push alerts on for this phone or computer, shared by every "Push" switch (Settings, Alerts go to, deal
// filters, and the prompt in the home-screen app). The browser asks the member's permission, so it has to start from
// a tap. On iPhone, push works only once TCG Boogie is on the home screen and opened from there (Apple's rule), so
// there it shows the home-screen steps instead, and the home-screen app asks again (components/PushPrompt.js).

export const pushSupported = () => typeof window !== "undefined"
  && (inAppShell() ? Boolean(window.TCGBoogieNative) : "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
/** The browser's answer about notifications. The Android app asks when push is switched on, so it's always "default" here. */
export const pushPermission = () => (inAppShell() ? "default" : Notification.permission);
export const isIOS = () => typeof navigator !== "undefined"
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const standalone = () => typeof window !== "undefined"
  && (inAppShell() || window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);
/** Has to go on the home screen first (iPhone in Safari). */
export const needsInstall = () => !pushSupported() && isIOS() && !standalone();

function keyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const APP_TOKEN = "tcgb-app-push-token";
const appEndpoint = (token) => `fcm:${token}`;
const appSubscription = (token) => ({ endpoint: appEndpoint(token), keys: { p256dh: "fcm", auth: "fcm" } });

/** Android app: Firebase can replace an install's token, so save the new one when it changes. Runs on each app page load. */
export async function syncAppPush() {
  if (!inAppShell()) return;
  const status = await askApp("push-status");
  if (!status.enabled || !status.token) return;
  let saved = null;
  try { saved = localStorage.getItem(APP_TOKEN); } catch { /* storage blocked: save it again */ }
  if (saved === status.token) return;
  const res = await savePush(appSubscription(status.token), navigator.userAgent).catch(() => null);
  if (res?.ok) try { localStorage.setItem(APP_TOKEN, status.token); } catch { /* fine */ }
}

export async function currentSubscription() {
  if (inAppShell()) {
    const status = await askApp("push-status");
    return status.enabled && status.token
      ? { endpoint: appEndpoint(status.token), unsubscribe: () => askApp("push-disable") }
      : null;
  }
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Turn push on for this device (call it from a tap). Returns { ok, endpoint } or { ok: false, state, error }:
 * state "ios-install" (the home-screen steps are showing), "blocked", "unsupported" or "off" (the member said not now).
 */
export async function enablePush() {
  if (needsInstall()) {
    install({ forPush: true });
    return { ok: false, state: "ios-install" };
  }
  if (!pushSupported()) return { ok: false, state: "unsupported", error: "This browser can't show push notifications. Try Chrome, Edge, Firefox or Safari." };
  if (inAppShell()) {
    const reply = await askApp("push-enable", 120000); // waits on the phone's permission question
    if (!reply.token) {
      return reply.state === "blocked"
        ? { ok: false, state: "blocked", error: "Notifications are blocked for TCG Boogie. Allow them in your phone's app settings, then try again." }
        : reply.state === "off" ? { ok: false, state: "off" }
          : { ok: false, state: "off", error: "Push alerts couldn't switch on just now. Please try again." };
    }
    const res = await savePush(appSubscription(reply.token), navigator.userAgent);
    if (!res.ok) return { ok: false, state: "off", error: res.error };
    try { localStorage.setItem(APP_TOKEN, reply.token); } catch { /* fine */ }
    return { ok: true, endpoint: appEndpoint(reply.token) };
  }
  if (Notification.permission === "denied") return { ok: false, state: "blocked", error: "Notifications are blocked for TCG Boogie in this browser. Allow them in the browser's site settings, then try again." };
  try {
    const key = await pushKey();
    if (!key) return { ok: false, state: "off", error: "Push alerts work on the live site, not in this preview." };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return permission === "denied"
        ? { ok: false, state: "blocked", error: "Notifications are blocked for TCG Boogie in this browser. Allow them in the browser's site settings, then try again." }
        : { ok: false, state: "off" };
    }
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const res = await savePush(sub.toJSON(), navigator.userAgent);
    if (!res.ok) return { ok: false, state: "off", error: res.error };
    return { ok: true, endpoint: sub.endpoint };
  } catch {
    return { ok: false, state: "off", error: "This browser wouldn't switch push on. Please try again, or try another browser." };
  }
}

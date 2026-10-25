// TCG Boogie's service worker: shows push alerts (lib/push.js sends them) and opens the deal or card when one is
// tapped, in the open TCG Boogie window if there is one. It doesn't cache pages: the site always loads fresh.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "TCG Boogie", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "TCG Boogie", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined, // a newer alert about the same deal replaces the older one
    renotify: Boolean(data.tag),
    data: { url: data.url || "/app/deals" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/app/deals", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const mine = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (mine) {
      await mine.focus();
      return mine.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});

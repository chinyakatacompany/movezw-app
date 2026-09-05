import { precacheAndRoute } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const VIBRATION_PATTERNS = {
  default: [200, 100, 200],
  // A single 500ms buzz reads as barely different from the short pattern on
  // most phones — a real double-buzz is what actually feels "long" and
  // grabs attention for a job alert.
  long: [600, 200, 600],
  double: [150, 80, 150, 80, 150],
  off: [],
};

// Fires even while the app is closed or the phone is locked/in a pocket —
// this is what makes background delivery possible, unlike the in-app
// Supabase realtime subscriptions used elsewhere, which only run while a
// tab is open.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "MoveZW", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "New job request";
  const vibrate = VIBRATION_PATTERNS[payload.vibration] || VIBRATION_PATTERNS.long;

  const showNotification = self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-512.png",
      badge: "/icon-192.png",
      vibrate,
      data: { url: payload.url || "/driver" },
      tag: payload.tag || "movezw-job",
      renotify: true,
    });
  // The exact unread count is synced when the app next opens. While it is
  // closed, set a generic launcher dot immediately so a new job/offer is
  // still visible from the home screen.
  const setBadge = self.navigator?.setAppBadge
    ? self.navigator.setAppBadge().catch(() => {})
    : Promise.resolve();
  event.waitUntil(Promise.all([showNotification, setBadge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/driver";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

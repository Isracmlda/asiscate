import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseConfig } from './config/firebaseConfig';

precacheAndRoute(self.__WB_MANIFEST);
// Always fetch attendance entry pages from Hosting so installed copies cannot
// keep showing an older QR screen or older attendance instructions.
registerRoute(
  ({ request, url }) => request.mode === 'navigate'
    && (url.searchParams.has('studentAttendanceQr') || url.searchParams.has('formationCheckin')),
  new NetworkOnly()
);
// Firebase Auth uses /__/auth/* for its OAuth callback helper. Do not let the
// PWA navigation fallback replace that endpoint with the SPA's index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/__/]
}));
self.skipWaiting();
clientsClaim();

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || 'Recordatorio de asistencia';
  const options = {
    body: payload.notification?.body || 'Es hora de pasar lista a tu grupo.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingWindow = windows.find(client => client.url === targetUrl);

    if (existingWindow) {
      await existingWindow.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});

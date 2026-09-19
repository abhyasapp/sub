/* ═══════════════════════════════════════════════════════════════════════
   SW.JS — Abhyas Service Worker  (v1.07)

   Strategy:
   • Admin panel      → NEVER intercepted. Always live network.
   • index.html/shell → network-first, cache-bypass (no-store) so a live
                         connection is never shadowed by a stale copy.
                         Falls back to the last cached copy ONLY when the
                         network genuinely fails.
   • API/getFile      → network-first. Plain API calls get a generic
                         offline JSON fallback and are never cached.
                         `action=getFile` responses (question-set JSON,
                         including subjective topic files) ARE cached in
                         Cache Storage as a second offline layer alongside
                         app.js's IndexedDB QDB.
   • Stale clearance  → whenever we're confirmed online again, purge
                         cached entries that aren't part of the current
                         SHELL.
   ═══════════════════════════════════════════════════════════════════════ */

/* CACHE_NAME derives from version.js's APP_VERSION, so bumping that
   value is the ONLY step needed to force every open browser tab to
   drop its old cached shell on next activation. Bump APP_VERSION for
   ANY shell-relevant change — HTML, JS, CSS, manifest, or the vendor
   assets — not just version releases. */
importScripts('./version.js');
const CACHE_NAME = 'abhyas-v' + APP_VERSION;

/* ── PUSH NOTIFICATIONS (Firebase Cloud Messaging) ─────────────────
   Wrapped in try/catch: these are remote CDN scripts, not part of our
   own SHELL, so a network hiccup during SW install/activation must
   never break offline caching (this SW's actual job) just because push
   notifications couldn't initialize. */
let _fcmMessaging = null;
try {
  importScripts('./firebase-config.js');
  if (typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED) {
    importScripts(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
    );
    firebase.initializeApp(FIREBASE_CONFIG);
    _fcmMessaging = firebase.messaging();
  }
} catch (err) {
  console.warn('SW: push notifications unavailable (not configured yet, or offline during install)', err);
}

// Fires when a push arrives while no Abhyas tab is focused — Firebase's
// SDK handles the actual push-event parsing; this just decides how to
// display it. Tapping it is handled by the existing 'notificationclick'
// listener further down (already built for timetable reminders — reused
// as-is here, no changes needed there).
if (_fcmMessaging) {
  _fcmMessaging.onBackgroundMessage(payload => {
    const title = (payload.notification && payload.notification.title) || 'Abhyas';
    const body = (payload.notification && payload.notification.body) || '';
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png'
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   SHELL — everything precached for offline use.
   v1.07 adds the four new module scripts; they must be listed or the
   offline boot will fail when user.html tries to load them.
   ═══════════════════════════════════════════════════════════════════════ */
const SHELL = [
  './',
  './index.html',
  './user.html',

  /* Core scripts */
  './config.js',
  './version.js',
  './shared.js',
  './firebase-config.js',
  './chapters-data.js',
  './cloud-sync.js',

  /* Modular app code — user.html loads these three in this order */
  './app.js',
  './objective.js',
  './subjective.js',

  /* Subjective syllabus data (chapter/topic map) and topic fileId map */
  './subjective_chapters.js',
  './subjective-data.js',

  /* Shared PDF reader — without this, opening a marked paper offline fails */
  './pdf-viewer.js',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',

  /* Styles + manifest */
  './design-system.css',
  './manifest.json',

  /* Icon font used across all pages */
  './vendor/phosphor/phosphor-regular.css',
  './vendor/phosphor/Phosphor.woff2'

  /* NOTE: admin.html is deliberately NOT in SHELL — it must never be
     served from cache. */
];

/* Is this request/page the admin panel? */
async function isAdminOrigin(request, clientId) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('admin.html')) return true;
  if (!clientId) return false;
  try {
    const client = await self.clients.get(clientId);
    return !!(client && client.url && client.url.includes('admin.html'));
  } catch (e) { return false; }
}

/* ═══════════════════════════════════════════════════════════════════════
   INSTALL — precache the shell and activate immediately
   ═══════════════════════════════════════════════════════════════════════ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(SHELL))
      .catch(err => {
        // addAll is atomic — a single failure means NOTHING was cached.
        // Log loudly so a broken install is visible in the console; the
        // SW still activates and the per-request fallbacks below will
        // fill in what they can on first online use.
        console.warn('SW install: shell precache failed — some files may not be available offline:', err);
      })
  );
  self.skipWaiting();  // ← immediate activation, no old SW left behind
});

/* ═══════════════════════════════════════════════════════════════════════
   ACTIVATE — delete old caches, claim clients, notify every open tab.
   The notification is what lets app.js surface a "reload to update"
   toast — the SW activates mid-session (skipWaiting + clients.claim),
   but the PAGE keeps executing the OLD JavaScript until it reloads.
   ═══════════════════════════════════════════════════════════════════════ */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      try {
        client.postMessage({ type: 'SW_ACTIVATED', version: APP_VERSION });
      } catch (e) { /* client may be closing */ }
    });
  })());
});

/* ═══════════════════════════════════════════════════════════════════════
   STALE CLEARANCE — remove shell entries that aren't in the current SHELL
   (i.e. assets from a previous version). API responses are preserved.
   ═══════════════════════════════════════════════════════════════════════ */
async function clearStaleShellEntries() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const shellAbs = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));
  await Promise.all(keys.map(req => {
    const url = new URL(req.url);
    const isApi = url.hostname.includes('script.google.com');   // keep getFile responses
    if (isApi) return Promise.resolve();
    if (!shellAbs.has(req.url)) return cache.delete(req);
    return Promise.resolve();
  }));
}

/* Message from index.html / user.html — purge stale shell entries now
   that the network is confirmed online. */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CLEAR_STALE_IF_ONLINE') {
    e.waitUntil ? e.waitUntil(clearStaleShellEntries()) : clearStaleShellEntries();
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   NOTIFICATION CLICK — focus an existing Abhyas tab, or open user.html
   ═══════════════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.includes('user.html') && 'focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./user.html');
  })());
});

/* ═══════════════════════════════════════════════════════════════════════
   FETCH — network-first with cache fallback; admin bypassed entirely
   ═══════════════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  e.respondWith((async () => {
    const fromAdmin = await isAdminOrigin(e.request, e.clientId);

    /* ── ADMIN: bypass the service worker entirely ── */
    if (fromAdmin) return fetch(e.request);

    /* ── API calls: network-first ── */
    if (url.hostname.includes('script.google.com')) {
      const isGetFile = (url.searchParams.get('action') || '').toLowerCase() === 'getfile';
      try {
        const res = await fetch(e.request.clone());
        if (isGetFile && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        // Deliberately NO clearStaleShellEntries() call here. It used to
        // fire on every getFile fetch — a full cache-key scan per
        // question-file request, so ~200 scans during a first-time
        // CACHE.autoSync of the whole library. The message-triggered
        // path above is the only place stale entries accumulate.
        return res;
      } catch (err) {
        if (isGetFile) {
          const cached = await caches.match(e.request);
          if (cached) return cached;
        }
        // Don't fabricate a fake response — let the page handle the error.
        throw err;
      }
    }

    /* ── App shell: network-first with cache fallback ── */
    try {
      const res = await fetch(e.request.clone(), { cache: 'no-store' });
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    } catch (err) {
      const cached = await caches.match(e.request);
      return cached || new Response('Offline', { status: 503 });
    }
  })());
});
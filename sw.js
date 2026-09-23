/* ═══════════════════════════════════════════════════════════════════════
   SW.JS — Abhyas Service Worker  (v1.20)

   Strategy
   • API (script.google.com)  → never touched. POSTs and question files go
                                straight to the network; app.js keeps the
                                question cache in IndexedDB (QDB).
   • App shell (same origin)  → network-first, but with a 4 s timeout when a
                                cached copy exists, so a weak connection or
                                load-shedding never hangs the app. Falls back
                                to the cached copy, then to a friendly offline
                                page.
   • Fonts / KaTeX / pdf.js / confetti (public CDNs) → cache-first in their
                                own cache, fetched with CORS so nothing is
                                stored as an opaque (quota-hungry) response.
                                Math, fonts and the PDF reader now work offline
                                after the first online visit.
   • Precache is tolerant: one missing file no longer cancels the whole
     offline install.
   • admin.html is never served from cache.
   ═══════════════════════════════════════════════════════════════════════ */

importScripts('./version.js');
const CACHE_NAME = 'abhyas-v' + APP_VERSION;
const CDN_CACHE = 'abhyas-cdn-v1';
const NETWORK_TIMEOUT_MS = 4000;
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

/* ── PUSH NOTIFICATIONS (Firebase Cloud Messaging) ──
   Wrapped in try/catch so a network hiccup during install can never break
   offline caching just because push could not initialise. */
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

/* Everything the app loads from its own origin. Missing files are reported in
   the console but do not stop the rest from being cached. Self-host pdf.js in
   ./vendor/pdfjs/ and it is cached here automatically. */
const SHELL = [
  './',
  './index.html',
  './user.html',
  './privacy.html',
  './terms.html',

  './config.js',
  './content-index.js',
  './version.js',
  './shared.js',
  './firebase-config.js',
  './chapters-loader.js',
  './cloud-sync.js',

  './app.js',
  './objective.js',
  './subjective.js',
  './subjective_chapters.js',
  './subjective-data.js',
  './pdf-viewer.js',

  './icon-192.png',
  './icon-512.png',
  './favicon.png',

  './design-system.css',
  './manifest.json',

  './vendor/phosphor/phosphor-regular.css',
  './vendor/phosphor/Phosphor.woff2',

  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './vendor/pdf-lib/pdf-lib.min.js',
  './vendor/katex/katex.min.js',
  './vendor/katex/katex.min.css',
  './vendor/katex/auto-render.min.js',
  './vendor/confetti/confetti.browser.js',
  './vendor/fonts/fonts.css',
  './vendor/fonts/inter-latin-400-normal.woff2',
  './vendor/fonts/inter-latin-500-normal.woff2',
  './vendor/fonts/inter-latin-600-normal.woff2',
  './vendor/fonts/inter-latin-700-normal.woff2',
  './vendor/fonts/inter-latin-800-normal.woff2',
  './vendor/fonts/jetbrains-mono-latin-400-normal.woff2',
  './vendor/fonts/jetbrains-mono-latin-500-normal.woff2',
  './vendor/fonts/jetbrains-mono-latin-700-normal.woff2',
  './vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2'

  /* admin.html is deliberately NOT here: it must never be served from cache. */
];

function offlinePage() {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'font:16px/1.6 system-ui,sans-serif;background:#f2f4f3;color:#1c2321;text-align:center;padding:24px}' +
    'h1{font-size:1.3rem;margin:0 0 8px}p{margin:0 0 16px;color:#4a5551}' +
    'a{display:inline-block;padding:10px 18px;border-radius:10px;background:#1e7a4c;color:#fff;text-decoration:none;font-weight:600}' +
    '@media(prefers-color-scheme:dark){body{background:#080b14;color:#edf2ef}p{color:#9aa6b8}}</style></head><body>' +
    '<div><h1>You are offline</h1><p>This page has not been saved on your phone yet.<br>' +
    'Chapters you downloaded still open from the app.</p><a href="./user.html">Open Abhyas</a></div></body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ── INSTALL ── */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(SHELL.map(async path => {
      const res = await fetch(new Request(path, { cache: 'reload' }));
      if (!res.ok) throw new Error(path + ' -> ' + res.status);
      await cache.put(path, res);
    }));
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? SHELL[i] : null))
      .filter(Boolean);
    if (failed.length) console.warn('SW install: these files could not be cached (offline use may be limited):', failed);
  })());
  self.skipWaiting();
});

/* ── ACTIVATE ── */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [CACHE_NAME, CDN_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => keep.indexOf(k) === -1).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      try { client.postMessage({ type: 'SW_ACTIVATED', version: APP_VERSION }); } catch (err) { /* closing */ }
    });
  })());
});

/* Remove shell entries that are no longer part of the current SHELL. Vendor
   files are kept because their exact names may differ from the list above. */
async function clearStaleShellEntries() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const shellAbs = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));
  await Promise.all(keys.map(req => {
    const url = new URL(req.url);
    if (url.hostname.includes('script.google.com')) return Promise.resolve();
    if (url.pathname.indexOf('/vendor/') !== -1) return Promise.resolve();
    if (!shellAbs.has(req.url)) return cache.delete(req);
    return Promise.resolve();
  }));
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CLEAR_STALE_IF_ONLINE') {
    e.waitUntil(clearStaleShellEntries());
  }
});

/* ── NOTIFICATION CLICK ── */
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

/* ── FETCH HELPERS ── */
function fetchWithTimeout(req, ms) {
  if (!ms) return fetch(req, { cache: 'no-cache' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { cache: 'no-cache', signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* Only give up on the network quickly when there is something to fall back to;
   on a first-ever visit, wait for the network as long as it takes. */
async function networkFirst(req) {
  const isNav = req.mode === 'navigate';
  const cached = await caches.match(req, { ignoreSearch: isNav });
  try {
    const res = await fetchWithTimeout(req, cached ? NETWORK_TIMEOUT_MS : 0);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch (err) {
    if (cached) return cached;
    if (isNav) {
      const shell = await caches.match('./index.html');
      return shell || offlinePage();
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function cdnCacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) cache.put(req.url, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    try { return await fetch(req); } catch (e2) { return new Response('', { status: 504, statusText: 'Offline' }); }
  }
}

/* ── FETCH ── */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POSTs (Apps Script) go straight through
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  if (/^script\.google(usercontent)?\.com$/.test(url.hostname)) return;   // API: never touched
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) { e.respondWith(cdnCacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/admin.html')) return;       // admin is never cached

  e.respondWith(networkFirst(req));
});

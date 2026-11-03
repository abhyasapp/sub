/* ═══════════════════════════════════════════════════════════════════════
   SW.JS — Abhyas Service Worker (v1.58.0)
   Version is derived from js/core/version.js. Update that file (and
   config.js and package.json — a test fails if any of the three differ)
   to invalidate every cache on the next page load.
   ═══════════════════════════════════════════════════════════════════════ */

importScripts('./js/core/version.js');
const CACHE_NAME = 'abhyas-v' + APP_VERSION;

/* The browser decides whether to install a new worker by comparing the bytes
   of THIS file. A change inside js/core/version.js alone (pulled in by
   importScripts below) does not trigger an update, so an already-installed
   app keeps its old shell cache and never sees a deployed fix. Bump SW_BUILD
   together with APP_VERSION in config.js, version.js and package.json. */
const SW_BUILD = '2.14';
const CDN_CACHE  = 'abhyas-cdn-v1';
const NETWORK_TIMEOUT_MS = 2500;
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

const SHELL = [
  './', './index.html', './user.html', './privacy.html', './terms.html', './manifest.json',
  './js/core/config.js', './js/core/version.js', './js/core/nav.js', './js/app.js',
  './js/data/chapters-loader.js', './js/data/content-index.js', './js/data/subjective_chapters.js', './js/data/subjective-data.js',
  './icon-192.png', './icon-512.png', './favicon.png',
  './tools/vendor/phosphor/phosphor-regular.css', './tools/vendor/phosphor/Phosphor.woff2',
  './tools/vendor/pdfjs/pdf.min.js', './tools/vendor/pdfjs/pdf.worker.min.js', './tools/vendor/pdf-lib/pdf-lib.min.js',
  './tools/vendor/katex/katex.min.js', './tools/vendor/katex/katex.min.css', './tools/vendor/katex/auto-render.min.js',
  './tools/vendor/confetti/confetti.browser.js',
  './tools/vendor/fonts/fonts.css',
  './tools/vendor/fonts/inter-latin-400-normal.woff2', './tools/vendor/fonts/inter-latin-500-normal.woff2',
  './tools/vendor/fonts/inter-latin-600-normal.woff2', './tools/vendor/fonts/inter-latin-700-normal.woff2',
  './tools/vendor/fonts/inter-latin-800-normal.woff2',
  './tools/vendor/fonts/jetbrains-mono-latin-400-normal.woff2', './tools/vendor/fonts/jetbrains-mono-latin-500-normal.woff2', './tools/vendor/fonts/jetbrains-mono-latin-700-normal.woff2',
  './tools/vendor/katex/fonts/KaTeX_AMS-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './tools/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './tools/vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  './tools/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2', './tools/vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  './tools/vendor/katex/fonts/KaTeX_Main-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './tools/vendor/katex/fonts/KaTeX_Math-Italic.woff2', './tools/vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './tools/vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2', './tools/vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './tools/vendor/katex/fonts/KaTeX_Script-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './tools/vendor/katex/fonts/KaTeX_Size2-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  './tools/vendor/katex/fonts/KaTeX_Size4-Regular.woff2', './tools/vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
  './js/app/index-page.js',
  './js/core/access.js',
  './js/core/actions.js',
  './js/core/auth.js',
  './js/core/constants.js',
  './js/core/crash-report.js',
  './js/core/dom.js',
  './js/core/expose.js',
  './js/core/float-space.js',
  './js/core/format.js',
  './js/core/insights.js',
  './js/core/loksewa.js',
  './js/core/modal.js',
  './js/core/net.js',
  './js/core/perf.js',
  './js/core/progress.js',
  './js/core/psync.js',
  './js/core/question.js',
  './js/core/router.js',
  './js/core/scope.js',
  './js/core/state.js',
  './js/core/storage.js',
  './js/core/study-docs.js',
  './js/core/subjective-api.js',
  './js/core/sync.js',
  './js/core/text.js',
  './js/core/theme.js',
  './js/core/toast.js',
  './js/features/boot.js',
  './js/features/cache.js',
  './js/features/chapter-nav.js',
  './js/features/chapter-stats.js',
  './js/features/cloud-drive.js',
  './js/features/count.js',
  './js/features/data.js',
  './js/features/focus.js',
  './js/features/home-layout.js',
  './js/features/home-ui.js',
  './js/features/home.js',
  './js/features/hourly.js',
  './js/features/insights.js',
  './js/features/local-file.js',
  './js/features/mixed-practice.js',
  './js/features/module-sheet.js',
  './js/features/net-toggle.js',
  './js/features/online-study.js',
  './js/features/pdf-viewer.js',
  './js/features/print-q.js',
  './js/features/progress-reset.js',
  './js/features/progress.js',
  './js/features/push.js',
  './js/features/pwa.js',
  './js/features/quiz-engine.js',
  './js/features/quiz-extras.js',
  './js/features/quiz-search.js',
  './js/features/quiz-wrappers.js',
  './js/features/review.js',
  './js/features/session.js',
  './js/features/shell-hooks.js',
  './js/features/shell-ui.js',
  './js/features/sprint-plan.js',
  './js/features/sprint-log.js',
  './js/features/sprint-report.js',
  './js/features/sprint.js',
  './js/features/streak.js',
  './js/features/study-docs.js',
  './js/features/subj-bank.js',
  './js/features/subj-builder.js',
  './js/features/subj-exam.js',
  './js/features/subj-list.js',
  './js/features/subj-pdf.js',
  './js/features/subj-public.js',
  './js/features/subj-qotd.js',
  './js/features/subj-queue.js',
  './js/features/submissions.js',
  './js/features/syllabus.js',
  './js/features/timetable.js',
  './js/features/today-plan.js',
  './js/features/tutorial.js',
  './js/features/weekly.js',
  './js/features/wrong-bank-ui.js',
  './js/report/report-matching.js',
  './js/report/report-shared.js',
  './js/report/userreport.js',
  './js/app/index-admin-router.js',
  './css/tokens.css',
  './js/core/i18n.js',
  './css/app.css',
  './js/features/settings-ui.js',
  './js/core/qna.js',
  './js/features/qna.js'
];

function offlinePage() {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px/1.6 system-ui,sans-serif;background:#f2f4f3;color:#1c2321;text-align:center;padding:24px}h1{font-size:1.3rem;margin:0 0 8px}p{margin:0 0 16px;color:#4a5551}a{display:inline-block;padding:10px 18px;border-radius:10px;background:#1e7a4c;color:#fff;text-decoration:none;font-weight:600}@media(prefers-color-scheme:dark){body{background:#080b14;color:#edf2ef}p{color:#9aa6b8}}</style></head><body><div><h1>You are offline</h1><p>This page has not been saved on your phone yet.<br>Chapters you downloaded still open from the app.</p><a href="./user.html">Open Abhyas</a></div></body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(SHELL.map(async path => {
      const res = await fetch(new Request(path, { cache: 'reload' }));
      if (!res.ok) throw new Error(path + ' -> ' + res.status);
      await cache.put(path, res);
    }));
    const failed = results.map((r, i) => (r.status === 'rejected' ? SHELL[i] : null)).filter(Boolean);
    if (failed.length) console.warn('SW install: failed to cache:', failed);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [CACHE_NAME, CDN_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => keep.indexOf(k) === -1).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      try { client.postMessage({ type: 'SW_ACTIVATED', version: APP_VERSION }); } catch (err) {}
    });
  })());
});

async function clearStaleShellEntries() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const shellAbs = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));
  await Promise.all(keys.map(req => {
    const url = new URL(req.url);
    if (url.hostname.includes('script.google.com')) return Promise.resolve();
    if (url.pathname.indexOf('/tools/vendor/') !== -1) return Promise.resolve();
    if (!shellAbs.has(req.url)) return cache.delete(req);
    return Promise.resolve();
  }));
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CLEAR_STALE_IF_ONLINE') {
    e.waitUntil(clearStaleShellEntries());
  }
});

self.addEventListener('push', function(event) {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.notification?.title || 'Abhyas';
    const options = {
      body: data.notification?.body || 'You have a new update.',
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: data.data
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    event.waitUntil(self.registration.showNotification('Abhyas', {
      body: event.data.text(),
      icon: './icon-192.png'
    }));
  }
});

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

function fetchWithTimeout(req, ms) {
  if (!ms) return fetch(req, { cache: 'no-cache' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(req, { cache: 'no-cache', signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

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

async function localCacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  return networkFirst(req);
}

/* Cache-key helper. A URL ending in refresh=1… means "fetch a fresh copy
   from origin" (question content can change); the `_` param was only ever
   used as a cache-buster on jsDelivr. Strip both so one canonical entry is
   kept per file instead of a new one per request. */
function cdnCacheKey(u) {
  try {
    const url = new URL(u);
    url.searchParams.delete('_');
    url.searchParams.delete('refresh');
    return url.toString();
  } catch (err) { return u; }
}

async function cdnCacheFirst(req) {
  const key = cdnCacheKey(req.url);
  const cache = await caches.open(CDN_CACHE);
  if (/([?&])refresh=1(&|$)/.test(req.url)) {
    /* Bypass the mirror entirely: revalidation passes need the CDN's
       current answer, not the last one we cached (the mirror has no TTL,
       so a plain cache-first read would answer with the stale copy and
       downloaded question files would never update). */
    const fresh = await fetch(key, { mode: 'cors', credentials: 'omit', cache: 'reload' });
    if (fresh.ok) cache.put(key, fresh.clone()).catch(() => {});
    return fresh;
  }
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    try { return await fetch(req); } catch (e2) { return new Response('', { status: 504, statusText: 'Offline' }); }
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  if (/^script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) { e.respondWith(cdnCacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/admin.html')) return;

  if (/\/tools\/vendor\//.test(url.pathname) || /\/(icon-\d+|favicon)\.png$/.test(url.pathname)) {
    e.respondWith(localCacheFirst(req)); return;
  }

  e.respondWith(networkFirst(req));
});
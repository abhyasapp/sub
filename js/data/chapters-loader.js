/* ══════════════════════════════════════════════════════════════════════
   js/data/chapters-loader.js — v1.46.1

   Fetches chapters-data.js from jsDelivr (abhyasapp/content repo),
   caches the SOURCE TEXT in localStorage for 24 h, and executes it
   via an inline <script> so window.ChapterData exists before app.js runs.

   Requires CSP `script-src ... 'unsafe-inline'` because the source
   is executed via `s.textContent = source`.

   Load order (user.html + admin.html):
     chapters-loader.js → subjective_chapters.js → subjective-data.js
     → content-index.js → ... shims ... → app.js

   MUST load before any shim that triggers ChapterData at boot.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* One source of truth: ABHYAS_CONFIG.CONTENT_CDN_BASE (js/core/config.js). To pin content to a
   commit or tag instead of the moving `main` branch, change it there and nowhere else. */
var CDN_BASE   = (window.ABHYAS_CONFIG && window.ABHYAS_CONFIG.CONTENT_CDN_BASE)
               || 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main';
var DATA_URL   = CDN_BASE + '/chapters-data.js';
var CACHE_KEY  = 'abhyas_chapters_cache_v2';
var TTL_MS     = 24 * 60 * 60 * 1000;
var MAX_FAILS  = 3;

function urlWithBust() {
  var sep = DATA_URL.indexOf('?') === -1 ? '?' : '&';
  return DATA_URL + sep + '_=' + Date.now();
}

function readCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    var o = JSON.parse(raw);
    if (!o || typeof o.source !== 'string' || !o.source.length) return null;
    if (o.fails >= MAX_FAILS
        && o.savedAt
        && Date.now() - o.savedAt > TTL_MS) {
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      return null;
    }
    return o;
  } catch (e) { return null; }
}
function writeCache(source) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      source: source,
      savedAt: Date.now(),
      fails: 0
    }));
    return true;
  } catch (e) { return false; }
}
function bumpFails() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    o.fails = (o.fails || 0) + 1;
    localStorage.setItem(CACHE_KEY, JSON.stringify(o));
  } catch (e) {}
}
function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

function runSource(source) {
  var s = document.createElement('script');
  s.textContent = source;
  (document.head || document.documentElement).appendChild(s);
}

function hasGlobals() {
  return !!window.ChapterData;
}

function showScreen(msg, opts) {
  opts = opts || {};
  if (document.getElementById('chapters-boot')) return;
  var el = document.createElement('div');
  el.id = 'chapters-boot';
  el.style.cssText =
      'position:fixed;inset:0;background:#0b0d10;color:#e6e8ea;'
    + 'display:flex;align-items:center;justify-content:center;flex-direction:column;'
    + 'gap:1rem;z-index:2147483647;font-family:system-ui,sans-serif;'
    + 'padding:2rem;text-align:center';
  el.innerHTML =
      (opts.retry ? '' :
        '<div style="width:42px;height:42px;border:4px solid rgba(255,255,255,.15);'
      + 'border-top-color:#ffb300;border-radius:50%;animation:chbspin .8s linear infinite"></div>')
    + '<div style="font-size:.95rem;opacity:.85;max-width:32ch;line-height:1.5">'
    + msg + '</div>'
    + (opts.retry
        ? '<button onclick="location.reload()" style="padding:.6rem 1.2rem;background:#ffb300;'
        + 'color:#0b0d10;border:none;border-radius:8px;font-weight:700;font-size:.85rem;'
        + 'cursor:pointer;font-family:inherit">Try again</button>'
        : '')
    + '<style>@keyframes chbspin{to{transform:rotate(360deg)}}</style>';
  (document.body || document.documentElement).appendChild(el);
}

/* ── 1. Warm path: cached source exists — run it synchronously ────── */
var cache = readCache();
if (cache) {
  try { runSource(cache.source); }
  catch (e) {
    console.error('[chapters-loader] cached source failed to execute', e);
    bumpFails();
    clearCache();
    cache = null;
  }
}

/* ── 2. Cold path: no usable cache — fetch, run, cache ────────────── */
if (!hasGlobals()) {
  fetch(urlWithBust())
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function(src) {
      try {
        runSource(src);
        writeCache(src);
        if (!hasGlobals()) {
          showScreen('Chapters data loaded but did not define ChapterData. Contact support.', { retry: true });
        }
      } catch (e) {
        console.error('[chapters-loader] source failed to execute', e);
        showScreen('Chapters data is corrupted. Please contact support.', { retry: true });
      }
    })
    .catch(function(e) {
      console.error('[chapters-loader] fetch failed', e);
      showScreen('Could not load chapters data. Check your connection and try again.', { retry: true });
    });
  return; // Exit early, the promise handles the rest
}

/* ── 3. Warm path complete — refresh fresh data in the background ──── */
var _inFlight = false;
var _lastFresh = 0;

function weakConnection() {
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return !!(c && (c.saveData
    || c.type === 'cellular'
    || /^(slow-2g|2g|3g)$/i.test(c.effectiveType || '')));
}
function fetchFresh(reason) {
  if (_inFlight) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (reason === 'visible' || reason === 'interval') {
    var gap = weakConnection() ? 60 * 60 * 1000 : 5 * 60 * 1000;
    if (Date.now() - _lastFresh < gap) return;
  }
  _lastFresh = Date.now();
  _inFlight = true;

  var ctl = ('AbortController' in window) ? new AbortController() : null;
  var to  = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;

  fetch(urlWithBust(), { cache: 'no-store', signal: ctl && ctl.signal })
    .then(function (r) { return r.ok ? r.text() : null; })
    .then(function (src) {
      if (!src) return;
      if (cache && src === cache.source) {
        writeCache(src);   /* extend savedAt so TTL never expires for active users */
        return;
      }
      if (!writeCache(src)) return;
      if (cache) cache.source = src;
      try {
        window.dispatchEvent(new CustomEvent('abhyas:chapters-updated', {
          detail: { reason: reason || 'background' }
        }));
        if (typeof window.toast === 'function') {
          window.toast('Chapters updated — reload to see the change', 8000);
        }
      } catch (e) {}
    })
    .catch(function () {})
    .finally(function () {
      if (to) clearTimeout(to);
      _inFlight = false;
    });
}

setTimeout(function () { fetchFresh('boot'); }, 2000);
window.addEventListener('online', function () { fetchFresh('online'); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') fetchFresh('visible');
});
setInterval(function () { fetchFresh('interval'); }, 15 * 60 * 1000);

})();
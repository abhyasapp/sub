/* ══════════════════════════════════════════════════════════════════════
   chapters-loader.js — ABHYAS
   ──────────────────────────────────────────────────────────────────────
   Fetches chapters-data.js from jsDelivr (the GitHub content repo),
   caches it in localStorage for 24 h, and executes it so the same four
   globals the old file defined are attached to window before app.js runs:

     window.CH_NAMES, window.LEVEL_LABELS, window.DRIVE, window.ChapterData

   Load order in user.html:
     <script src="js/data/chapters-loader.js"></script>
     <script src="js/app/app.js"></script>
     <script src="js/app/objective.js"></script>

   Requires only that the content repo has been published to GitHub and
   jsDelivr has mirrored it (it does this automatically for any public
   GitHub repo).
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── Config ───────────────────────────────────────────────────────── */
/* CHANGE THIS to your GitHub username. Repo name is 'content' by default;
   change it if you called your repo something else. */
const CDN_BASE  = 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main';
const CACHE_KEY = 'abhyas_chapters_cache_v2';
const TTL_MS    = 24 * 60 * 60 * 1000;
const URL       = CDN_BASE + '/chapters-data.js';

/* jsDelivr ignores unknown query params, so this is a safe cache-buster. */
function urlWithBust(){
  const sep = URL.indexOf('?') === -1 ? '?' : '&';
  return URL + sep + '_=' + Date.now();
}

/* ── Helpers ──────────────────────────────────────────────────────── */
function readCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw) return null;
    const o = JSON.parse(raw);
    if(!o || typeof o.source !== 'string' || !o.source.length) return null;
    return o;
  }catch(e){ return null; }
}
function writeCache(source){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify({ source, savedAt: Date.now() }));
    return true;
  }catch(e){ return false; }
}
function runSource(source){
  const s = document.createElement('script');
  s.textContent = source;
  (document.head || document.documentElement).appendChild(s);
}
function hasGlobals(){
  return !!(window.ChapterData && window.CH_NAMES && window.LEVEL_LABELS && window.DRIVE);
}
function showScreen(msg){
  const el = document.createElement('div');
  el.id = 'chapters-boot';
  el.style.cssText = 'position:fixed;inset:0;background:#0b0d10;color:#e6e8ea;'
    + 'display:flex;align-items:center;justify-content:center;flex-direction:column;'
    + 'gap:1rem;z-index:2147483647;font-family:system-ui,sans-serif;'
    + 'padding:2rem;text-align:center';
  el.innerHTML =
      '<div style="width:42px;height:42px;border:4px solid rgba(255,255,255,.15);'
    + 'border-top-color:#ffb300;border-radius:50%;animation:chbspin .8s linear infinite"></div>'
    + '<div style="font-size:.95rem;opacity:.85;max-width:32ch;line-height:1.5">'
    + msg + '</div>'
    + '<style>@keyframes chbspin{to{transform:rotate(360deg)}}</style>';
  (document.body || document.documentElement).appendChild(el);
}

/* ── 1. Warm path: cached source exists — run it synchronously ────── */
const cache = readCache();
if(cache){
  try{ runSource(cache.source); }
  catch(e){ console.error('[chapters-loader] cached source failed to execute', e); }
}

/* ── 2. Cold path: no usable cache — fetch, run, cache ────────────── */
if(!hasGlobals()){
  let src = null;
  try{
    const xhr = new XMLHttpRequest();
    xhr.open('GET', urlWithBust(), false);
    xhr.send(null);
    if(xhr.status < 200 || xhr.status >= 300) throw new Error('HTTP ' + xhr.status);
    src = xhr.responseText;
  }catch(e){
    console.error('[chapters-loader] fetch failed', e);
    showScreen('Could not load chapters data. Check your connection and reload the page.');
    return;
  }
  try{
    runSource(src);
    writeCache(src);
  }catch(e){
    console.error('[chapters-loader] source failed to execute', e);
    showScreen('Chapters data is corrupted. Please contact support.');
    return;
  }
  if(!hasGlobals()){
    showScreen('Chapters data loaded but did not define the expected globals.');
    return;
  }
  return;
}

/* ── 3. Warm path complete — refresh fresh data in the background ──── */
let _inFlight = false;
let _lastFresh = 0;

function weakConnection(){
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return !!(c && (c.saveData || c.type === 'cellular' || /^(slow-2g|2g|3g)$/i.test(c.effectiveType || '')));
}
function fetchFresh(reason){
  if(_inFlight) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if(reason === 'visible' || reason === 'interval'){
    const gap = weakConnection() ? 60 * 60 * 1000 : 5 * 60 * 1000;
    if(Date.now() - _lastFresh < gap) return;
  }
  _lastFresh = Date.now();
  _inFlight = true;

  /* A hung fetch must not leave _inFlight true for the rest of the
     session — that silently disables every future refresh. */
  const _abortCtl = ('AbortController' in window) ? new AbortController() : null;
  const _abortTo  = _abortCtl ? setTimeout(() => _abortCtl.abort(), 15000) : null;
  fetch(urlWithBust(), { cache: 'no-store', signal: _abortCtl && _abortCtl.signal })
    .then(r => r.ok ? r.text() : null)
    .then(src => {
      if(!src) return;
      if(cache && src === cache.source){
        writeCache(src);
        return;
      }
      if(!writeCache(src)) return;
      if(cache) cache.source = src;
      try{
        window.dispatchEvent(new CustomEvent('abhyas:chapters-updated', {
          detail: { reason: reason || 'background' }
        }));
        if(typeof window.toast === 'function'){
          window.toast('Chapters updated — reload to see the change', 8000);
        }
      }catch(e){}
    })
    .catch(() => {})
    .finally(() => {
      if(_abortTo) clearTimeout(_abortTo);
      _inFlight = false;
    });
}

setTimeout(() => fetchFresh('boot'), 2000);
window.addEventListener('online', () => fetchFresh('online'));
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') fetchFresh('visible');
});
setInterval(() => fetchFresh('interval'), 15 * 60 * 1000);

})();
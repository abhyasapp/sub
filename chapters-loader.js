/* ══════════════════════════════════════════════════════════════════════
   chapters-loader.js — ABHYAS
   ──────────────────────────────────────────────────────────────────────
   Replaces the bundled chapters-data.js. Fetches the source from Drive,
   caches it in localStorage for 24 h, and executes it so the same four
   globals the old file defined are attached to window before app.js runs:

     window.CH_NAMES, window.LEVEL_LABELS, window.DRIVE, window.ChapterData

   Load order in user.html:
     <script src="chapters-loader.js"></script>   ← replaces chapters-data.js
     <script src="app.js"></script>
     <script src="objective.js"></script>

   Requires:
     • FILE_ID below points at the chapters-data.js file on Drive
     • API_KEY below is a Google API key, restricted to the Drive API
       and to this site's referrer(s)
     • The Drive file is shared "Anyone with the link → Viewer"
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── Config ───────────────────────────────────────────────────────── */
const FILE_ID   = '1wr_2W4UHotzWe6djopAXxmPIaNGBhLqM';
const API_KEY   = 'AIzaSyAkm6iyFSV8lB82zWfD9gdjwdoldjXa2Vk';
const CACHE_KEY = 'abhyas_chapters_cache_v2';
const TTL_MS    = 24 * 60 * 60 * 1000;
const URL = 'https://www.googleapis.com/drive/v3/files/' + FILE_ID
          + '?alt=media&key=' + encodeURIComponent(API_KEY);

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
    xhr.open('GET', URL + '&_=' + Date.now(), false);
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

/* ── 3. Warm path complete — refresh fresh data in the background ────
   Cache-first makes every cold boot instant. But a stale chapter list is
   worse than a slower one: when you rename a chapter in Drive, students
   should see it the next time they open the app, not 24 hours later. So:
   fetch on every launch, every 'online', every tab-visible, and every 15
   minutes. Never auto-reload — a student might be mid-quiz. Offer a toast. */
let _inFlight = false;

function fetchFresh(reason){
  if(_inFlight) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _inFlight = true;

  fetch(URL + '&_=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.text() : null)
    .then(src => {
      if(!src) return;
      if(src === cache.source){
        writeCache(src);
        return;
      }
      if(!writeCache(src)) return;
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
    .finally(() => { _inFlight = false; });
}

setTimeout(() => fetchFresh('boot'), 2000);
window.addEventListener('online', () => fetchFresh('online'));
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') fetchFresh('visible');
});
setInterval(() => fetchFresh('interval'), 15 * 60 * 1000);

})();

// js/core/storage.js — the ONLY place that touches localStorage directly.
// _load and _save are still function declarations so they are available
// to any file that runs after this one (state.js needs _load at load time).

function _load(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch (e) { return d; }
}

let _lastStorageWarnAt = 0;

/* Storage guard. Warns BEFORE the device runs out of room and offers a backup.
   It never deletes anything by itself: wrong answers, bookmarks, flags and progress
   are the student's work. (The previous version trimmed wrong answers, bookmarks and
   flags to 100 each, silently, the moment a write failed.) */
const STORE_GUARD = {
  LIMIT: 5 * 1024 * 1024,          // typical localStorage quota in bytes (UTF-16); deliberately conservative
  WARN_AT: 0.8,                    // warn from 80% full
  WARN_EVERY_MS: 24 * 3600 * 1000, // at most one early warning a day
  KEY: 'abhyas_storage_warned',
  _lastCheck: 0, _mem: 0,

  usedBytes() {
    let n = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) {}
    return n;
  },
  percent() { return Math.min(100, Math.round(this.usedBytes() / this.LIMIT * 100)); },

  /* Cheap to call often: does real work at most every 5 minutes. */
  maybeCheck(force) {
    const now = Date.now();
    if (!force && now - this._lastCheck < 300000) return;
    this._lastCheck = now;
    const pct = this.percent();
    if (pct < this.WARN_AT * 100) return;
    let last = this._mem;
    try { last = Math.max(last, Number(localStorage.getItem(this.KEY)) || 0); } catch (e) {}
    if (now - last < this.WARN_EVERY_MS) return;
    this._mem = now;
    try { localStorage.setItem(this.KEY, String(now)); } catch (e) {}
    this.warn(pct, false);
  },

  warn(pct, full) {
    const msg = full
      ? 'This device is out of storage, so your latest progress could not be saved. <strong>Nothing has been deleted.</strong>'
      : 'Your device storage is about <strong>' + pct + '%</strong> full. <strong>Nothing has been deleted</strong>, and nothing will be deleted automatically.';
    if (typeof openMod === 'function') {
      openMod('Storage is filling up',
        '<p class="t-callout mb3">' + msg + '</p>' +
        '<p class="t-callout mb3">Download a backup first. Then you can free space by removing downloaded question sets (they can be downloaded again) from Data &amp; backup.</p>' +
        '<div class="bg">' +
          '<button class="btn btn-a" type="button" data-on-click="DATA.exportAll();closeMod()">Download backup</button>' +
          '<button class="btn btn-quiet" type="button" data-on-click="closeMod();UI.go(\'data\')">Open Data &amp; backup</button>' +
          '<button class="btn btn-quiet" type="button" data-on-click="closeMod()">Not now</button>' +
        '</div>');
    } else if (typeof toast === 'function') {
      toast('\u26a0\ufe0f ' + msg.replace(/<[^>]+>/g, ''), 8000);
    }
  }
};

function _save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    if (typeof PSYNC_KEYS !== 'undefined' && PSYNC_KEYS.has(k)) PSYNC.scheduleSync();
    STORE_GUARD.maybeCheck();
    return true;
  } catch (e) {
    const now = Date.now();
    if (now - _lastStorageWarnAt > 30000) {
      _lastStorageWarnAt = now;
      const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      if (isQuota) STORE_GUARD.warn(100, true);          // in-memory state is untouched; the session keeps working
      else if (typeof toast === 'function') toast('\u26a0\ufe0f Could not save \u2014 some data may not have been saved.', 5000);
    }
    return false;
  }
}

/* First check shortly after boot, off the critical path. */
try { setTimeout(() => { try { STORE_GUARD.maybeCheck(true); } catch (e) {} }, 8000); } catch (e) {}

/* IndexedDB question-set cache. Same public shape as before. */
const QDB = (() => {
  const DB_NAME = 'abhyas_question_cache';
  const STORE = 'sets';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function get(key) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  }
  async function set(key, value) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  }
  async function del(key) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function keys() {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return []; }
  }
  async function clear() {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function migrateFromLocalStorage() {
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(LS.QC));
    if (!oldKeys.length) return;
    for (const k of oldKeys) {
      try {
        const value = JSON.parse(localStorage.getItem(k));
        await set(k.slice(LS.QC.length), value);
      } catch (e) {}
      localStorage.removeItem(k);
    }
  }
  return { get, set, del, keys, clear, migrateFromLocalStorage };
})();
// tests/cache-refresh.test.js — CACHE.refreshFromUpdate reacts to a
// chapters-data change: purges orphan downloads, adds new picked files,
// rechecks already-downloaded sets against the CDN, and throttles itself.
import { describe, it, expect, vi } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

function makeSandbox() {
  const storage = new Map();
  const handlers = new Map();
  const toasts = [];
  const qdbEntries = new Map();

  const extra = {
    setTimeout,
    clearTimeout,
    navigator: { onLine: true, connection: null },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => { storage.delete(k); },
      key: i => [...storage.keys()][i] || null,
      get length() { return storage.size; },
    },
    addEventListener: (type, fn) => {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
    },
    dispatchEvent: () => {},
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {} }),
      body: { appendChild: () => {} },
    },
    toast: (m) => toasts.push(m),
    UI: { cur: 'other' },
    S: { online: true, forcedOffline: false },
    _load: (k, d) => {
      const v = storage.get(k);
      return v === undefined ? d : JSON.parse(v);
    },
    _save: (k, v) => { storage.set(k, JSON.stringify(v)); return true; },
    QDB: {
      get: async k => qdbEntries.get(k),
      set: async (k, v) => { qdbEntries.set(k, v); return true; },
      del: async k => { qdbEntries.delete(k); },
      keys: async () => [...qdbEntries.keys()],
      clear: async () => { qdbEntries.clear(); },
    },
  };
  const ctx = loadGlobals(['js/features/cache.js'], extra);
  return { ctx, storage, handlers, toasts, qdbEntries };
}

describe('CACHE.refreshFromUpdate', () => {
  const refs = [
    { fid: 'f-keep',    key: 'L5_1_book_keep',    lv: 'L5' },
    { fid: 'f-changed', key: 'L5_2_book_changed', lv: 'L5' },
    { fid: 'f-new',     key: 'L5_3_book_new',     lv: 'L5' },
    { fid: 'f-other',   key: 'L7_1_book_other',   lv: 'L7' },
  ];

  function hydrate(cache) {
    cache.ChapterData = { levels: () => ['L5', 'L7'], levelLabel: lv => lv, allFileRefs: () => refs.slice() };
    cache.QUIZ = {
      _running: false,
      _fetchFromCDN: async (fid) => {
        if (fid === 'f-changed') return { v: 2 };
        if (fid === 'f-keep' || fid === 'f-new' || fid === 'f-other') return { v: 1 };
        throw new Error('CDN 404');
      },
      _fetch: async () => { throw new Error('offline'); },
    };
  }

  it('purges orphans, adds picked-new files, rechecks downloaded sets and notifies', async () => {
    const s = makeSandbox();
    s.qdbEntries.set('L5_1_book_keep', { v: 1 });
    s.qdbEntries.set('L5_2_book_changed', { v: 1 });
    s.qdbEntries.set('ORPHAN_removed', { v: 9 });
    s.storage.set('abhyas_dl_groups', JSON.stringify(['L5']));
    s.storage.set('abhyas_autosync', JSON.stringify(false));
    hydrate(s.ctx);

    const listener = s.handlers.get('abhyas:chapters-updated')[0];
    await listener({ detail: { reason: 'boot' } });

    // Orphan purged.
    expect(s.qdbEntries.has('ORPHAN_removed')).toBe(false);
    // Existing set with UNCHANGED content is left as-is.
    expect(s.qdbEntries.get('L5_1_book_keep')).toEqual({ v: 1 });
    // Existing set with CHANGED content is refreshed from the CDN.
    expect(s.qdbEntries.get('L5_2_book_changed')).toEqual({ v: 2 });
    // New file in a picked level got downloaded.
    expect(s.qdbEntries.get('L5_3_book_new')).toEqual({ v: 1 });
    // Unpicked level's new file was NOT downloaded.
    expect(s.qdbEntries.has('L7_1_book_other')).toBe(false);
    // The 24 h revalidate stamps are reset so open-time recheck is instant.
    expect(s.storage.has('abhyas_qts')).toBe(false);
    // The change is summarised for the user.
    const all = s.toasts.join(' ');
    expect(all).toContain('1 new question set');
    expect(all).toContain('updated for offline use');
  });

  it('autosync downloads new files from every level', async () => {
    const s = makeSandbox();
    s.storage.set('abhyas_dl_groups', JSON.stringify([]));
    s.storage.set('abhyas_autosync', JSON.stringify(true));
    hydrate(s.ctx);

    const listener = s.handlers.get('abhyas:chapters-updated')[0];
    await listener({ detail: { reason: 'boot' } });

    expect(s.qdbEntries.get('L5_3_book_new')).toEqual({ v: 1 });
    expect(s.qdbEntries.get('L7_1_book_other')).toEqual({ v: 1 });
  });

  it('notifies that removed downloads were cleaned up', async () => {
    const s = makeSandbox();
    s.qdbEntries.set('ORPHAN_removed', { v: 9 });
    s.storage.set('abhyas_dl_groups', JSON.stringify([]));
    hydrate(s.ctx);

    const listener = s.handlers.get('abhyas:chapters-updated')[0];
    await listener({ detail: { reason: 'boot' } });

    expect(s.toasts.join(' ')).toContain('1 removed download');
  });

  it('does nothing offline, stores a pending marker and keeps data intact', async () => {
    const s = makeSandbox();
    s.ctx.S = { online: false, forcedOffline: false };
    s.qdbEntries.set('ORPHAN_removed', { v: 9 });
    hydrate(s.ctx);

    const listener = s.handlers.get('abhyas:chapters-updated')[0];
    await listener({ detail: { reason: 'boot' } });

    expect(s.qdbEntries.has('ORPHAN_removed')).toBe(true);
    expect(s.storage.has('abhyas_chapters_refresh_pending')).toBe(true);
  });

  it('throttles a burst of events to one refresh pass', async () => {
    const s = makeSandbox();
    s.storage.set('abhyas_dl_groups', JSON.stringify(['L5']));
    hydrate(s.ctx);
    const fetchSpy = vi.spyOn(s.ctx.QUIZ, '_fetchFromCDN');

    const listener = s.handlers.get('abhyas:chapters-updated')[0];
    await Promise.all([
      listener({ detail: { reason: 'visible' } }),
      listener({ detail: { reason: 'interval' } }),
    ]);

    // Exactly once per cached/new file — the second event was throttled.
    expect(fetchSpy).toHaveBeenCalledTimes(refs.filter(r => r.lv === 'L5').length);
  });
});

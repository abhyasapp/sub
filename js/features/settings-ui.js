// js/features/settings-ui.js — fills the "Display and accessibility" and "Storage" cards on
// Data & backup. Both cards shipped as empty containers with nothing behind them.
//
// Everything here is a choice the student makes on THIS device. Nothing is ever removed or
// changed without a tap, and the storage card only reports and links to the tools that already
// exist (backup export, the downloads manager, CACHE.clearAll with its own confirmation).
//
// Depends on: core/theme.js, core/storage.js (STORE_GUARD, QDB), core/i18n.js (I18N),
//             features/shell-ui.js (FONT, FOCUSMODE), features/cache.js (CACHE), core/text.js (esc).

window.SETTINGS = (function () {
  'use strict';

  const MOTION_KEY = 'abhyas_reduce_motion';
  const T = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v) : s);
  const $ = (id) => document.getElementById(id);
  const E = (s) => (typeof esc === 'function' ? esc(s) : String(s));

  /* ── Theme: Light / Dark / Automatic ────────────────────────────────────────────────────
     "Automatic" means no stored choice, so the device's own setting decides (theme.js already
     falls back to it). The header's quick toggle keeps working and simply stores a choice. */
  function themeMode() {
    try {
      const v = JSON.parse(localStorage.getItem('abhyas_theme') || 'null');
      if (v === 'light' || v === 'dark') return v;
    } catch (e) { /* unreadable value: treat as automatic */ }
    return 'auto';
  }
  function setTheme(mode) {
    try {
      if (mode === 'auto') localStorage.removeItem('abhyas_theme');
      else localStorage.setItem('abhyas_theme', JSON.stringify(mode === 'dark' ? 'dark' : 'light'));
    } catch (e) { /* private mode: still apply for this visit */ }
    if (typeof applyTheme === 'function' && typeof getStoredTheme === 'function') applyTheme(getStoredTheme());
    renderDisplay();
  }
  /* In Automatic mode follow the device if it switches (e.g. at sunset). */
  try {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => { if (themeMode() === 'auto' && typeof applyTheme === 'function') applyTheme(getStoredTheme()); };
    if (mq && mq.addEventListener) mq.addEventListener('change', follow);
  } catch (e) { /* older browser */ }

  /* ── Reduced motion: the device setting is always honoured (app.css); this adds a manual switch ── */
  function motionOn() { try { return localStorage.getItem(MOTION_KEY) === '1'; } catch (e) { return false; } }
  function applyMotion() { document.documentElement.classList.toggle('reduce-motion', motionOn()); }
  function toggleMotion() {
    try { localStorage.setItem(MOTION_KEY, motionOn() ? '0' : '1'); } catch (e) {}
    applyMotion();
    renderDisplay();
  }
  applyMotion();

  /* ── Small builders ─────────────────────────────────────────────────────────────────────── */
  function seg(label, opts, current, call) {
    return '<div class="seg" role="group" aria-label="' + E(label) + '">' +
      opts.map(o => '<button type="button" class="btn btn-sm seg-opt" aria-pressed="' + (o.v === current) + '"' +
        (o.lang ? ' lang="' + o.lang + '"' : '') +
        ' data-on-click="SETTINGS.' + call + '(\'' + o.v + '\')">' + E(o.t) + '</button>').join('') +
      '</div>';
  }
  function row(title, hint, control) {
    return '<div class="set-row"><div class="set-text"><div class="set-label">' + E(title) + '</div>' +
      (hint ? '<div class="set-hint">' + E(hint) + '</div>' : '') + '</div>' + control + '</div>';
  }
  function switchBtn(label, on, call) {
    return '<button type="button" class="btn btn-sm seg-opt" role="switch" aria-checked="' + on + '"' +
      ' aria-label="' + E(label) + '" data-on-click="SETTINGS.' + call + '()">' + E(on ? T('On') : T('Off')) + '</button>';
  }

  /* ── Display and accessibility ──────────────────────────────────────────────────────────── */
  function renderDisplay() {
    const box = $('display-card-body');
    if (!box) return;
    const fs = (typeof FONT !== 'undefined') ? FONT.get() : 100;
    const fsOpts = (typeof FONT !== 'undefined')
      ? FONT.STEPS.map((v, i) => ({ v: String(v), t: T(FONT.NAMES[i]) }))
      : [];
    const lang = (typeof I18N !== 'undefined' && I18N.lang) || 'en';
    const focus = (typeof FOCUSMODE !== 'undefined') ? FOCUSMODE.on() : false;
    box.innerHTML = '<div class="set-list">' +
      row(T('Theme'), T('Automatic follows your device.'),
        seg(T('Theme'), [{ v: 'light', t: T('Light') }, { v: 'dark', t: T('Dark') }, { v: 'auto', t: T('Automatic') }], themeMode(), 'theme')) +
      (fsOpts.length ? row(T('Text size'), T('Makes questions and explanations easier to read.'),
        seg(T('Text size'), fsOpts, String(fs), 'textSize')) : '') +
      row(T('Language'), T('Menus and buttons. Questions stay in English.'),
        seg(T('Language'), [{ v: 'en', t: 'English', lang: 'en' }, { v: 'ne', t: 'नेपाली', lang: 'ne' }], lang, 'language')) +
      row(T('Reduce motion'), T('Turns off animations and transitions.'), switchBtn(T('Reduce motion'), motionOn(), 'toggleMotion')) +
      (typeof FOCUSMODE !== 'undefined' ? row(T('Focus mode'), T('Hides streaks and badges while you study.'), switchBtn(T('Focus mode'), focus, 'toggleFocus')) : '') +
      '</div>';
  }

  /* ── Storage ────────────────────────────────────────────────────────────────────────────── */
  const fmtBytes = (n) => n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  async function _deviceUsage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (e && e.quota) return { usage: e.usage || 0, quota: e.quota };
      }
    } catch (e) { /* not available */ }
    return null;
  }
  async function _persisted() {
    try { return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { return null; }
  }

  async function renderStorage() {
    const box = $('storage-card-body');
    if (!box) return;
    let used = 0, pct = 0;
    try { used = STORE_GUARD.usedBytes(); pct = STORE_GUARD.percent(); } catch (e) { /* storage guard not loaded */ }
    let sets = 0, total = 0, anyCached = false;
    try {
      const keys = await QDB.keys();
      anyCached = keys.length > 0;
      const have = new Set(keys);
      const refs = ChapterData.allFileRefs();
      total = refs.length;
      sets = refs.filter(r => have.has(r.key)).length;   // study documents and other cached files are not question sets
      if (!total) sets = keys.length;
    } catch (e) { /* question index not loaded yet */ }
    const dev = await _deviceUsage();
    const persisted = await _persisted();
    const warn = pct >= 80;

    const meter = '<div class="meter' + (warn ? ' warn' : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct +
      '" aria-label="' + E(T('Saved progress and notes')) + '"><span style="width:' + Math.max(2, pct) + '%"></span></div>';

    box.innerHTML = '<div class="set-list">' +
      '<div class="set-row set-col"><div class="set-text"><div class="set-label">' + E(T('Progress, notes and settings')) + '</div>' +
        '<div class="set-hint">' + E(T('{a} of about {b} ({n}%)', { a: fmtBytes(used), b: '5 MB', n: pct })) + '</div></div>' + meter +
        (warn ? '<p class="t-foot set-warn">' + E(T('Getting full. Download a backup. Nothing is ever deleted automatically.')) + '</p>' : '') +
      '</div>' +
      row(T('Downloaded question sets'),
        total ? T('{a} of {b} sets are saved for offline study.', { a: sets, b: total }) : T('{a} sets are saved for offline study.', { a: sets }),
        '<button type="button" class="btn btn-sm btn-quiet" data-on-click="UI.go(\'offline\')">' + E(T('Manage downloads')) + '</button>') +
      (dev ? row(T('Used on this device'),
        T('{a} of {b} available to Abhyas.', { a: fmtBytes(dev.usage), b: fmtBytes(dev.quota) }), '') : '') +
      ((persisted !== null && navigator.storage && navigator.storage.persist)
        ? row(T('Protect my data'),
            persisted ? T('Your browser will not clear Abhyas data when the device runs low on space.') : T('Ask the browser not to clear Abhyas data when the device runs low on space.'),
            persisted ? '<span class="ctag tg">' + E(T('Protected')) + '</span>'
                      : '<button type="button" class="btn btn-sm btn-quiet" data-on-click="SETTINGS.protect()">' + E(T('Protect')) + '</button>')
        : '') +
      '</div>' +
      '<div class="bg set-actions">' +
        '<button type="button" class="btn btn-a" data-on-click="DATA.exportAll()"><i class="ph ph-download-simple"></i> ' + E(T('Download backup')) + '</button>' +
        '<button type="button" class="btn btn-quiet" data-on-click="SETTINGS.removeDownloads()"' + (anyCached ? '' : ' disabled') + '><i class="ph ph-trash"></i> ' + E(T('Remove downloaded sets')) + '</button>' +
      '</div>';
  }

  async function protect() {
    let ok = false;
    try { ok = !!(await navigator.storage.persist()); } catch (e) {}
    if (typeof toast === 'function') toast(ok ? T('Your data is now protected.') : T('The browser did not allow it. Installing Abhyas to your home screen usually helps.'), 5000);
    renderStorage();
  }

  async function removeDownloads() {
    if (typeof CACHE === 'undefined') return;
    await CACHE.clearAll();      // confirms first; progress, notes and bookmarks are not touched
    renderStorage();
  }

  function refresh() { renderDisplay(); renderStorage(); }

  if (typeof UI !== 'undefined' && UI.onEnter) UI.onEnter('data', refresh);
  /* Re-draw labels when the language changes while this screen is open. */
  document.addEventListener('abhyas:lang', refresh);

  return {
    refresh, renderDisplay, renderStorage, protect, removeDownloads, toggleMotion,
    theme: setTheme,
    textSize(v) { if (typeof FONT !== 'undefined') { FONT.set(Number(v)); renderDisplay(); } },
    language(l) { if (typeof I18N !== 'undefined') { I18N.setLang(l); } refresh(); },
    toggleFocus() { if (typeof FOCUSMODE !== 'undefined') { FOCUSMODE.toggle(); renderDisplay(); } }
  };
})();

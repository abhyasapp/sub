#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tests/check.js — static checks for the Abhyas repo.

   Runs with:   node tests/check.js     (or npm test)
   Exit code:   0 on success, 1 on failure.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let PASS = 0, FAIL = 0;
const PENDING = [];   /* async test groups: the summary waits for these */
const FAILURES = [];

function pass(msg) { PASS++; console.log('  ✓ ' + msg); }
function fail(msg) { FAIL++; FAILURES.push(msg); console.log('  ✗ ' + msg); }
function group(msg) { console.log('\n── ' + msg + ' ' + '─'.repeat(Math.max(0, 56 - msg.length))); }

/* Files moved into folders in v1.32. Tests still refer to them by their short
   names; this maps each short name to its real location. */
const MOVED = {
  'config.js': 'js/core/config.js', 'version.js': 'js/core/version.js', 'firebase-config.js': 'js/core/firebase-config.js', 'shared.js': 'js/core/shared.js', 'nav.js': 'js/core/nav.js',
  'app.js': 'js/app/app.js', 'objective.js': 'js/app/objective.js', 'subjective.js': 'js/app/subjective.js', 'cloud-sync.js': 'js/app/cloud-sync.js', 'storage-health.js': 'js/app/storage-health.js', 'display-prefs.js': 'js/app/display-prefs.js',
  'pdf-viewer.js': 'js/app/pdf-viewer.js', 'user-page.js': 'js/app/user-page.js',
  'chapters-loader.js': 'js/data/chapters-loader.js', 'subjective_chapters.js': 'js/data/subjective_chapters.js',
  'subjective-data.js': 'js/data/subjective-data.js', 'content-index.js': 'js/data/content-index.js',
  'design-system.css': 'css/design-system.css'
};
const real = rel => MOVED[rel] || rel;

function readFile(rel) {
  const p = path.join(ROOT, real(rel));
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return null; }
}
function exists(rel) {
  try { fs.accessSync(path.join(ROOT, real(rel))); return true; }
  catch (e) { return false; }
}

/* ═══════════════════════════════════════════════════════════════════════
   Version drift — every place a version is written down must agree.
   ═══════════════════════════════════════════════════════════════════════ */
group('Version drift');
(function versionDrift(){
  const expected = [
    ['version.js',   /APP_VERSION\s*=\s*['"]([^'"]+)['"]/],
    ['gas/code.gs',  /const\s+APP_VERSION\s*=\s*["']([^"']+)["']/],
    ['package.json', /"version"\s*:\s*"([^"]+)"/]
  ];
  const found = expected.map(([file, re]) => {
    const src = readFile(file);
    if (src === null) return [file, null, 'file missing'];
    const m = src.match(re);
    return [file, m ? m[1] : null, m ? '' : 'version literal not found'];
  });

  /* Compare only major.minor so a patch bump in one file does not
     spuriously fail the others. */
  const norm = v => v ? String(v).replace(/^(\d+\.\d+).*$/, '$1') : null;
  const base = norm(found[0][1]);
  if (!base) { fail('version.js does not declare a version'); return; }

  found.forEach(([file, v, err]) => {
    if (err) { fail(`version check: ${file} — ${err}`); return; }
    if (norm(v) !== base) fail(`version drift: ${file} says ${v} but version.js says ${found[0][1]}`);
    else pass(`${file} = ${v}`);
  });
})();

/* ═══════════════════════════════════════════════════════════════════════
   Required files
   ═══════════════════════════════════════════════════════════════════════ */
group('Required files');
[
  'index.html','user.html','admin.html','privacy.html','terms.html',
  'app.js','objective.js','subjective.js','cloud-sync.js','storage-health.js','display-prefs.js',
  'shared.js','config.js','version.js','chapters-loader.js',
  'subjective_chapters.js','subjective-data.js',
  'pdf-viewer.js','content-index.js','firebase-config.js',
  'design-system.css','sw.js','manifest.json',
  'favicon.png','icon-192.png','icon-512.png'
].forEach(f => {
  if (exists(f)) pass(f); else fail('missing ' + f);
});

/* ═══════════════════════════════════════════════════════════════════════
   JS syntax — parse every .js file
   ═══════════════════════════════════════════════════════════════════════ */
group('JS syntax');
const jsFiles = [
  'app.js','objective.js','subjective.js','cloud-sync.js','storage-health.js','display-prefs.js',
  'shared.js','config.js','version.js','chapters-loader.js',
  'subjective_chapters.js','subjective-data.js',
  'pdf-viewer.js','content-index.js','firebase-config.js','sw.js'
];
jsFiles.forEach(f => {
  const src = readFile(f);
  if (src === null) { fail(f + ' (missing)'); return; }
  try {
    new Function(src);
    pass(f + ' parses');
  } catch (e) {
    fail(f + ' syntax error: ' + e.message);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Inline <script> blocks in HTML parse
   ═══════════════════════════════════════════════════════════════════════ */
group('Inline script blocks');
['index.html','user.html','admin.html'].forEach(f => {
  const src = readFile(f);
  if (!src) { fail(f + ' (missing)'); return; }
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/(?:ld\+json|json)["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) blocks.push(m[1]);
  let ok = 0, bad = 0;
  blocks.forEach((b, i) => {
    try { new Function(b); ok++; }
    catch (e) { bad++; fail(`${f} inline block #${i+1}: ${e.message}`); }
  });
  if (bad === 0) pass(`${f}: ${ok} inline block(s) parse`);
});

/* ═══════════════════════════════════════════════════════════════════════
   Same-origin <script src> / <link href> targets exist
   ═══════════════════════════════════════════════════════════════════════ */
group('Linked assets resolve');
['index.html','user.html','admin.html'].forEach(f => {
  const src = readFile(f);
  if (!src) return;
  const bad = [];
  const re = /(?:src|href)=["']([^"'#?]+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (/^(https?:)?\/\//.test(url)) continue;
    if (/^(mailto:|tel:|data:)/.test(url)) continue;
    if (!exists(url.replace(/^\.?\//, ''))) bad.push(url);
  }
  if (bad.length) bad.forEach(u => fail(`${f} → ${u} (missing)`));
  else pass(`${f}: all same-origin links resolve`);
});

/* ═══════════════════════════════════════════════════════════════════════
   sw.js SHELL entries exist
   ═══════════════════════════════════════════════════════════════════════ */
group('sw.js SHELL');
(function swShell(){
  const src = readFile('sw.js');
  if (!src) return;
  const m = src.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!m) { fail('sw.js has no SHELL array'); return; }
  const entries = [...m[1].matchAll(/'\.\/([^']*)'/g)].map(x => x[1]).filter(Boolean);
  const missing = entries.filter(e => !exists(e));
  if (missing.length) missing.forEach(e => fail('sw.js SHELL → ./' + e + ' (missing)'));
  else pass(`sw.js: ${entries.length} SHELL entries exist`);
})();

/* ═══════════════════════════════════════════════════════════════════════
   manifest.json valid
   ═══════════════════════════════════════════════════════════════════════ */
group('manifest.json');
(function manifest(){
  const src = readFile('manifest.json');
  if (!src) { fail('missing manifest.json'); return; }
  try { JSON.parse(src); pass('manifest.json is valid JSON'); }
  catch (e) { fail('manifest.json invalid: ' + e.message); }
})();

/* ═══════════════════════════════════════════════════════════════════════
   CSP allows exactly the hosts used by each page
   ═══════════════════════════════════════════════════════════════════════ */
group('Content-Security-Policy');
['index.html','user.html','admin.html'].forEach(f => {
  const src = readFile(f);
  if (!src) return;
  const cspMatch = src.match(/Content-Security-Policy["'][^>]*content="([^"]+)"/i);
  if (!cspMatch) { fail(f + ': no CSP meta tag'); return; }
  const csp = cspMatch[1];
  ['script.google.com','accounts.google.com','www.gstatic.com',
   'cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'
  ].forEach(host => {
    if (csp.indexOf(host) === -1) fail(`${f}: CSP does not list ${host}`);
  });
  pass(f + ': CSP lists the required hosts');
});

/* ═══════════════════════════════════════════════════════════════════════
   v1.20 patch anchors present
   ═══════════════════════════════════════════════════════════════════════ */
group('v1.20 markers');
[
  ['app.js',       'GOOGLE_PROMPT_HEAD'],
  ['objective.js', 'fileMissedNowCount'],
  ['user-page.js',  'window.WRONGBY'],
  ['user-page.js',  'window.HEATMAP'],
  ['user-page.js',  'window.HARDQ'],
  ['objective.js',  'loksewaGroupRows'],
  ['admin.html',   'const SUBJ_HOURLY'],
  ['gas/code.gs',  'getHardQuestionsCache_']
].forEach(([f, marker]) => {
  const src = readFile(f);
  if (!src) { fail(f + ' (missing)'); return; }
  if (src.indexOf(marker) === -1) fail(`${f}: v1.20 marker "${marker}" not found (patch not applied?)`);
  else pass(`${f}: ${marker}`);
});


/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: 60-day sprint planner (shared.js)
   ═══════════════════════════════════════════════════════════════════════ */
group('Sprint planner');
(function sprintTests(){
  const vm = require('vm');
  const src = readFile('shared.js');
  if (!src) { fail('shared.js missing'); return; }
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(src + '\nthis.sprintPlan=sprintPlan;this.sprintDayNumber=sprintDayNumber;', ctx); }
  catch (e) { fail('shared.js failed to load in a sandbox: ' + e.message); return; }
  const at = (iso, o) => ctx.sprintPlan(Object.assign({ startISO: '2026-10-01', now: new Date(iso + 'T12:00:00'),
    totalTopics: 70, coveredTopics: 0, dueReview: 0, questionsToday: 0 }, o || {}));
  const eq = (name, got, want) => got === want ? pass(name) : fail(`${name}: got ${got}, want ${want}`);

  eq('day 1 on the start date',        at('2026-10-01').day, 1);
  eq('day 60 is the last active day',  at('2026-11-29').state, 'active');
  eq('day 61 is finished',             at('2026-11-30').state, 'finished');
  eq('before start is notstarted',     at('2026-09-30').state, 'notstarted');
  eq('bad start date is notstarted',   at('2026-10-05', { startISO: 'junk' }).state, 'notstarted');
  eq('learn phase through day 35',     at('2026-11-04').phase, 'learn');
  eq('drill phase from day 36',        at('2026-11-05').phase, 'drill');
  eq('mock phase from day 53',         at('2026-11-22').phase, 'mock');
  eq('mock day has a mock paper',      at('2026-11-22').mock, true);
  eq('day 1 spreads 70 topics over 35 days', at('2026-10-01').newTopics, 2);
  eq('never schedules more topics than remain', at('2026-10-01', { coveredTopics: 70 }).newTopics, 0);
  eq('behind plan is detected',        at('2026-10-20', { coveredTopics: 5 }).pace, 'behind');
  eq('ahead of plan is detected',      at('2026-10-05', { coveredTopics: 40 }).pace, 'ahead');
  eq('goal met needs questions and review cleared', at('2026-10-02', { questionsToday: 40, dueReview: 0 }).goalMet, true);
  eq('goal not met with review due',   at('2026-10-02', { questionsToday: 40, dueReview: 3 }).goalMet, false);
  eq('zero topics does not divide by zero', at('2026-10-02', { totalTopics: 0 }).state, 'active');
})();

/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: spaced repetition (objective.js REV.trackAnswer)
   Reviews happen after 1, 3, 7 and 14 days; the question graduates only
   after the 14-day review is answered correctly.
   ═══════════════════════════════════════════════════════════════════════ */
group('Spaced repetition');
(function srTests(){
  const src = readFile('objective.js');
  if (!src) { fail('objective.js missing'); return; }
  const start = src.indexOf('const REV = {');
  if (start === -1) { fail('REV not found in objective.js'); return; }
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const body = src.slice(start, end);
  const S = { wr: [], bk: [], fl: [] };
  const sandbox = { S, LS: { WR: 'wr' }, SR_INTERVALS: [1, 3, 7, 14], _save(){}, HOME: { updateBadges(){} },
                    toast(){}, sessionStorage: { getItem(){ return null; }, setItem(){} } };
  let REV;
  try { REV = new Function(...Object.keys(sandbox), body + '; return REV;')(...Object.values(sandbox)); }
  catch (e) { fail('could not load REV: ' + e.message); return; }

  const DAY = 86400000, q = { uid: 'q1', q: 'x' };
  REV.trackAnswer(q, false);
  const it = () => S.wr.find(x => x.uid === 'q1');
  const days = () => Math.round((it()._nextDue - Date.now()) / DAY);
  it()._nextDue = Date.now();          REV.trackAnswer(q, true);
  days() === 1  ? pass('first correct review is due in 1 day')  : fail('1-day interval wrong: ' + days());
  it()._nextDue = Date.now();          REV.trackAnswer(q, true);
  days() === 3  ? pass('second review is due in 3 days')        : fail('3-day interval wrong: ' + days());
  it()._nextDue = Date.now();          REV.trackAnswer(q, true);
  days() === 7  ? pass('third review is due in 7 days')         : fail('7-day interval wrong: ' + days());
  it()._nextDue = Date.now();          REV.trackAnswer(q, true);
  (it() && days() === 14) ? pass('fourth review is due in 14 days (previously skipped)') : fail('14-day interval missing');
  it()._nextDue = Date.now();          REV.trackAnswer(q, true);
  !it() ? pass('question graduates after the 14-day review') : fail('question should have graduated');

  REV.trackAnswer(q, false); REV.trackAnswer(q, true);      // wrong -> due now -> correct: streak 1, next due in 1 day
  REV.trackAnswer(q, true);                                  // answered again before it is due
  it()._streak === 1 ? pass('answering before it is due does not advance the streak') : fail('early answer advanced the streak: ' + it()._streak);
  it()._nextDue = Date.now(); REV.trackAnswer(q, false);
  it()._streak === 0 ? pass('a wrong answer resets the streak') : fail('wrong answer did not reset');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Student page must define every global helper it calls on window.MODAL
   (admin.html has its own MODAL; the student bundle did not, and the
   weekly-test result sheet threw a ReferenceError).
   ═══════════════════════════════════════════════════════════════════════ */
group('Student MODAL API');
(function modalApi(){
  const files = ['app.js','objective.js','subjective.js','user-page.js','cloud-sync.js','pdf-viewer.js','user.html'];
  const used = new Set(), defined = readFile('app.js') || '';
  files.forEach(f => {
    const src = readFile(f) || '';
    for (const m of src.matchAll(/\bMODAL\.([A-Za-z_]+)\s*\(/g)) used.add(m[1]);
  });
  if (!/window\.MODAL\s*=/.test(defined)) { if (used.size) fail('student bundle calls MODAL.* but never defines window.MODAL'); return; }
  used.forEach(name => {
    if (!new RegExp('\\b' + name + '\\s*\\(').test(defined.slice(defined.indexOf('window.MODAL')))) fail('window.MODAL has no ' + name + '()');
  });
  pass('window.MODAL defines: ' + [...used].join(', '));
})();


/* ═══════════════════════════════════════════════════════════════════════
   SYNC MUST NEVER REMOVE DATA. It only adds, and the result is the combined copy.
   (A merge that started from a size-trimmed copy once cut a bank of 250 missed
   questions down to 21 on the device. These tests load the real PSYNC code.)
   ═══════════════════════════════════════════════════════════════════════ */
group('Sync never removes data');
PENDING.push((async function syncSafetyTests(){
  const vm = require('vm');
  const app = readFile('app.js') || '';
  const start = app.indexOf('const PSYNC = {');
  if (start === -1) { fail('PSYNC not found'); return; }
  let depth = 0, end = -1;
  for (let i = app.indexOf('{', start); i < app.length; i++) { if (app[i] === '{') depth++; else if (app[i] === '}' && --depth === 0) { end = i + 1; break; } }
  const sharedCtx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console, btoa, atob, Response, Blob, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Uint8Array, String };
  vm.runInNewContext(readFile('shared.js') + '\nthis.mergeSyncData=mergeSyncData;this.syncEncode=syncEncode;this.syncDecode=syncDecode;', sharedCtx);

  const mk = (n, p) => Array.from({ length: n }, (_, i) => ({ uid: p + i, q: 'A fairly long civil engineering question number ' + i + ' about soil bearing capacity and settlement of footings?', options: ['Option one is this long sentence', 'Option two is that long sentence', 'Option three another long one', 'Option four final long sentence'], exp: 'Explanation text explaining the reasoning so the stored item has a realistic size.', _streak: i % 3, _nextDue: 1760000000000 + i * 1000 }));
  function world(opts) {
    const store = {}; if (opts.notes) store.abhyas_qnotes = JSON.stringify(opts.notes);
    const S = { user: { username: 'Sita', token: 't' }, online: true, forcedOffline: false, prog: opts.prog || { total: 100, correct: 60, sessions: [] }, chapStats: {}, cov: {}, bk: opts.bk || [], fl: opts.fl || [], wr: opts.wr || [], stk: { days: [], last: '' } };
    const LS = { PROG: 'p', CHAPSTATS: 'c', COV: 'v', BK: 'b', FL: 'f', WR: 'w', STK: 's' };
    const sent = []; const toasts = [];
    const netFetch = async (url, o) => { const b = JSON.parse(o.body); sent.push(b); return { json: async () => opts.reply(b) }; };
    const env = { S, LS, _save: (k, v) => { store[k] = JSON.stringify(v); }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      mergeSyncData: sharedCtx.mergeSyncData, syncEncode: sharedCtx.syncEncode, syncDecode: sharedCtx.syncDecode, toast: m => toasts.push(m), netFetch, APPS: 'x',
      document: { getElementById(){ return null; } }, HOME: { render(){}, updateBadges(){} }, PROG: { render(){} }, navigator: {}, Blob, setTimeout: () => 0, clearTimeout(){}, console, JSON, Date, Object, Array, Math, Number, String, Set };
    const P = new Function(...Object.keys(env), app.slice(start, end) + '; return PSYNC;')(...Object.values(env));
    return { P, S, store, sent, toasts };
  }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const small = JSON.stringify({ prog: { total: 10, correct: 5, sessions: [] }, wr: [{ uid: 'r_1', q: 'x' }], bk: [], fl: [], stk: { days: ['2026-10-01'], last: '2026-10-01' }, cov: {}, chapStats: {}, qnotes: {} });

  /* 1. the exact failure: a large bank meets a small cloud copy */
  let w = world({ wr: mk(250, 'w_'), bk: mk(60, 'b_'), fl: mk(20, 'f_'), reply: () => ({ success: true }) });
  let out = await w.P.mergeIn(small, 'test');
  eq('250 missed questions + 1 from the cloud = 251 (was 21)', [out.ok, w.S.wr.length], [true, 251]);
  eq('60 saved questions are all kept (was cut to 20)', w.S.bk.length, 60);
  eq('20 flagged questions are all kept', w.S.fl.length, 20);
  eq('what is written to the device matches', JSON.parse(w.store.w).length, 251);
  eq('the study day from the other copy is added', w.S.stk.days, ['2026-10-01']);

  /* 2. the cloud copy is the COMPLETE state, never cut down */
  const full = w.P._fullLocal();
  eq('nothing is trimmed from the device state', [full.wr.length, full.bk.length, full.fl.length], [251, 60, 20]);
  const enc = await sharedCtx.syncEncode(JSON.stringify(full), 44000);
  eq('a big bank still fits the cloud cell (compressed)', enc !== null && enc.length <= 44000 && enc.indexOf('gz1:') === 0, true);
  eq('and comes back complete', (await sharedCtx.syncDecode(enc)).wr.length, 251);

  /* 3. conflict while saving: the other device's copy is ADDED, then the combined copy is saved */
  w = world({ wr: mk(250, 'w_'), reply: b => (b.baseUpdatedAt === '' ? { success: false, conflict: true, data: small, updatedAt: '2026-10-03T10:00:00.000Z' } : { success: true, updatedAt: '2026-10-03T10:00:05.000Z' }) });
  await w.P.pushNow();
  eq('after a save conflict this device still has all 250 plus the other copy', w.S.wr.length, 251);
  eq('two requests were made: the first rejected, the second with the combined copy', w.sent.length, 2);
  const pushed = await sharedCtx.syncDecode(w.sent[1].data);
  eq('the combined copy that was uploaded holds all 251', pushed.wr.length, 251);
  eq('the reply told the user nothing was removed', w.toasts.some(t => /Nothing was removed/.test(t)), true);

  /* 4. "Restore" adds; it never replaces */
  w = world({ wr: mk(5, 'mine_'), bk: mk(3, 'mb_'), reply: () => ({ success: true, data: JSON.stringify({ wr: mk(3, 'cloud_'), bk: [], fl: [], prog: { total: 0, correct: 0, sessions: [] }, stk: { days: [], last: '' } }), updatedAt: '2026-10-03T10:00:00.000Z' }) });
  await w.P.forceRestore();
  eq('restore: 5 on the device + 3 from the cloud = 8', w.S.wr.length, 8);
  eq('restore leaves the saved questions alone', w.S.bk.length, 3);
  w = world({ wr: [], prog: { total: 0, correct: 0, sessions: [] }, reply: () => ({ success: true, data: JSON.stringify({ wr: mk(4, 'cloud_'), bk: mk(2, 'cb_'), fl: [], prog: { total: 50, correct: 30, sessions: [] }, stk: { days: [], last: '' } }), updatedAt: '2026-10-03T10:00:00.000Z' }) });
  await w.P.pullIfEmpty();
  eq('a fresh device gets the cloud copy', [w.S.wr.length, w.S.bk.length, w.S.prog.total], [4, 2, 50]);

  /* 5. a merge that would remove anything is refused */
  w = world({ wr: mk(10, 'w_'), reply: () => ({ success: true }) });
  eq('the safety check refuses a smaller result', w.P._mergeKeepsEverything({ wr: mk(10, 'a'), bk: [], fl: [], qnotes: {}, prog: { total: 5, correct: 1, sessions: [] } }, { wr: mk(9, 'a'), bk: [], fl: [], qnotes: {}, prog: { total: 5, correct: 1, sessions: [] } }), false);
  eq('and a lower running total', w.P._mergeKeepsEverything({ wr: [], bk: [], fl: [], qnotes: {}, prog: { total: 5, correct: 1, sessions: [] } }, { wr: [], bk: [], fl: [], qnotes: {}, prog: { total: 4, correct: 1, sessions: [] } }), false);
  eq('and accepts a result that only adds', w.P._mergeKeepsEverything({ wr: mk(2, 'a'), bk: [], fl: [], qnotes: {}, prog: { total: 5, correct: 1, sessions: [] } }, { wr: mk(3, 'a'), bk: [], fl: [], qnotes: {}, prog: { total: 9, correct: 2, sessions: [] } }), true);
  w = world({ wr: mk(10, 'w_'), reply: () => ({ success: true }) });
  out = await w.P.mergeIn('{not json', 'x');
  eq('an unreadable cloud copy changes nothing', [out.ok, w.S.wr.length], [false, 10]);

  /* 6. safety copies: taken before every change, newest 3 kept, only for the signed-in student */
  w = world({ wr: mk(7, 'w_'), reply: () => ({ success: true }) });
  await w.P.mergeIn(small, 'one'); w.S.wr.push({ uid: 'x1' }); await w.P.mergeIn(small, 'two'); w.S.wr.push({ uid: 'x2' }); await w.P.mergeIn(small, 'three'); w.S.wr.push({ uid: 'x3' }); await w.P.mergeIn(small, 'four');
  const snaps = w.P.listSnapshots();
  eq('only the newest 3 safety copies are kept', snaps.length, 3);
  eq('the oldest copy (reason "one") was dropped, newest first', snaps.map(x => x.reason), ['four', 'three', 'two']);
  eq('a safety copy holds what the device had just before that change (7 + 1 from the cloud + 1 added = 9)', snaps[2].counts.wr, 9);
  w.S.user = { username: 'Someone Else', token: 't' };
  eq('another student never sees them', w.P.listSnapshots().length, 0);
  w.S.user = { username: 'sita', token: 't' };
  eq('the same student in different capitals does', w.P.listSnapshots().length, 3);
  const rec = await w.P.recoverSnapshot(2);
  eq('recovering a copy only adds', rec.ok && w.S.wr.length >= 8, true);

  /* 7. page closing: a copy that does not fit is never cut down and sent */
  w = world({ wr: mk(250, 'w_'), reply: () => ({ success: true }) });
  w.P._beaconSync();
  eq('no cut-down copy is sent when the page closes', w.sent.length, 0);

  /* 8. a payload that cannot fit even compressed is not sent, and nothing is lost */
  w = world({ wr: Array.from({ length: 400 }, (_, i) => ({ uid: 'r' + i, q: require('crypto').randomBytes(300).toString('base64') })), reply: () => ({ success: true }) });
  await w.P.pushNow();
  eq('an over-large copy is not uploaded', w.sent.length, 0);
  eq('and the device still has every item', w.S.wr.length, 400);
})());

/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: two-device progress merge (shared.js mergeSyncData)
   ═══════════════════════════════════════════════════════════════════════ */
group('Multi-device merge');
(function mergeTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.merge=mergeSyncData;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const A = { prog: { sessions: [{ at: 3, fid: 'x' }, { at: 1, fid: 'x' }] }, chapStats: { c1: { attempted: 5 }, c2: { attempted: 1 } },
              cov: { f1: { p: '1200', a: 3, c: 1 } }, bk: [{ uid: 'a_1' }], fl: [], wr: [{ uid: 'w_1', _streak: 2 }],
              stk: { days: ['2026-10-01', '2026-10-03'] }, qnotes: { q1: 'mine' }, sprint: '2026-10-01' };
  const B = { prog: { sessions: [{ at: 2, fid: 'y' }, { at: 1, fid: 'x' }] }, chapStats: { c1: { attempted: 9 }, c3: { attempted: 2 } },
              cov: { f1: { p: '0021', a: 4, c: 2 }, f2: { p: '1', a: 1, c: 1 } }, bk: [{ uid: 'a_1' }, { uid: 'b_2' }], fl: [{ uid: 'f_1' }],
              wr: [{ uid: 'w_1', _streak: 0 }, { uid: 'w_2', _streak: 1 }], stk: { days: ['2026-10-02'] }, qnotes: { q1: 'theirs', q2: 'other' }, sprint: '2026-09-20' };
  const m = ctx.merge(A, B);
  eq('sessions are unioned, newest first, no duplicates', m.prog.sessions.map(s => s.at), [3, 2, 1]);
  eq('chapter stats keep the higher attempt count', [m.chapStats.c1.attempted, m.chapStats.c2.attempted, m.chapStats.c3.attempted], [5 < 9 ? 9 : 5, 1, 2]);
  eq('coverage bits from both devices are combined', m.cov.f1.p, '1221');
  eq('coverage keeps files only one device has', !!m.cov.f2, true);
  eq('bookmarks are unioned by uid', m.bk.map(x => x.uid), ['a_1', 'b_2']);
  eq('flashcards from the other device are kept', m.fl.map(x => x.uid), ['f_1']);
  eq('wrong-answer queue unions; this device wins a conflict', m.wr.map(x => x.uid + ':' + x._streak), ['w_1:2', 'w_2:1']);
  eq('study days are unioned and sorted', m.stk.days, ['2026-10-01', '2026-10-02', '2026-10-03']);
  eq('streak "last" is the newest day', m.stk.last, '2026-10-03');
  eq('notes union; this device wins a conflict', m.qnotes, { q1: 'mine', q2: 'other' });
  eq('sprint start prefers this device', m.sprint, '2026-10-01');
  eq('merging with nothing keeps local data', ctx.merge(A, null).bk.length, 1);
  eq('merging into nothing takes the other copy', ctx.merge(null, B).fl.length, 1);
  eq('garbage input does not throw', ctx.merge('x', 5).prog.sessions.length, 0);
})();

group('Size-based 60-day plan');
(function sizedPlanTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.plan=sprintPlan;this.today=sprintToday;this.days=sprintTotalDays;this.add=sprintIsoAdd;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const P = (day, o) => ctx.plan(Object.assign({ startISO: '2026-10-01', now: new Date(ctx.add('2026-10-01', day - 1) + 'T12:00:00'), totalQ: 3000, attemptedQ: 0, wrongQ: 0, dueReview: 0, questionsToday: 0 }, o || {}));

  eq('the target is sized to the content: 3000 questions over 30 working learn days is 100 a day', [P(1).newQ, P(1).qTarget, P(1).sized], [100, 100, true]);
  eq('it says so when the pace needed is realistic, tight or not realistic', [P(1).feasibility, P(1, { totalQ: 6000 }).feasibility, P(1, { totalQ: 7000 }).feasibility], ['ok', 'tight', 'unrealistic']);
  eq('it reports the pace needed per day', P(1, { totalQ: 7000 }).neededPerDay, 234);
  eq('everything attempted: feasibility is done', P(10, { attemptedQ: 3000 }).feasibility, 'done');
  eq('no question counts: the old fixed plan is used', ctx.plan({ startISO: '2026-10-01', now: new Date('2026-10-01T12:00:00'), totalTopics: 70, coveredTopics: 0, dueReview: 0, questionsToday: 0 }).qTarget, 40);

  eq('every 7th learn day is a catch-up day', [7, 14, 21, 28, 35].map(d => P(d, { attemptedQ: 3000 * d / 35 }).catchup), [true, true, true, true, true]);
  eq('a normal day is not a catch-up day', P(6).catchup, false);
  const c = P(14);   // nothing attempted by day 14
  eq('catch-up day pays back the backlog, capped at 150 new questions', [c.catchup, c.backlogQ, c.newQ], [true, 1200, 150]);
  eq('catch-up day with no backlog is a light review day', (r => [r.catchup, r.newQ, r.qTarget])(P(7, { attemptedQ: 900 })), [true, 0, 20]);
  eq('the new quota is spread over the remaining WORKING days (catch-up days excluded)', P(8, { attemptedQ: 700 }).newQ, Math.ceil(2300 / 24));

  const off = P(5, { offDays: ['2026-10-05'] });
  eq('a rest day has no target and counts as met', [off.rest, off.qTarget, off.mins, off.goalMet], [true, 0, 0, true]);
  eq('taking a day off raises the other days a little (fewer working days left)', P(4, { offDays: ['2026-10-05'] }).newQ > P(4).newQ, true);

  eq('reviews are capped at 30', P(2, { dueReview: 100, attemptedQ: 90 }).reviewQ, 30);
  eq('reviews are capped at 15 when behind', P(20, { dueReview: 100, attemptedQ: 100 }).reviewQ, 15);
  eq('the daily target includes the reviews', P(2, { dueReview: 10, attemptedQ: 90 }).qTarget, P(2, { attemptedQ: 90 }).qTarget + 10);

  eq('pace is judged in questions: 100 of 3000 on day 20 is behind', P(20, { attemptedQ: 100 }).pace, 'behind');
  eq('pace: 3000 attempted on day 10 is ahead', P(10, { attemptedQ: 3000 }).pace, 'ahead');

  const dr = P(40, { attemptedQ: 3000, wrongQ: 300 });
  eq('drill phase starts after learn and is at least 40 questions', [dr.phase, dr.qTarget], ['drill', 40]);
  eq('drill target grows with the work still to do', P(40, { attemptedQ: 1000, wrongQ: 600 }).qTarget > 40, true);
  eq('drill target never exceeds 150', P(40, { attemptedQ: 0, wrongQ: 0, totalQ: 9000 }).qTarget, 150);
  eq('mock phase: one paper', (r => [r.phase, r.mock, r.qTarget])(P(55, { attemptedQ: 3000 })), ['mock', true, 100]);
  eq('time estimate follows the student\'s own speed', [P(1, { secPerQ: 30 }).mins, P(1, { secPerQ: 90 }).mins], [50, 150]);
  eq('a mock day budgets time to review the paper', P(55, { attemptedQ: 3000, secPerQ: 60 }).mins, 130);

  eq('an exam in 31 days shortens the plan to 31 days', [ctx.days('2026-10-01', '2026-11-01'), P(1, { examISO: '2026-11-01' }).totalDays], [31, 31]);
  eq('the plan is never shorter than 14 days or longer than 60', [ctx.days('2026-10-01', '2026-10-05'), ctx.days('2026-10-01', '2027-06-01'), ctx.days('2026-10-01', '')], [14, 60, 60]);
  eq('past the shortened plan it is finished', P(32, { examISO: '2026-11-01' }).state, 'finished');
  eq('a shorter plan needs a faster pace', P(1, { examISO: '2026-11-01' }).newQ > P(1).newQ, true);
  eq('garbage input does not throw and is never negative', (() => { const r = P(3, { attemptedQ: 99999, wrongQ: -5, dueReview: -3, secPerQ: 'x', offDays: 'no' }); return [r.qTarget >= 0, r.newQ >= 0, r.coveragePct]; })(), [true, true, 100]);

  /* the daily list */
  const ch = [
    { lv: 'level7', ch: 'a', label: 'A', total: 100, attempted: 0, wrong: 0, accuracy: null, state: 'not-started' },
    { lv: 'level7', ch: 'b', label: 'B', total: 50, attempted: 20, wrong: 3, accuracy: 0.85, state: 'in-progress' },
    { lv: 'gk', ch: 'g', label: 'G', total: 100, attempted: 0, wrong: 0, accuracy: null, state: 'not-started' }
  ];
  const plan60 = { state: 'active', phase: 'learn', catchup: false, rest: false, mock: false, reviewQ: 0, newQ: 60, qTarget: 60 };
  const t = ctx.today(plan60, ch);
  eq('today\'s list adds up to the day\'s new quota', t.reduce((n, i) => n + i.questions, 0), 60);
  eq('a chapter already started comes first', t[0].label, 'B');
  eq('GK always gets a share while any is left', t.some(i => i.lv === 'gk' && i.questions > 0), true);
  eq('a list never offers more than a chapter has left', t.every(i => i.questions <= ch.find(c => c.label === i.label).total - ch.find(c => c.label === i.label).attempted), true);
  eq('reviews come first in the list', ctx.today(Object.assign({}, plan60, { reviewQ: 12, qTarget: 72 }), ch)[0], { kind: 'review', label: 'Review missed questions', questions: 12 });
  const weak = ctx.today({ state: 'active', phase: 'drill', catchup: false, rest: false, mock: false, reviewQ: 0, newQ: 0, qTarget: 40 }, [
    { lv: 'level7', ch: 'x', label: 'X', total: 10, attempted: 10, wrong: 4, accuracy: 0.6, state: 'in-progress' },
    { lv: 'level7', ch: 'y', label: 'Y', total: 10, attempted: 10, wrong: 2, accuracy: 0.8, state: 'in-progress' },
    { lv: 'gk', ch: 'z', label: 'Z', total: 10, attempted: 10, wrong: 0, accuracy: 1, state: 'complete' }]);
  eq('drill list goes to the weakest chapters first and skips completed ones', weak.map(i => [i.label, i.kind, i.questions]), [['X', 'weak', 4], ['Y', 'weak', 2]]);
  eq('mock day lists the paper', ctx.today({ state: 'active', mock: true, qTarget: 100, reviewQ: 0 }, ch).map(i => i.kind), ['mock']);
  eq('rest day lists nothing to do', ctx.today({ state: 'active', rest: true }, ch).map(i => i.kind), ['rest']);
  eq('no plan, no list', [ctx.today(null, ch), ctx.today({ state: 'notstarted' }, ch)], [[], []]);
})();

group('Sprint screen wiring');
(function sprintUiTests(){
  const eq = (n, ok, why) => ok ? pass(n) : fail(n + (why ? ': ' + why : ''));
  const ujs = readFile('user-page.js') || '', uh = readFile('user.html') || '', app = readFile('app.js') || '';
  eq('the plan is built from real question counts (Level 7 + GK)', /totalQ,\s*attemptedQ,\s*wrongQ/.test(ujs) && /sprintRefs\(ChapterData\.allFileRefs\(\)\)/.test(ujs));
  eq('the card shows today\'s chapter list with a Start button for each line', /sprintToday\(plan, this\._chapters\(\)\)/.test(ujs) && /SPRINT\.startItem\(/.test(ujs));
  eq('a warning shows when the pace needed is tight or unrealistic', /plan\.feasibility === 'tight'/.test(ujs) && /plan\.feasibility === 'unrealistic'/.test(ujs));
  eq('a rest day can be taken and cancelled', /restDay\(\)/.test(ujs) && /abhyas_sprint_off/.test(ujs));
  eq('an exam date can be set, validated and removed', /examDialog\(\)/.test(ujs) && /saveExam\(\)/.test(ujs) && /clearExam\(\)/.test(ujs) && /v <= this\._iso\(new Date\(\)\)/.test(ujs));
  eq('speed is measured from the student\'s own sessions', /_secPerQ\(\)/.test(ujs) && /durationSec/.test(ujs));
  eq('start of a list line opens the chapter or the review', /CH_GRID\.startChapter\(it\.lv, it\.ch/.test(ujs) && /REV\.start\('wr'/.test(ujs));
  eq('the Start button on the card begins the first real task of the day', /items\.findIndex\(it => it\.kind !== 'rest'\)/.test(ujs));
  eq('the list has styles', /\.sprint-row\{/.test(uh) && /\.sprint-list\{/.test(uh));
  eq('restarting or resetting the sprint also clears rest days', /_saveOff\(\[\]\)/.test(ujs) && /removeItem\('abhyas_sprint_off'\)/.test(app));
  eq('the 24-hour undo brings rest days back too', /sprintOff/.test(app));
})();

group('Sprint card (runs against a fake device)');
(function sprintCardRuntime(){
  const ujs = readFile('user-page.js') || '', sh = readFile('shared.js') || '';
  const grab = marker => { const st = ujs.indexOf(marker); let d = 0, en = -1; for (let i = ujs.indexOf('{', st); i < ujs.length; i++) { if (ujs[i] === '{') d++; else if (ujs[i] === '}' && --d === 0) { en = i + 1; break; } } return ujs.slice(st, en); };
  const eq = (n, ok, why) => ok ? pass(n) : fail(n + (why ? ': ' + why : ''));
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const store = { abhyas_sprint_start: iso(new Date()) };
  const refs = []; ['level7', 'gk'].forEach(lv => [1, 2, 3].forEach(c => refs.push({ fid: lv + c, key: 'k', lv, ch: 'c' + c, book: 'B' })));
  const S = { fcount: {}, cov: {}, wr: [], prog: { sessions: [] } }; refs.forEach(r => { S.fcount[r.fid] = 100; });
  S.cov.level71 = { p: '1'.repeat(40) + '2'.repeat(5), a: 45, c: 40 };
  const box = { style: {}, innerHTML: '' }, out = {};
  const env = { window: { addEventListener(){}, removeEventListener(){} }, navigator: {}, S,
    ChapterData: { allFileRefs: () => refs, chapters: () => ({ c1: 1, c2: 1, c3: 1 }), chapterFileRefs: (lv, ch) => refs.filter(r => r.lv === lv && r.ch === ch), chapterName: (lv, ch) => ch.toUpperCase() },
    $: id => id === 'sprint-card' ? box : null, esc: x => String(x).replace(/</g, '&lt;'), toast(){}, openMod(){}, closeMod(){}, confirm: () => true,
    REV: { dueWrong: () => [1, 2, 3], start(){ out.rev = 1; } }, CH_GRID: { startChapter(...a){ out.started = a; } }, SYLLABUS_MOCK: { start(){} }, TODAY_PLAN: { start(){} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: () => null, addEventListener(){} }, Date, JSON, Math, Array, Number, String, Object, Set, console };
  let m;
  try {
    const code = sh + '\n' + grab('window.MASTERY = {').replace('window.MASTERY = ', 'const MASTERY = ') + ';\n' + grab('window.SPRINT = {').replace('window.SPRINT = ', 'const SPRINT = ') + ';\nreturn {SPRINT};';
    m = new Function(...Object.keys(env), code)(...Object.values(env));
    m.SPRINT.render();
  } catch (e) { fail('the sprint card threw: ' + e.message); return; }
  eq('day 1 renders with its phase and a size-based target', /Day 1 of 60/.test(box.innerHTML) && /Learn/.test(box.innerHTML) && /\/\d+ questions/.test(box.innerHTML));
  eq('the list has a review line and chapter lines with Start buttons', /Review missed questions/.test(box.innerHTML) && (box.innerHTML.match(/SPRINT\.startItem\(/g) || []).length >= 2);
  eq('a chapter that is already started is offered first', /C1<span/.test(box.innerHTML));
  eq('Level 7 and GK both appear in today\'s list', /\(GK\)/.test(box.innerHTML) && /C1<span/.test(box.innerHTML));
  m.SPRINT.startItem(1);
  eq('Start opens that chapter', Array.isArray(out.started) && out.started[0] === 'level7');
  m.SPRINT.startItem(0);
  eq('Start on the review line opens the review', out.rev === 1);
  m.SPRINT.restDay();
  eq('taking today off is saved and shows a rest day', store.abhyas_sprint_off === JSON.stringify([iso(new Date())]) && (m.SPRINT.render(), /Rest day/.test(box.innerHTML)));
  m.SPRINT.restDay();
  eq('cancelling the rest day removes it', store.abhyas_sprint_off === '[]');
  const ex = new Date(); ex.setDate(ex.getDate() + 30);
  store.abhyas_exam_date = iso(ex); m.SPRINT.render();
  eq('an exam in 30 days shortens the plan and shows the countdown', /Day 1 of 30/.test(box.innerHTML) && /to exam/.test(box.innerHTML));
})();

group('Exam timer warnings, shortcuts and display preferences');
(function examUxTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; }, documentElement: { setAttribute(){}, removeAttribute(){} } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.ew=examWarning;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const total = 3600;
  let w = [], fired = [];
  for (let left = total; left >= 0; left--) { const r = ctx.ew(left, total, w); w = r.warned; if (r.fire) fired.push([r.fire, left]); }
  eq('a 60-minute exam warns once each at 10, 5 and 1 minute left', fired, [[600, 600], [300, 300], [60, 60]]);
  eq('resuming with 4 minutes left does not announce the 10-minute warning late', (() => { const r = ctx.ew(240, 3600, []); return [r.fire, r.warned.sort((a, b) => a - b)]; })(), [0, [300, 600]]);
  eq('a 5-minute quiz has no "10 minutes left"', (() => { let ww = [], f = []; for (let l = 300; l >= 0; l--) { const r = ctx.ew(l, 300, ww); ww = r.warned; if (r.fire) f.push(r.fire); } return f; })(), [60]);
  eq('the warning list is not changed in place', (() => { const a = []; ctx.ew(100, 3600, a); return a.length; })(), 0);
  const obj = readFile('objective.js') || '';
  /_timerWarn\(S\.quiz\.left\)/.test(obj) ? pass('the exam clock checks for warnings every second') : fail('timer does not call _timerWarn');
  /examTotal: \(snap/.test(obj) ? pass('a resumed exam keeps its warnings') : fail('resume path has no examTotal');
  /aria-live/.test(obj) ? pass('warnings are announced to screen readers') : fail('no live region for timer warnings');
  ['1', 'c', 'm', 'n', 'p'].every(k => new RegExp("k==='" + k + "'|\\['1','2','3','4','5'\\]").test(obj)) ? pass('exam keyboard shortcuts: 1-5 pick, C clear, M mark, N next, P previous') : fail('an exam shortcut is missing');
  const dp = readFile('display-prefs.js') || '';
  const win = {};
  try { vm.runInNewContext(dp, { window: win, document: { addEventListener(){}, getElementById(){ return null; }, documentElement: { setAttribute(){}, removeAttribute(){} } }, localStorage: { getItem(){ return null; }, setItem(){} } }); } catch (e) { fail('display-prefs.js load: ' + e.message); return; }
  const R = win.DISPLAY_RULES;
  eq('display preferences: bad or missing data falls back to the defaults', [R.cleanPrefs(null), R.cleanPrefs('x'), R.cleanPrefs({ fs: 'huge', hc: 'yes', amoled: 1 })], [R.DEFAULTS, R.DEFAULTS, R.DEFAULTS]);
  eq('display preferences: valid choices are kept', R.cleanPrefs({ fs: 'large', hc: true, amoled: true }), { fs: 'large', hc: true, amoled: true });
  eq('three text sizes', R.SIZES, ['small', 'medium', 'large']);
  const uh = readFile('user.html') || '';
  /html\[data-hc="1"\]/.test(uh) && /html\[data-amoled="1"\]\.dark/.test(uh) && /html\[data-fs="large"\]/.test(uh) ? pass('CSS exists for large text, high contrast and AMOLED black') : fail('display CSS missing');
  /abhyas_display/.test(uh) && /id="display-card-body"/.test(uh) ? pass('the page applies saved display settings before it paints, and has a settings card') : fail('early apply or settings card missing');
})();

group('Question reports: 6 categories and offline queue');
(function reportTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.add=reportQueueAdd;this.rm=reportQueueRemove;this.R=REPORT_REASONS;this.MAX=REPORT_QUEUE_MAX;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  eq('there are six report categories', ctx.R.length, 6);
  const gs = require('fs').readFileSync(require('path').join(ROOT, 'gas/code.gs'), 'utf8'), obj = readFile('objective.js') || '', adm = require('fs').readFileSync(require('path').join(ROOT, 'admin.html'), 'utf8');
  const sv = (gs.match(/const QREPORT_REASONS = \[([^\]]*)\]/) || [])[1] || '';
  eq('server accepts the same six categories as the app', sv.replace(/[" ]/g, '').split(',').sort(), ctx.R.slice().sort());
  ctx.R.every(r => obj.indexOf('value="' + r + '"') !== -1) ? pass('the report form offers every category') : fail('a category is missing from the report form');
  ctx.R.every(r => adm.indexOf(r) !== -1) ? pass('the admin screen knows every category') : fail('admin.html is missing a category');
  let q = ctx.add([], { uid: 'f_1', reason: 'typo', note: 'x' }, 5);
  eq('a report is queued', [q.length, q[0].queuedAt], [1, 5]);
  eq('the same question and reason is kept once (newest wins)', ctx.add(q, { uid: 'f_1', reason: 'typo', note: 'newer' }, 9).map(x => x.note), ['newer']);
  eq('the same question with another reason is a separate report', ctx.add(q, { uid: 'f_1', reason: 'unclear' }, 9).length, 2);
  eq('an invalid category or empty uid is ignored', [ctx.add(q, { uid: 'f_2', reason: 'rude' }).length, ctx.add(q, { reason: 'typo' }).length], [1, 1]);
  let big = []; for (let i = 0; i < 30; i++) big = ctx.add(big, { uid: 'u' + i, reason: 'other' }, i);
  eq('the queue is capped and keeps the newest', [big.length, big[big.length - 1].uid], [ctx.MAX, 'u29']);
  eq('a sent report is removed from the queue', ctx.rm(q, { uid: 'f_1', reason: 'typo' }).length, 0);
  eq('note length is limited to 500', ctx.add([], { uid: 'a', reason: 'other', note: 'x'.repeat(900) })[0].note.length, 500);
  /flushReports/.test(readFile('app.js') || '') ? pass('queued reports are sent when the device comes back online') : fail('the online handler does not flush the report queue');
})();

group('85% mastery gate and Level 7 + GK sprint');
(function masteryTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.cm=chapterMastery;this.sr=sprintRefs;this.TH=MASTERY_THRESHOLD;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const base = { fids: ['a'], fcount: { a: 20 } };
  const bits = (r, w, u) => '1'.repeat(r) + '2'.repeat(w) + '0'.repeat(u);
  eq('the pass mark is 85%', ctx.TH, 0.85);
  eq('all attempted, 17/20 right (85%), nothing in wrong bank: complete', ctx.cm({ ...base, cov: { a: { p: bits(17, 3, 0) } }, wr: [] }).state, 'complete');
  const low = ctx.cm({ ...base, cov: { a: { p: bits(16, 4, 0) } }, wr: [] });
  eq('80% is not complete, and the reason is shown', [low.state, low.needs], ['in-progress', ['Accuracy 80% (need 85%)']]);
  eq('95% accurate but only half attempted: not complete', ctx.cm({ ...base, cov: { a: { p: bits(10, 0, 10) } }, wr: [] }).state, 'in-progress');
  const w = ctx.cm({ ...base, cov: { a: { p: bits(20, 0, 0) } }, wr: [{ uid: 'a_1', fileId: 'a' }, { uid: 'z_1', fileId: 'other' }] });
  eq('100% but one question still in the wrong bank: not complete', [w.state, w.wrongLeft], ['in-progress', 1]);
  eq('nothing attempted yet: not started', ctx.cm({ ...base, cov: {}, wr: [] }).state, 'not-started');
  eq('unknown size (file not downloaded yet) is never called complete', ctx.cm({ fids: ['a'], fcount: {}, cov: { a: { p: bits(20, 0, 0) } }, wr: [] }).state, 'unknown');
  eq('an empty chapter is never complete', ctx.cm({ fids: [], fcount: {}, cov: {}, wr: [] }).state, 'unknown');
  eq('accuracy uses the latest result, so a corrected mistake stops counting', ctx.cm({ fids: ['a'], fcount: { a: 4 }, cov: { a: { p: '1111' } }, wr: [] }).accuracy, 1);
  eq('two sets in one chapter are judged together', ctx.cm({ fids: ['a', 'b'], fcount: { a: 10, b: 10 }, cov: { a: { p: bits(10, 0, 0) }, b: { p: bits(7, 3, 0) } }, wr: [] }).accuracy, 0.85);
  const refs = [{ fid: 1, lv: 'level7' }, { fid: 2, lv: 'level5' }, { fid: 3, lv: 'gk' }];
  eq('the sprint covers Level 7 and GK only', ctx.sr(refs).map(r => r.fid), [1, 3]);
  eq('sprintRefs tolerates garbage', ctx.sr(null), []);
  const up = readFile('user.html') || '', ujs = readFile('user-page.js') || '';
  /sprintRefs\(ChapterData\.allFileRefs\(\)\)/.test(ujs) ? pass('the sprint plan is built from Level 7 + GK files') : fail('SPRINT._inputs does not use sprintRefs');
  /Daily target met/.test(ujs) && /\.sprint-done/.test(up) ? pass('a green "Daily target met" badge shows when the day\'s goal is done') : fail('daily target badge missing');
  /MASTERY\.chapter\(this\.lv, ch\)/.test(ujs) ? pass('chapter cards only say Complete when the gate is met') : fail('chapter cards do not use the mastery gate');
})();

group('Storage warning and backup reminder (rules)');
(function storageRulesTests(){
  const vm = require('vm');
  const win = {};
  const ctx = { window: win, document: { addEventListener(){}, getElementById(){ return null; } }, localStorage: { getItem(){ return null; }, setItem(){} }, navigator: {}, setTimeout(){}, console };
  try { vm.runInNewContext(readFile('storage-health.js') || '', ctx); } catch (e) { fail('storage-health.js load: ' + e.message); return; }
  const R = win.STORAGE_RULES;
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  eq('79% is fine, 80% warns, 95% is full', [R.storageLevel(0.79), R.storageLevel(0.8), R.storageLevel(0.95)], ['ok', 'warn', 'full']);
  eq('fraction is clamped and a missing limit is zero', [R.storageFraction(50, 100), R.storageFraction(500, 100), R.storageFraction(5, 0), R.storageFraction(-5, 100)], [0.5, 1, 0, 0]);
  eq('4,000,000 of 5,000,000 characters is exactly the 80% line', R.storageLevel(R.storageFraction(4000000, R.LIMIT_CHARS)), 'warn');
  eq('keys are grouped for the breakdown', ['abhyas_prog', 'abhyas_wr', 'abhyas_qnotes', 'abhyas_tt', 'abhyas_theme'].map(R.storageGroup), ['progress', 'saved', 'notes', 'plan', 'other']);
  const D = 24 * 60 * 60 * 1000, now = 100 * D;
  eq('no record yet: no reminder (a new install is not nagged)', R.backupDue(null, now, 500).due, false);
  eq('6 days and 99 answers: no reminder', R.backupDue({ at: now - 6 * D, total: 0 }, now, 99).due, false);
  eq('7 days: reminder, because of the days', (r => [r.due, r.reason])(R.backupDue({ at: now - 7 * D, total: 0 }, now, 5)), [true, 'days']);
  eq('100 new answers: reminder, because of the answers', (r => [r.due, r.reason, r.answers])(R.backupDue({ at: now - D, total: 40 }, now, 140)), [true, 'answers', 100]);
  eq('answers are counted since the last backup, never negative', R.backupDue({ at: now, total: 900 }, now, 100).answers, 0);
  eq('sizes read naturally', [R.fmtBytes(500), R.fmtBytes(2048), R.fmtBytes(3 * 1024 * 1024)], ['500 B', '2.0 KB', '3.0 MB']);
  const sh = readFile('storage-health.js') || '';
  /localStorage\.removeItem|\.clear\(\)|QDB\.clear|DATA\.reset/.test(sh) ? fail('storage-health.js deletes data by itself') : pass('the storage module never deletes anything on its own');
  const uh = readFile('user.html') || '';
  /id="storage-card-body"/.test(uh) && /id="backup-nudge-slot"/.test(uh) && /id="backup-nudge-slot-data"/.test(uh) ? pass('Data and Home have a place for the storage card and the reminder') : fail('storage/reminder slots missing from user.html');
  /js\/app\/storage-health\.js/.test(uh) ? pass('user.html loads storage-health.js') : fail('user.html does not load storage-health.js');
})();

group('Google Drive backup versions');
(function driveVersionTests(){
  const vm = require('vm');
  const win = { addEventListener(){} };
  const ctx = { window: win, document: { addEventListener(){} }, localStorage: { getItem(){ return null; }, setItem(){} }, navigator: {}, console, setTimeout, fetch: async () => ({}), URLSearchParams, Date, Math, JSON, Object, Array, Number, String, Promise };
  const src = readFile('cloud-sync.js') || '';
  try { vm.runInNewContext(src, ctx); } catch (e) { fail('cloud-sync.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const names = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map((d, i) => ({ id: 'id' + i, name: 'abhyas-backup-' + d + 'T00-00-00-000Z.json' }));
  eq('with 7 snapshots the 2 oldest are removed, the newest 5 stay', win._cloudPrune(names, 5), ['id1', 'id0']);
  eq('5 or fewer snapshots: nothing is removed', win._cloudPrune(names.slice(0, 5), 5), []);
  eq('the older single-file backup is never pruned', win._cloudPrune([{ id: 'legacy', name: 'abhyas-progress-backup.json' }].concat(names), 5).indexOf('legacy'), -1);
  eq('files this app did not create are never pruned', win._cloudPrune([{ id: 'x', name: 'notes.txt' }].concat(names), 5).indexOf('x'), -1);
  const a = { v: 2, ts: 1, prog: { total: 5 }, bk: [{ uid: 'a' }] };
  const sum = win._cloudChecksum(a);
  eq('the checksum ignores the time and the sum itself', [win._cloudChecksum(Object.assign({}, a, { ts: 999, sum: 'zzz' })) === sum, sum.length], [true, 8]);
  eq('any change to the content changes the checksum', win._cloudChecksum(Object.assign({}, a, { bk: [{ uid: 'b' }] })) === sum, false);
  eq('key order does not matter', win._cloudChecksum({ bk: a.bk, prog: a.prog, v: 2 }) === win._cloudChecksum({ v: 2, prog: a.prog, bk: a.bk }), true);
  const m = win._cloudMigrate({ v: 1, ts: 1, prog: { total: 3 }, bk: [] });
  eq('an older (v1) backup is still readable', [m.ok, m.ok && m.data.v], [true, 2]);
  eq('a backup from a newer app is refused with a clear reason', win._cloudMigrate({ v: 99 }).ok, false);
  /method:\s*'PATCH'|PATCH/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')) ? fail('a backup still overwrites an existing file') : pass('a backup never overwrites an earlier one (no PATCH)');
  /MAX_VERSIONS\s*=\s*5/.test(src) ? pass('the newest 5 versions are kept') : fail('MAX_VERSIONS is not 5');
  /_cloudChecksum\(parsed\)\s*!==\s*parsed\.sum/.test(src) ? pass('a damaged backup is detected before it is applied') : fail('restore does not verify the checksum');
  /DATA\._applyImport\(migrated\.data\)/.test(src) ? pass('restore adds to the device through the safe merge (nothing removed)') : fail('restore no longer uses the additive merge');
  /slice\(-500\)/.test(src) ? fail('the backup still cuts lists to 500') : pass('the backup is complete (no 500-item cut)');
})();

group('Scoped progress reset (device behaviour)');
(function resetModuleTests(){
  const app = readFile('app.js') || '';
  const grab = name => {
    const st = app.indexOf('const ' + name + ' = {'); if (st === -1) return '';
    let d = 0, en = -1;
    for (let i = app.indexOf('{', st); i < app.length; i++) { if (app[i] === '{') d++; else if (app[i] === '}' && --d === 0) { en = i + 1; break; } }
    return app.slice(st, en);
  };
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  function device() {
    const store = {};
    const S = { prog: { total: 40, correct: 30, badges: { b1: 1 }, sessions: [
        { at: 100, mode: 'exam', fid: 'f1', chapter: 'Soil \u2014 B1' }, { at: 200, mode: 'flashcard', fid: 'f2', chapter: 'RCC \u2014 B1' }, { at: 300, mode: 'exam', fid: 'f2', chapter: 'RCC \u2014 B1' }] },
      chapStats: { 'Soil \u2014 B1': { attempted: 10, correct: 5, lastAt: 100 }, 'RCC \u2014 B1': { attempted: 30, correct: 25, lastAt: 300 } },
      cov: { f1: { p: '1', a: 1, c: 1, t: 100 }, f2: { p: '12', a: 2, c: 1, t: 300 } },
      wr: [{ uid: 'f1_0', fileId: 'f1' }, { uid: 'f2_0', fileId: 'f2' }], bk: [{ uid: 'bk' }], fl: [{ uid: 'fl' }], stk: { days: ['2026-10-01'], last: '2026-10-01' }, fcount: { x: 1 }, tt: { sessions: [{ id: 1 }] } };
    store.abhyas_sprint_start = '2026-08-01';
    const LS = { PROG: 'p', CHAPSTATS: 'c', COV: 'v', BK: 'b', FL: 'f', WR: 'w', STK: 's', FCOUNT: 'fc', TT: 't', EXAM_SNAP: 'es' };
    const refs = [{ fid: 'f1', lv: 7, ch: 1, book: 'B1' }, { fid: 'f2', lv: 7, ch: 2, book: 'B1' }];
    const ChapterData = { allFileRefs: () => refs, chapterName: (lv, ch) => ({ 1: 'Soil', 2: 'RCC' }[ch]) };
    let synced = 0;
    const env = { S, LS, ChapterData, esc: x => String(x), openMod(){}, closeMod(){}, toast(){}, toastUndo(){}, _save: (k, v) => { store[k] = JSON.stringify(v); },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      HOME: { render(){}, updateBadges(){} }, PROG: { render(){} }, REV: { renderList(){} }, SPRINT: { render(){} }, PSYNC: { scheduleSync(){ synced++; } },
      DATA: { exportAll(){} }, Date, JSON, Object, Array, Set, Number, String, console, document: { getElementById(){ return null; } } };
    const src = grab('PROGRESS_RESET') + ';' + grab('RESET_SNAPSHOT') + ';';
    const mod = new Function(...Object.keys(env), src + 'return {PR: PROGRESS_RESET, RS: RESET_SNAPSHOT};')(...Object.values(env));
    return Object.assign({ S, store, synced: () => synced }, mod);
  }
  let d = device(); d.PR.run('all');
  eq('reset all: totals, sessions, chapters, coverage, wrong bank and study days go to zero', [d.S.prog.total, d.S.prog.correct, d.S.prog.sessions.length, Object.keys(d.S.chapStats).length, Object.keys(d.S.cov).length, d.S.wr.length, d.S.stk.days.length], [0, 0, 0, 0, 0, 0, 0]);
  eq('reset all keeps bookmarks, flags, earned badges and the study plan', [d.S.bk.length, d.S.fl.length, d.S.prog.badges.b1, d.S.tt.sessions.length], [1, 1, 1, 1]);
  eq('reset all leaves a marker and asks for a sync', [!!d.PR.load().all, d.synced() > 0], [true, true]);
  eq('reset all restarts the sprint today', d.store.abhyas_sprint_start === '2026-08-01', false);
  d = device(); d.PR.run('wr');
  eq('reset wrong bank empties only the bank', [d.S.wr.length, d.S.prog.sessions.length, d.S.prog.total, Object.keys(d.S.chapStats).length], [0, 3, 40, 2]);
  d = device(); d.PR.run('sprint');
  eq('reset sprint only restarts the sprint', [d.store.abhyas_sprint_start === '2026-08-01', d.S.prog.sessions.length, d.S.wr.length], [false, 3, 2]);
  d = device(); d.PR.run('exams');
  eq('reset exam history removes exam sessions only', d.S.prog.sessions.map(x => x.mode), ['flashcard']);
  d = device(); d.PR.run('chapter', 'Soil \u2014 B1');
  eq('reset one chapter removes only that chapter', [d.S.prog.sessions.map(x => x.fid), Object.keys(d.S.chapStats), Object.keys(d.S.cov), d.S.wr.map(x => x.uid)], [['f2', 'f2'], ['RCC \u2014 B1'], ['f2'], ['f2_0']]);
  eq('an unknown chapter changes nothing', (d = device(), d.PR.run('chapter', 'Nope'), d.S.prog.sessions.length), 3);
  d = device(); d.PR.run('all');
  d.RS.restore();
  eq('undo brings everything back, including the sprint date', [d.S.prog.total, d.S.prog.sessions.length, d.S.wr.length, d.store.abhyas_sprint_start], [40, 3, 2, '2026-08-01']);
  eq('undo cancels the marker so other devices stop applying it', [d.PR.load().all, (d.PR.load().un || []).length], [undefined, 1]);
  d = device(); d.PR.noteRemoved('f1_0');
  eq('removing one wrong-bank question leaves a marker for that question', Object.keys(d.PR.load().rm), ['f1_0']);
  d = device(); const T = d.PR.noteWrongCleared(); d.PR.lift([T]);
  eq('undoing a cleared wrong bank lifts its marker', [d.PR.load().wr, d.PR.load().un.length], [undefined, 1]);
  eq('loading an old backup on purpose lifts earlier resets', (d = device(), d.PR.run('wr'), d.PR.liftAll(), d.PR.load().wr), undefined);
  eq('every reset kind needs a typed word', Object.keys(d.PR.SCOPES).every(k => /^(START FRESH|RESET)$/.test(d.PR.SCOPES[k].word)), true);
  eq('"reset all" needs START FRESH', d.PR.SCOPES.all.word, 'START FRESH');
})();

group('Reset markers (a reset survives sync)');
(function resetMarkerTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.merge=mergeSyncData;this.mr=mergeResets;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const T = 1000;
  /* device A reset everything at T; device B is stale and still holds old data */
  const A = { prog: { total: 0, correct: 0, gen: T, sessions: [{ at: 1500, fid: 'f1', chapter: 'C1', mode: 'exam' }] }, chapStats: {}, cov: { f1: { p: '1', a: 1, c: 1, t: 1500 } },
              bk: [{ uid: 'bk1' }], fl: [], wr: [{ uid: 'f1_5', fileId: 'f1', _addedAt: 1500 }], stk: { days: [] }, resets: { all: T } };
  const B = { prog: { total: 500, correct: 300, sessions: [{ at: 10, fid: 'f1', chapter: 'C1', mode: 'exam' }, { at: 20, fid: 'f2', chapter: 'C2' }] },
              chapStats: { C1: { attempted: 50, lastAt: 20 } }, cov: { f2: { p: '1', a: 1, c: 1 } }, bk: [{ uid: 'bk2' }], fl: [{ uid: 'fl1' }],
              wr: [{ uid: 'old_1', fileId: 'f2' }], stk: { days: ['1960-01-01'] } };
  const m = ctx.merge(A, B);
  eq('stale sessions from before the reset do not come back', m.prog.sessions.map(s => s.at), [1500]);
  eq('stale totals do not come back', [m.prog.total, m.prog.correct], [0, 0]);
  eq('stale chapter stats and coverage do not come back', [Object.keys(m.chapStats).length, Object.keys(m.cov)], [0, ['f1']]);
  eq('stale wrong-bank items do not come back; new ones stay', m.wr.map(x => x.uid), ['f1_5']);
  eq('stale study days do not come back', m.stk.days, []);
  eq('bookmarks and flags are never touched by a reset', [m.bk.map(x => x.uid), m.fl.map(x => x.uid)], [['bk1', 'bk2'], ['fl1']]);
  eq('the marker travels with the merged copy', m.resets, { all: T });
  eq('merging the other way gives the same answer', ctx.merge(B, A).wr.map(x => x.uid), ['f1_5']);

  /* one chapter */
  const C = { prog: { sessions: [{ at: 10, fid: 'f1', chapter: 'C1' }, { at: 20, fid: 'f2', chapter: 'C2' }] }, chapStats: { C1: { attempted: 5, lastAt: 10 }, C2: { attempted: 7, lastAt: 20 } },
              cov: { f1: { p: '1', a: 1, c: 1, t: 10 }, f2: { p: '1', a: 1, c: 1, t: 20 } }, wr: [{ uid: 'f1_1', fileId: 'f1', _addedAt: 10 }, { uid: 'f2_1', fileId: 'f2', _addedAt: 20 }], resets: { ch: { f1: T * 0 + 100, C1: 100 } } };
  const mc = ctx.merge(C, null);
  eq('resetting one chapter removes only that chapter', [mc.prog.sessions.map(s => s.fid), Object.keys(mc.chapStats), Object.keys(mc.cov), mc.wr.map(x => x.uid)], [['f2'], ['C2'], ['f2'], ['f2_1']]);

  /* wrong bank only, and single removals */
  const D = { prog: { total: 9, correct: 4, sessions: [{ at: 10 }] }, wr: [{ uid: 'a', _addedAt: 10 }, { uid: 'b', _addedAt: 10 }, { uid: 'c', _addedAt: 10 }], resets: { rm: { b: 50 } } };
  eq('a question removed from the wrong bank stays removed after a merge', ctx.merge(D, { wr: [{ uid: 'b', _addedAt: 10 }] }).wr.map(x => x.uid), ['a', 'c']);
  eq('a question that is wrong again later is kept', ctx.merge(D, { wr: [{ uid: 'b', _addedAt: 90 }] }).wr.map(x => x.uid), ['a', 'c', 'b']);
  const mw = ctx.merge({ prog: D.prog, wr: D.wr, resets: { wr: 60 } }, null);
  eq('reset wrong bank clears the bank but keeps sessions and totals', [mw.wr.length, mw.prog.sessions.length, mw.prog.total], [0, 1, 9]);
  const me = ctx.merge({ prog: { sessions: [{ at: 10, mode: 'exam' }, { at: 11, mode: 'flashcard' }] }, resets: { exams: 100 } }, null);
  eq('reset exam history removes only exam sessions', me.prog.sessions.map(s => s.mode), ['flashcard']);
  eq('restarted sprint wins over the old start date', ctx.merge({ sprint: '2026-10-05', resets: { sprint: 5 } }, { sprint: '2026-08-01' }).sprint, '2026-10-05');
  eq('markers combine by taking the newest of each', ctx.mr({ all: 5, ch: { x: 1 } }, { all: 9, ch: { x: 3, y: 2 } }), { all: 9, ch: { x: 3, y: 2 } });
  eq('data with no markers merges exactly as before', ctx.merge({ wr: [{ uid: 'z' }] }, null).wr.length, 1);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: backend password rule + revision comparison (gas/code.gs)
   ═══════════════════════════════════════════════════════════════════════ */
group('Backend helpers');
(function gasTests(){
  const src = readFile('gas/code.gs');
  if (!src) { fail('gas/code.gs missing'); return; }
  const grab = (re) => { const m = src.match(re); return m ? m[0] : ''; };
  const code =
    grab(/const MIN_USER_PASSWORD_LENGTH\s*=\s*\d+;/) + '\n' +
    grab(/const COMMON_PASSWORDS_\s*=\s*\[[^\]]*\];/) + '\n' +
    grab(/function weakPasswordReason_[\s\S]*?\n}\n/) + '\n' +
    grab(/function _isoOf_[\s\S]*?\n}\n/) + '\n' +
    grab(/function _sameRevision_[\s\S]*?\n}\n/) + '\nreturn {weak: weakPasswordReason_, same: _sameRevision_};';
  let f;
  try { f = new Function(code)(); } catch (e) { fail('could not load backend helpers: ' + e.message); return; }
  const eq = (n, got, want) => got === want ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  eq('7-character password is rejected', !!f.weak('abc1234', 'sam'), true);
  eq('"12345678" is rejected as too common', !!f.weak('12345678', 'sam'), true);
  eq('"password" family is rejected', !!f.weak('Password123', 'sam'), true);
  eq('repeated characters are rejected', !!f.weak('aaaaaaaaa', 'sam'), true);
  eq('password containing the username is rejected', !!f.weak('ramesh-2026!', 'ramesh'), true);
  eq('a normal strong password is accepted', f.weak('tiger-Lamp-47', 'ramesh'), '');
  eq('short usernames are not used for the contains-check', f.weak('sam-tiger-47', 'sam'), '');
  eq('revisions match despite dropped milliseconds', f.same('2026-10-03T10:00:00.123Z', '2026-10-03T10:00:00Z'), true);
  eq('different revisions are a conflict', f.same('2026-10-03T10:00:00Z', '2026-10-03T10:05:00Z'), false);
  eq('empty vs real revision is a conflict', f.same('', '2026-10-03T10:00:00Z'), false);
  eq('Date objects from Sheets compare correctly', f.same(new Date('2026-10-03T10:00:00Z'), '2026-10-03T10:00:00.000Z'), true);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: frameThrottle (shared.js) collapses bursts of render calls
   ═══════════════════════════════════════════════════════════════════════ */
group('Render throttle');
(function throttleTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.frameThrottle=frameThrottle;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const frames = []; const schedule = f => frames.push(f);
  const flush = () => { while (frames.length) frames.shift()(); };
  const eq = (n, got, want) => got === want ? pass(n) : fail(`${n}: got ${got}, want ${want}`);

  let calls = [], r = 0;
  const f = ctx.frameThrottle(function (x) { calls.push(x); return ++r; }, schedule);
  eq('first call runs synchronously', f('a'), 1);
  f('b'); f('c'); f('d');
  eq('burst calls in the same frame are deferred', calls.length, 1);
  flush();
  eq('one trailing call runs after the frame', calls.length, 2);
  eq('trailing call uses the latest arguments', calls[1], 'd');
  flush();
  eq('no extra calls once the burst ends', calls.length, 2);
  f('e');
  eq('after the frame ends a new call runs immediately', calls.length, 3);
  flush();
  const g = ctx.frameThrottle(function () { throw new Error('boom'); }, schedule);
  let threw = false; try { g(); } catch (e) { threw = true; }
  flush();
  g.call && eq('a throwing render does not wedge the throttle', (() => { try { g(); } catch (e) { return 'ran'; } return 'ran'; })(), 'ran');
  eq('errors still propagate to the caller', threw, true);
  const obj = { n: 0, hit(){ this.n++; } };
  obj.hit = ctx.frameThrottle(obj.hit.bind(obj), schedule); obj.hit(); obj.hit(); flush();
  eq('bound methods keep their this across the trailing call', obj.n, 2);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: progress insights data (shared.js insightsData)
   ═══════════════════════════════════════════════════════════════════════ */
group('Progress insights');
(function insightTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.insightsData=insightsData;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const now = new Date(2026, 9, 10, 15, 0, 0);                       /* 10 Oct 2026, local */
  const at = (daysAgo, hour) => new Date(2026, 9, 10 - daysAgo, hour || 9).getTime();
  const sessions = [
    { at: at(0), total: 40, correct: 30, durationSec: 1200, pct: 75 },
    { at: at(0, 20), total: 10, correct: 5, durationSec: 300, pct: 50 },
    { at: at(2), total: 20, correct: 10, durationSec: 600, pct: 50 },
    { at: at(9), total: 30, correct: 24, durationSec: 900, pct: 80 },
    { at: 0, total: 99, correct: 99 }, null, { total: 5 }
  ];
  const d = ctx.insightsData(sessions, ['2026-10-09', '2026-10-10'], now);
  eq('14 days are returned, oldest first', [d.last14.length, d.last14[13].date, d.last14[0].date], [14, '2026-10-10', '2026-09-27']);
  eq('sessions on the same day are summed', [d.last14[13].q, d.last14[13].correct, d.last14[13].mins], [50, 35, 25]);
  eq('today is flagged', d.last14[13].isToday, true);
  eq('this week questions (days 8-14 of window)', d.weekQuestions, 70);
  eq('previous week questions', d.prevWeekQuestions, 30);
  eq('this week accuracy (45 correct of 70)', d.accWeek, 64);
  eq('previous week accuracy', d.accPrev, 80);
  eq('accuracy delta is week minus previous week', d.accDelta, -16);
  eq('study time this week in minutes', d.weekMinutes, 35);
  eq('trend is oldest to newest and ignores junk rows', d.recent.map(r => r.pct), [80, 50, 50, 75]);
  eq('streak counts days with study logged OR a session (Oct 8, 9, 10)', d.streak, 3);
  const e = ctx.insightsData(null, null, now);
  eq('no data gives zeros and nulls, no throw', [e.weekQuestions, e.accWeek, e.accDelta, e.streak, e.recent.length], [0, null, null, 0, 0]);
  const yest = ctx.insightsData([], ['2026-10-09', '2026-10-08'], now);
  eq("not studying yet today does not reset the streak", yest.streak, 2);
  const gap = ctx.insightsData([], ['2026-10-10', '2026-10-08'], now);
  eq('a missed day breaks the streak', gap.streak, 1);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Every local file a page, the service worker or the manifest points at
   must exist. This is what protects the folder layout from a typo.
   ═══════════════════════════════════════════════════════════════════════ */
group('File references resolve');
(function refTests(){
  const missing = [];
  const isLocal = u => u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:)/i.test(u);
  const check = (from, u) => {
    if (!isLocal(u)) return;
    const clean = u.split('#')[0].split('?')[0].replace(/^\.\//, '');
    if (!clean || clean.endsWith('/')) return;
    /* real disk path on purpose: the short-name map must not hide a stale reference */
    let ok = true; try { fs.accessSync(path.join(ROOT, clean)); } catch (e) { ok = false; }
    if (!ok) missing.push(from + ' -> ' + u);
  };
  ['index.html', 'user.html', 'admin.html', 'privacy.html', 'terms.html'].forEach(f => {
    const src = readFile(f) || '';
    const body = src.replace(/<!--[\s\S]*?-->/g, '');
    for (const m of body.matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)="([^"]+)"/gi)) check(f, m[1]);
  });
  const sw = readFile('sw.js') || '';
  for (const m of sw.matchAll(/importScripts\(\s*'([^']+)'/g)) check('sw.js importScripts', m[1]);
  const shellBlock = (sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '';
  for (const m of shellBlock.matchAll(/'(\.\/[^']+)'/g)) check('sw.js SHELL', m[1]);
  try {
    const man = JSON.parse(readFile('manifest.json'));
    (man.icons || []).forEach(i => check('manifest.json', i.src));
    (man.shortcuts || []).forEach(sh => (sh.icons || []).forEach(i => check('manifest shortcut', i.src)));
  } catch (e) { missing.push('manifest.json is not valid JSON'); }
  missing.length === 0 ? pass('all script/link/img, service-worker and manifest references exist') : missing.forEach(m => fail('missing file: ' + m));
})();


/* ═══════════════════════════════════════════════════════════════════════
   Navigation: user.html screens and js/core/nav.js must describe the same app
   ═══════════════════════════════════════════════════════════════════════ */
group('Navigation (nav.js)');
(function navTests(){
  const vm = require('vm');
  const ctx = { window: {}, document: { getElementById(){ return null; }, querySelectorAll(){ return []; }, querySelector(){ return null; } }, localStorage: { getItem(){ return null; }, setItem(){} } };
  try { vm.runInNewContext(readFile('nav.js') || readFile('js/core/nav.js'), ctx); } catch (e) { fail('nav.js failed to load: ' + e.message); return; }
  const NAV = ctx.window.NAV;
  if (!NAV) { fail('nav.js did not define window.NAV'); return; }
  const html = readFile('user.html') || '';
  const views = [...html.matchAll(/class="view(?: on)?" id="view-([a-z-]+)"/g)].map(m => m[1]);
  const navViews = NAV.ALL.filter(i => !i.special).map(i => i.view);
  const dup = navViews.filter((v, i) => navViews.indexOf(v) !== i);
  dup.length === 0 ? pass('no screen appears twice in the navigation') : fail('duplicate nav entries: ' + dup.join(', '));
  const unlisted = views.filter(v => v !== 'home' && navViews.indexOf(v) === -1);
  unlisted.length === 0 ? pass('every screen in user.html is reachable from the navigation') : fail('screens with no nav entry: ' + unlisted.join(', '));
  const dangling = navViews.filter(v => views.indexOf(v) === -1);
  dangling.length === 0 ? pass('every nav entry opens a screen that exists') : fail('nav entries with no screen: ' + dangling.join(', '));
  const noHead = navViews.filter(v => !NAV.HEADS[v]);
  noHead.length === 0 ? pass('every nav entry has a page header') : fail('no header text for: ' + noHead.join(', '));
  const placeholders = [...html.matchAll(/class="pg-head" data-head="([a-z-]+)"/g)].map(m => m[1]);
  const wrongHead = placeholders.filter(v => navViews.indexOf(v) === -1);
  wrongHead.length === 0 && placeholders.length >= navViews.length ? pass('page headers are generated from nav.js (' + placeholders.length + ')') : fail('header placeholders do not match the navigation');
  const staticHeads = (html.match(/<div class="pg-head">/g) || []).length;
  staticHeads === 0 ? pass('no hand-written page headers left to drift') : fail(staticHeads + ' hand-written pg-head blocks remain');
  const tabs = new Set(Object.keys(NAV.TABS).map(k => 'bn-' + k));
  const missingTab = [...tabs].filter(id => html.indexOf('id="' + id + '"') === -1);
  missingTab.length === 0 ? pass('every phone tab used by the navigation exists in the bottom bar') : fail('missing bottom-bar tabs: ' + missingTab.join(', '));
  const stale = NAV.ALL.filter(i => !i.special && NAV.tabForView(i.view) && !html.includes('id="' + NAV.tabForView(i.view) + '"'));
  stale.length === 0 ? pass('every screen maps to a real bottom-bar tab') : fail('screens mapped to a missing tab: ' + stale.map(i => i.view).join(', '));
  const sheetItems = Object.keys(NAV.TABS).reduce((n, k) => n + NAV.sheet(k).sections.reduce((m, sc) => m + sc.items.length, 0), 0);
  sheetItems === NAV.ALL.length ? pass('phone menus list exactly the same ' + sheetItems + ' items as the sidebar') : fail('phone menus list ' + sheetItems + ' items but the sidebar has ' + NAV.ALL.length);
  const ids = []; NAV.GROUPS.forEach(g => g.items.forEach(i => { if (i.hint) ids.push(i.hint.id); if (i.badge) ids.push(i.badge.id); if (i.count) ids.push(i.count.id); }));
  ids.length === new Set(ids).size ? pass('badge and hint element ids are unique') : fail('duplicate badge/hint ids');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Exams must not reveal marks while the paper is being taken. A running
   score lets a student see which answers were right after each tap. Marks
   (with negative marking) belong on the result page only.
   ═══════════════════════════════════════════════════════════════════════ */
group('No marks during an exam');
(function examLeakTests(){
  const html = readFile('user.html') || '';
  const bar = (html.match(/id="ex-bar"[\s\S]*?id="ex-qs"/) || [''])[0] || html;
  /\bex-lok\b|qt-lok|Loksewa score/i.test(html) ? fail('a live score tile is back in the exam bar') : pass('exam bar has no live score tile');
  const up = readFile('user-page.js') || '';
  /getElementById\('ex-lok/.test(up) ? fail('user-page.js still paints a live score') : pass('nothing paints a running score during the exam');
  const obj = readFile('objective.js') || '';
  const exAnswer = (obj.match(/exAnswer\s*\([^)]*\)\s*\{[\s\S]*?\n  \},/) || [''])[0];
  /toast\(|classList\.add\('(?:correct|wrong|ok|bad)'\)|\.score|0\.2/.test(exAnswer)
    ? fail('exAnswer shows correctness or marks while answering') : pass('answering in an exam shows no correctness or marks');
  /wrong \* 0\.2|wrong\*0\.2/.test(obj) ? pass('result page applies negative marking (−0.2 per wrong)') : fail('negative marking missing from results');
})();

group('Timed exam: unselect and clear response');
(function examClearTests(){
  const obj = readFile('objective.js') || '';
  /S\.quiz\.ans\[qi\]\s*===\s*oi\)\s*\?\s*null/.test(obj)
    ? pass('tapping the selected option again unselects it') : fail('exAnswer no longer toggles a selected option off');
  /clearAnswer\s*\(qi\)/.test(obj) && /ex-clear-\$\{qi\}/.test(obj)
    ? pass('every exam question has a Clear response button') : fail('Clear response button missing from exam cards');
  const html = readFile('user.html') || '';
  /\.ex-clear\[hidden\]/.test(html) ? pass('Clear response button hides when nothing is selected') : fail('.ex-clear[hidden] style missing');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Behaviour: weekly marks use Loksewa negative marking everywhere
   ═══════════════════════════════════════════════════════════════════════ */
group('Weekly negative marking');
(function weeklyMarkTests(){
  const src = readFile('gas/code.gs') || '';
  const grab = re => { const m = src.match(re); return m ? m[0] : ''; };
  const code = grab(/const WEEKLY_NEGATIVE_MARK\s*=\s*[\d.]+;/) + '\n' + grab(/function weeklyMarks_[\s\S]*?\n}\n/) + '\nreturn weeklyMarks_;';
  let f; try { f = new Function(code)(); } catch (e) { fail('weeklyMarks_ failed to load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  /* 10 questions: 5 right, 3 wrong, 2 skipped -> 5 - 0.6 = 4.4 */
  eq('5 right, 3 wrong, 2 skipped = 4.4 marks (44%)', [f(5, 2, 10).marks, f(5, 2, 10).pct, f(5, 2, 10).wrong], [4.4, 44, 3]);
  eq('all right = 100%', f(10, 0, 10).pct, 100);
  eq('skipped questions cost nothing', f(4, 6, 10).pct, 40);
  eq('wrong answers cost 0.2 each', f(0, 0, 10).marks, -2);
  eq('a negative total is shown as 0% (not -20%)', f(0, 0, 10).pct, 0);
  eq('ranking still sees the exact negative score', f(0, 0, 10).exactPct, -20);
  eq('no questions does not divide by zero', f(0, 0, 0).pct, 0);
  eq('correct is capped at the total', f(99, 0, 10).marks, 10);
  eq('raw percentage is no longer used for weekly rankings', /const pct = total \? \(correct \/ total\) \* 100 : 0;\s*\n\s*scores\.push/.test(src), false);
  const obj = readFile('objective.js') || '';
  eq('weekly, daily and hourly headlines are negative-marked', /const isLoksewa = isLoksewaFormat\(S\.quiz\.scope\)/.test(obj), true);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Admin navigation: rail, titles, permissions and page headings agree
   ═══════════════════════════════════════════════════════════════════════ */
group('Admin navigation');
(function adminNavTests(){
  const vm = require('vm');
  const ctx = { window: {}, document: { getElementById(){ return null; } } };
  try { vm.runInNewContext(readFile('js/core/admin-nav.js'), ctx); } catch (e) { fail('admin-nav.js failed to load: ' + e.message); return; }
  const N = ctx.window.ADMIN_NAV; if (!N) { fail('admin-nav.js did not define ADMIN_NAV'); return; }
  const html = readFile('admin.html') || '';
  const views = [...html.matchAll(/<section class="view(?: on)?" id="view-([a-z-]+)"/g)].map(m => m[1]);
  const navViews = N.ALL.map(i => i.view);
  const dup = navViews.filter((v, i) => navViews.indexOf(v) !== i);
  dup.length === 0 ? pass('no admin section appears twice') : fail('duplicate admin nav entries: ' + dup.join(', '));
  const unlisted = views.filter(v => navViews.indexOf(v) === -1);
  unlisted.length === 0 ? pass('every admin screen is reachable from the rail') : fail('admin screens with no rail entry: ' + unlisted.join(', '));
  const dangling = navViews.filter(v => views.indexOf(v) === -1);
  dangling.length === 0 ? pass('every rail entry opens a screen that exists') : fail('rail entries with no screen: ' + dangling.join(', '));
  const bad = [];
  N.ALL.forEach(i => {
    const m = html.match(new RegExp('id="view-' + i.view + '"[\\s\\S]*?<h1>([^<]*)</h1>'));
    if (!m) { bad.push(i.view + ' (no <h1>)'); return; }
    const h = m[1].replace(/&amp;/g, '&').trim();
    if (h !== i.label) bad.push(i.view + ': heading "' + h + '" vs rail "' + i.label + '"');
  });
  bad.length === 0 ? pass('each admin page heading matches its rail label') : bad.forEach(b => fail('heading mismatch: ' + b));
  /UI = \{[\s\S]{0,200}TITLES: ADMIN_NAV\.TITLES/.test(html) ? pass('UI.TITLES and UI.FEATURES come from admin-nav.js') : fail('UI still defines its own TITLES/FEATURES');
  /<div class="rail-group">/.test(html) ? fail('hand-written rail groups are back in admin.html') : pass('no hand-written rail left to drift');
  const badges = N.ALL.filter(i => i.badge).map(i => i.badge);
  const used = badges.filter(b => new RegExp("['\"]" + b + "['\"]|getElementById\\(['\"]" + b).test(html) || html.indexOf(b) !== -1);
  used.length === badges.length ? pass('rail badge ids are referenced by the admin code') : fail('unused badge ids: ' + badges.filter(b => used.indexOf(b) === -1).join(', '));
})();


/* ═══════════════════════════════════════════════════════════════════════
   Login page: one way between Sign in and Create account (the tabs). The
   tabs are shown in exactly those two modes, so a second link under each
   form only repeated them.
   ═══════════════════════════════════════════════════════════════════════ */
group('Login page');
(function loginTests(){
  const html = readFile('index.html') || '';
  /New to Abhyas\?|Already registered\?/.test(html) ? fail('duplicate sign-in/create-account link rows are back') : pass('no duplicate sign-in / create-account links under the forms');
  /id="auth-tabs"/.test(html) ? pass('the Sign in / Create account tabs are present') : fail('auth tabs missing');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Study PDFs (admin uploads, student reads): backend rules
   ═══════════════════════════════════════════════════════════════════════ */
group('Study PDFs backend');
(function studyDocTests(){
  const src = readFile('gas/code.gs') || '';
  const grab = re => { const m = src.match(re); return m ? m[0] : ''; };
  const code = grab(/function sanitizeSheetField_[\s\S]*?\n}\n/) + '\n' + grab(/const STUDYDOC_CATEGORIES\s*=\s*\[[^\]]*\];/) + '\n' + grab(/function normalizeStudyDocMeta_[\s\S]*?\n}\n/) + '\n' +
    grab(/function rowToStudyDoc_[\s\S]*?\n}\n/) + '\n' + grab(/function sortStudyDocs_[\s\S]*?\n}\n/) +
    '\nreturn {norm: normalizeStudyDocMeta_, row: rowToStudyDoc_, sort: sortStudyDocs_, cats: STUDYDOC_CATEGORIES};';
  let f; try { f = new Function(code)(); } catch (e) { fail('study-doc helpers failed to load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

  eq('an upload without a title is rejected', !!f.norm({ title: '   ' }, true).error, true);
  eq('a title that looks like a spreadsheet formula is neutralised', f.norm({ title: '=HYPERLINK("http://x")' }, true).value.title.charAt(0), "'");
  eq('so is a description', f.norm({ title: 'A', description: '+cmd' }, true).value.description.charAt(0), "'");
  eq('an unknown category is rejected', !!f.norm({ title: 'A', category: 'virus' }, true).error, true);
  eq('category defaults to model-answer', f.norm({ title: 'A' }, true).value.category, 'model-answer');
  eq('category is case-insensitive', f.norm({ title: 'A', category: 'NOTES' }, true).value.category, 'notes');
  eq('title whitespace is collapsed and capped at 120', f.norm({ title: '  a   b  ' + 'x'.repeat(200) }, true).value.title.length, 120);
  eq('chapter id keeps only safe characters', f.norm({ title: 'A', chapterId: "ch 1;<script>" }, true).value.chapterId, 'ch1script');
  eq('description is one line, max 400', f.norm({ title: 'A', description: 'a\nb' + 'x'.repeat(500) }, true).value.description.length, 400);
  eq('sort order defaults to 100 and is clamped', [f.norm({ title: 'A' }, true).value.sortOrder, f.norm({ title: 'A', sortOrder: -5 }, true).value.sortOrder, f.norm({ title: 'A', sortOrder: 99999 }, true).value.sortOrder], [100, 0, 9999]);
  eq('an edit may keep the title untouched', !!f.norm({}, false).error, false);

  const row = ['id1', 'Soil answers', 'model-answer', 'soil', 'desc', 'DRIVEFILEID', 'a.pdf', 12345, 'published', 5, 'owner', 1000, 2000];
  const stu = f.row(row, false), adm = f.row(row, true);
  eq('students never receive the Drive file id', JSON.stringify(stu).indexOf('DRIVEFILEID'), -1);
  eq('admins see whether a file exists, not its id', [adm.hasFile, JSON.stringify(adm).indexOf('DRIVEFILEID')], [true, -1]);
  eq('a blank sort order falls back to 100', f.row(['i', 't', 'notes', '', '', 'F', 'a.pdf', 1, 'published', '', 'o', 1, 1], false).sortOrder, 100);

  const docs = [{ id: 'a', sortOrder: 100, uploadedAt: 1 }, { id: 'b', sortOrder: 100, uploadedAt: 9 }, { id: 'c', sortOrder: 1, uploadedAt: 0 }];
  eq('lowest sort order first, then newest upload', f.sort(docs).map(d => d.id), ['c', 'b', 'a']);

  eq('students cannot list hidden or fileless documents', /d\.status === "published" && String\(data\[i\]\[5\]/.test(src), true);
  eq('student endpoints check the paywall', /function listStudyDocs[\s\S]*?requireAccess_\(auth\)[\s\S]*?function getStudyDocPdf[\s\S]*?requireAccess_\(auth\)/.test(src), true);
  eq('manage endpoints check studydocs_manage', ['adminAddStudyDoc', 'adminUpdateStudyDoc', 'adminDeleteStudyDoc'].every(fn => new RegExp('function ' + fn + '[\\s\\S]*?checkAdminCan_\\(p, "studydocs_manage"\\)').test(src)), true);
  eq('every study-doc action is wired into the dispatcher', ['liststudydocs', 'getstudydocpdf', 'adminliststudydocs', 'adminaddstudydoc', 'adminupdatestudydoc', 'admindeletestudydoc', 'admindownloadstudydoc'].every(a => src.indexOf('case "' + a + '"') !== -1), true);
  eq('both permissions exist in FEATURES', /studydocs_view:/.test(src) && /studydocs_manage:/.test(src), true);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Study PDFs: student-side helpers (shared.js) and screen wiring
   ═══════════════════════════════════════════════════════════════════════ */
group('Study PDFs student side');
(function studyDocClientTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.f=studyDocsFilter;this.n=studyDocsNewIds;this.c=studyDocsCategories;this.b=formatBytes;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const docs = [
    { id: 'a', title: 'Soil Mechanics answers', description: 'last five years', category: 'model-answer' },
    { id: 'b', title: 'Hydrology notes', description: '', category: 'notes' },
    { id: 'c', title: 'PSC 2080 paper', description: 'Soil section included', category: 'past-paper' }
  ];
  eq('no filter keeps everything in order', ctx.f(docs, {}).map(d => d.id), ['a', 'b', 'c']);
  eq('category filter', ctx.f(docs, { cat: 'notes' }).map(d => d.id), ['b']);
  eq('search matches title or description, any case', ctx.f(docs, { q: 'SOIL' }).map(d => d.id), ['a', 'c']);
  eq('every search word must match', ctx.f(docs, { q: 'soil paper' }).map(d => d.id), ['c']);
  eq('search also matches the category label', ctx.f(docs, { q: 'past papers' }).map(d => d.id), ['c']);
  eq('category and search combine', ctx.f(docs, { cat: 'model-answer', q: 'soil' }).map(d => d.id), ['a']);
  eq('junk input gives an empty list, no throw', [ctx.f(null, {}).length, ctx.f([null], {}).length], [0, 0]);
  eq('docs not yet seen are new', ctx.n(docs, ['a']), ['b', 'c']);
  eq('nothing is new when all were seen', ctx.n(docs, ['a', 'b', 'c']), []);
  eq('chips only list categories that have documents', ctx.c(docs).map(x => x.category + ':' + x.count), ['model-answer:1', 'notes:1', 'past-paper:1']);
  eq('file sizes read naturally', [ctx.b(900), ctx.b(480000), ctx.b(2300000)], ['900 B', '469 KB', '2.2 MB']);

  const up = readFile('user-page.js') || '';
  eq('opening the screen loads the list', /UI\.onEnter\('studydocs'/.test(up), true);
  eq('offline copies of hidden/deleted documents are purged', /_purgeStale\(\)/.test(up) && /live\.has\(x\.id\)/.test(up), true);
  eq('the PDF fetch goes through the paywalled endpoint', /action:'getStudyDocPdf'/.test(up), true);
  eq('no Drive link is ever built on the student side', /drive\.google\.com|\.getUrl|webViewLink/.test(up.slice(up.indexOf('window.STUDYDOCS'), up.indexOf('window.SPRINT'))), false);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Permissions: every key the code checks must exist, and every key must be
   switchable in the "Add an admin" screen (otherwise nobody but the owner
   could ever use that feature).
   ═══════════════════════════════════════════════════════════════════════ */
group('Admin permissions');
(function permTests(){
  const gas = readFile('gas/code.gs') || '', adm = readFile('admin.html') || '';
  const block = (gas.match(/const FEATURES = \{([\s\S]*?)\n\};/) || [])[1] || '';
  const keys = [...block.matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]);
  keys.length > 10 ? pass(keys.length + ' permission keys defined') : fail('could not read FEATURES');
  const used = new Set([...gas.matchAll(/checkAdminCan_\(p, "([a-z_]+)"\)/g)].map(m => m[1]));
  const unknown = [...used].filter(k => keys.indexOf(k) === -1);
  unknown.length === 0 ? pass('every permission the backend checks is defined') : fail('checked but not defined: ' + unknown.join(', '));
  const perm = new Set([...adm.matchAll(/data-perm="([a-z_]+)"/g)].map(m => m[1]));
  const unknownPerm = [...perm].filter(k => keys.indexOf(k) === -1);
  unknownPerm.length === 0 ? pass('every data-perm in admin.html is a defined permission') : fail('data-perm with no permission: ' + unknownPerm.join(', '));
  const groups = (adm.match(/GROUPS: \[([\s\S]*?)\n  \],/) || [])[1] || '';
  const inUi = new Set([...groups.matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
  /* admins_manage is deliberately NOT grantable: every endpoint that checks it also
     requires the owner role. The check below makes sure that stays true, so this
     exemption cannot hide a real gap. */
  const OWNER_ONLY = ['admins_manage'];
  const ownerOnlyEnforced = OWNER_ONLY.every(k => {
    const fns = [...gas.matchAll(new RegExp('function (\\w+)\\(p\\) \\{\\s*const chk = checkAdminCan_\\(p, "' + k + '"\\);([\\s\\S]*?)\\n\\}\\n', 'g'))];
    return fns.length > 0 && fns.every(m => /chk\.role !== ADMIN_ROLE_OWNER/.test(m[2].slice(0, 400)));
  });
  ownerOnlyEnforced ? pass('owner-only permissions are enforced by role in every endpoint that uses them') : fail('an owner-only permission is checked without a role check');
  const hidden = keys.filter(k => !inUi.has(k) && OWNER_ONLY.indexOf(k) === -1);
  hidden.length === 0 ? pass('every grantable permission can be switched on in the admin editor') : fail('permissions the owner cannot grant: ' + hidden.join(', '));
  const navFeatures = [...new Set(readFile('js/core/admin-nav.js').match(/feature:\s*(?:'[a-z_]+'|\[[^\]]*\])/g).join(' ').match(/[a-z]+_[a-z]+|dashboard|imports|maintenance/g))];
  const badNav = navFeatures.filter(k => keys.indexOf(k) === -1);
  badNav.length === 0 ? pass('every rail entry needs a permission that exists') : fail('rail entries need unknown permission: ' + badNav.join(', '));
})();

group('Study PDFs admin side');
(function studyAdminTests(){
  const adm = readFile('admin.html') || '';
  const eq = (n, got) => got ? pass(n) : fail(n);
  eq('admin has the Study PDFs screen', /id="view-studydocs"/.test(adm));
  eq('upload button needs studydocs_manage', /data-perm="studydocs_manage" onclick="STUDYDOCS\.openUpload\(\)"/.test(adm));
  eq('upload checks size and type before sending', /f\.size > this\.MAX_BYTES/.test(adm) && /not a PDF/.test(adm));
  eq('opening the screen loads the list', /if \(id === 'studydocs'\) STUDYDOCS\.load\(\)/.test(adm));
  eq('admin permission map is built from the one nav list', /ADMIN_NAV\.ALL\.forEach\(it => \{ map\['nav-' \+ it\.view\]/.test(adm));
  eq('delete asks for confirmation first', /CONFIRM\.ask\(\{ title: 'Delete this PDF\?'/.test(adm));
})();


group('Study PDFs chapter links');
(function chapterLinkTests(){
  const vm = require('vm');
  const ctx = { window: { SUBJECTIVE_CHAPTERS: [{ id: 'geotech', name: 'Geotechnical Engineering' }], addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.fc=studyDocsForChapter;this.cn=subjChapterName;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const docs = [{ id: 'a', chapterId: 'geotech' }, { id: 'b', chapterId: '' }, { id: 'c', chapterId: 'geotech' }, { id: 'd', chapterId: 'structure' }];
  eq('documents for one chapter, in order', ctx.fc(docs, 'geotech').map(d => d.id), ['a', 'c']);
  eq('a blank chapter matches nothing (untied PDFs are not shown as chapter answers)', ctx.fc(docs, '').length, 0);
  eq('an unknown chapter matches nothing', ctx.fc(docs, 'nope').length, 0);
  eq('bad input does not throw', [ctx.fc(null, 'x').length, ctx.fc([null], 'x').length], [0, 0]);
  eq('chapter name lookup', [ctx.cn('geotech'), ctx.cn('nope')], ['Geotechnical Engineering', '']);
  const up = readFile('user-page.js') || '', adm = readFile('admin.html') || '';
  eq('the model-answer button is only drawn when a matching PDF exists', /modelDocs\.length\s*\?/.test(up), true);
  eq('admin can tie a PDF to a written-answer chapter', /id="sd-chap"/.test(adm) && /chapterId: \$\('sd-chap'\)\.value/.test(adm), true);
  eq('hiding or showing a PDF keeps its chapter', /chapterId: d\.chapterId, description: d\.description, sortOrder: d\.sortOrder, status/.test(adm), true);
})();


/* ═══════════════════════════════════════════════════════════════════════
   Backend authentication audit. Every action the dispatcher accepts must
   call authUser_ / checkAdminCan_ / checkAdmin_ itself, except this short
   list of public ones. A new endpoint cannot be added by accident without
   either a check or a deliberate edit to this list.
   ═══════════════════════════════════════════════════════════════════════ */
group('Backend authentication audit');
(function authAudit(){
  const src = readFile('gas/code.gs') || '';
  const PUBLIC = ['login', 'googlelogin', 'signup', 'logclienterror', 'requestpasswordreset', 'resetpassword', 'getpublicinfo', 'getsettings', 'adminlogin'];
  const cases = [...src.matchAll(/case "([a-z]+)":\s*result = (\w+)\(/g)].map(m => ({ action: m[1], fn: m[2] }));
  cases.length > 60 ? pass(cases.length + ' backend actions found') : fail('could not read the dispatcher');
  const body = name => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i); const st = j; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(st, j + 1); };
  const DIRECT = /\b(authUser_|checkAdminCan_|checkAdmin_)\s*\(/;
  const open = cases.filter(c => PUBLIC.indexOf(c.action) === -1 && !DIRECT.test(body(c.fn))).map(c => c.action + ' -> ' + c.fn);
  open.length === 0 ? pass('every non-public action checks who is calling') : open.forEach(o => fail('action without an auth check: ' + o));
  const stale = PUBLIC.filter(a => !cases.some(c => c.action === a));
  stale.length === 0 ? pass('the public list matches real actions') : fail('public list names missing actions: ' + stale.join(', '));
  /* Self-service actions: any signed-in admin acts on their OWN account only, so they use
     checkAdmin_ on purpose (checkAdminCan_ would also block the forced first-login password change). */
  const SELF = ['adminswitchfromuser', 'adminchangepassword', 'adminlistadmins'];
  const adminNoPerm = cases.filter(c => /^admin/.test(c.action) && PUBLIC.indexOf(c.action) === -1 && SELF.indexOf(c.action) === -1 && !/checkAdminCan_/.test(body(c.fn))).map(c => c.action);
  adminNoPerm.length === 0 ? pass('every other admin action checks a specific permission') : fail('admin actions without a permission check: ' + adminNoPerm.join(', '));
  const cp = body('adminChangePassword');
  /verifyPassword_\(currentPassword/.test(cp) && /findAdminRow_\(sheet, actor\)/.test(cp)
    ? pass('changing an admin password needs the current password and only touches your own account') : fail('adminChangePassword is not limited to the caller or skips the current password');
  const la = body('adminListAdmins');
  /!isOwner && uname\.toLowerCase\(\) !== actor\.toLowerCase\(\)\) continue/.test(la)
    ? pass('non-owners only see their own row in the admin list') : fail('adminListAdmins shows every admin to non-owners');
  const sw = body('adminSwitchFromUser');
  /authUser_|checkSession|token/.test(sw) ? pass('the student-to-admin switch verifies the student session') : fail('adminSwitchFromUser does not verify the session');
  const postOnly = (src.match(/const POST_ONLY_ACTIONS = \{([\s\S]*?)\};/) || [])[1] || '';
  ['login', 'googlelogin', 'signup', 'resetpassword', 'adminlogin'].every(a => new RegExp('\\b' + a + ':').test(postOnly)) ? pass('credential actions are POST-only') : fail('a credential action can be sent by GET');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Colour contrast of the theme tokens (WCAG AA: 4.5:1 for normal text).
   Checked from the CSS itself, so no browser is needed. A real-browser axe
   audit of every screen found no violations at v1.32; this keeps the tokens
   from drifting back.
   ═══════════════════════════════════════════════════════════════════════ */
group('Colour contrast');
(function contrastTests(){
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const tokensOf = (html, theme) => {
    const out = {};
    const blocks = [...html.matchAll(/(:root[^{}]*|\.dark[^{}]*)\{([^{}]*)\}/g)];
    const apply = sel => blocks.filter(b => sel(b[1].trim())).forEach(b => { for (const m of b[2].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2]; });
    if (theme === 'dark') { apply(sel => sel === ':root' ); apply(sel => /^\.dark\b/.test(sel) || /^:root\.dark\b/.test(sel)); }
    else { apply(sel => sel === ':root'); apply(sel => sel === ':root:not(.dark)'); }
    return out;
  };
  const bad = [], checked = [];
  [['user.html'], ['admin.html'], ['index.html']].forEach(([f]) => {
    const html = readFile(f) || '';
    ['light', 'dark'].forEach(theme => {
      const t = tokensOf(html, theme);
      const bgs = ['--bg', '--surface', '--bg-sunken'].filter(k => t[k]);
      ['--ink', '--ink-2', '--ink-3'].forEach(ink => {
        if (!t[ink]) return;
        bgs.forEach(bg => { const r = ratio(t[ink], t[bg]); checked.push(1); if (r < 4.5) bad.push(`${f} ${theme}: ${ink} ${t[ink]} on ${bg} ${t[bg]} = ${r.toFixed(2)}`); });
      });
      if (t['--on-accent'] && t['--accent']) { const r = ratio(t['--on-accent'], t['--accent']); checked.push(1); if (r < 4.5) bad.push(`${f} ${theme}: button text ${t['--on-accent']} on accent ${t['--accent']} = ${r.toFixed(2)}`); }
      if (theme === 'dark' && t['--accent'] && t['--surface']) { const r = ratio(t['--accent'], t['--surface']); checked.push(1); if (r < 4.5) bad.push(`${f} dark: accent text on surface = ${r.toFixed(2)}`); }
      /* status colours as text on their own tinted banner (the tint is rgba in the dark theme, so it is composited over the surface) */
      const rgba = (name) => { const m = (html.match(new RegExp(name + '\\s*:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)', 'g')) || []).pop(); if (!m) return null; const n = m.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/); return n ? [+n[1], +n[2], +n[3], +n[4]] : null; };
      const over = (c, bgHex) => '#' + [0, 1, 2].map(i => Math.round(c[3] * c[i] + (1 - c[3]) * parseInt(bgHex.slice(1 + i * 2, 3 + i * 2), 16)).toString(16).padStart(2, '0')).join('');
      ['danger', 'warning', 'success', 'violet'].forEach(k => {
        const fg = t['--' + k + '-ink'] || t['--' + k]; if (!fg) return;
        let soft = t['--' + k + '-soft'];
        /* in the dark theme the tint is declared as rgba(), which the hex reader above skipped, so a light-theme hex may have been inherited: prefer the rgba tint */
        if (theme === 'dark') { const c = rgba('--' + k + '-soft'); if (c && t['--surface']) soft = over(c, t['--surface']); }
        if (!soft) return;
        const r = ratio(fg, soft); checked.push(1);
        if (r < 4.5) bad.push(`${f} ${theme}: ${k} text ${fg} on its tinted background ${soft} = ${r.toFixed(2)}`);
      });
      if (theme === 'light' && t['--accent-ink'] && t['--accent-soft']) { const r = ratio(t['--accent-ink'], t['--accent-soft']); checked.push(1); if (r < 4.5) bad.push(`${f} light: tinted-button text = ${r.toFixed(2)}`); }
    });
  });
  checked.length > 30 ? pass(checked.length + ' text/background pairs checked across 3 pages x 2 themes') : fail('contrast test read too few tokens (' + checked.length + ')');
  bad.length === 0 ? pass('every text token meets 4.5:1 on its backgrounds') : bad.forEach(b => fail('low contrast: ' + b));

  const adm = readFile('js/core/admin-nav.js') || '';
  /aria-label="' \+ esc\(it\.label\)/.test(adm) ? pass('icon-only admin rail buttons carry an accessible name') : fail('admin rail buttons have no aria-label');
  const index = readFile('index.html') || '';
  /\.foot a/.test(index) && /text-decoration:underline/.test(index) ? pass('links inside sentences are underlined') : fail('in-text links rely on colour alone');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Offline: the service worker precaches only what is on its SHELL list. A page
   that loads a script missing from that list breaks offline after a first
   visit (user-page.js, the biggest student script, was missing).
   ═══════════════════════════════════════════════════════════════════════ */
group('Offline precache');
(function shellTests(){
  const sw = readFile('sw.js') || '';
  const block = (sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || '';
  const shell = new Set([...block.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
  shell.size > 30 ? pass('the SHELL lists ' + shell.size + ' files') : fail('could not read SHELL');
  const missing = [];
  ['index.html', 'user.html', 'privacy.html', 'terms.html'].forEach(page => {
    const html = (readFile(page) || '').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)="([^"]+)"/gi)) {
      const u = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(u)) continue;
      const clean = u.split('#')[0].split('?')[0].replace(/^\.\//, '');
      if (!clean || clean.endsWith('/') || /\.html$/.test(clean)) continue;
      if (!shell.has(clean)) missing.push(page + ' loads ' + clean);
    }
  });
  missing.length === 0 ? pass('every script, stylesheet and image the public pages load is precached') : missing.forEach(m => fail('not in the offline cache: ' + m));
  /admin/.test(block) && /admin\.html'/.test(block) ? fail('admin.html must never be precached') : pass('admin.html is kept out of the offline cache');
  /admin-nav\.js/.test(block) ? fail('admin-only script must not be precached') : pass('admin-only scripts are kept out of the offline cache');
})();


/* ═══════════════════════════════════════════════════════════════════════
   Apps Script: all .gs files share ONE global scope. A name defined twice
   (a function in two files, or twice in one) silently overrides the first.
   ═══════════════════════════════════════════════════════════════════════ */
group('Apps Script global names');
(function gasNames(){
  const files = ['code.gs', 'setup.gs', 'private-files.gs', 'content-index.gs', 'debug.gs'];
  const seen = {}; const dups = [];
  files.forEach(f => {
    const src = readFile('gas/' + f) || '';
    for (const m of src.matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/gm)) {
      const name = m[1] || m[2];
      if (seen[name]) dups.push(`${name} (${seen[name]} and ${f})`); else seen[name] = f;
    }
  });
  Object.keys(seen).length > 300 ? pass(Object.keys(seen).length + ' global names across 5 files') : fail('could not read the .gs files');
  dups.length === 0 ? pass('no global name is defined twice') : dups.forEach(d => fail('defined twice: ' + d));
})();


group('Backend: cloud copy rules');
(function cloudRuleTests(){
  const src = readFile('gas/code.gs') || '';
  const grab = re => { const m = src.match(re); return m ? m[0] : ''; };
  const code = grab(/const PROGRESS_HISTORY_MIN_GAP_MS\s*=\s*[^;]+;/) + '\n' + grab(/const PROGRESS_GZ_PREFIX\s*=\s*"[^"]+";/) + '\n' +
    grab(/function isAcceptableProgressData_[\s\S]*?\n}\n/) + '\n' + grab(/function shouldArchiveProgress_[\s\S]*?\n}\n/) + '\nreturn {ok: isAcceptableProgressData_, arch: shouldArchiveProgress_};';
  let f; try { f = new Function(code)(); } catch (e) { fail('cloud rule helpers failed to load: ' + e.message); return; }
  const eq = (n, got, want) => got === want ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  eq('plain JSON is accepted', f.ok('{"wr":[]}'), true);
  eq('a compressed copy is accepted', f.ok('gz1:H4sIAAAAAAAAA6tWKkktLlGyUlAqS8wpTVWqBQBnqZ0nGQAAAA=='), true);
  eq('text that is neither is refused', f.ok('hello'), false);
  eq('a "gz1:" copy with junk characters is refused', f.ok('gz1:<script>alert(1)</script>xxxxxxxxxx'), false);
  eq('an empty "gz1:" copy is refused', f.ok('gz1:'), false);
  eq('empty is refused', f.ok(''), false);

  const big = 'x'.repeat(1000), HOUR = 3600e3;
  eq('the first replaced copy is always kept', f.arch(big, 10 * HOUR, big + 'y', '', 0), true);
  eq('a copy only minutes after the newest kept one is not kept again', f.arch(big, 10 * HOUR + 5 * 60e3, big + 'y', 'older' + big, 10 * HOUR), false);
  eq('a copy 30+ minutes after the newest kept one is kept', f.arch(big, 11 * HOUR, big + 'y', 'older' + big, 10 * HOUR), true);
  eq('a copy about to be replaced by a much smaller one is kept, even if recent', f.arch(big, 10 * HOUR + 60e3, 'x'.repeat(300), 'older' + big, 10 * HOUR), true);
  eq('the same copy is never stored twice', f.arch(big, 12 * HOUR, big + 'y', big, 10 * HOUR), false);
  eq('tiny placeholder copies are ignored', f.arch('{}', 12 * HOUR, '{"a":1}', '', 0), false);

  eq('saving archives the old copy BEFORE overwriting it', /_archivePreviousProgress_\(username, found\.row\[1\], found\.row\[2\], dataStr\);\s*\n\s*sheet\.getRange\(found\.rowIndex, 2, 1, 2\)/.test(src), true);
  eq('a failing archive can never block a save', /function _archivePreviousProgress_[\s\S]*?catch \(e\) \{/.test(src), true);
  eq('history endpoint is wired and asks who is calling', /case "getprogresshistory"/.test(src) && /function getProgressHistory\(p\) \{\s*const auth = authUser_\(p\);/.test(src), true);
  eq('the history sheet is deleted with the account', /PROGRESS_HISTORY_SHEET, getProgressHistorySheet_/.test(src), true);
})();


group('Question corrections (pure rules)');
(function correctionRuleTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.m=matchCorrectedQuestion;this.l=applyCorrectionsToList;this.sim=qSimilarity;this.sec=reportSection;this.ch=questionContentChanged;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const Q = (i, text, correct, extra) => Object.assign({ uid: 'F_' + i, fileId: 'F', q: text, options: ['a', 'b', 'c', 'd'], correct, explanation: '' }, extra || {});
  const T = ['Bearing capacity of a shallow footing depends on which soil property', 'The unit weight of water in kN per cubic metre is', 'Poisson ratio of concrete usually lies between', 'Slump test measures the workability of fresh concrete'];

  /* 1. the answer key was corrected */
  const fresh = [Q(0, T[0], 1), Q(1, T[1], 2), Q(2, T[2], 3), Q(3, T[3], 0)];
  const saved = Q(1, T[1], 0, { _streak: 2, _nextDue: 777, tag: 'formula', _note: 'mine' });
  let r = ctx.l([saved], 'F', fresh, 5000);
  eq('a corrected answer replaces the old one in a saved copy', r.list[0].correct, 2);
  eq('and the saved copy is counted as updated', [r.updated, r.moved, r.withdrawn], [1, 0, 0]);
  eq('review progress is kept (streak, due date, tag, note)', [r.list[0]._streak, r.list[0]._nextDue, r.list[0].tag, r.list[0]._note], [2, 777, 'formula', 'mine']);
  eq('it is marked as corrected so the student can be told', r.list[0]._corrected, 5000);
  eq('the original list is not modified', saved.correct, 0);

  /* 2. a typo fix in the question text still matches */
  r = ctx.l([Q(0, 'Bearing capacity of a shalow footing depends on which soil property', 1)], 'F', fresh, 1);
  eq('a small text fix is still the same question', [r.list[0].q, r.withdrawn], [T[0], 0]);

  /* 3. questions inserted before it: found where it moved to */
  const shifted = [Q(0, 'A brand new question about retaining walls and earth pressure', 0), Q(1, T[0], 1), Q(2, T[1], 2)];
  r = ctx.l([Q(0, T[0], 3), Q(1, T[1], 0)], 'F', shifted, 1);
  eq('a question that moved is found at its new place', r.list.map(x => x.uid + ':' + x.correct), ['F_1:1', 'F_2:2']);
  eq('moves are counted', r.moved, 2);

  /* 4. a different question at the same position is never overwritten */
  r = ctx.l([Q(1, 'Which admixture is used to delay the setting of cement', 1)], 'F', [Q(0, T[0], 1), Q(1, T[1], 2)], 1);
  eq('a saved question that is no longer in the file is marked withdrawn, not deleted', [r.list.length, r.list[0]._withdrawn, r.list[0].q], [1, true, 'Which admixture is used to delay the setting of cement']);
  eq('and it keeps its old content', r.list[0].correct, 1);

  /* 5. two saved copies that now point at one question are merged, nothing else is dropped */
  r = ctx.l([Q(0, T[0], 3), Q(5, T[0], 3), Q(2, T[2], 0)], 'F', [Q(0, T[0], 1), Q(1, 'x', 0), Q(2, T[2], 3)], 1);
  eq('duplicates collapse to one', r.list.map(x => x.uid), ['F_0', 'F_2']);
  eq('and are counted', r.merged, 1);

  /* 6. other files and bad downloads */
  const other = Q(0, T[0], 3, { uid: 'G_0', fileId: 'G' });
  eq('questions from other files are untouched', ctx.l([other], 'F', fresh, 1).list[0], other);
  eq('an empty download changes nothing', ctx.l([saved], 'F', [], 1).list[0], saved);
  eq('a failed download (not a list) changes nothing', ctx.l([saved], 'F', null, 1).list[0], saved);
  const many = [0, 1, 2, 3, 4].map(i => Q(i, 'Some question number ' + i + ' about footings and piles', 0));
  r = ctx.l(many, 'F', [Q(0, 'completely unrelated words here', 0)], 1);
  eq('if most saved questions "vanish" it is treated as a bad download and nothing is marked', r.withdrawn, 0);

  /* 7. weekly papers must keep their length so answers line up */
  r = ctx.l([Q(0, T[0], 3), Q(5, T[0], 3)], 'F', [Q(0, T[0], 1)], 1, { keepAll: true });
  eq('keepAll never merges or drops', r.list.length, 2);

  /* 8. helpers */
  eq('identical text is fully similar, unrelated text is not', [ctx.sim('a b c', 'a b c'), ctx.sim('a b c', 'x y z')], [1, 0]);
  eq('empty text is never similar', ctx.sim('', 'a'), 0);
  eq('Nepali text is compared too', ctx.sim('\u0928\u0947\u092a\u093e\u0932 \u0915\u094b \u0930\u093e\u091c\u0927\u093e\u0928\u0940', '\u0928\u0947\u092a\u093e\u0932 \u0915\u094b \u0930\u093e\u091c\u0927\u093e\u0928\u0940') , 1);
  eq('only content changes count', [ctx.ch(Q(0, 'a', 1), Q(0, 'a', 1)), ctx.ch(Q(0, 'a', 1), Q(0, 'a', 2))], [false, true]);
  eq('section: weekly, daily paper, hourly, exam, practice', [ctx.sec({ weeklyId: 'w' }, 'exam'), ctx.sec({ loksewaMock: true }, 'exam'), ctx.sec({ hourlySprint: true }, 'exam'), ctx.sec({}, 'exam'), ctx.sec({}, 'flashcard')], ['weekly', 'daily-paper', 'hourly', 'exam', 'practice']);
  eq('section: results and review lists come from where the report was opened', [ctx.sec({}, 'exam', 'results'), ctx.sec(null, null, 'review-missed')], ['results', 'review-missed']);
})();

group('Question reports (backend rules)');
(function reportRuleTests(){
  const src = readFile('gas/code.gs') || '';
  const grab = re => { const m = src.match(re); return m ? m[0] : ''; };
  const code = grab(/function sanitizeSheetField_[\s\S]*?\n}\n/) + '\n' + grab(/const QREPORT_REASONS\s*=\s*\[[^\]]*\];/) + '\n' + grab(/const QREPORT_SECTIONS\s*=\s*\[[^\]]*\];/) + '\n' + grab(/function normalizeReportPayload_[\s\S]*?\n}\n/) + '\n' +
    grab(/function updateCorrectionsMap_[\s\S]*?\n}\n/) + '\n' + grab(/function correctionsSince_[\s\S]*?\n}\n/) + '\nreturn {norm: normalizeReportPayload_, upd: updateCorrectionsMap_, since: correctionsSince_};';
  let f; try { f = new Function(code)(); } catch (e) { fail('report helpers failed to load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const ok = { uid: 'FILE123_7', reason: 'wrong_answer', questionSnapshot: 'What?', optionsSnapshot: ['a', 'b', 'c', 'd'], correctIndex: 2, chosenIndex: 1, section: 'weekly', appVersion: '1.32' };
  const r = f.norm(ok).value;
  eq('a full report keeps the options, the marked answer, the student pick and the section', [r.fileId, JSON.parse(r.optionsSnapshot), r.correctIndex, r.chosenIndex, r.section], ['FILE123', ['a', 'b', 'c', 'd'], 2, 1, 'weekly']);
  eq('an old app (no extra fields) still works', [!!f.norm({ uid: 'F_1', reason: 'typo' }).value, f.norm({ uid: 'F_1', reason: 'typo' }).value.section, f.norm({ uid: 'F_1', reason: 'typo' }).value.chosenIndex], [true, 'other', '']);
  eq('a missing question reference is refused', !!f.norm({ reason: 'typo' }).error, true);
  eq('the two new categories are accepted by the server', ['incomplete', 'image_problem'].map(x => !!f.norm({ uid: 'F_1', reason: x }).value), [true, true]);
  eq('an unknown category is still refused', !!f.norm({ uid: 'F_1', reason: 'rude' }).error, true);
  eq('a reference with odd characters is refused', !!f.norm({ uid: 'F_1<script>', reason: 'typo' }).error, true);
  eq('an unknown reason is refused', !!f.norm({ uid: 'F_1', reason: 'spam' }).error, true);
  eq('an unknown section becomes "other"', f.norm({ uid: 'F_1', reason: 'typo', section: 'x' }).value.section, 'other');
  eq('a wild answer index is dropped', [f.norm({ uid: 'F_1', reason: 'typo', correctIndex: 99 }).value.correctIndex, f.norm({ uid: 'F_1', reason: 'typo', correctIndex: -1 }).value.correctIndex], ['', '']);
  eq('option text is capped and kept on one line', JSON.parse(f.norm({ uid: 'F_1', reason: 'typo', optionsSnapshot: ['x'.repeat(500) + '\nz'] }).value.optionsSnapshot)[0].length <= 200, true);
  eq('a note that looks like a formula is neutralised', f.norm({ uid: 'F_1', reason: 'typo', note: '=HYPERLINK("x")' }).value.note.charAt(0), "'");
  eq('a local question bank id is still reported with its own id as the file', f.norm({ uid: 'local_3', reason: 'typo' }).value.fileId, 'local');

  const m1 = f.upd({}, 'A', 100, 3); const m2 = f.upd(m1, 'B', 200, 3); const m3 = f.upd(m2, 'C', 300, 3); const m4 = f.upd(m3, 'D', 400, 3);
  eq('the corrections list keeps only the newest files', Object.keys(m4).sort(), ['B', 'C', 'D'].sort());
  eq('correcting a file again moves it forward in time', f.upd({ A: 1 }, 'A', 9, 5).A, 9);
  eq('students only get files corrected after the last check', f.since({ A: 100, B: 200, C: 300 }, 150), { B: 200, C: 300 });
  eq('a first check (since 0) gets everything', Object.keys(f.since({ A: 100, B: 200 }, 0)).length, 2);
  eq('junk values are ignored', f.since({ A: 'x', B: 200 }, 0), { B: 200 });

  eq('editing a question in the app tells devices which file changed', /markFileCorrected_\(fileId\);\s*\/\*[^*]*\*\/\s*\n\s*logAction_\(actor, "Edit Question"/.test(src), true);
  eq('marking a report fixed tells devices, and closes other open reports on the same question', /adminUpdateQuestionReportStatus[\s\S]*?markFileCorrected_\(String\(found\.row\[2\]/.test(src) && /also closed/.test(src), true);
  eq('the manual "refresh a file" action needs the manage permission', /function adminMarkFileCorrected\(p\) \{\s*const chk = checkAdminCan_\(p, "qreports_manage"\)/.test(src), true);
  eq('getCorrections asks who is calling', /function getCorrections\(p\) \{\s*const auth = authUser_\(p\);/.test(src), true);
  eq('the corrections list is private (not in the public settings)', /CORRECTIONS_SETTING_KEY = "private_corrections"/.test(src), true);
})();


group('Loksewa scheme and where it shows');
(function loksewaTests(){
  const vm = require('vm');
  const ctx = { window: { addEventListener(){}, removeEventListener(){} }, document: { addEventListener(){}, getElementById(){ return null; } }, navigator: {}, localStorage: { getItem(){ return null; }, setItem(){} }, console };
  try { vm.runInNewContext(readFile('shared.js') + '\nthis.fmt=isLoksewaFormat;this.norm=normalizeLoksewaScheme;this.dflt=defaultLoksewaScheme;this.grp=loksewaGroupFor;this.compose=composeLoksewaPaper;this.rows=loksewaGroupRows;this.conflict=loksewaSchemeConflict;this.topics=loksewaTopicScheme;', ctx); } catch (e) { fail('shared.js load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const rng = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; });

  /* 1. only three sections are Loksewa-formatted */
  eq('weekly test, daily paper and hourly 50 are Loksewa-formatted', [ctx.fmt({ weeklyId: 'w1' }), ctx.fmt({ loksewaMock: true }), ctx.fmt({ hourlySprint: true })], [true, true, true]);
  eq('chapter practice, mixed, review and the rest are not', [ctx.fmt({}), ctx.fmt({ fid: 'x' }), ctx.fmt({ reviewOnly: true }), ctx.fmt({ timeLimitSec: 600 }), ctx.fmt(null), ctx.fmt(undefined)], [false, false, false, false, false, false]);

  /* 2. validation */
  const d = ctx.dflt();
  eq('the default is 25 General Knowledge + 50 Level 7 = 75', [d.total, d.groups.map(g => g.name + ':' + g.marks)], [75, ['General Knowledge:25', 'Level 7 Civil Engineering:50']]);
  eq('nothing stored gives the default', [ctx.norm('').isDefault, ctx.norm(null).isDefault, ctx.norm('not json').isDefault, ctx.norm('{"groups":[]}').isDefault], [true, true, true, true]);
  const good = { groups: [{ name: 'General', marks: 25, level: 'gk', chapters: [] }, { name: 'Structures', marks: 20, level: 'level7', chapters: ['c1', 'c2'] }, { name: 'Others', marks: 30, level: 'level7', chapters: [] }] };
  const n = ctx.norm(JSON.stringify(good));
  eq('a good scheme is kept as typed', [n.isDefault, n.total, n.groups.map(g => g.marks)], [false, 75, [25, 20, 30]]);
  eq('bad groups are dropped, not trusted', ctx.norm({ groups: [{ name: '', marks: 5, level: 'gk' }, { name: 'x', marks: 0, level: 'gk' }, { name: 'y', marks: 999, level: 'gk' }, { name: 'ok', marks: 5, level: 'a b' }] }).isDefault, true);
  eq('marks are whole numbers', ctx.norm({ groups: [{ name: 'a', marks: 12.6, level: 'gk', chapters: [] }] }).groups[0].marks, 13);
  eq('chapter ids with odd characters are ignored', ctx.norm({ groups: [{ name: 'a', marks: 5, level: 'gk', chapters: ['ok', '<b>', 'also_ok'] }] }).groups[0].chapters, ['ok', 'also_ok']);
  eq('a scheme over 200 marks is refused', ctx.norm({ groups: [{ name: 'a', marks: 100, level: 'x', chapters: [] }, { name: 'b', marks: 100, level: 'y', chapters: [] }, { name: 'c', marks: 5, level: 'z', chapters: [] }] }).isDefault, true);
  eq('a stored scheme can be a string or an object', [ctx.norm(JSON.stringify(good)).total, ctx.norm(good).total], [75, 75]);

  /* 3. which group a chapter belongs to */
  eq('a named chapter goes to its own group', ctx.grp(n, 'level7', 'c1').name, 'Structures');
  eq('any other chapter of the level goes to the catch-all', ctx.grp(n, 'level7', 'c9').name, 'Others');
  eq('a level the scheme does not use belongs to no group', ctx.grp(n, 'level5', 'c1'), null);

  /* 4. the daily paper follows the scheme exactly */
  const mk = (lv, ch, count) => Array.from({ length: count }, (_, i) => ({ q: { uid: lv + ch + '_' + i }, lv, ch }));
  const pool = [].concat(mk('gk', 'g1', 60), mk('gk', 'g2', 60), mk('level7', 'c1', 40), mk('level7', 'c2', 40), mk('level7', 'c3', 80), mk('level7', 'c4', 80));
  let paper = ctx.compose(n, pool, rng());
  eq('the paper has exactly the scheme\'s 75 questions', paper.questions.length, 75);
  eq('and each group gets exactly its marks (25 / 20 / 30)', [paper.perGroup.g0, paper.perGroup.g1, paper.perGroup.g2], [25, 20, 30]);
  const fromChapters = (ids, grp) => paper.questions.filter(q => ids.some(c => q.uid.indexOf(c + '_') !== -1));
  eq('"Structures" only uses its own chapters (c1, c2): 20 questions', paper.questions.filter(q => /^level7c[12]_/.test(q.uid)).length, 20);
  eq('chapters take turns: both of them appear equally (10 + 10)', [paper.questions.filter(q => /^level7c1_/.test(q.uid)).length, paper.questions.filter(q => /^level7c2_/.test(q.uid)).length], [10, 10]);
  eq('the catch-all uses only the other chapters (c3, c4): 30 questions, 15 + 15', [paper.questions.filter(q => /^level7c3_/.test(q.uid)).length, paper.questions.filter(q => /^level7c4_/.test(q.uid)).length], [15, 15]);
  eq('the two General Knowledge chapters are balanced too (13 + 12)', [paper.questions.filter(q => /^gkg1_/.test(q.uid)).length, paper.questions.filter(q => /^gkg2_/.test(q.uid)).length].sort(), [12, 13]);
  eq('no question appears twice', new Set(paper.questions.map(q => q.uid)).size, 75);
  eq('the same seed gives the same paper', JSON.stringify(ctx.compose(n, pool, rng()).questions.map(q => q.uid)) === JSON.stringify(paper.questions.map(q => q.uid)), true);
  eq('a different day gives a different paper', JSON.stringify(ctx.compose(n, pool, (() => { let a = 999; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })()).questions.map(q => q.uid)) === JSON.stringify(paper.questions.map(q => q.uid)), false);
  /* 5. short of questions: honest, never padded from a different group */
  const thin = [].concat(mk('gk', 'g1', 10), mk('level7', 'c1', 5), mk('level7', 'c2', 50), mk('level7', 'c3', 50));
  paper = ctx.compose(n, thin, rng());
  eq('General Knowledge is short (10 of 25)', paper.shortfalls.some(s => s.name === 'General' && s.got === 10 && s.wanted === 25), true);
  eq('Structures has 55 available so is not short', paper.shortfalls.some(s => s.name === 'Structures'), false);
  eq('chapters outside the scheme are never used', ctx.compose(n, mk('level5', 'z', 100), rng()).questions.length, 0);
  eq('the default scheme gives 25 + 50 from a gk and a level7 pool', (() => { const r = ctx.compose(ctx.dflt(), [].concat(mk('gk', 'a', 40), mk('level7', 'b', 40), mk('level7', 'c', 40)), rng()); return [r.questions.length, r.perGroup.g0, r.perGroup.g1]; })(), [75, 25, 50]);

  /* 6. result-page rows */
  const items = [{ lv: 'gk', ch: 'g1', state: 'correct' }, { lv: 'gk', ch: 'g1', state: 'wrong' }, { lv: 'level7', ch: 'c1', state: 'correct' }, { lv: 'level7', ch: 'c9', state: 'skipped' }, { lv: 'level5', ch: 'x', state: 'wrong' }, { lv: null, ch: null, state: 'correct' }];
  const rows = ctx.rows(n, items, true);
  eq('rows follow the groups, then "Other"', rows.map(r => r.name), ['General', 'Structures', 'Others', 'Other']);
  eq('wrong answers cost 0.2: 1 right + 1 wrong = 0.8', rows[0].score, 0.8);
  eq('the daily paper scores each group out of its marks', [rows[0].outOf, rows[1].outOf, rows[2].outOf], [25, 20, 30]);
  eq('weekly and hourly sets score out of their own questions', ctx.rows(n, items, false).map(r => r.outOf), [2, 1, 1, 2]);
  eq('"Other" collects what is outside the scheme', [rows[3].total, rows[3].correct, rows[3].wrong], [2, 1, 1]);
  eq('empty groups are left out', rows.length, 4);

  /* 7. admin form rules */
  const row = (name, marks, level, chapters) => ({ name, marks, level, chapters });
  eq('a good form is accepted', ctx.conflict([row('A', 25, 'gk', []), row('B', 20, 'level7', ['c1']), row('C', 30, 'level7', [])]), '');
  eq('the same chapter in two groups is refused', /only belong to one group/.test(ctx.conflict([row('A', 5, 'level7', ['c1']), row('B', 5, 'level7', ['c1', 'c2'])])), true);
  eq('two catch-alls for one level are refused', /every chapter of the same level/.test(ctx.conflict([row('A', 5, 'level7', []), row('B', 5, 'level7', [])])), true);
  eq('a catch-all in two DIFFERENT levels is fine', ctx.conflict([row('A', 5, 'gk', []), row('B', 5, 'level7', [])]), '');
  eq('a name is needed', /needs a name/.test(ctx.conflict([row(' ', 5, 'gk', [])])), true);
  eq('marks must be whole numbers 1 to 100', [/whole numbers/.test(ctx.conflict([row('A', 0, 'gk', [])])), /whole numbers/.test(ctx.conflict([row('A', 2.5, 'gk', [])])), /whole numbers/.test(ctx.conflict([row('A', 101, 'gk', [])]))], [true, true, true]);
  eq('an empty form is refused', ctx.conflict([]).length > 0, true);

  /* 8. wiring */
  const obj = readFile('objective.js') || '', up = readFile('user-page.js') || '', gas = readFile('gas/code.gs') || '', adm = readFile('admin.html') || '';
  eq('the Loksewa score line is only written for the three sections', /if \(isLoksewa\)\{\s*const score = correct - wrong \* LOKSEWA_NEGATIVE/.test(obj) && !/Loksewa-style score/.test(obj), true);
  eq('the breakdown tables only appear for the three sections', /\n      if \(isLoksewa\) \{\s*\n\s*const groups = \{\};/.test(obj), true);
  eq('the old group table that read an undefined map is gone', !/WEEKLY\.LOKSEWA_GROUPS/.test(obj), true);
  eq('the daily paper is composed from the scheme', /composeLoksewaPaper\(scheme, pool/.test(up) && !/GENERAL_COUNT|TECH_COUNT/.test(up), true);
  eq('students receive the scheme with the public info', /loksewaScheme: String\(all\.loksewaScheme/.test(gas) && /abhyas_lscheme/.test(up), true);
  eq('the server refuses a malformed scheme', /key === "loksewaScheme"\) \{ const bad = loksewaSchemeProblem_\(value\)/.test(gas) && /key === "loksewaScheme" && loksewaSchemeProblem_\(value\)\) return;/.test(gas), true);
  eq('admin has the editor and saves it as a setting', /id="lks-panel"/.test(adm) && /key: 'loksewaScheme', value/.test(adm), true);
  eq('the daily-paper card lists the scheme groups, not fixed 25 and 50', /scheme\.groups\.map\(g => '<div class="syl-row">/.test(up) && !/General Knowledge<\/span><span class="syl-marks">25/.test(up), true);

  /* 6. the 50 Level 7 marks split by topic (the default until an admin sets a scheme) */
  const topics = ctx.topics;
  const NAMES = [['survey','Engineering Survey'],['mat','Construction Materials'],['soil','Geotechnical Engineering'],['cm','Construction Management'],
    ['sa','Structural Analysis'],['conc','Concrete Technology'],['est','Estimating & Costing'],['draw','Engineering Drawing'],['eco','Engineering Economics'],['prof','Professional Practices']];
  const full = topics(NAMES.map(([id, name]) => ({ id, name })));
  eq('topic default: Level 7 topics carry 7,6,6,6,5,5,5,4,3,3', full.groups.filter(g => g.level === 'level7').map(g => g.marks), [7,6,6,6,5,5,5,4,3,3]);
  eq('topic default: Level 7 adds up to 50, GK stays 25, paper is 75', [full.groups.filter(g => g.level === 'level7').reduce((n, g) => n + g.marks, 0), full.groups[0].marks, full.total], [50, 25, 75]);
  eq('topic default: each topic owns its own chapter', full.groups.filter(g => g.level === 'level7').map(g => g.chapters.join()), NAMES.map(n => n[0]));
  eq('topic default: passes the editor\'s own conflict check', ctx.conflict(full.groups.map(g => ({ name: g.name, marks: g.marks, level: g.level, chapters: g.chapters }))), '');
  const tricky = topics([{ id: 'a', name: 'Reinforced Concrete Structures' }, { id: 'b', name: 'Estimating and Costing of Works' }, { id: 'c', name: 'ENGINEERING SURVEYING' }, { id: 'd', name: 'Soil Mechanics' }, { id: 'e', name: 'Hydrology' }]);
  eq('topic default: matching ignores case, "&" and wording; concrete beats structures', tricky.groups.filter(g => g.level === 'level7').map(g => g.name + ':' + g.chapters.join()),
    ['Engineering Survey:c', 'Geotechnical Engineering:d', 'Concrete Technology:a', 'Estimating and Costing:b', 'Other Level 7 chapters:']);
  eq('topic default: a chapter no topic claims is not lost (it feeds "Other")', tricky.groups.find(g => g.name === 'Other Level 7 chapters').chapters, []);
  eq('topic default: marks of topics with no chapter go to "Other" when there are leftover chapters', tricky.groups.filter(g => g.level === 'level7').reduce((n, g) => n + g.marks, 0), 50);
  const partial = topics([{ id: 'a', name: 'Surveying' }, { id: 'b', name: 'Concrete' }]);
  eq('topic default: nothing left over -> no "Other" group, paper is shorter (not invented)', [partial.groups.map(g => g.name), partial.total], [['General Knowledge', 'Engineering Survey', 'Concrete Technology'], 37]);
  eq('topic default: chapter names that fit no topic -> null (plain 25 + 50 split is used)', [topics([{ id: 'x', name: 'Misc' }]), topics([]), topics(null)], [null, null, null]);
  eq('topic default: unsafe ids are ignored', topics([{ id: 'a b', name: 'Surveying' }]), null);
  eq('without chapters loaded the default is still 25 GK + 50 Level 7', [ctx.dflt().total, ctx.dflt().groups.map(g => g.marks)], [75, [25, 50]]);
  const topicPaper = ctx.compose(full, NAMES.flatMap(([id]) => Array.from({ length: 12 }, (_, i) => ({ q: { id: id + i }, lv: 'level7', ch: id }))).concat(Array.from({ length: 30 }, (_, i) => ({ q: { id: 'gk' + i }, lv: 'gk', ch: 'g1' }))), rng());
  eq('a paper built from it draws exactly the marks of each topic', NAMES.map(([id]) => topicPaper.questions.filter(q => String(q.id).indexOf(id) === 0 && !/^gk/.test(q.id)).length).join(), '7,6,6,6,5,5,5,4,3,3');
  eq('the paper is 75 questions with no shortfall', [topicPaper.questions.length, topicPaper.shortfalls.length], [75, 0]);
  const liveCtx = Object.assign({}, ctx, { ChapterData: {
    allFileRefs: () => NAMES.map(([id]) => ({ lv: 'level7', ch: id })).concat([{ lv: 'gk', ch: 'g1' }]), chapterName: (lv, ch) => NAMES.find(n => n[0] === ch)[1] } });
  require('vm').runInNewContext(readFile('shared.js') + '\nthis.d=defaultLoksewaScheme();', liveCtx);
  const live = { d: liveCtx.d };
  eq('with Level 7 chapters loaded, defaultLoksewaScheme() is topic-wise', [live.d.topicBased, live.d.groups.length, live.d.total], [true, 11, 75]);
})();

group('Loksewa scheme (backend check)');
(function loksewaServerTests(){
  const src = readFile('gas/code.gs') || '';
  const m = src.match(/function loksewaSchemeProblem_[\s\S]*?\n}\n/);
  let f; try { f = new Function(m[0] + '\nreturn loksewaSchemeProblem_;')(); } catch (e) { fail('could not load loksewaSchemeProblem_: ' + e.message); return; }
  const eq = (n, got, want) => got === want ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const ok = JSON.stringify({ groups: [{ name: 'A', marks: 25, level: 'gk', chapters: [] }, { name: 'B', marks: 50, level: 'level7', chapters: ['c1'] }] });
  eq('a good scheme is accepted', f(ok), '');
  eq('empty clears the scheme', f(''), '');
  eq('not JSON is refused', f('{nope') !== '', true);
  eq('no groups is refused', f('{"groups":[]}') !== '', true);
  eq('a group without a name is refused', f('{"groups":[{"name":"","marks":5,"level":"gk"}]}') !== '', true);
  eq('marks out of range or fractional are refused', [f('{"groups":[{"name":"a","marks":0,"level":"gk"}]}') !== '', f('{"groups":[{"name":"a","marks":101,"level":"gk"}]}') !== '', f('{"groups":[{"name":"a","marks":2.5,"level":"gk"}]}') !== ''].join(), 'true,true,true');
  eq('a level with odd characters is refused', f('{"groups":[{"name":"a","marks":5,"level":"a b"}]}') !== '', true);
  eq('more than 200 marks is refused', f(JSON.stringify({ groups: [{ name: 'a', marks: 100, level: 'x' }, { name: 'b', marks: 100, level: 'y' }, { name: 'c', marks: 1, level: 'z' }] })) !== '', true);
  eq('more than 20 groups is refused', f(JSON.stringify({ groups: Array.from({ length: 21 }, (_, i) => ({ name: 'g' + i, marks: 1, level: 'x' })) })) !== '', true);
  eq('the scheme is a public setting (students must be able to read it)', /PRIVATE_SETTING_PREFIXES[^;]*;/.test(src) && !/private_loksewa/i.test(src), true);
})();

/* ═══════════════════════════════════════════════════════════════════════
   Downloads: group picker, pause/stop, waiting for connection, slow-line savers
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const app = readFile('app.js') || '', uh = readFile('user.html') || '', obj = readFile('objective.js') || '';
  const sw = readFile('sw.js') || '', ld = readFile('chapters-loader.js') || '';
  console.log('\nDownloads and slow-connection savers');
  /dl-selected-btn/.test(uh) && /CACHE\.dlSelected\(\)/.test(uh) && /async dlSelected\(/.test(app)
    ? pass('Downloads page has a "Download selected" button wired to CACHE.dlSelected') : fail('Download selected is not wired');
  /class="dl-group"/.test(app) && /abhyas_dl_groups/.test(app)
    ? pass('each level has a checkbox and the choice is remembered on the device') : fail('group checkboxes or their memory are missing');
  /async dl\(groups\)/.test(app) && /only\.has\(r\.lv\)/.test(app)
    ? pass('CACHE.dl can be limited to the ticked groups') : fail('CACHE.dl does not filter by group');
  /togglePause\(\)/.test(uh) && /stopDl\(\)/.test(uh) && /_paused/.test(app) && /_stop/.test(app)
    ? pass('Pause / Resume / Stop controls exist') : fail('pause or stop controls are missing');
  /CACHE\._running\)\{ toast\('A download is already running/.test(app)
    ? pass('a second download cannot start while one is running') : fail('double-start guard is missing');
  /CONCURRENCY: 4/.test(app) && /Promise\.all\(Array\.from\(\{length: Math\.min\(CACHE\._poolSize\(\)/.test(app) && /const GETFILE_GATE/.test(app)
    ? pass('downloads fetch several files at once, still inside the shared request limit') : fail('parallel download pool is missing');
  /session expired\|access has ended/.test(app)
    ? pass('a download stops at once when the session or access has ended, instead of failing every file') : fail('download does not stop on an ended session');
  /!S\.online \|\| S\.forcedOffline\) && !CACHE\._stop/.test(app)
    ? pass('a running download waits for the connection instead of failing files') : fail('download does not wait for the connection');
  /async removeSelected\(/.test(app) && /ASK\.confirm/.test(app.slice(app.indexOf('async removeSelected(')))
    ? pass('removing a group asks first and only runs when the person taps it') : fail('removeSelected is missing or unconfirmed');
  /prefetchNext\(fileId\)/.test(obj) && /saveData/.test(app.slice(app.indexOf('async prefetchNext(')))
    ? pass('the next set is prefetched, but not on mobile data or data saver') : fail('prefetch is missing or ignores data saver');
  /localCacheFirst/.test(sw) && /NETWORK_TIMEOUT_MS = 2500/.test(sw)
    ? pass('service worker serves vendor files from the saved copy and gives up on a weak line sooner') : fail('service worker savers are missing');
  /weakConnection\(\)/.test(ld) && /60 \* 60 \* 1000/.test(ld)
    ? pass('chapter list checks run less often on a weak connection') : fail('chapter loader is not throttled');
})();

group('One safe escAttrJs (v1.34)');
(function escAttrJsOnce(){
  const sharedSrc = readFile('js/core/shared.js') || '';
  const fn = (sharedSrc.match(/function escAttrJs\(s\) \{[\s\S]*?\n\}/) || [''])[0];
  const defs = f => (readFile(f) || '').match(/function escAttrJs\s*\(|escAttrJs\s*=\s*function/g) || [];
  defs('admin.html').length === 0 && defs('js/app/user-page.js').length === 0
    ? pass('admin.html and user-page.js use the shared escAttrJs instead of their own copy') : fail('a second escAttrJs copy is back');
  if (!fn) { fail('escAttrJs not found in shared.js'); return; }
  const esc = new Function(fn + '; return escAttrJs;')();
  /* what the browser does: decode the attribute value, then run it as JS */
  const decode = a => a.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const run = payload => { let got = null, boom = false;
    try { new Function('f', 'alert', decode("f('" + esc(payload) + "')"))(v => { got = v; }, () => { boom = true; }); } catch (e) { return { err: e.message }; }
    return { got, boom }; };
  ["&#39;);alert(1);//", "O'Brien", 'a\\b"c<d>&e', "x');alert(1);('"].forEach(p => {
    const r = run(p);
    r.got === p && !r.boom ? pass('escAttrJs round-trips ' + JSON.stringify(p)) : fail('escAttrJs breaks on ' + JSON.stringify(p));
  });
})();

/* ═══════════════════════════════════════════════════════════════════════
   Summary
   ═══════════════════════════════════════════════════════════════════════ */
Promise.all(PENDING).then(() => {
  console.log('\n' + '═'.repeat(60));
  console.log(`Tests: ${PASS} passing, ${FAIL} failing.`);
  if (FAIL) {
    console.log('\nFailures:');
    FAILURES.forEach(f => console.log('  • ' + f));
    process.exit(1);
  }
});

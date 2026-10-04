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
const FAILURES = [];

function pass(msg) { PASS++; console.log('  ✓ ' + msg); }
function fail(msg) { FAIL++; FAILURES.push(msg); console.log('  ✗ ' + msg); }
function group(msg) { console.log('\n── ' + msg + ' ' + '─'.repeat(Math.max(0, 56 - msg.length))); }

/* Files moved into folders in v1.32. Tests still refer to them by their short
   names; this maps each short name to its real location. */
const MOVED = {
  'config.js': 'js/core/config.js', 'version.js': 'js/core/version.js', 'firebase-config.js': 'js/core/firebase-config.js', 'shared.js': 'js/core/shared.js', 'nav.js': 'js/core/nav.js',
  'app.js': 'js/app/app.js', 'objective.js': 'js/app/objective.js', 'subjective.js': 'js/app/subjective.js', 'cloud-sync.js': 'js/app/cloud-sync.js',
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
  'app.js','objective.js','subjective.js','cloud-sync.js',
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
  'app.js','objective.js','subjective.js','cloud-sync.js',
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
  ['objective.js',  'LOKSEWA_GROUPS'],
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
   Behaviour: progress sync payload stays under the server limit (45,000)
   ═══════════════════════════════════════════════════════════════════════ */
group('Progress sync payload');
(function syncTests(){
  const src = readFile('app.js');
  if (!src) { fail('app.js missing'); return; }
  const start = src.indexOf('const PSYNC = {');
  if (start === -1) { fail('PSYNC not found'); return; }
  let depth = 0, end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  const notes = {};
  for (let i = 0; i < 4000; i++) notes['q' + i] = 'note text number ' + i + ' '.repeat(20);
  const store = { abhyas_qnotes: JSON.stringify(notes), abhyas_sprint_start: '2026-10-01' };
  const S = { prog: { sessions: [] }, chapStats: {}, cov: {}, bk: [], fl: [], wr: [], stk: {} };
  let P;
  try {
    P = new Function('S', 'localStorage', src.slice(start, end) + '; return PSYNC;')(S, { getItem: k => store[k] || null });
  } catch (e) { fail('could not load PSYNC: ' + e.message); return; }
  const json = P._syncPayload();
  json.length <= 45000 ? pass('huge notes are trimmed to fit (' + json.length + ' chars)') : fail('payload too large: ' + json.length);
  let parsed; try { parsed = JSON.parse(json); } catch (e) { fail('payload is not valid JSON'); return; }
  parsed.sprint === '2026-10-01' ? pass('sprint start date is synced') : fail('sprint start missing from payload');
  const kept = Object.keys(parsed.qnotes);
  (kept.length > 0 && kept[kept.length - 1] === 'q3999') ? pass('newest notes are kept, oldest dropped') : fail('wrong notes were dropped');
})();


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
  eq('daily Loksewa paper headline is negative-marked too', /isWeekly \|\| isLoksewaPaper/.test(obj), true);
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
  const code = grab(/const STUDYDOC_CATEGORIES\s*=\s*\[[^\]]*\];/) + '\n' + grab(/function normalizeStudyDocMeta_[\s\S]*?\n}\n/) + '\n' +
    grab(/function rowToStudyDoc_[\s\S]*?\n}\n/) + '\n' + grab(/function sortStudyDocs_[\s\S]*?\n}\n/) +
    '\nreturn {norm: normalizeStudyDocMeta_, row: rowToStudyDoc_, sort: sortStudyDocs_, cats: STUDYDOC_CATEGORIES};';
  let f; try { f = new Function(code)(); } catch (e) { fail('study-doc helpers failed to load: ' + e.message); return; }
  const eq = (n, got, want) => JSON.stringify(got) === JSON.stringify(want) ? pass(n) : fail(`${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

  eq('an upload without a title is rejected', !!f.norm({ title: '   ' }, true).error, true);
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
   Summary
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(60));
console.log(`Tests: ${PASS} passing, ${FAIL} failing.`);
if (FAIL) {
  console.log('\nFailures:');
  FAILURES.forEach(f => console.log('  • ' + f));
  process.exit(1);
}
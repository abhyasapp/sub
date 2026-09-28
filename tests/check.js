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

function readFile(rel) {
  const p = path.join(ROOT, rel);
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return null; }
}
function exists(rel) {
  try { fs.accessSync(path.join(ROOT, rel)); return true; }
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
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
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
  const cspMatch = src.match(/Content-Security-Policy["'][^>]*content=["']([^"']+)["']/i);
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
  ['user.html',    'window.WRONGBY'],
  ['user.html',    'window.HEATMAP'],
  ['user.html',    'window.HARDQ'],
  ['user.html',    'LOKSEWA_GROUPS'],
  ['admin.html',   'const SUBJ_HOURLY'],
  ['gas/code.gs',  'getHardQuestionsCache_']
].forEach(([f, marker]) => {
  const src = readFile(f);
  if (!src) { fail(f + ' (missing)'); return; }
  if (src.indexOf(marker) === -1) fail(`${f}: v1.20 marker "${marker}" not found (patch not applied?)`);
  else pass(`${f}: ${marker}`);
});

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
#!/usr/bin/env node
/* Abhyas checks. No dependencies: only Node's built-in modules.
   Run:  node tests/check.js     (or  npm test)
   Exit code is 1 if anything fails, so it can gate a deploy. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));

/* Look for a file at the root, then under script/, then under gas/.
   The .gs files live wherever the developer wants them; the tests
   should not care. */
function findPath(name){
  const candidates = [name, 'script/' + name, 'gas/' + name];
  for (const c of candidates) if (exists(c)) return c;
  return name;
}
function readGs(name){
  const p = findPath(name);
  if (!exists(p)) return '';
  return read(p);
}

let passed = 0, failed = 0, warned = 0;
function section(t) { console.log('\n' + t); }
function ok(name, cond, detail) {
  if (cond === undefined) cond = true;   // ok('name') means it passed
  if (cond) { passed++; console.log('  ok    ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
function warn(name, detail) { warned++; console.log('  warn  ' + name + (detail ? '  (' + detail + ')' : '')); }

const JS_FILES = ['app.js', 'objective.js', 'subjective.js', 'cloud-sync.js', 'shared.js', 'config.js',
  'version.js', 'pdf-viewer.js', 'chapters-data.js', 'subjective-data.js', 'subjective_chapters.js',
  'firebase-config.js', 'sw.js', 'code.gs', 'setup.gs', 'private-files.gs', 'debug.gs']
  .map(findPath).filter(exists);
const HTML_FILES = ['index.html', 'user.html', 'admin.html', 'privacy.html', 'terms.html'].filter(exists);

function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1]) || /ld\+json/i.test(m[1]) || !m[2].trim()) continue;
    out.push(m[2]);
  }
  return out;
}

/* ── 1. Syntax ─────────────────────────────────────────────────────── */
section('Syntax');
JS_FILES.forEach(f => {
  try { new vm.Script(read(f), { filename: f }); ok(f + ' parses'); }
  catch (e) { ok(f + ' parses', false, e.message); }
});
HTML_FILES.forEach(f => {
  const blocks = inlineScripts(read(f));
  let bad = '';
  blocks.forEach((b, i) => { try { new vm.Script(b, { filename: f + '#' + i }); } catch (e) { bad = e.message; } });
  ok(f + ' inline scripts parse', !bad, bad);
});
try { JSON.parse(read('manifest.json')); ok('manifest.json is valid JSON'); }
catch (e) { ok('manifest.json is valid JSON', false, e.message); }

/* ── 2. Versions ───────────────────────────────────────────────────── */
section('Versions');
const vClient = (read('version.js').match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
const vServer = (readGs('code.gs').match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
ok('version.js and code.gs agree', vClient && vClient === vServer, 'client ' + vClient + ', server ' + vServer);

/* ── 3. Local links ────────────────────────────────────────────────── */
section('Links and files');
HTML_FILES.forEach(f => {
  const html = read(f);
  const missing = [];
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1];
    if (/^(https?:|\/\/|#|mailto:|tel:|data:|javascript:)/i.test(u)) continue;
    u = u.replace(/[?#].*$/, '');
    if (!u || u.startsWith('/')) continue;
    if (!exists(u)) missing.push(u);
  }
  ok(f + ' links to files that exist', !missing.length, missing.join(', '));
});

const sw = read('sw.js');
const shellBlock = (sw.match(/const SHELL = \[([\s\S]*?)\n\];/) || [])[1] || '';
const shell = [...shellBlock.matchAll(/'\.\/([^']*)'/g)].map(x => x[1]).filter(Boolean);
const shellMissing = shell.filter(p => !exists(p));
ok('service-worker list is not empty', shell.length > 10);
ok('service-worker files exist (excluding vendor/)', !shellMissing.filter(p => !p.startsWith('vendor/')).length,
   shellMissing.filter(p => !p.startsWith('vendor/')).join(', '));
if (shellMissing.some(p => p.startsWith('vendor/'))) warn('some vendor/ files are missing', 'run: python vendor-assets.py');

/* ── 4. Honest copy (regressions from the review) ──────────────────── */
section('Copy and legal');
const idx = read('index.html');
ok('cookie banner no longer promises ads', !/ads that help/i.test(idx));
ok('sign-up links to Terms and Privacy', /terms\.html/.test(idx) && /privacy\.html/.test(idx));
ok('no IQ content is advertised', !/\bIQ\b/.test(idx) && !/\bIQ\b/.test(read('manifest.json')));
ok('privacy.html and terms.html exist', exists('privacy.html') && exists('terms.html'));
ok('no private keys are committed', !JS_FILES.concat(HTML_FILES).some(f => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(read(f))));

/* ── 5. Content data ───────────────────────────────────────────────── */
section('Content data');
function loadData(file, ctx) { vm.runInContext(read(file), ctx, { filename: file }); }
const _hasChaptersData = exists('chapters-data.js');
let DRIVE = {}, CH_NAMES = {};
if (_hasChaptersData) {
  const dctx = vm.createContext({ window: {} });
  dctx.window = dctx;
  loadData('chapters-data.js', dctx);
  DRIVE = dctx.DRIVE; CH_NAMES = dctx.CH_NAMES;
} else {
  warn('chapters-data.js not present — content-ID checks skipped (chapters-loader.js serves it at runtime)');
}
const ids = [];
let badIds = 0, orphan = 0;
Object.keys(DRIVE).forEach(lv => Object.keys(DRIVE[lv]).forEach(ch => {
  if (!CH_NAMES[lv] || !CH_NAMES[lv][ch]) orphan++;
  Object.keys(DRIVE[lv][ch]).forEach(book => Object.keys(DRIVE[lv][ch][book]).forEach(sub => {
    const id = DRIVE[lv][ch][book][sub];
    if (!id) return;
    ids.push(id);
    if (!/^[A-Za-z0-9_-]{25,60}$/.test(id)) badIds++;
  }));
}));
if (_hasChaptersData) {
  ok('question files are registered', ids.length > 50, ids.length + ' files');
  ok('every file ID looks like a Drive ID', badIds === 0, badIds + ' bad');
  ok('no file ID is used twice', new Set(ids).size === ids.length, (ids.length - new Set(ids).size) + ' duplicates');
  ok('every chapter with files has a name', orphan === 0, orphan + ' unnamed');
}

/* ── 6. Behaviour (real app code in a stubbed browser) ─────────────── */
section('Behaviour');
function makeContext() {
  const store = {};
  const noop = () => {};
  const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, remove: noop, setAttribute: noop, addEventListener: noop, after: noop,
    querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: ''
  });
  const sb = {
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop,
    navigator: { onLine: true, userAgent: 'test' },
    localStorage: {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      addEventListener: noop, getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [], createElement: el, body: el(), documentElement: el(), head: el(),
      visibilityState: 'visible'
    },
    location: { href: '', pathname: '/user.html', hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    fetch: () => Promise.reject(new Error('no network in tests')),
    URL, URLSearchParams, Blob, AbortController, TextEncoder, TextDecoder
  };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.addEventListener = noop;
  return vm.createContext(sb);
}
let ctx = null;
try {
  ctx = makeContext();
  /* chapters-loader.js replaced the bundled chapters-data.js. When the
     bundled file is absent, load every other app script and install a
     minimal ChapterData stub so app.js / objective.js can still boot. */
  const _appScripts = ['config.js', 'version.js', 'shared.js',
    'subjective_chapters.js', 'subjective-data.js', 'app.js', 'objective.js', 'subjective.js'];
  if (exists('chapters-data.js')) _appScripts.splice(3, 0, 'chapters-data.js');
  _appScripts.forEach(f => { if (exists(f)) vm.runInContext(read(f), ctx, { filename: f }); });
  if (!exists('chapters-data.js')) {
    vm.runInContext(
      "window.CH_NAMES = window.CH_NAMES || {};"
    + "window.LEVEL_LABELS = window.LEVEL_LABELS || {};"
    + "window.DRIVE = window.DRIVE || {};"
    + "window.ChapterData = window.ChapterData || {"
    + "  allFileRefs: function(){ return []; },"
    + "  levels: function(){ return []; },"
    + "  levelLabel: function(lv){ return lv; },"
    + "  chapterName: function(lv, ch){ return ch; },"
    + "  chapterFileRefs: function(){ return []; },"
    + "  chapters: function(){ return {}; },"
    + "  books: function(){ return {}; },"
    + "  files: function(){ return {}; },"
    + "  fileCount: function(){ return 0; }"
    + "};",
      ctx, { filename: 'chapters-data-stub.js' });
  }
  ok('app scripts load together');
} catch (e) {
  ok('app scripts load together', false, e.message);
}
const run = code => vm.runInContext(code, ctx);
function test(name, code) {
  if (!ctx) return warn(name, 'skipped: scripts did not load');
  try { ok(name, !!run(code)); } catch (e) { ok(name, false, e.message); }
}

test('normQ accepts letter answers and builds uids',
  "(() => { const r = normQ([{q:'Q1',options:['a','b','c'],correct:'B'}],'f'); return r.length===1 && r[0].correct===1 && r[0].uid==='f_0'; })()");
test('normQ skips malformed rows',
  "normQ([{q:'',options:['a','b']},{q:'x',options:['a']},null],'f').length===0");
test('isOk compares numbers and text',
  "isOk(1,'1') && isOk('A','a') && !isOk(null,1) && !isOk(2,1)");
test('computeAccessLevel: permanent, trial, pending, expired',
  "computeAccessLevel({permanentAccess:true},{}).level==='permanent' && computeAccessLevel({isTrial:true},{}).level==='trial' && computeAccessLevel({needsPayment:true},{status:'payment_pending'}).level==='pending_review' && computeAccessLevel({needsPayment:true},{status:'expired'}).level==='expired'");
test('coverage store records and merges per question',
  "(() => { S.cov = {}; COV.record([{uid:'F_0',ok:true},{uid:'F_3',ok:false},{uid:'F_3',ok:true},{uid:'local_1',ok:true}]); const a = S.cov.F; COV.merge({F:{p:'0210',a:9,c:4},G:{p:'12',a:2,c:1}}); return a.p.length>=4 && S.cov.F.a===9 && S.cov.G.p==='12' && !S.cov.local; })()");
test('sync payload always fits under the server limit',
  "(() => { S.prog.sessions=[]; for(let i=0;i<50;i++){ const qres=[]; for(let j=0;j<40;j++) qres.push({uid:'1Blbxd3mWlMvDpAWd_KfVItE2CzjajB_o_'+j,ok:j%2===0}); S.prog.sessions.push({chapter:'x',total:40,correct:20,at:Date.now()-i,qres}); } S.bk=[]; for(let i=0;i<400;i++) S.bk.push({uid:'u'+i,q:'question text '.repeat(12),options:['a','b','c','d'],correct:1}); const s = PSYNC._syncPayload(); const keep = S.prog.sessions[49].qres && S.prog.sessions[49].qres.length===40; return s.length<=44000 && JSON.parse(s).prog.sessions.length>=10 && keep; })()");
test('wrong answers only count once they are due again',
  "(() => { S.wr=[{uid:'a',_streak:0,_nextDue:Date.now()-1000}]; REV.trackAnswer({uid:'a'},true); const s1=S.wr[0]._streak; REV.trackAnswer({uid:'a'},true); return s1===1 && S.wr[0]._streak===1 && S.wr[0]._nextDue>Date.now(); })()");
if (exists('chapters-data.js')) {
  test('scope helpers see every registered file',
    "scopeLeaves('', '', '', '').length === ChapterData.allFileRefs().length && ChapterData.allFileRefs().length > 50");
} else {
  warn('scope helpers — skipped (content lives in chapters-loader.js now)');
}
test('written-question parser reads marks and text',
  "(() => { const r = SUBJ_SMART.preview('1. Explain the design of a bridge deck slab. [5]'); return r.length===1 && r[0].marks===5 && /bridge deck/.test(r[0].question); })()");

/* ── 7. Every onclick points at something that exists ──────────────── */
section('Handlers');
const allJs = JS_FILES.map(read).join('\n') + '\n' + HTML_FILES.map(f => inlineScripts(read(f)).join('\n')).join('\n');
const SKIP = new Set(['window', 'document', 'this', 'event', 'localStorage', 'JSON', 'Math', 'location', 'history',
  'navigator', 'e', 'console', 'Array', 'Object', 'String', 'Number', 'el', 'btn', 'a']);
['index.html', 'user.html', 'admin.html'].filter(exists).forEach(f => {
  const html = read(f);
  const pairs = new Set();
  const attrRe = /on(?:click|change|input|submit|keydown|focus)="([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(html))) {
    const callRe = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = callRe.exec(m[1]))) if (!SKIP.has(c[1])) pairs.add(c[1] + '.' + c[2]);
  }
  const missing = [];
  pairs.forEach(p => {
    const [obj, method] = p.split('.');
    const objOk = new RegExp('(?:const|let|var|function|class)\\s+' + obj + '\\b|window\\.' + obj + '\\s*=|\\b' + obj + '\\s*=\\s*[{(]').test(allJs);
    const methodOk = new RegExp('\\b' + method + '\\s*(?:\\(|:|=)').test(allJs);
    if (!objOk || !methodOk) missing.push(p);
  });
  ok(f + ': every onclick target exists (' + pairs.size + ' checked)', !missing.length, missing.join(', '));
});

/* ── 8. Content-Security-Policy stays in step with the pages ───────── */
section('Security policy');
['index.html', 'user.html', 'admin.html'].filter(exists).forEach(f => {
  const html = read(f);
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  ok(f + ' has a Content-Security-Policy', !!m);
  if (!m) return;
  const policy = m[1];
  const dir = name => ((policy.match(new RegExp('(?:^|;)\\s*' + name + '\\s+([^;]+)')) || [])[1] || '');
  const scriptSrc = dir('script-src'), styleSrc = dir('style-src');
  const bad = [];
  let x;
  const sre = /<script\b[^>]*\bsrc="(https?:\/\/[^"\/]+)/gi;
  while ((x = sre.exec(html))) if (scriptSrc.indexOf(x[1]) === -1) bad.push('script ' + x[1]);
  const tre = /<link\b[^>]*>/gi;
  while ((x = tre.exec(html))) {
    if (!/rel="stylesheet"/i.test(x[0])) continue;
    const h = (x[0].match(/href="(https?:\/\/[^"\/]+)/i) || [])[1];
    if (h && styleSrc.indexOf(h) === -1) bad.push('style ' + h);
  }
  ok(f + ': every external script and stylesheet host is allowed', !bad.length, bad.join(', '));
  ok(f + ': policy blocks plugins and foreign base URLs', /object-src 'none'/.test(policy) && /base-uri 'self'/.test(policy));
});

/* ── 9. Content index ──────────────────────────────────────────────── */
section('Content index');
if (exists('content-index.js')) {
  const ictx = vm.createContext({ window: {} });
  ictx.window = ictx;
  let idxOk = true, idxMsg = '';
  try { vm.runInContext(read('content-index.js'), ictx); } catch (e) { idxOk = false; idxMsg = e.message; }
  ok('content-index.js runs', idxOk, idxMsg);
  const map = ictx.CONTENT_INDEX || {};
  const unknown = Object.keys(map).filter(k => ids.indexOf(k) === -1);
  ok('content-index.js only lists registered files', !unknown.length, unknown.length + ' unknown');
  ok('content-index.js counts are positive numbers', Object.keys(map).every(k => Number.isInteger(map[k]) && map[k] > 0));
  if (!Object.keys(map).length) warn('content-index.js is empty', 'run buildContentIndex() in Apps Script for exact progress bars');
} else {
  warn('content-index.js is missing');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + warned + ' warnings');
process.exit(failed ? 1 : 0);

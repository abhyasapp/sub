/* Shared helpers for the real-browser checks in this folder.
   They need dev dependencies that are NOT part of the app:
       npm i --no-save puppeteer-core @sparticuz/chromium axe-core
   Nothing here is loaded by the app or by `npm test`. */
const path = require('path'), fs = require('fs'), http = require('http');
const puppeteer = require('puppeteer-core');
const chromiumPkg = require('@sparticuz/chromium');
const chromium = chromiumPkg.default || chromiumPkg;

const ROOT = path.resolve(__dirname, '..', '..');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((q, r) => {
    const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    try { const b = fs.readFileSync(p); r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b); }
    catch (e) { r.writeHead(404); r.end(''); }
  });
  return new Promise(res => server.listen(0, () => res({ server, port: server.address().port })));
}

async function launch() {
  return puppeteer.launch({ args: [...chromium.args, '--no-sandbox'], executablePath: await chromium.executablePath(), headless: true });
}

/* A signed-in student with some history, and a stand-in for the chapter list the app normally
   downloads from Drive. Runs before every page script. */
const STUDENT = { type: 'user', username: 'tester', name: 'Sita', token: 'tok', lastVerified: Date.now(), access: { level: 'permanent', accessType: 'yearly' } };
function seedStudent(user) {
  localStorage.setItem('abhyas_session', JSON.stringify(user));
  localStorage.setItem('abhyas_tut_seen', JSON.stringify({ tester: true }));
  const refs = []; for (let c = 1; c <= 3; c++) refs.push({ fid: 'f' + c, lv: 'L1', ch: 'c' + c, chName: 'C', book: 'B', sub: 'S', subtopic: 'T', name: 'T', count: 25 });
  window.CH_NAMES = {}; window.LEVEL_LABELS = { L1: 'Level 1' }; window.DRIVE = {};
  window.ChapterData = { allFileRefs: () => refs, chapterFileRefs: () => refs, chapterName: () => 'Chapter', levelLabel: () => 'Level 1', chapters: () => [], levels: () => ['L1'], fileCount: () => refs.length, files: () => refs, books: () => [] };
  const sessions = []; for (let i = 0; i < 20; i++) sessions.push({ chapter: 'Soil', mode: 'practice', total: 40, correct: 25, wrong: 10, skipped: 5, pct: 62, at: Date.now() - i * 3.6e6 * 7, durationSec: 700, fid: 'f1' });
  localStorage.setItem('abhyas_prog', JSON.stringify({ total: 600, correct: 420, sessions }));
  localStorage.setItem('abhyas_sprint_start', new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10));
}

/* Open the admin console without a real login (the backend is never contacted). */
async function enterAdmin(pg) {
  await pg.evaluate(() => { ADMIN.creds = { user: 'owner', token: 'x' }; ADMIN._perms = { role: 'owner', features: {} };
    document.getElementById('gate').style.display = 'none'; document.getElementById('app').classList.add('on'); ADMIN._applyPermissions(); });
}

module.exports = { ROOT, serve, launch, STUDENT, seedStudent, enterAdmin, sleep: ms => new Promise(r => setTimeout(r, ms)) };

/* A small question bank for tests: two levels with chapters, and a question file for each file id.
   Used with `bank()` below; the pretend backend answers getFile from it. */
const BANK_REFS = (() => {
  const refs = [];
  [['gk', ['g1', 'g2']], ['level7', ['c1', 'c2', 'c3', 'c4']]].forEach(([lv, chs]) => chs.forEach(ch => {
    refs.push({ fid: `F_${lv}_${ch}`, key: `k_${lv}_${ch}`, lv, ch, chName: ch.toUpperCase(), book: 'B', sub: 'S', subtopic: ch, name: ch, count: 40 });
  }));
  return refs;
})();
const WORDS = ['footing','pile','girder','culvert','aggregate','bitumen','slump','beam','column','truss','rebar','mortar','plinth','lintel','bearing','settlement','shear','torsion','moment','deflection','seepage','permeability','piezometer','levelling','traverse','theodolite','contour','chainage','hydrograph','aquifer','weir','spillway','penstock','turbine','sewer','manhole','coagulation','chlorine','turbidity','alkalinity'];
/* 40 questions per file. Every question has its own wording and its own options (like a real bank), so a test can tell
   questions apart. `version` 2 is what a corrected file looks like to the tests. */
function bankFile(fid, version) {
  const h = [...fid].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: 40 }, (_, i) => {
    const w = k => WORDS[(h + i * 7 + k * 11 + k * k) % WORDS.length];
    return { q: `Which ${w(0)} rule governs the ${w(1)} when the ${w(2)} carries ${w(3)} near the ${w(4)} number ${i}?`,
      options: [0, 1, 2, 3].map(j => `${w(5 + j)} ${i * 4 + j + 1} kN`), correct: i % 4, explanation: `Because of the ${w(1)} and the ${w(2)} (item ${i} of ${fid})` };
  });
}
function seedBank(user, refs) {
  localStorage.setItem('abhyas_session', JSON.stringify(user));
  localStorage.setItem('abhyas_tut_seen', JSON.stringify({ tester: true }));
  window.CH_NAMES = {}; window.LEVEL_LABELS = { gk: 'General Knowledge', level7: 'Level 7' }; window.DRIVE = {};
  window.ChapterData = { allFileRefs: () => refs, chapterFileRefs: (lv, ch) => refs.filter(r => r.lv === lv && r.ch === ch),
    chapterName: (lv, ch) => ch.toUpperCase(), levelLabel: lv => window.LEVEL_LABELS[lv] || lv,
    chapters: lv => [...new Set(refs.filter(r => r.lv === lv).map(r => r.ch))].map(id => ({ id, name: id.toUpperCase() })),
    levels: () => [...new Set(refs.map(r => r.lv))], fileCount: () => refs.length, files: () => refs, books: () => [] };
}
module.exports.BANK_REFS = BANK_REFS; module.exports.bankFile = bankFile; module.exports.seedBank = seedBank;

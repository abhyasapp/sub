/* Loksewa marking and the daily 75-mark paper.
   - Loksewa wording, +1/-0.2 marks and the group / chapter tables appear ONLY on the weekly test, the daily paper
     and the hourly 50. Chapter practice and the other quizzes show a plain percentage.
   - The daily paper is built exactly to the admin's mark scheme.
       node tests/browser/loksewa.js            (exit 1 on failure) */
const { serve, launch, STUDENT, BANK_REFS, bankFile, seedBank, sleep } = require('./common');

(async () => {
  const { server, port } = await serve(); const browser = await launch();
  const pg = await browser.newPage(); await pg.setViewport({ width: 420, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  const scheme = { groups: [
    { name: 'General Knowledge', marks: 25, level: 'gk', chapters: [] },
    { name: 'Structures', marks: 20, level: 'level7', chapters: ['c1', 'c2'] },
    { name: 'Other technical', marks: 30, level: 'level7', chapters: [] } ] };
  await pg.evaluateOnNewDocument(seedBank, STUDENT, BANK_REFS);
  await pg.evaluateOnNewDocument(s => localStorage.setItem('abhyas_lscheme', s), JSON.stringify(scheme));
  await pg.setRequestInterception(true);
  pg.on('request', rq => {
    const u = rq.url();
    if (u.startsWith('http://localhost')) return rq.continue();
    if (/script\.google|exec/.test(u)) {
      const m = u.match(/fileId=([^&]+)/);
      /* the backend hands out the admin's scheme with the public info, as the real one does */
      const body = m ? bankFile(decodeURIComponent(m[1]))
        : /action=getPublicInfo/i.test(u) ? { success: true, announcement: '', contentVersion: '1', loksewaScheme: JSON.stringify(scheme) }
        : { success: true };
      return rq.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    }
    rq.abort();
  });
  await pg.goto(`http://localhost:${port}/user.html`, { waitUntil: 'load' });
  await pg.evaluate(() => { S.online = true; S.forcedOffline = false; });
  await sleep(1500);
  const res = {};

  /* 1. the daily paper is built to the scheme */
  res.card = await pg.evaluate(() => { SYLLABUS_MOCK.render(); return document.getElementById('syllabus-mock-slot').innerText.replace(/\s+/g, ' '); });
  res.paper = await pg.evaluate(async () => {
    const b = await SYLLABUS_MOCK.build();
    const by = f => b.papers.filter(q => f(q.uid)).length;
    return { total: b.papers.length, gk: by(u => /_gk_/.test(u)), structures: by(u => /_level7_c[12]_/.test(u)), other: by(u => /_level7_c[34]_/.test(u)),
      gkChapters: [by(u => /_gk_g1_/.test(u)), by(u => /_gk_g2_/.test(u))], strChapters: [by(u => /_level7_c1_/.test(u)), by(u => /_level7_c2_/.test(u))], otherChapters: [by(u => /_level7_c3_/.test(u)), by(u => /_level7_c4_/.test(u))],
      unique: new Set(b.papers.map(q => q.uid)).size, short: b.shortfalls.length };
  });
  res.minutes = await pg.evaluate(() => LKS.minutes());

  /* 2. results screens. answers: 5 right, 3 wrong, 2 skipped out of 10 */
  async function results(scope, mode, label) {
    await pg.evaluate((scope, mode) => {
      const qs = Array.from({ length: 10 }, (_, i) => ({ uid: 'F_level7_c1_' + i, fileId: 'F_level7_c1', q: 'Question ' + i + ' about footings and piles?', options: ['A', 'B', 'C', 'D'], correct: i % 4, explanation: 'x' }));
      QUIZ._doStart(qs, mode, 'Test', false, scope);
      if (mode === 'exam') { for (let i = 0; i < 5; i++) QUIZ.exAnswer(i, i % 4); for (let i = 5; i < 8; i++) QUIZ.exAnswer(i, (i % 4 + 1) % 4); QUIZ.submitExam(); }
      else { for (let i = 0; i < 5; i++) { S.quiz.idx = i; QUIZ.fcAnswer(i % 4); } for (let i = 5; i < 8; i++) { S.quiz.idx = i; QUIZ.fcAnswer((i % 4 + 1) % 4); } QUIZ.fcFinish(); }
    }, scope, mode);
    await sleep(500);
    await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Submit/.test(x.textContent.trim()) && x.offsetParent !== null); b.length && b[b.length - 1].click(); });
    await sleep(1400);
    return pg.evaluate(() => {
      const t = document.body.innerText;
      return { ring: document.getElementById('res-pct').textContent, neg: (document.getElementById('res-neg') || {}).textContent || '', lok: /Loksewa/i.test(document.getElementById('view-results') ? document.getElementById('view-results').innerText : t),
        groupTable: /Marks by group/.test(t), chapterTable: /Marks by chapter/.test(t), tables: document.querySelectorAll('.chapter-breakdown').length,
        groupRows: [...document.querySelectorAll('.chapter-breakdown table:first-of-type tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()) };
    });
  }
  res.weekly = await results({ weeklyId: 'w1', weeklyTitle: 'Week 1', timeLimitSec: 600 }, 'exam');
  res.daily = await results({ loksewaMock: true, timeLimitSec: 600 }, 'exam');
  res.hourly = await results({ hourlySprint: true, timeLimitSec: 600 }, 'exam');
  res.practice = await results({ fid: 'F_level7_c1' }, 'flashcard');
  res.examPlain = await results({ timeLimitSec: 600 }, 'exam');
  res.afterwards = await results({ weeklyId: 'w2', weeklyTitle: 'Week 2', timeLimitSec: 600 }, 'exam');
  res.practiceAgain = await results({ fid: 'F_level7_c1' }, 'flashcard');

  await browser.close(); server.close();
  const lokOk = r => r.ring === '44%' && /Loksewa score: 4\.4 \/ 10/.test(r.neg) && r.chapterTable;
  const plainOk = r => !/Loksewa/i.test(r.neg) && r.neg === '' && !r.groupTable && !r.chapterTable && r.tables === 0 && r.ring === '50%';
  const checks = [
    ['the daily paper has the scheme\'s 75 questions', res.paper.total === 75],
    ['General Knowledge: exactly 25', res.paper.gk === 25],
    ['Structures: exactly 20, only chapters c1 and c2', res.paper.structures === 20],
    ['Other technical: exactly 30, only chapters c3 and c4', res.paper.other === 30],
    ['chapters take turns inside each group', res.paper.strChapters.join() === '10,10' && res.paper.otherChapters.join() === '15,15' && res.paper.gkChapters.slice().sort().join() === '12,13'],
    ['no question twice, nothing short', res.paper.unique === 75 && res.paper.short === 0],
    ['75 marks is 60 minutes', res.minutes === 60],
    ['the paper card lists the scheme\'s groups and marks', /General Knowledge\s*25/.test(res.card) && /Structures\s*20/.test(res.card) && /Other technical\s*30/.test(res.card) && /75-mark/.test(res.card)],
    ['weekly result: Loksewa-marked 44%, score line, chapter table', lokOk(res.weekly)],
    ['daily paper result: Loksewa-marked 44%, score line, chapter table', lokOk(res.daily)],
    ['hourly 50 result: Loksewa-marked 44%, score line, chapter table', lokOk(res.hourly)],
    ['daily paper result: marks by group from the scheme (Structures out of 20)', res.daily.groupTable && res.daily.groupRows.some(r => /Structures/.test(r) && /\/ 20/.test(r))],
    ['weekly and hourly score groups out of their own questions (not the paper\'s marks)', res.weekly.groupRows.some(r => /Structures/.test(r) && /\/ 10/.test(r)) && res.hourly.groupRows.some(r => /Structures/.test(r) && /\/ 10/.test(r))],
    ['chapter practice shows a plain percentage and NO Loksewa wording or tables', plainOk(res.practice)],
    ['a timed exam that is not weekly, daily or hourly is plain too', plainOk(res.examPlain)],
    ['tables from a Loksewa result do not stay behind on the next plain result', plainOk(res.practiceAgain)],
    ['only one set of tables on a Loksewa result', res.afterwards.tables === 1],
    ['no script errors', errs.length === 0]
  ];
  console.log(JSON.stringify({ paper: res.paper, daily: res.daily.groupRows, practice: res.practice.neg }, null, 0));
  checks.forEach(([n, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + n));
  if (errs.length) console.log('errors:', errs);
  process.exit(checks.every(c => c[1]) ? 0 : 1);
})();

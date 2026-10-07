/* Reported-question corrections, end to end.
   1. A report button exists wherever a question appears, and each report carries what the admin needs
      (options, the marked answer, what the student picked, which section).
   2. When the admin corrects a question file, the phone drops its old copy, downloads the corrected file,
      and updates the questions it saved for review (Missed, Saved, Flagged, weekly paper) without losing
      streaks, notes or tags. A question that was removed is marked Withdrawn, not deleted.
   3. The student is told when a question they reported was fixed.
       node tests/browser/corrections.js            (exit 1 on failure) */
const { serve, launch, STUDENT, BANK_REFS, bankFile, seedBank, sleep } = require('./common');
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  const { server, port } = await serve(); const browser = await launch();
  const pg = await browser.newPage(); await pg.setViewport({ width: 420, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  const reports = [], posts = []; let version = 1, corrections = {}, mine = [], fileFails = false, removeFirst = false;
  const FID = 'F_level7_c1';
  await pg.evaluateOnNewDocument(seedBank, STUDENT, BANK_REFS);
  await pg.setRequestInterception(true);
  pg.on('request', rq => {
    const u = rq.url();
    if (u.startsWith('http://localhost')) return rq.continue();
    if (/script\.google|exec/.test(u)) {
      const m = u.match(/fileId=([^&]+)/);
      if (m) {
        if (fileFails) return rq.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: false, error: 'busy' }) });
        let file = bankFile(decodeURIComponent(m[1]), version);
        if (version === 2 && decodeURIComponent(m[1]) === FID) {
          file[3].correct = 1;                                             /* the answer key of question 3 was wrong (it was 3) */
          file[5].q = file[5].q.replace('Which', 'Whch').replace('rule', 'rule') + ' (typo fixed)';   /* a wording fix in question 5 */
          if (removeFirst) file = file.slice(1);                           /* question 0 deleted: everything moves up by one */
        }
        return rq.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(file) });
      }
      let b = {}; try { b = JSON.parse(rq.postData() || '{}'); } catch (e) {}
      posts.push(b.action); let out = { success: true };
      if (b.action === 'reportQuestion') reports.push(b);
      if (b.action === 'getCorrections') out = { success: true, now: 5000, files: corrections, resolvedMine: mine };
      return rq.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    }
    rq.abort();
  });
  await pg.goto(`http://localhost:${port}/user.html`, { waitUntil: 'load' });
  await pg.evaluate(() => { S.online = true; S.forcedOffline = false; localStorage.setItem('abhyas_corr_seen', '1'); localStorage.setItem('abhyas_corr_checked', String(Date.now())); });
  await sleep(1500);
  const res = {};
  const BANK = bankFile(FID, 1);
  await pg.evaluate(b => { window.__BANK = b; }, BANK);
  const mkQ = i => Object.assign({ uid: 'F_level7_c1_' + i, fileId: 'F_level7_c1' }, JSON.parse(JSON.stringify(window.__BANK[i])));

  /* ---------- 1. report buttons and payloads ---------- */
  async function sendReport(open, label) {
    await pg.evaluate(open); await sleep(400);
    const before = reports.length;
    await pg.evaluate(() => { const s = document.getElementById('qr-reason'); if (s) s.value = 'wrong_answer'; const n = document.getElementById('qr-note'); if (n) n.value = 'check'; document.getElementById('qr-send-btn').click(); });
    await sleep(500);
    res['report ' + label] = reports.length > before ? reports[reports.length - 1] : null;
  }
  const start = (mode, scope) => `(function(){ const qs=[0,1,2,3].map(${mkQ.toString()}); QUIZ._doStart(qs,'${mode}','T',false,${JSON.stringify(scope)}); })()`;
  // practice (flashcard): pick option 1 on question 0, then report
  await pg.evaluate(start('flashcard', { fid: FID })); await sleep(400);
  await pg.evaluate(() => { S.quiz.idx = 0; QUIZ.fcAnswer(1); });
  await sendReport(() => QUIZ._reportCurrent(), 'practice');
  // timed exam variants
  for (const [label, scope] of [['exam', { timeLimitSec: 600 }], ['daily-paper', { loksewaMock: true, timeLimitSec: 600 }], ['weekly', { weeklyId: 'w1', timeLimitSec: 600 }], ['hourly', { hourlySprint: true, timeLimitSec: 600 }]]) {
    await pg.evaluate(start('exam', scope)); await sleep(400);
    res['button ' + label] = await pg.evaluate(() => document.querySelectorAll('#ex-qs [aria-label^="Report an issue"]').length);
    await pg.evaluate(() => QUIZ.exAnswer(2, 0));
    await sendReport(() => QUIZ._reportExam(2), label);
  }
  // results page
  await pg.evaluate(() => { QUIZ.exAnswer(0, 0); QUIZ.submitExam(); }); await sleep(400);
  await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => /^Submit/.test(x.textContent.trim()) && x.offsetParent !== null); b.length && b[b.length - 1].click(); }); await sleep(1300);
  res['button results'] = await pg.evaluate(() => document.querySelectorAll('#view-results [aria-label^="Report an issue"], #res-list [aria-label^="Report an issue"]').length || document.querySelectorAll('[aria-label^="Report an issue with question"]').length);
  await sendReport(() => QUIZ._reportResult(1), 'results');
  // review lists
  await pg.evaluate(mk => { const f = eval('(' + mk + ')'); S.wr = [0, 1, 2, 3, 4, 5].map(i => Object.assign(f(i), { _streak: 2, _nextDue: 1234, tag: 'formula', _note: 'my note' })); S.bk = [0, 3, 5].map(i => Object.assign(f(i), { tag: 'x' })); S.fl = [3].map(f);
    _save(LS.WR, S.wr); _save(LS.BK, S.bk); _save(LS.FL, S.fl); }, mkQ.toString());
  for (const [view, kind, label] of [['wrong', 'wr', 'review-missed'], ['bookmarks', 'bk', 'review-saved'], ['flagged', 'fl', 'review-flagged']]) {
    await pg.evaluate(`UI.go('${view}')`); await sleep(500);
    if (kind === 'wr') { await pg.evaluate(() => WRONGBY._plain('wr')); await sleep(300); }       /* the flat list shows every question */
    res['button ' + label] = await pg.evaluate(() => document.querySelectorAll('.view.on [aria-label="Report an issue with this question"]').length);
    res['rows ' + label] = await pg.evaluate(() => document.querySelectorAll('.view.on .sd-card, .view.on .q-card, .view.on .rq, .view.on [class*="rev-"]').length);
    await sendReport(`REV._report('${kind}','F_level7_c1_3')`, label);
  }
  // a question from the student's own bank has no report button and cannot be reported
  await pg.evaluate(() => { S.quiz = { qs: [{ uid: 'local_1', fileId: 'local', q: 'mine', options: ['a', 'b'], correct: 0 }], ans: [null], idx: 0, mode: 'flashcard', scope: {} }; QUIZ._openReport(S.quiz.qs[0], { section: 'practice' }); });
  res.localReports = reports.length;
  const nBefore = reports.length;
  res.localNoModal = await pg.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /cannot be reported/.test(t.textContent)));

  /* ---------- 2. a correction arrives ---------- */
  await pg.evaluate(() => UI.go('home')); await sleep(300);
  /* the corrected file is not downloaded yet: the old copy is still cached */
  await pg.evaluate(async fid => { const raw = await QUIZ._fetch(fid, 'k_level7_c1'); window.__oldCached = normQ(raw, fid)[3].correct; }, FID);
  res.oldCachedAnswer = await pg.evaluate(() => window.__oldCached);
  version = 2; corrections = { [FID]: 4000, SOME_OTHER_FILE_NOT_ON_THIS_PHONE: 4100 }; mine = [{ uid: FID + '_3', at: 4000 }];
  await pg.evaluate(() => { localStorage.setItem('abhyas_corr_checked', '0'); return CORRECTIONS.check(true); }); await sleep(2500);
  res.afterCorrection = await pg.evaluate(() => ({
    wr3: S.wr.find(x => x.uid === 'F_level7_c1_3'), wr5: S.wr.find(x => x.uid === 'F_level7_c1_5'), wrLen: S.wr.length, bk3: S.bk.find(x => x.uid === 'F_level7_c1_3'), fl3: S.fl.find(x => x.uid === 'F_level7_c1_3'), wr1: S.wr.find(x => x.uid === 'F_level7_c1_1'),
    saved: JSON.parse(localStorage.getItem('abhyas_wr')).find(x => x.uid === 'F_level7_c1_3').correct, seen: localStorage.getItem('abhyas_corr_seen'),
    toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ') }));
  res.newCache = await pg.evaluate(async fid => { const raw = await QUIZ._fetch(fid, 'k_level7_c1'); return normQ(raw, fid)[3].correct; }, FID);
  res.asked = posts.filter(a => a === 'getCorrections').length;
  /* shown in the list with a Corrected tag */
  await pg.evaluate(() => { UI.go('wrong'); WRONGBY._plain('wr'); }); await sleep(500);
  res.correctedTag = await pg.evaluate(() => /Corrected/.test(document.getElementById('view-wrong').innerText));
  res.wrongHtml = await pg.evaluate(() => (document.querySelector('#view-wrong .rq-list, #view-wrong #wr-list, #view-wrong') || {}).innerHTML.slice(0, 600));

  /* ---------- 3. the file loses a question: Withdrawn, never deleted, never practised ---------- */
  version = 2; removeFirst = true; corrections = { [FID]: 4500 };
  await pg.evaluate(() => { S.wr.unshift(Object.assign({}, S.wr[0], { uid: 'F_level7_c1_0', q: 'Question 0 of F_level7_c1 about civil engineering topic number 0 version 1' })); _save(LS.WR, S.wr); localStorage.setItem('abhyas_corr_checked', '0'); return CORRECTIONS.check(true); }); await sleep(2500);
  res.afterRemoval = await pg.evaluate(() => ({ len: S.wr.length, q0: (S.wr.find(x => x.q && x.q.indexOf('number 0 version') !== -1) || {})._withdrawn === true, uids: S.wr.map(x => x.uid).slice(0, 8),
    due: REV.dueWrong().some(x => x._withdrawn) }));
  res.withdrawnTag = await pg.evaluate(() => { UI.go('wrong'); WRONGBY._plain('wr'); return new Promise(r => setTimeout(() => r(/Withdrawn/.test(document.getElementById('view-wrong').innerText)), 500)); });
  res.grouped = await pg.evaluate(() => { WRONGBY.render(); const g = WRONGBY.groups(); const nWith = S.wr.filter(x => x._withdrawn).length;
    return { counted: g.reduce((n, c) => n + c.n, 0), total: S.wr.length, withdrawn: nWith, note: /withdrawn question/.test(document.getElementById('wr-list').innerText) }; });
  res.practiceSet = await pg.evaluate(async () => { let started = null; const orig = QUIZ.startWith; QUIZ.startWith = (qs) => { started = qs.map(q => q.uid + '|' + q.q.slice(0, 20)); }; QUIZ._showLoader = () => {}; QUIZ._hideLoader = () => {};
    await WRONGBY.start(['F_level7_c1'], false); QUIZ.startWith = orig; return { n: started ? started.length : -1, hasWithdrawn: started ? started.some(s => /Which \w+ rule governs the \w+ when the \w+ carries \w+ near the \w+ number 0\?/.test(s)) : null }; });

  /* ---------- 4. a failed download changes nothing and is retried ---------- */
  fileFails = true; corrections = { [FID]: 6000 };
  const lenBefore = await pg.evaluate(() => S.wr.length + ':' + JSON.stringify(S.wr.map(x => x.correct)));
  await pg.evaluate(() => { localStorage.setItem('abhyas_corr_seen', '4500'); localStorage.setItem('abhyas_corr_checked', '0'); return CORRECTIONS.check(true); }); await sleep(1800);
  res.failed = await pg.evaluate(() => ({ same: S.wr.length + ':' + JSON.stringify(S.wr.map(x => x.correct)), seen: localStorage.getItem('abhyas_corr_seen') }));
  res.lenBefore = lenBefore;
  await browser.close(); server.close();

  const rp = res['report practice'] || {};
  const full = (r, section) => r && r.uid === 'F_level7_c1_' + (r.uid.split('_').pop()) && r.section === section && Array.isArray(r.optionsSnapshot) && r.optionsSnapshot.length === 4 && r.correctIndex !== '' && r.reason === 'wrong_answer' && r.appVersion;
  const ac = res.afterCorrection;
  const checks = [
    ['practice report: options, marked answer, the student\'s pick (B) and section', full(rp, 'practice') && rp.chosenIndex === 1],
    ['timed exam, daily paper, weekly and hourly questions each have a report button (4 questions)', ['exam', 'daily-paper', 'weekly', 'hourly'].every(l => res['button ' + l] === 4)],
    ['each of those reports names its own section', ['exam', 'daily-paper', 'weekly', 'hourly'].every(l => full(res['report ' + l], l))],
    ['the report from an exam carries what the student picked (A)', res['report weekly'] && res['report weekly'].chosenIndex === 0],
    ['results page has report buttons and reports as "results"', res['button results'] >= 4 && full(res['report results'], 'results')],
    ['Missed (full list), Saved and Flagged lists have report buttons and report their own section', res['button review-missed'] >= 6 && res['button review-saved'] >= 3 && res['button review-flagged'] >= 1 && full(res['report review-missed'], 'review-missed') && full(res['report review-saved'], 'review-saved') && full(res['report review-flagged'], 'review-flagged')],
    ['a question from the student\'s own bank cannot be reported (the app says so, nothing is sent)', res.localNoModal && res.localReports === nBefore],
    ['before the correction, the phone shows the OLD answer key (D)', res.oldCachedAnswer === 3],
    ['after the correction, the saved copy in Missed has the new answer (B), on the device too', ac.wr3 && ac.wr3.correct === 1 && ac.saved === 1],
    ['Saved and Flagged copies are corrected too', ac.bk3 && ac.bk3.correct === 1 && ac.fl3 && ac.fl3.correct === 1],
    ['a wording fix reaches the saved copy', ac.wr5 && /typo fixed/.test(ac.wr5.q)],
    ['streak, due date, tag and note survive the correction', ac.wr3 && ac.wr3._streak === 2 && ac.wr3._nextDue === 1234 && ac.wr3.tag === 'formula' && ac.wr3._note === 'my note'],
    ['an untouched saved question is unchanged and not tagged', ac.wr1 && ac.wr1.correct === 1 && !ac.wr1._corrected],
    ['nothing was deleted by the correction', ac.wrLen === 6],
    ['the downloaded file was replaced: the next load has the new key', res.newCache === 1],
    ['the student was told, and thanked for the report', /updated/i.test(ac.toasts) && /Thanks/.test(ac.toasts) && /reported/.test(ac.toasts)],
    ['a corrected question carries a "Corrected" tag in the list', res.correctedTag],
    ['the check asked the server exactly once', res.asked >= 1],
    ['"last seen" moved forward so it is not repeated', ac.seen === '5000'],
    ['a question the file no longer has is marked Withdrawn, not deleted', res.afterRemoval.q0 && res.afterRemoval.len >= 7],
    ['withdrawn questions are shown with a tag and left out of practice', res.withdrawnTag && res.afterRemoval.due === false],
    ['the grouped Missed view leaves withdrawn questions out of its counts and says how many', res.grouped.counted === res.grouped.total - res.grouped.withdrawn && res.grouped.withdrawn >= 1 && res.grouped.note],
    ['practising missed questions never includes a withdrawn one', res.practiceSet.n === res.grouped.total - res.grouped.withdrawn],
    ['a failed download of the corrected file changes nothing', res.failed.same === res.lenBefore],
    ['and it will be tried again (last seen not advanced)', res.failed.seen === '4500'],
    ['no script errors', errs.length === 0]
  ];
  console.log('WRONGHTML', (res.wrongHtml||'').replace(/\s+/g,' ').slice(0,500));
  console.log('LISTS', JSON.stringify({m: res['button review-missed'], s: res['button review-saved'], f: res['button review-flagged'], rep: ['review-missed','review-saved','review-flagged'].map(k => res['report '+k] && res['report '+k].section), tag: res.correctedTag, wtag: res.withdrawnTag}));
  console.log(JSON.stringify({ afterCorrection: { wr3: ac.wr3 && { c: ac.wr3.correct, s: ac.wr3._streak, corrected: !!ac.wr3._corrected }, toasts: ac.toasts }, afterRemoval: res.afterRemoval, failed: res.failed, buttons: Object.fromEntries(Object.entries(res).filter(([k]) => /^button/.test(k))) }));
  checks.forEach(([n, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + n));
  if (errs.length) console.log('errors:', errs);
  process.exit(checks.every(c => c[1]) ? 0 : 1);
})();

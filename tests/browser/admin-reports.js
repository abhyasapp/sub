/* Admin side of question corrections and the Loksewa mark scheme, in a real browser with a pretend backend.
   - Reports show what the student saw: options, the answer the app marks correct, what the student picked,
     the section, how many students reported it, and offer "Mark fixed" / "No change needed".
   - The mark-scheme editor builds, validates and saves the scheme.
   - Both screens pass the accessibility audit.
       node tests/browser/admin-reports.js            (exit 1 on failure) */
const fs = require('fs');
const { serve, launch, enterAdmin, BANK_REFS, sleep } = require('./common');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

(async () => {
  const { server, port } = await serve(); const browser = await launch();
  const pg = await browser.newPage(); await pg.setViewport({ width: 1100, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  const sent = [];
  const now = new Date().toISOString();
  let reports = [
    { id: 'r1', uid: 'FILEAAA111_3', fileId: 'FILEAAA111', questionNumber: 4, questionSnapshot: 'Which footing rule governs the settlement?', reason: 'wrong_answer', note: 'D is wrong', reportedBy: 'sita', reportedAt: now, status: 'open',
      options: ['10 kN', '20 kN', '30 kN', '40 kN'], correctIndex: 3, chosenIndex: 1, section: 'weekly', openReporters: 3, resolvedAt: '', resolvedBy: '', corrected: false },
    { id: 'r2', uid: 'FILEAAA111_3', fileId: 'FILEAAA111', questionNumber: 4, questionSnapshot: 'Which footing rule governs the settlement?', reason: 'wrong_answer', note: '', reportedBy: 'ram', reportedAt: now, status: 'open',
      options: ['10 kN', '20 kN', '30 kN', '40 kN'], correctIndex: 3, chosenIndex: null, section: 'daily-paper', openReporters: 3, resolvedAt: '', resolvedBy: '', corrected: false },
    { id: 'r3', uid: 'FILEBBB222_0', fileId: 'FILEBBB222', questionNumber: 1, questionSnapshot: 'Old report with no extra details', reason: 'typo', note: '', reportedBy: 'gita', reportedAt: now, status: 'open',
      options: [], correctIndex: null, chosenIndex: null, section: '', openReporters: 1, resolvedAt: '', resolvedBy: '', corrected: false }];
  await pg.setRequestInterception(true);
  pg.on('request', rq => {
    const u = rq.url();
    if (u.startsWith('http://localhost')) return rq.continue();
    if (rq.method() === 'POST' && /script\.google|exec/.test(u)) {
      let b = {}; try { b = JSON.parse(rq.postData() || '{}'); } catch (e) {}
      sent.push(b); let out = { success: true };
      if (b.action === 'adminListQuestionReports') out = { success: true, reports };
      if (b.action === 'adminUpdateQuestionReportStatus') { out = { success: true, id: b.id, status: b.status, alsoClosed: b.id === 'r1' ? 1 : 0, refreshed: b.corrected !== false }; reports = reports.map(r => (r.id === b.id || (b.id === 'r1' && r.uid === 'FILEAAA111_3')) ? Object.assign({}, r, { status: b.status, resolvedBy: 'owner' }) : r); }
      if (b.action === 'adminMarkFileCorrected') out = /^[A-Za-z0-9_-]{10,200}$/.test(b.fileId) ? { success: true } : { success: false, error: 'bad id' };
      if (b.action === 'adminUpdateSettings') out = { success: true };
      return rq.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    }
    rq.abort();
  });
  await pg.evaluateOnNewDocument(refs => {
    window.CH_NAMES = {}; window.LEVEL_LABELS = { gk: 'General Knowledge', level7: 'Level 7' }; window.DRIVE = {};
    window.ChapterData = { allFileRefs: () => refs, chapterFileRefs: (lv, ch) => refs.filter(r => r.lv === lv && r.ch === ch), chapterName: (lv, ch) => ch.toUpperCase(), levelLabel: lv => window.LEVEL_LABELS[lv] || lv,
      chapters: () => [], levels: () => ['gk', 'level7'], fileCount: () => refs.length, files: () => refs, books: () => [] };
  }, BANK_REFS);
  await pg.goto(`http://localhost:${port}/admin.html`, { waitUntil: 'load' }); await sleep(1200);
  await enterAdmin(pg);
  const res = {};
  const audit = async label => { await pg.evaluate(axeSrc); for (const dark of [false, true]) { res['a11y ' + label + (dark ? ' dark' : '')] = await pg.evaluate(async d => { if (!document.getElementById('a11y-still')) { const st = document.createElement('style'); st.id = 'a11y-still'; st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st); } document.documentElement.classList.toggle('dark', d); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise(r => setTimeout(r, 100)); const o = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] }); return o.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ')); }, dark); } };

  /* ---- Reports ---- */
  await pg.evaluate(() => { UI.nav('qreports'); return QREPORTS.load(); }); await sleep(900);
  res.cards = await pg.evaluate(() => [...document.querySelectorAll('#qreports-list .sub-card, #qreports-list .card, #qreports-list > *')].length);
  res.page = await pg.evaluate(() => { const t = document.getElementById('view-qreports').innerText.replace(/\s+/g, ' ');
    return { shows3: /3 students/.test(t), correctMarked: /marked correct/.test(t), studentChose: /student chose/.test(t), weekly: /Weekly test/.test(t), daily: /Daily 75-mark paper/.test(t), qno: /question 4 in its file/.test(t),
      drive: !!document.querySelector('#view-qreports a[href^="https://drive.google.com/file/d/FILEAAA111/view"]'), noDetail: /Section not recorded/.test(t), noChange: document.querySelectorAll('#view-qreports button[title*="already right"]').length,
      mark: document.querySelectorAll('#view-qreports button[title*="corrected the question file"]').length, refresh: !!document.querySelector('#view-qreports button[onclick*="refreshFile"]'),
      correctOpt: document.querySelectorAll('#view-qreports .qr-opt.is-correct').length, pickedOpt: document.querySelectorAll('#view-qreports .qr-opt.is-picked').length }; });
  await audit('reports');
  // mark fixed: also closes the other report on the same question
  await pg.evaluate(() => QREPORTS.setStatus('r1', 'resolved')); await sleep(800);
  res.fixedRequest = sent.filter(b => b.action === 'adminUpdateQuestionReportStatus').pop();
  res.afterFixed = await pg.evaluate(() => QREPORTS.all.filter(r => r.uid === 'FILEAAA111_3').map(r => r.status));
  await pg.evaluate(() => QREPORTS.setStatus('r3', 'resolved', false)); await sleep(500);
  res.noChangeRequest = sent.filter(b => b.action === 'adminUpdateQuestionReportStatus').pop();
  // refresh a file
  await pg.evaluate(() => QREPORTS.refreshFile()); await sleep(300);
  await pg.evaluate(() => { document.getElementById('rf-id').value = 'bad id'; QREPORTS.doRefreshFile(); }); await sleep(200);
  res.badIdSent = sent.some(b => b.action === 'adminMarkFileCorrected');
  await pg.evaluate(() => { document.getElementById('rf-id').value = 'FILEAAA111xyz'; QREPORTS.doRefreshFile(); }); await sleep(500);
  res.goodIdSent = sent.filter(b => b.action === 'adminMarkFileCorrected').map(b => b.fileId);
  await pg.evaluate(() => MODAL.close('sheet'));

  /* ---- Mark scheme editor ---- */
  await pg.evaluate(() => { UI.nav('settings'); LKS_ADMIN.load(''); }); await sleep(700);
  res.defaultRows = await pg.evaluate(() => ({ rows: document.querySelectorAll('#lks-rows .lks-row').length, total: document.getElementById('lks-total').textContent, names: [...document.querySelectorAll('.lks-name')].map(i => i.value), levels: [...document.querySelectorAll('.lks-level')].map(s => s.value) }));
  await audit('settings');
  // build a three-group scheme
  await pg.evaluate(() => { LKS_ADMIN.addRow(); const rows = document.querySelectorAll('#lks-rows .lks-row'); const last = rows[rows.length - 1]; last.querySelector('.lks-name').value = 'Structures'; last.querySelector('.lks-marks').value = '20'; last.querySelector('.lks-level').value = 'level7'; LKS_ADMIN._levelChanged(2); });
  await sleep(300);
  await pg.evaluate(() => { const rows = document.querySelectorAll('#lks-rows .lks-row'); const last = rows[rows.length - 1]; last.querySelector('details').open = true; last.querySelectorAll('.lks-ch').forEach(c => { if (c.value === 'c1' || c.value === 'c2') c.checked = true; }); LKS_ADMIN._changed();
    const second = rows[1]; second.querySelector('.lks-marks').value = '30'; LKS_ADMIN._changed(); });
  res.threeRows = await pg.evaluate(() => ({ rows: LKS_ADMIN.rows.length, total: document.getElementById('lks-total').textContent, problem: LKS_ADMIN.problem() }));
  // an overlapping chapter is refused and nothing is sent
  const n0 = sent.length;
  await pg.evaluate(() => { LKS_ADMIN.addRow(); const rows = document.querySelectorAll('#lks-rows .lks-row'); const last = rows[rows.length - 1]; last.querySelector('.lks-name').value = 'Dup'; last.querySelector('.lks-marks').value = '5'; last.querySelector('.lks-level').value = 'level7'; LKS_ADMIN._levelChanged(3); });
  await sleep(200);
  await pg.evaluate(() => { const rows = document.querySelectorAll('#lks-rows .lks-row'); rows[rows.length - 1].querySelectorAll('.lks-ch').forEach(c => { if (c.value === 'c1') c.checked = true; }); LKS_ADMIN._changed(); });
  res.overlap = await pg.evaluate(() => LKS_ADMIN.problem());
  await pg.evaluate(() => LKS_ADMIN.save()); await sleep(300);
  res.overlapSent = sent.length - n0;
  await pg.evaluate(() => LKS_ADMIN.removeRow(3)); await sleep(200);
  await pg.evaluate(() => LKS_ADMIN.save()); await sleep(600);
  res.saved = sent.filter(b => b.action === 'adminUpdateSettings').pop();
  await browser.close(); server.close();

  const p = res.page, sv = res.saved && JSON.parse(res.saved.value);
  const checks = [
    ['reports: three open reports are listed', res.cards >= 3],
    ['reports: "3 students reported this" warning', p.shows3],
    ['reports: options shown with the marked-correct one and the student\'s pick', p.correctMarked && p.studentChose && p.correctOpt >= 2 && p.pickedOpt >= 1],
    ['reports: section, position in the file, link to the file in Drive', p.weekly && p.daily && p.qno && p.drive],
    ['reports: an old report with no details still displays', p.noDetail],
    ['reports: "Mark fixed", "No change needed" and "Refresh a file" are offered', p.mark >= 3 && p.noChange >= 3 && p.refresh],
    ['mark fixed sends resolved (students told to refresh)', res.fixedRequest.status === 'resolved' && res.fixedRequest.corrected === undefined],
    ['mark fixed closes the other open report on the same question', res.afterFixed.join() === 'resolved,resolved'],
    ['"No change needed" says corrected:false so students are not told to refresh', res.noChangeRequest.corrected === false && res.noChangeRequest.status === 'resolved'],
    ['refresh a file refuses a bad id without calling the server', res.badIdSent === false],
    ['refresh a file sends a good id', res.goodIdSent.join() === 'FILEAAA111xyz'],
    ['scheme editor starts from the default: 25 + 50 = 75', res.defaultRows.rows === 2 && /75 marks/.test(res.defaultRows.total) && res.defaultRows.levels.join() === 'gk,level7'],
    ['scheme editor: a third group with ticked chapters, total updates', res.threeRows.rows === 3 && /75 marks/.test(res.threeRows.total) && res.threeRows.problem === ''],
    ['scheme editor: the same chapter in two groups is refused, nothing sent', /only belong to one group/.test(res.overlap) && res.overlapSent === 0],
    ['scheme editor: saves a validated scheme as the public setting', res.saved && res.saved.key === 'loksewaScheme' && sv.groups.length === 3 && sv.groups[2].name === 'Structures' && sv.groups[2].chapters.join() === 'c1,c2' && sv.groups[1].marks === 30],
    ['accessibility: Reports, light and dark', res['a11y reports'].length === 0 && res['a11y reports dark'].length === 0],
    ['accessibility: Settings with the scheme editor, light and dark', res['a11y settings'].length === 0 && res['a11y settings dark'].length === 0],
    ['no script errors', errs.length === 0]
  ];
  console.log(JSON.stringify({ page: p, defaultRows: res.defaultRows, threeRows: res.threeRows, a11y: { r: res['a11y reports'], rd: res['a11y reports dark'], s: res['a11y settings'], sd: res['a11y settings dark'] } }));
  checks.forEach(([n, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + n));
  if (errs.length) console.log('errors:', errs);
  process.exit(checks.every(c => c[1]) ? 0 : 1);
})();

/* Sync must never remove data. A device with a large missed-question bank meets a small cloud copy
   (the case that cut 250 missed questions down to 21). Runs the real app in headless Chromium against a
   pretend backend and checks: nothing is lost, the uploaded copy is complete, "Restore" and "Load a backup"
   only add, and the Recover screen can add a safety copy back.
       node tests/browser/sync-merge.js            (exit 1 on failure) */
const { serve, launch, STUDENT, seedStudent, sleep } = require('./common');

(async () => {
  const { server, port } = await serve(); const browser = await launch();
  const pg = await browser.newPage(); await pg.setViewport({ width: 420, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  const sent = []; let mode = 'conflict';
  const cloudCopy = JSON.stringify({ prog: { total: 10, correct: 5, sessions: [] }, wr: [{ uid: 'cloud_1', q: 'from the other device' }], bk: [{ uid: 'cloud_b', q: 'saved elsewhere' }], fl: [], stk: { days: ['2026-10-01'], last: '2026-10-01' }, cov: {}, chapStats: {}, qnotes: {} });
  await pg.evaluateOnNewDocument(seedStudent, STUDENT);
  await pg.evaluateOnNewDocument(() => {
    const mk = (n, p) => Array.from({ length: n }, (_, i) => ({ uid: p + i, q: 'A fairly long civil engineering question number ' + i + ' about soil bearing capacity and settlement of footings?', options: ['Option one is this long sentence', 'Option two is that long sentence', 'Option three another long one', 'Option four final long sentence'], exp: 'Explanation text so the stored item has a realistic size.', _streak: i % 3, _nextDue: Date.now() + i * 1000 }));
    localStorage.setItem('abhyas_wr', JSON.stringify(mk(250, 'w_'))); localStorage.setItem('abhyas_bk', JSON.stringify(mk(60, 'b_'))); localStorage.setItem('abhyas_fl', JSON.stringify(mk(20, 'f_')));
  });
  await pg.setRequestInterception(true);
  pg.on('request', rq => {
    const u = rq.url();
    if (u.startsWith('http://localhost')) return rq.continue();
    if (rq.method() === 'POST' && /script\.google|exec/.test(u)) {
      let b = {}; try { b = JSON.parse(rq.postData() || '{}'); } catch (e) {}
      sent.push(b); let out = { success: true };
      if (b.action === 'saveProgress') out = (mode === 'conflict' && b.baseUpdatedAt === '') ? { success: false, conflict: true, data: cloudCopy, updatedAt: '2026-10-03T10:00:00.000Z' } : { success: true, updatedAt: '2026-10-03T10:00:09.000Z' };
      if (b.action === 'getProgress') out = { success: true, data: cloudCopy, updatedAt: '2026-10-03T10:00:00.000Z' };
      if (b.action === 'getProgressHistory') out = b.slot ? { success: true, data: cloudCopy, savedAt: '2026-10-02T08:00:00.000Z' } : { success: true, entries: [{ slot: 1, savedAt: '2026-10-02T08:00:00.000Z', chars: 2100 }] };
      return rq.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out) });
    }
    rq.abort();
  });
  await pg.goto(`http://localhost:${port}/user.html`, { waitUntil: 'load' });
  await pg.evaluate(() => { ABHYAS_CONFIG.GAS_URL = 'https://script.google.com/macros/s/TEST/exec'; S.online = true; S.forcedOffline = false; });
  await sleep(1500);
  const res = {}; const counts = () => pg.evaluate(() => ({ wr: S.wr.length, bk: S.bk.length, fl: S.fl.length, savedWr: (JSON.parse(localStorage.getItem('abhyas_wr') || '[]')).length, savedBk: (JSON.parse(localStorage.getItem('abhyas_bk') || '[]')).length }));
  res.start = await counts();

  // 1. a save meets another device's copy -> combined, nothing removed
  await pg.evaluate(() => PSYNC.pushNow()); await sleep(1200);
  res.afterConflict = await counts();
  const saves = sent.filter(b => b.action === 'saveProgress');
  res.saveRequests = saves.length;
  res.uploaded = await pg.evaluate(async d => { const o = await syncDecode(d); return { wr: o.wr.length, bk: o.bk.length, gz: d.indexOf('gz1:') === 0, chars: d.length }; }, saves[saves.length - 1].data);
  res.toast = await pg.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
  res.snapshots = await pg.evaluate(() => PSYNC.listSnapshots().map(s => ({ reason: s.reason, wr: s.counts.wr, bk: s.counts.bk })));

  // 2. Restore adds, "Load a backup" adds
  await pg.evaluate(() => { S.wr.push({ uid: 'new_on_device', q: 'x' }); _save(LS.WR, S.wr); });
  await pg.evaluate(() => DATA.restoreCloud()); await sleep(900);
  res.afterRestore = await counts();
  await pg.evaluate(() => DATA._applyImport({ wr: [{ uid: 'file_1', q: 'from a file' }], bk: [], fl: [], prog: { total: 1, correct: 1, sessions: [] }, stk: { days: [], last: '' } })); await sleep(500);
  res.afterImport = await counts();

  // 3. Recover screen: safety copy listed, cloud history listed, adding back only adds
  await pg.evaluate(() => UI.go('data')); await sleep(500);
  res.recoverRows = await pg.evaluate(() => document.querySelectorAll('#recover-local .rec-row').length);
  await pg.screenshot({ path: '/tmp/recover.png' });
  const before = await counts();
  await pg.evaluate(() => RECOVER.addLocal(document.querySelectorAll('#recover-local .rec-row').length - 1)); await sleep(500);
  res.afterRecoverLocal = await counts(); res.recoverMsg = await pg.evaluate(() => document.getElementById('recover-msg').textContent);
  await pg.evaluate(() => RECOVER.loadCloud()); await sleep(600);
  res.cloudRows = await pg.evaluate(() => document.querySelectorAll('#recover-cloud .rec-row').length);
  await pg.evaluate(() => RECOVER.addCloud(1)); await sleep(500);
  res.afterRecoverCloud = await counts();

  // 3b. the real recovery case: data has been lost, and the safety copy brings it back
  await pg.evaluate(() => { S.wr = S.wr.slice(0, 5); S.bk = S.bk.slice(0, 3); _save(LS.WR, S.wr); _save(LS.BK, S.bk); });
  res.simulatedLoss = await counts();
  const big = await pg.evaluate(() => PSYNC.listSnapshots().findIndex(s => s.counts.wr >= 250));
  await pg.evaluate(i => RECOVER.addLocal(i), big); await sleep(600);
  res.afterRealRecovery = await counts();
  res.recoveredMsg = await pg.evaluate(() => document.getElementById('recover-msg').textContent);

  // 3c. signing in with the same account in different capitals never wipes the device; a different account does, after keeping a copy
  await pg.evaluate(() => { _save(LS.LAST_USER, 'Sita'); });
  const sameBefore = await counts();
  await pg.evaluate(() => AUTH._resetUserScopedLocalDataIfDifferentUser('sita'));
  res.sameAccount = await counts();
  await pg.evaluate(() => AUTH._resetUserScopedLocalDataIfDifferentUser('Someone Else'));
  res.otherAccount = await counts();
  res.otherSeesSnapshots = await pg.evaluate(() => { S.user = { username: 'Someone Else', token: 'tok' }; return PSYNC.listSnapshots().length; });
  await pg.evaluate(() => { S.user = { username: 'sita', token: 'tok' }; });
  res.ownerSeesSnapshots = await pg.evaluate(() => PSYNC.listSnapshots().filter(x => x.reason === 'before-account-switch').length);

  // 4. the page closing never uploads a cut-down copy
  const n0 = sent.length; await pg.evaluate(() => PSYNC._beaconSync()); res.beaconSent = sent.length - n0;
  await browser.close(); server.close();

  const checks = [
    ['starts with 250 / 60 / 20', res.start.wr === 250 && res.start.bk === 60 && res.start.fl === 20],
    ['save conflict: all 250 kept + 1 from the other device', res.afterConflict.wr === 251 && res.afterConflict.savedWr === 251],
    ['save conflict: all 60 saved kept + 1 from the other device', res.afterConflict.bk === 61 && res.afterConflict.savedBk === 61],
    ['flagged questions untouched', res.afterConflict.fl === 20],
    ['combined copy was uploaded (2 requests) and holds everything', res.saveRequests === 2 && res.uploaded.wr === 251 && res.uploaded.bk === 61],
    ['a big copy is sent compressed', res.uploaded.gz && res.uploaded.chars <= 44000],
    ['user told nothing was removed', /Nothing was removed/.test(res.toast)],
    ['a safety copy of the 250/60 state was kept', res.snapshots.some(s => s.wr === 250 && s.bk === 60)],
    ['Restore adds, keeps the item added on this device', res.afterRestore.wr >= 252],
    ['loading a backup file adds', res.afterImport.wr === res.afterRestore.wr + 1],
    ['Recover screen lists a safety copy', res.recoverRows >= 1],
    ['adding a safety copy back never reduces anything', res.afterRecoverLocal.wr >= before.wr && res.afterRecoverLocal.bk >= before.bk],
    ['Recover says nothing was removed', /Nothing was removed/.test(res.recoverMsg)],
    ['earlier cloud copies are listed', res.cloudRows === 1],
    ['adding an earlier cloud copy never reduces anything', res.afterRecoverCloud.wr >= res.afterRecoverLocal.wr],
    ['after losing data, the safety copy brings all 250 missed and 60 saved questions back', res.simulatedLoss.wr === 5 && res.afterRealRecovery.wr >= 250 && res.afterRealRecovery.bk >= 60],
    ['the recovery message says how much came back', /missed/.test(res.recoveredMsg) && /Nothing was removed/.test(res.recoveredMsg)],
    ['same account in different capitals keeps everything', res.sameAccount.wr === sameBefore.wr && res.sameAccount.bk === sameBefore.bk],
    ['a different account starts clean', res.otherAccount.wr === 0 && res.otherAccount.bk === 0],
    ['the other account cannot see the first account\'s safety copies', res.otherSeesSnapshots === 0],
    ['the first account finds a copy taken before the switch', res.ownerSeesSnapshots >= 1],
    ['closing the page sends nothing when the copy would not fit as-is', res.beaconSent === 0],
    ['no script errors', errs.length === 0]
  ];
  console.log(JSON.stringify(res));
  checks.forEach(([n, ok]) => console.log((ok ? '  ok   ' : '  FAIL ') + n));
  if (errs.length) console.log('errors:', errs);
  process.exit(checks.every(c => c[1]) ? 0 : 1);
})();

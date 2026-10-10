/* Behavioural test of the offline download (v1.34): the real client code (CACHE.dl, QUIZ._fetch, QUIZ._fetchBatch)
   talking to the real server code (handleGetFile / handleGetFiles from gas/code.gs) with Drive, cache and login mocked.
   Run: node tests/download.test.js   (also run by tests/check.js's npm test) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('js/app/app.js'), obj = read('js/app/objective.js');
let gas = read('gas/code.gs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- server: the real code.gs inside a vm with Apps Script services mocked ---------- */
function makeServer({ fileCount = 60, responseCap = null, oldServer = false } = {}) {
  let src = gas;
  if (responseCap) src = src.replace(/const GETFILES_MAX_RESPONSE_CHARS = [^;]+;/, 'const GETFILES_MAX_RESPONSE_CHARS = ' + responseCap + ';');
  const store = new Map();
  const cache = { get: k => (store.has(k) ? store.get(k) : null), put: (k, v) => store.set(k, v) };
  const drive = {};
  for (let i = 0; i < fileCount; i++) drive['f' + i] = JSON.stringify(Array.from({ length: 20 }, (_, q) => ({ q: 'Q' + q, i })));
  drive.notjson = 'not json at all';
  const stats = { getFile: 0, getFiles: 0, filesRead: 0, maxBatch: 0 };
  const ctx = {
    console, Date, JSON, Math, String, Number, Array, Object, RegExp, isNaN, Set, Map,
    CacheService: { getScriptCache: () => cache },
    DriveApp: { getFileById: id => {
      if (!(id in drive)) throw new Error('not found');
      stats.filesRead++;
      return { getMimeType: () => 'application/json', getSize: () => drive[id].length, getName: () => id,
               getBlob: () => ({ getDataAsString: () => drive[id] }) };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  /* replace only the parts that touch sheets / logins / content registry */
  vm.runInContext(`
    var __mode = { token: 'good', paid: true };
    authUser_ = function(p){ if (p.token === 'good') return { ok:true, username:'Stu', found:{} };
      return { ok:false, error:{ success:false, error:'Session expired. Please log in again.', sessionInvalid:true } }; };
    requireAccess_ = function(){ return __mode.paid ? null : { success:false, needsPayment:true, error:'no access' }; };
    isContentFileAllowed_ = function(id){ return id.indexOf('bad') !== 0; };
    checkAdmin_ = function(p){ return p.adminToken === 'admin' ? { username:'root' } : null; };
    logAction_ = function(){};
  `, ctx);
  ctx.__drive = drive;
  return {
    ctx, stats, store,
    call(action, params) {
      if (action === 'getfile') { stats.getFile++; return JSON.parse(JSON.stringify(vm.runInContext('handleGetFile', ctx)(params))); }
      if (action === 'getfiles') {
        if (oldServer) return { success: false, error: "Unknown action: 'getfiles'." };
        stats.getFiles++; stats.maxBatch = Math.max(stats.maxBatch, String(params.fileIds).split(',').length);
        return JSON.parse(JSON.stringify(vm.runInContext('handleGetFiles', ctx)(params)));
      }
      return { success: false, error: "Unknown action: '" + action + "'." };
    },
    setPaid(v) { vm.runInContext('__mode.paid = ' + v, ctx); },
  };
}

/* ---------- client: the real CACHE.dl + QUIZ._fetch/_fetchBatch with browser pieces mocked ---------- */
function makeClient(server, { refsN = 60, preSaved = 0, token = 'good', latency = 60, online = true } = {}) {
  const refs = Array.from({ length: refsN }, (_, i) => ({ fid: 'f' + i, key: 'k' + i, lv: 'level5', name: 'n' + i }));
  const db = new Map();
  for (let i = 0; i < preSaved; i++) db.set('k' + i, [{ q: 'saved' }]);
  const toasts = [];
  let inflight = 0, maxInflight = 0, requests = 0;
  const S = { online, forcedOffline: false, user: { username: 'Stu', token } };
  const QDB = { get: async k => (db.has(k) ? db.get(k) : null), set: async (k, v) => { db.set(k, v); return true; } };
  const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const netFetch = async url => {
    requests++; inflight++; maxInflight = Math.max(maxInflight, inflight);
    await sleep(latency);
    const u = new URL(url); const params = Object.fromEntries(u.searchParams.entries());
    const body = JSON.stringify(server.call(String(params.action).toLowerCase(), params));
    inflight--;
    return { text: async () => body };
  };
  const GETFILE_GATE = { take: async () => {}, backoff() {} };
  const quizSrc = obj.slice(obj.indexOf('  async _fetch('), obj.indexOf('  _reval: {},')).trim().replace(/,\s*$/, '');
  const cacheSrc = app.slice(app.indexOf('  CONCURRENCY: 4,'), app.indexOf('  async removeSelected(){')).trim().replace(/,\s*$/, '');
  const env = { S, QDB, qs, netFetch, GETFILE_GATE, APPS: 'https://x.test/exec', toast: m => toasts.push(m),
    navigator: {}, document: { getElementById: () => null }, setTimeout, ChapterData: { allFileRefs: () => refs } };
  const factory = new Function(...Object.keys(env),
    `const QUIZ = { _cacheWarned:false, _maybeRevalidate(){}, ${quizSrc} };
     const CACHE = { ${cacheSrc}, _ctl(){}, render(){}, _paused:false, _running:false, _stop:false };
     return { QUIZ, CACHE };`);
  const { QUIZ, CACHE } = factory(...Object.values(env));
  return { CACHE, QUIZ, db, toasts, refs, stats: () => ({ maxInflight, requests }) };
}

(async () => {
  console.log('Download: new server, 60 files');
  {
    const srv = makeServer(); const c = makeClient(srv);
    const t = Date.now(); await c.CACHE.dl();
    ok(c.db.size === 60, 'all 60 files saved (' + c.db.size + ')');
    ok(srv.stats.getFiles === 10 && srv.stats.getFile === 0, 'used 10 batch requests, no single requests (batch=' + srv.stats.getFiles + ', single=' + srv.stats.getFile + ')');
    ok(c.stats().maxInflight <= 3, 'never more than 3 requests at once (' + c.stats().maxInflight + ')');
    ok(srv.stats.maxBatch <= 8, 'batch never above the server maximum of 8 (' + srv.stats.maxBatch + ')');
    ok(c.CACHE._running === false, 'running flag cleared');
    console.log('    (' + (Date.now() - t) + ' ms for 60 files; one-by-one would need 60 requests)');
  }
  console.log('Download: files already on the device are skipped');
  {
    const srv = makeServer(); const c = makeClient(srv, { preSaved: 40 });
    await c.CACHE.dl();
    ok(c.db.size === 60, 'all 60 present');
    ok(srv.stats.filesRead === 20, 'only the 20 missing files were read from Drive (' + srv.stats.filesRead + ')');
  }
  console.log('Download: older server without getFiles falls back to one file per request');
  {
    const srv = makeServer({ oldServer: true, fileCount: 40 }); const c = makeClient(srv, { refsN: 40 });
    await c.CACHE.dl();
    ok(c.db.size === 40, 'all 40 files saved through the old path (' + c.db.size + ')');
    ok(c.CACHE._noBatch === true, 'remembers the server has no batch support');
    ok(srv.stats.getFile >= 40, 'used single getFile requests (' + srv.stats.getFile + ')');
  }
  console.log('Download: server leaves files out of a big answer (deferred)');
  {
    const srv = makeServer({ responseCap: 100, fileCount: 24 }); const c = makeClient(srv, { refsN: 24 });
    await c.CACHE.dl();
    ok(c.db.size === 24, 'every file still arrives (' + c.db.size + ')');
    ok(srv.stats.getFiles > 4, 'needed extra requests for the deferred files (' + srv.stats.getFiles + ')');
  }
  console.log('Download: one file the student may not open');
  {
    const srv = makeServer(); srv.ctx.__drive.bad1 = '[]'; const c = makeClient(srv, { refsN: 12 });
    c.refs[5].fid = 'bad1'; c.refs[5].key = 'kbad';
    await c.CACHE.dl();
    ok(c.db.size === 11 && !c.db.has('kbad'), 'the other 11 saved, the blocked one skipped (' + c.db.size + ')');
  }
  console.log('Download: expired session stops at once');
  {
    const srv = makeServer(); const c = makeClient(srv, { token: 'stale' });
    await c.CACHE.dl();
    ok(c.db.size === 0, 'nothing saved');
    ok(c.stats().requests <= 3, 'stopped after the first answers, not 60 failures (' + c.stats().requests + ' requests)');
    ok(c.toasts.some(t => /session expired/i.test(t)), 'told the student why');
  }
  console.log('Download: access ended stops at once');
  {
    const srv = makeServer(); srv.setPaid(false); const c = makeClient(srv);
    await c.CACHE.dl();
    ok(c.db.size === 0 && c.toasts.some(t => /access has ended/i.test(t)), 'stopped with the payment message');
  }
  console.log('Download: Stop button');
  {
    const srv = makeServer(); const c = makeClient(srv, { latency: 100 });
    setTimeout(() => { c.CACHE._stop = true; }, 150);
    await c.CACHE.dl();
    ok(c.db.size > 0 && c.db.size < 60, 'stopped part-way with progress kept (' + c.db.size + ' of 60)');
    ok(c.CACHE._running === false, 'running flag cleared');
    await c.CACHE.dl();
    ok(c.db.size === 60, 'a second run finishes the rest without re-downloading (' + c.db.size + ')');
  }
  console.log('Download: server says slow down');
  {
    const srv = makeServer(); let first = true;
    const real = srv.call.bind(srv);
    srv.call = (a, p) => { if (a === 'getfiles' && first) { first = false; return { success: false, rateLimited: true, error: 'busy' }; } return real(a, p); };
    const c = makeClient(srv, { refsN: 12 });
    const t = Date.now(); await c.CACHE.dl();
    ok(c.db.size === 12, 'all files saved after waiting (' + c.db.size + ')');
    ok(Date.now() - t >= 2500, 'waited before asking again (' + (Date.now() - t) + ' ms)');
  }

  console.log('Server: getFiles rules');
  {
    const srv = makeServer(); const call = p => srv.call('getfiles', p);
    let r = call({ fileIds: 'f1,f2,f1', username: 'Stu', token: 'good' });
    ok(r.success && Object.keys(r.files).length === 2, 'duplicate ids are read once');
    r = call({ fileIds: 'f1', username: 'Stu', token: 'nope' });
    ok(r.sessionInvalid === true, 'wrong token is refused');
    r = call({ fileIds: '', username: 'Stu', token: 'good' });
    ok(r.success === false, 'empty list refused');
    r = call({ fileIds: Array.from({ length: 9 }, (_, i) => 'f' + i).join(','), username: 'Stu', token: 'good' });
    ok(r.success === false, 'more than 8 refused');
    r = call({ fileIds: 'f1,../etc', username: 'Stu', token: 'good' });
    ok(r.success === false, 'malformed id refused');
    r = call({ fileIds: 'bad1,f1', username: 'Stu', token: 'good' });
    ok(r.files.bad1.success === false && r.files.f1.success === true, 'a file outside the registered content is refused per file');
    r = call({ fileIds: 'notjson,f1', username: 'Stu', token: 'good' });
    ok(r.files.notjson.success === false && r.files.f1.success === true, 'one broken file does not spoil the others');
    r = call({ fileIds: 'f1,f2', adminToken: 'admin' });
    ok(r.success === true && r.files.f1.success && r.files.f2.success, 'an admin token (panel preview) works without a student login');
    /* per-student files budget: 360 a minute */
    const s2 = makeServer(); let limited = false, served = 0;
    for (let i = 0; i < 60 && !limited; i++) {
      const x = s2.call('getfiles', { fileIds: 'f0,f1,f2,f3,f4,f5,f6,f7', username: 'Stu', token: 'good' });
      if (x.rateLimited) limited = true; else served += 8;
    }
    ok(limited && served <= 360, 'a student is slowed down after 360 files in a minute (served ' + served + ')');
  }

  console.log('\n' + pass + ' passing, ' + fail + ' failing.');
  process.exit(fail ? 1 : 0);
})();

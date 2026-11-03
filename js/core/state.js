// js/core/state.js — the single in-memory state object, hydrated from
// localStorage on first load.

const S = {
  user: null,
  online: navigator.onLine,
  forcedOffline: _load(LS.FORCED_OFFLINE, false),
  bk: _load(LS.BK, []),
  fl: _load(LS.FL, []),
  wr: _load(LS.WR, []),
  prog: _load(LS.PROG, { total: 0, correct: 0, sessions: [] }),
  tt: _load(LS.TT, { sessions: [], reminders: { enabled: false, leadMinutes: 5 } }),
  stk: _load(LS.STK, { days: [], last: '' }),
  fcount: _load(LS.FCOUNT, {}),
  chapStats: _load(LS.CHAPSTATS, {}),
  weeklyAttempts: _load(LS.WK_ATTEMPTS, {}),
  cov: _load(LS.COV, {}),
  dpi: null,
  localQs: null,
  quiz: { qs: [], ans: [], mode: '', idx: 0, timer: null, elapsed: 0, left: 0, active: false, ch: '', scope: null },
  cloud: _load(LS.CLOUD, { fid: '' }),
  profile: _load(LS.PROFILE, { ver: 1, id: '' })
};

/* Post-load repairs & type validation for older saved shapes or corrupt data. */
(function _validateState() {
  const isArr = Array.isArray;
  const isObj = v => v && typeof v === 'object' && !isArr(v);

  // 1. Repairs for missing sub-properties
  if (!isObj(S.tt)) S.tt = { sessions: [], reminders: { enabled: false, leadMinutes: 5 } };
  if (!S.tt.reminders) S.tt.reminders = { enabled: false, leadMinutes: 5 };
  
  // 2. Ensure arrays are arrays
  if (!isArr(S.bk)) S.bk = [];
  if (!isArr(S.fl)) S.fl = [];
  if (!isArr(S.wr)) S.wr = [];
  if (!isArr(S.prog.sessions)) S.prog.sessions = [];
  if (!isArr(S.stk.days)) S.stk.days = [];
  if (!isArr(S.tt.sessions)) S.tt.sessions = [];

  // 3. Ensure objects are objects
  if (!isObj(S.prog)) S.prog = { total: 0, correct: 0, sessions: [] };
  if (!isObj(S.stk)) S.stk = { days: [], last: '' };
  if (!isObj(S.fcount)) S.fcount = {};
  if (!isObj(S.chapStats)) S.chapStats = {};
  if (!isObj(S.weeklyAttempts)) S.weeklyAttempts = {};
  if (!isObj(S.cov)) S.cov = {};

  // 4. Prune invalid items from arrays (failsafe against partial writes)
  S.bk = S.bk.filter(x => x && x.uid);
  S.fl = S.fl.filter(x => x && x.uid);
  S.wr = S.wr.filter(x => x && x.uid);
  S.prog.sessions = S.prog.sessions.filter(x => x && typeof x === 'object');
})();
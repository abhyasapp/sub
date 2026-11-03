// js/core/sync.js — the merge rule that never loses data, the reset markers
// that survive it, and the gzip codec that lets a large copy fit.

function mergeResets(a, b) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const A = isObj(a) ? a : {}, B = isObj(b) ? b : {};
  const out = {};
  ['all', 'wr', 'exams', 'sprint'].forEach(k => {
    const v = Math.max(Number(A[k]) || 0, Number(B[k]) || 0);
    if (v > 0) out[k] = v;
  });
  ['ch', 'rm'].forEach(k => {
    const m = {};
    [A[k], B[k]].forEach(src => {
      if (!isObj(src)) return;
      Object.keys(src).forEach(id => {
        const v = Number(src[id]) || 0;
        if (v > (m[id] || 0)) m[id] = v;
      });
    });
    let keys = Object.keys(m);
    if (!keys.length) return;
    if (keys.length > 400) {
      keys.sort((x, y) => m[y] - m[x]);
      keys = keys.slice(0, 400);
    }
    const t = {};
    keys.forEach(id => { t[id] = m[id]; });
    out[k] = t;
  });
  const un = Array.from(new Set(
    (Array.isArray(A.un) ? A.un : []).concat(Array.isArray(B.un) ? B.un : [])
      .map(Number).filter(v => v > 0)
  )).sort((x, y) => y - x).slice(0, 40);
  if (un.length) {
    const lifted = v => un.indexOf(v) !== -1;
    ['all', 'wr', 'exams', 'sprint'].forEach(k => { if (lifted(out[k])) delete out[k]; });
    ['ch', 'rm'].forEach(k => {
      if (!out[k]) return;
      Object.keys(out[k]).forEach(id => { if (lifted(out[k][id])) delete out[k][id]; });
      if (!Object.keys(out[k]).length) delete out[k];
    });
    out.un = un;
  }
  return out;
}

function applyResets(d, rs) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const arr = v => Array.isArray(v) ? v : [];
  if (!isObj(d) || !isObj(rs) || !Object.keys(rs).length) return d;
  const allT = Number(rs.all) || 0;
  const wrT = Number(rs.wr) || 0;
  const exT = Number(rs.exams) || 0;
  const ch = isObj(rs.ch) ? rs.ch : {};
  const rm = isObj(rs.rm) ? rs.rm : {};
  const chT = k => (k ? (Number(ch[k]) || 0) : 0);
  const out = Object.assign({}, d);

  if (isObj(d.prog)) {
    const prog = Object.assign({}, d.prog);
    prog.sessions = arr(d.prog.sessions).filter(s => {
      if (!s) return false;
      const at = Number(s.at) || 0;
      if (allT && at <= allT) return false;
      if (exT && s.mode === 'exam' && at <= exT) return false;
      const t = Math.max(chT(s.fid), chT(s.chapter));
      return !(t && at <= t);
    });
    const gen = Number(d.prog.gen) || 0;
    if (allT && gen < allT) { prog.total = 0; prog.correct = 0; }
    if (allT) prog.gen = Math.max(gen, allT);
    out.prog = prog;
  }
  if (isObj(d.chapStats)) {
    const cs = {};
    Object.keys(d.chapStats).forEach(k => {
      const rec = d.chapStats[k];
      const at = Number(rec && rec.lastAt) || 0;
      if (allT && at <= allT) return;
      const t = chT(k);
      if (t && at <= t) return;
      cs[k] = rec;
    });
    out.chapStats = cs;
  }
  if (isObj(d.cov)) {
    const cv = {};
    Object.keys(d.cov).forEach(fid => {
      const rec = d.cov[fid];
      const at = Number(rec && rec.t) || 0;
      if (allT && at <= allT) return;
      const t = chT(fid);
      if (t && at <= t) return;
      cv[fid] = rec;
    });
    out.cov = cv;
  }
  if (Array.isArray(d.wr)) {
    out.wr = d.wr.filter(x => {
      if (!x) return false;
      const at = Number(x._addedAt) || 0;
      if (allT && at <= allT) return false;
      if (wrT && at <= wrT) return false;
      const r = Number(rm[x.uid]) || 0;
      if (r && at <= r) return false;
      const t = chT(x.fileId);
      return !(t && at <= t);
    });
  }
  if (allT && isObj(d.stk)) {
    const cut = localISODate(new Date(allT));
    const days = arr(d.stk.days).filter(x => String(x) >= cut);
    out.stk = Object.assign({}, d.stk, { days, last: days.length ? days[days.length - 1] : '' });
  }
  return out;
}

function mergeSyncData(local, remote) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const arr = v => Array.isArray(v) ? v : [];
  const L0 = isObj(local) ? local : {};
  const R0 = isObj(remote) ? remote : {};
  const resets = mergeResets(L0.resets, R0.resets);
  const L = applyResets(L0, resets);
  const R = applyResets(R0, resets);

  const unionBy = (a, b, keyOf) => {
    const seen = new Set(), out = [];
    arr(a).concat(arr(b)).forEach(x => {
      if (x === null || x === undefined) return;
      const k = keyOf(x);
      if (seen.has(k)) return;
      seen.add(k); out.push(x);
    });
    return out;
  };
  const uidOf = x => (x && x.uid !== undefined) ? 'u:' + x.uid : 'j:' + JSON.stringify(x);

  const lp = isObj(L.prog) ? L.prog : {};
  const rp = isObj(R.prog) ? R.prog : {};
  const sessKey = s => (s && s.at)
    ? 'a:' + s.at + ':' + (s.fid || s.chapter || '')
    : 'j:' + JSON.stringify(s);
  const sessions = unionBy(lp.sessions, rp.sessions, sessKey)
    .sort((a, b) => (Number(b && b.at) || 0) - (Number(a && a.at) || 0));   // union of both devices; nothing dropped

  const sum = (list, f) => list.reduce((n, x) => n + (Number(x && x[f]) || 0), 0);
  const onlyIn = (a, b) => {
    const k = new Set(arr(b).map(sessKey));
    return arr(a).filter(x => !k.has(sessKey(x)));
  };
  const total = Math.max(
    (Number(lp.total) || 0) + sum(onlyIn(rp.sessions, lp.sessions), 'total'),
    (Number(rp.total) || 0) + sum(onlyIn(lp.sessions, rp.sessions), 'total')
  );
  const correct = Math.max(
    (Number(lp.correct) || 0) + sum(onlyIn(rp.sessions, lp.sessions), 'correct'),
    (Number(rp.correct) || 0) + sum(onlyIn(lp.sessions, rp.sessions), 'correct')
  );
  const badges = Object.assign({},
    isObj(rp.badges) ? rp.badges : {},
    isObj(lp.badges) ? lp.badges : {}
  );
  const prog = Object.assign({}, rp, lp, { sessions, total, correct, badges });
  const gen = Math.max(Number(lp.gen) || 0, Number(rp.gen) || 0);
  if (gen) prog.gen = gen;

  const chapStats = Object.assign({}, isObj(R.chapStats) ? R.chapStats : {});
  Object.keys(isObj(L.chapStats) ? L.chapStats : {}).forEach(k => {
    const l = L.chapStats[k], r = chapStats[k];
    if (!r || (Number(l && l.attempted) || 0) >= (Number(r && r.attempted) || 0)) chapStats[k] = l;
  });

  const cov = {};
  const lc = isObj(L.cov) ? L.cov : {};
  const rc = isObj(R.cov) ? R.cov : {};
  new Set(Object.keys(lc).concat(Object.keys(rc))).forEach(fid => {
    const a = isObj(lc[fid]) ? lc[fid] : null;
    const b = isObj(rc[fid]) ? rc[fid] : null;
    const tt = Math.max(Number(a && a.t) || 0, Number(b && b.t) || 0);
    if (!a || !b) {
      const o = a || b;
      cov[fid] = { p: String(o.p || ''), a: Number(o.a) || 0, c: Number(o.c) || 0 };
      if (tt) cov[fid].t = tt;
      return;
    }
    const pa = String(a.p || ''), pb = String(b.p || '');
    let p = '';
    for (let i = 0, n = Math.max(pa.length, pb.length); i < n; i++) {
      const x = pa[i] || '0';
      p += x !== '0' ? x : (pb[i] || '0');
    }
    cov[fid] = {
      p,
      a: Math.max(Number(a.a) || 0, Number(b.a) || 0),
      c: Math.max(Number(a.c) || 0, Number(b.c) || 0)
    };
    if (tt) cov[fid].t = tt;
  });

  const ls = isObj(L.stk) ? L.stk : {};
  const rs = isObj(R.stk) ? R.stk : {};
  const days = Array.from(new Set(arr(ls.days).concat(arr(rs.days)))).sort().slice(-400);
  const stk = Object.assign({}, rs, ls, {
    days, last: days.length ? days[days.length - 1] : (ls.last || rs.last || '')
  });

  const qnotes = Object.assign({},
    isObj(R.qnotes) ? R.qnotes : {},
    isObj(L.qnotes) ? L.qnotes : {}
  );
  /* Daily sprint log: per day the larger counter wins (never lost, never double counted); a reset drops older days. */
  const cutT = Math.max(Number(resets.all) || 0, Number(resets.sprint) || 0);
  const sprintLog = (typeof SPRINT_LOG !== 'undefined' && SPRINT_LOG.mergeLogs)
    ? SPRINT_LOG.mergeLogs(isObj(L.sprintLog) ? L.sprintLog : null, isObj(R.sprintLog) ? R.sprintLog : null, cutT)
    : (isObj(L.sprintLog) ? L.sprintLog : (isObj(R.sprintLog) ? R.sprintLog : undefined));
  const okDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let sprint = okDate(L.sprint) ? L.sprint : (okDate(R.sprint) ? R.sprint : '');
  if (resets.sprint && okDate(L.sprint) && okDate(R.sprint)) {
    sprint = L.sprint > R.sprint ? L.sprint : R.sprint;
  }

  return {
    prog, chapStats, cov, stk, qnotes, sprint, sprintLog, resets,
    bk: unionBy(L.bk, R.bk, uidOf),
    fl: unionBy(L.fl, R.fl, uidOf),
    wr: unionBy(L.wr, R.wr, uidOf)
  };
}

const SYNC_GZ_PREFIX = 'gz1:';

async function _bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function _b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function _pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

async function syncEncode(json, ceiling) {
  if (json.length <= ceiling) return json;
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const gz = await _pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
    const out = SYNC_GZ_PREFIX + await _bytesToB64(gz);
    return out.length <= ceiling ? out : null;
  } catch (e) { return null; }
}

async function syncDecode(text) {
  const s = String(text == null ? '' : text);
  if (s.indexOf(SYNC_GZ_PREFIX) !== 0) return JSON.parse(s);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot read the compressed cloud copy. Update the browser.');
  }
  const bytes = await _pipe(
    _b64ToBytes(s.slice(SYNC_GZ_PREFIX.length)),
    new DecompressionStream('gzip')
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
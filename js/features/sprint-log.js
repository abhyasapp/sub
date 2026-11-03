/* ===================================================================
 * js/features/sprint-log.js — durable day-by-day record of the sprint.
 *
 * Why it exists: PROG.recordSession keeps only the latest 50 sessions, so a 60-day report
 * cannot be rebuilt from them. This log keeps one small record per calendar day (a few hundred
 * bytes), for the whole sprint, and merges safely across devices.
 *
 * Day record:
 *   { ts, q, c, w, sk, sec, ses, newSeen, kinds:{new,review,drill,mock}, mocks:[{pct,total}],
 *     byCh:{ [name]:{ n, c } }, planned:{ new } }
 * q = questions answered (c + w), sk = skipped, sec = seconds studied, newSeen = questions seen for
 * the FIRST time today (exact, from coverage), planned.new = that day's fixed new-question target.
 * =================================================================== */
(function () {
  'use strict';

  const KEY = 'abhyas_sprint_log';
  const KEEP_DAYS = 130;

  let _mem = null;                       // in-memory copy; localStorage is the persistence layer

  const blank = () => ({ v: 1, days: {}, base: null });
  const num = (x) => { x = Number(x); return isFinite(x) && x > 0 ? Math.floor(x) : 0; };

  function _read() {
    if (_mem) return _mem;
    let raw;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    _mem = raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object' ? raw : blank();
    return _mem;
  }
  function _write() {
    const d = _read();
    const keys = Object.keys(d.days).sort();
    if (keys.length > KEEP_DAYS) keys.slice(0, keys.length - KEEP_DAYS).forEach((k) => { delete d.days[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage full: keep working from memory */ }
  }

  function dayRec(iso) {
    const d = _read();
    return d.days[iso] || (d.days[iso] = {
      ts: 0, q: 0, c: 0, w: 0, sk: 0, sec: 0, ses: 0, newSeen: 0,
      kinds: { new: 0, review: 0, drill: 0, mock: 0 }, mocks: [], byCh: {}, planned: { new: 0 },
    });
  }

  /** What kind of session was this? Sprint launchers tag it; everything else is inferred from its label. */
  function kindOf(sess) {
    const tag = String((sess && (sess.sprintKind || sess.sessionKind)) || '');
    if (tag === 'new' || tag === 'review' || tag === 'drill' || tag === 'mock') return tag;
    if (sess && sess.mode === 'exam') return 'mock';
    const label = String((sess && (sess.chapter || sess.chapterKey)) || '');
    if (/wrong bank|missed|flagged|bookmark/i.test(label)) return 'review';
    if (/weak|mixed|drill|hardest/i.test(label)) return 'drill';
    return 'new';
  }

  /** Called once per finished session. `iso` is the local calendar day. */
  function recordSession(sess, iso) {
    if (!sess || !iso) return;
    const correct = num(sess.correct), wrong = num(sess.wrong);
    const answered = correct + wrong;
    if (!answered && !num(sess.skipped)) return;
    const r = dayRec(iso);
    r.q += answered; r.c += correct; r.w += wrong; r.sk += num(sess.skipped);
    r.sec += Math.min(num(sess.durationSec), 3 * 3600);
    r.ses += 1;
    const kind = kindOf(sess);
    r.kinds[kind] = (r.kinds[kind] || 0) + answered;
    if (kind === 'mock' && answered) {
      r.mocks.push({ pct: Math.round(correct / answered * 100), total: answered });
      if (r.mocks.length > 6) r.mocks.shift();
    }
    const name = String(sess.chapterKey || sess.chapter || '').slice(0, 60) || 'Mixed';
    const ch = r.byCh[name] || (r.byCh[name] = { n: 0, c: 0 });
    ch.n += answered; ch.c += correct;
    if (Object.keys(r.byCh).length > 24) {                      // keep the busiest chapters only
      const keep = Object.keys(r.byCh).sort((a, b) => r.byCh[b].n - r.byCh[a].n).slice(0, 24);
      Object.keys(r.byCh).forEach((k) => { if (keep.indexOf(k) === -1) delete r.byCh[k]; });
    }
    r.ts = Date.now();
    _write();
  }

  /** Questions seen for the first time. Idempotent per day: it only ever adds. */
  function addNew(iso, n) {
    n = num(n);
    if (!iso || !n) return;
    const r = dayRec(iso);
    r.newSeen += n; r.ts = Date.now();
    _write();
  }

  /** Freeze the day's fixed target the first time we know it (so the report can say "planned vs done"). */
  function setPlanned(iso, newTarget) {
    if (!iso) return;
    const r = dayRec(iso);
    if (!r.planned || !r.planned.new) { r.planned = { new: num(newTarget) }; _write(); }
  }

  function setBaseline(startIso, seen) {
    const d = _read();
    if (!d.base || d.base.start !== startIso) { d.base = { start: startIso, seen: num(seen) }; _write(); }
    return d.base;
  }

  function days() { return _read().days; }
  function baseline() { return _read().base; }

  /** Merge two logs without ever losing or double-counting: per day, the larger counter wins. */
  function mergeLogs(a, b, resetT) {
    const out = blank();
    const A = a && a.days ? a.days : {}, B = b && b.days ? b.days : {};
    const cut = Number(resetT) || 0;
    new Set(Object.keys(A).concat(Object.keys(B))).forEach((iso) => {
      const x = A[iso], y = B[iso];
      const alive = (r) => r && (!cut || Number(r.ts) >= cut);
      const xs = alive(x) ? x : null, ys = alive(y) ? y : null;
      if (!xs && !ys) return;
      if (!xs || !ys) { out.days[iso] = JSON.parse(JSON.stringify(xs || ys)); return; }
      const m = JSON.parse(JSON.stringify(xs.q >= ys.q ? xs : ys));          // start from the busier record
      ['q', 'c', 'w', 'sk', 'sec', 'ses', 'newSeen'].forEach((k) => { m[k] = Math.max(num(xs[k]), num(ys[k])); });
      ['new', 'review', 'drill', 'mock'].forEach((k) => { m.kinds[k] = Math.max(num((xs.kinds || {})[k]), num((ys.kinds || {})[k])); });
      m.planned = { new: Math.max(num((xs.planned || {}).new), num((ys.planned || {}).new)) };
      m.ts = Math.max(num(xs.ts), num(ys.ts));
      out.days[iso] = m;
    });
    const ba = a && a.base, bb = b && b.base;
    out.base = ba && bb ? (ba.start <= bb.start ? ba : bb) : (ba || bb || null);
    return out;
  }

  function mergeIn(remote, resetT) {
    if (!remote || typeof remote !== 'object') return;
    _mem = mergeLogs(_read(), remote, resetT);
    _write();
  }

  function exportForSync() {
    const d = _read();
    const keys = Object.keys(d.days).sort().slice(-75);              // the sprint is 60 days; keeps the cloud copy small
    const out = { v: 1, days: {}, base: d.base };
    const now = new Date();
    const recentFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
    const pad = (n) => String(n).padStart(2, '0');
    const cut = recentFrom.getFullYear() + '-' + pad(recentFrom.getMonth() + 1) + '-' + pad(recentFrom.getDate());
    keys.forEach((k) => {
      const rec = d.days[k];
      if (k >= cut) { out.days[k] = rec; return; }
      const slim = Object.assign({}, rec);                      // older days: totals only (per-chapter detail is the bulk)
      delete slim.byCh;
      out.days[k] = slim;
    });
    return out;
  }

  function clear() {
    _mem = blank();
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }
  function _resetMemory() { _mem = null; }       // tests

  window.SPRINT_LOG = { KEY, kindOf, recordSession, addNew, setPlanned, setBaseline, days, baseline, mergeLogs, mergeIn, exportForSync, clear, dayRec, _resetMemory };
})();

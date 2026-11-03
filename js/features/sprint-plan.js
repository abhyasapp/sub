/* ===================================================================
 * js/features/sprint-plan.js — the 60-day sprint planner. PURE: no DOM, no storage,
 * no globals read. Everything comes in as arguments, so it is fully unit-tested.
 *
 * Promise it keeps: every unseen Level 7 + GK objective question is scheduled on a
 * specific day, and the whole syllabus is finished by the last Learn day. Miss a day
 * and the next call simply re-spreads what is left over the days that remain, so the
 * plan always ends on time (and tells the student honestly when that needs more per day).
 * =================================================================== */
(function () {
  'use strict';

  const MS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  // Calendar arithmetic on UTC midnights: immune to DST and the device time zone.
  const parse = (iso) => { const p = String(iso).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  const fmt = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const addDays = (iso, n) => fmt(parse(iso) + n * MS);
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / MS);   // b - a
  const validIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  /** How a sprint of N days is split. N = 60 gives Learn 35 / Drill 17 / Mock 8 (the original design). */
  function phaseSplit(N) {
    N = Math.max(1, Math.floor(N) || 1);
    let learn = Math.round(N * 35 / 60);
    if (N >= 3) learn = Math.max(1, learn);
    learn = Math.min(learn, N);
    const drill = Math.min(Math.round(N * 17 / 60), N - learn);
    return { learn, drill, mock: N - learn - drill };
  }

  function phaseOf(dayNum, N) {
    const sp = phaseSplit(N);
    if (dayNum <= sp.learn) return 'Learn';
    if (dayNum <= sp.learn + sp.drill) return 'Drill';
    return 'Mock';
  }

  /** Largest-remainder split of `amount` over buckets, never giving a bucket more than its cap. */
  function splitBy(amount, caps) {
    const total = caps.reduce((a, b) => a + b, 0);
    const out = caps.map(() => 0);
    if (amount <= 0 || total <= 0) return out;
    amount = Math.min(amount, total);
    const ideal = caps.map((c) => amount * c / total);
    caps.forEach((c, i) => { out[i] = Math.min(c, Math.floor(ideal[i])); });
    let left = amount - out.reduce((a, b) => a + b, 0);
    const order = caps.map((c, i) => i).sort((a, b) => (ideal[b] - Math.floor(ideal[b])) - (ideal[a] - Math.floor(ideal[a])));
    for (let guard = 0; left > 0 && guard < 4 * caps.length + 8; guard++) {
      let moved = false;
      for (const i of order) { if (left > 0 && out[i] < caps[i]) { out[i]++; left--; moved = true; } }
      if (!moved) break;
    }
    return out;
  }

  const groupOf = (u) => (String(u.lv || '').toLowerCase() === 'gk' ? 'gk' : 'l7');

  /**
   * @param {Object} o
   * @param {Array}  o.units          [{fid, lv, ch, book, name, n, seen}] eligible question files, in syllabus order
   * @param {string} o.today          'YYYY-MM-DD'
   * @param {string} o.start          sprint start
   * @param {string} o.exam           exam date
   * @param {string[]} [o.rest]       planned rest days
   * @param {string[]} [o.off]        days the student took off
   * @param {number} [o.newDoneToday] unseen questions already covered today
   * @param {number} [o.baselineSeen] questions already seen when the sprint began
   */
  function buildPlan(o) {
    const units = (o.units || []).map((u, i) => ({
      order: i, fid: u.fid, lv: u.lv || '', ch: u.ch || '', book: u.book || '', name: u.name || u.fid,
      n: Math.max(0, Math.floor(Number(u.n)) || 0), seen: Math.max(0, Math.floor(Number(u.seen)) || 0),
    })).map((u) => Object.assign(u, { seen: Math.min(u.seen, u.n), rem: Math.max(0, u.n - Math.min(u.seen, u.n)) }));

    const start = validIso(o.start) ? o.start : o.today;
    const exam = validIso(o.exam) && o.exam >= start ? o.exam : addDays(start, 59);
    const today = validIso(o.today) ? o.today : start;
    const restSet = new Set(o.rest || []), offSet = new Set(o.off || []);
    const studyDay = (iso) => !restSet.has(iso) && !offSet.has(iso);

    const N = diffDays(start, exam) + 1;
    const sp = phaseSplit(N);
    const learnEnd = addDays(start, sp.learn - 1);
    const mockStart = addDays(start, sp.learn + sp.drill);
    const lastNewDay = sp.mock > 0 ? addDays(mockStart, -1) : exam;
    const eToday = today < start ? start : today;
    const dayNum = Math.max(1, Math.min(N, diffDays(start, eToday) + 1));
    const phase = phaseOf(dayNum, N);
    const daysToExam = Math.max(0, diffDays(eToday, exam));
    const examPassed = today > exam;

    const totalAll = units.reduce((a, u) => a + u.n, 0);
    const seenAll = units.reduce((a, u) => a + u.seen, 0);
    const remaining = totalAll - seenAll;
    const doneToday = Math.max(0, Math.min(Math.floor(Number(o.newDoneToday)) || 0, totalAll));

    // Horizon: normally the last Learn day. If the student is already past it, finish as early as the
    // remaining Drill days allow (flagged "compressed") and never run into exam day itself.
    let horizonEnd = learnEnd;
    let compressed = false;
    if (eToday > learnEnd && remaining > 0) {
      compressed = true;
      horizonEnd = eToday <= lastNewDay ? lastNewDay : (eToday < exam ? addDays(exam, -1) : eToday);
    }

    const availDays = [];
    for (let d = eToday; d <= horizonEnd && availDays.length < 400; d = addDays(d, 1)) if (studyDay(d)) availDays.push(d);
    let noStudyDays = false;
    if (!availDays.length && remaining > 0) { availDays.push(eToday); noStudyDays = true; }
    const K = availDays.length;
    const todayAvail = K > 0 && availDays[0] === eToday;

    // Even spread (differences of at most 1) of the start-of-today backlog over the available days.
    const adjTotal = remaining + (todayAvail ? doneToday : 0);
    const shares = [];
    for (let k = 0, prev = 0; k < K; k++) {
      const cum = Math.round((k + 1) * adjTotal / K);
      shares.push(cum - prev); prev = cum;
    }
    const quotaToday = todayAvail && K ? shares[0] : 0;
    const todayRemaining = todayAvail ? Math.max(0, quotaToday - doneToday) : 0;

    // Two queues (Level 7 and GK) are consumed in proportion to what each has left, so BOTH finish
    // on the same final day instead of GK being left for the end. Inside a queue, chapters go in order.
    const queues = { l7: [], gk: [] };
    units.filter((u) => u.rem > 0).forEach((u) => queues[groupOf(u)].push({ u, left: u.rem }));
    const qRem = (q) => q.reduce((a, x) => a + x.left, 0);
    const take = (q, count) => {
      const slices = [];
      while (count > 0 && q.length) {
        const head = q[0];
        const t = Math.min(count, head.left);
        slices.push({ fid: head.u.fid, lv: head.u.lv, ch: head.u.ch, book: head.u.book, name: head.u.name, count: t });
        head.left -= t; count -= t;
        if (head.left <= 0) q.shift();
      }
      return slices;
    };

    const schedule = [];
    for (let k = 0; k < K; k++) {
      const amount = k === 0 && todayAvail ? todayRemaining : shares[k];
      const [a, b] = splitBy(amount, [qRem(queues.l7), qRem(queues.gk)]);
      const slices = take(queues.l7, a).concat(take(queues.gk, b));
      const iso = availDays[k];
      schedule.push({
        iso, dayNum: diffDays(start, iso) + 1, phase: phaseOf(Math.max(1, Math.min(N, diffDays(start, iso) + 1)), N),
        newTarget: k === 0 && todayAvail ? quotaToday : shares[k],
        remainingTarget: amount, slices,
      });
    }

    // Coverage views for the report.
    const perUnit = units.map((u) => ({
      fid: u.fid, lv: u.lv, ch: u.ch, book: u.book, name: u.name, n: u.n, seen: u.seen,
      pct: u.n ? Math.round(u.seen / u.n * 100) : 100,
    }));
    const level = (g) => {
      const us = units.filter((u) => groupOf(u) === g);
      const n = us.reduce((a, u) => a + u.n, 0), s = us.reduce((a, u) => a + u.seen, 0);
      return { total: n, seen: s, pct: n ? Math.round(s / n * 100) : 100 };
    };

    // Honest pace: where should the student be at the START of today, and where are they?
    const sdCount = (from, to) => { let c = 0; for (let d = from; d <= to; d = addDays(d, 1)) if (studyDay(d)) c++; return c; };
    const availTotal = Math.max(1, sdCount(start, learnEnd));
    const elapsedTo = eToday > learnEnd ? learnEnd : addDays(eToday, -1);   // study days that were available BEFORE today
    const availElapsed = eToday > start ? sdCount(start, elapsedTo) : 0;
    const baseline = Math.max(0, Math.min(Number(o.baselineSeen) || 0, totalAll));
    const idealAtStart = baseline + (totalAll - baseline) * Math.min(1, availElapsed / availTotal);
    const seenAtStart = seenAll - doneToday;
    const delta = Math.round(seenAtStart - idealAtStart);                // + ahead, − behind
    const ref = Math.max(1, quotaToday || Math.ceil(remaining / Math.max(1, K)));
    let status = 'on-track';
    if (remaining === 0) status = 'complete';
    else if (compressed) status = 'compressed';
    else if (delta >= ref) status = 'ahead';
    else if (delta <= -ref) status = 'behind';

    return {
      start, exam, today: eToday, N, split: sp, learnEnd, mockStart, lastNewDay,
      dayNum, phase, daysToExam, examPassed,
      totalAll, seenAll, remaining, coveragePct: totalAll ? Math.round(seenAll / totalAll * 100) : 100,
      studyDaysLeft: K, noStudyDays, compressed,
      quotaToday, todayRemaining, doneToday, requiredPerDay: K ? Math.ceil(adjTotal / K) : 0,
      todaySlices: schedule.length && todayAvail ? schedule[0].slices : [],
      schedule, perUnit, levels: { l7: level('l7'), gk: level('gk') },
      status, behindBy: Math.max(0, -delta), aheadBy: Math.max(0, delta),
      finishesOn: schedule.length ? schedule[schedule.length - 1].iso : null,
    };
  }

  /** Average NEW questions per study day over the last `window` calendar days (missed study days count as 0). */
  function recentRate(days, today, rest, off, window) {
    window = window || 7;
    const restSet = new Set(rest || []), offSet = new Set(off || []);
    let sum = 0, n = 0;
    for (let i = 0; i < window; i++) {
      const iso = addDays(today, -i);
      if (restSet.has(iso) || offSet.has(iso)) continue;
      n++; sum += Math.max(0, Number(days && days[iso] && days[iso].newSeen) || 0);
    }
    return n ? sum / n : 0;
  }

  /** Date the syllabus would be finished at a given pace (study days only). null if it never would be. */
  function projectFinish(remaining, perDay, today, rest, off) {
    if (remaining <= 0) return today;
    if (!(perDay > 0)) return null;
    const restSet = new Set(rest || []), offSet = new Set(off || []);
    let left = remaining, d = today;
    for (let i = 0; i < 730; i++, d = addDays(d, 1)) {
      if (restSet.has(d) || offSet.has(d)) continue;
      left -= perDay;
      if (left <= 0) return d;
    }
    return null;
  }

  window.SPRINT_PLAN = { buildPlan, phaseSplit, phaseOf, recentRate, projectFinish, addDays, diffDays, parse, fmt, validIso, splitBy };
})();

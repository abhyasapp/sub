/* ===================================================================
 * js/features/sprint-report.js — turns the daily log + plan into the words and numbers a student
 * reads: a gentle remark per day, an honest sprint grade, and a shareable text report.
 * PURE: no DOM, no storage. Depends only on SPRINT_PLAN (date maths, pace).
 * =================================================================== */
(function () {
  'use strict';

  const P = window.SPRINT_PLAN;
  const pct = (c, n) => (n > 0 ? Math.round(c / n * 100) : 0);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function fmtMin(sec) {
    const m = Math.round((Number(sec) || 0) / 60);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  function accTier(a) { return a >= 85 ? 'excellent' : a >= 70 ? 'good' : a >= 50 ? 'developing' : 'needs'; }

  /** The weakest / strongest chapters of a set of day records (needs a few answers to count). */
  function chapterBoard(recs, minN) {
    minN = minN || 5;
    const agg = {};
    recs.forEach((r) => Object.keys((r && r.byCh) || {}).forEach((name) => {
      const a = agg[name] || (agg[name] = { name, n: 0, c: 0 });
      a.n += r.byCh[name].n; a.c += r.byCh[name].c;
    }));
    const list = Object.values(agg).filter((x) => x.n >= minN).map((x) => Object.assign(x, { acc: pct(x.c, x.n) }));
    return {
      weakest: list.slice().sort((a, b) => a.acc - b.acc || b.n - a.n).slice(0, 3),
      strongest: list.slice().sort((a, b) => b.acc - a.acc || b.n - a.n).slice(0, 3),
    };
  }

  /**
   * One day's remark.
   * @param {Object|undefined} rec  day record from SPRINT_LOG
   * @param {Object} ctx            { iso, today, isRest, isOff }
   * @returns {{tone:string,title:string,lines:string[],acc:number|null,planPct:number|null}}
   */
  function dayRemark(rec, ctx) {
    ctx = ctx || {};
    const isToday = ctx.iso === ctx.today;
    if (ctx.isRest || ctx.isOff) {
      return { tone: 'rest', title: 'Rest day', lines: ['Rest is part of the plan. Come back refreshed.'], acc: null, planPct: null };
    }
    const q = rec ? rec.q : 0;
    if (!q) {
      return isToday
        ? { tone: 'none', title: 'Not started yet', lines: ['A first set of 10 questions is a gentle way in.'], acc: null, planPct: null }
        : { tone: 'low', title: 'No practice recorded', lines: ['No worries. Even 10 questions tomorrow keeps your rhythm going.'], acc: null, planPct: null };
    }
    const acc = pct(rec.c, q);
    const planned = rec.planned && rec.planned.new ? rec.planned.new : 0;
    const planPct = planned ? Math.round(rec.newSeen / planned * 100) : null;
    const lines = [plural(q, 'question') + ' \u00b7 ' + acc + '% correct \u00b7 ' + fmtMin(rec.sec) + '.'];

    if (planned) {
      if (rec.newSeen >= planned) lines.push('New-question target met (' + rec.newSeen + ' of ' + planned + ').');
      else if (rec.newSeen >= planned * 0.7) lines.push('Close to the target: ' + rec.newSeen + ' of ' + planned + ' new questions. A small top-up tomorrow closes the gap.');
      else lines.push(rec.newSeen + ' of ' + planned + ' new questions today. Tomorrow\u2019s plan will absorb the difference.');
    }
    const tier = accTier(acc);
    if (tier === 'excellent') lines.push('Excellent accuracy. Keep this level.');
    else if (tier === 'developing') lines.push('Accuracy is developing. Re-read the explanations of the questions you missed.');
    else if (tier === 'needs') lines.push('Accuracy is low today. Slow down, read each option, and study the explanation before moving on.');

    const weak = chapterBoard([rec], 5).weakest[0];
    if (weak && weak.acc < 60) lines.push('Worth revisiting: ' + weak.name + ' (' + weak.acc + '%).');

    const answered = rec.c + rec.w;
    const secPer = answered ? rec.sec / answered : 0;
    if (answered >= 10 && secPer && secPer < 15 && acc < 60) lines.push('You may be answering too quickly. Give each question a moment.');
    else if (answered >= 10 && secPer > 150) lines.push('You are thinking deeply per question. In the exam you will have roughly 90 seconds each.');

    let tone = tier === 'excellent' ? 'great' : tier === 'good' ? 'good' : 'steady';
    let title = tone === 'great' ? 'Excellent day' : tone === 'good' ? 'Good day' : tier === 'needs' ? 'Keep going' : 'Steady progress';
    if (planned && rec.newSeen >= planned && acc >= 70) { tone = 'great'; title = 'Strong day'; }
    return { tone, title, lines: lines.slice(0, 5), acc, planPct };
  }

  /**
   * Whole-sprint numbers and grade.
   * @param {Object} days   SPRINT_LOG.days()
   * @param {Object} o      { today, start, exam, rest, off, plan, streak }
   */
  function summarize(days, o) {
    const rest = new Set(o.rest || []), off = new Set(o.off || []);
    const plan = o.plan;
    const recs = [];
    let studyDaysElapsed = 0;
    for (let d = o.start; d <= o.today && studyDaysElapsed < 400; d = P.addDays(d, 1)) {
      if (rest.has(d) || off.has(d)) continue;
      studyDaysElapsed++;
      if (days[d] && days[d].q > 0) recs.push({ iso: d, rec: days[d] });
    }
    const activeDays = recs.length;
    const all = recs.map((x) => x.rec);
    const totalQ = all.reduce((a, r) => a + r.q, 0), totalC = all.reduce((a, r) => a + r.c, 0);
    const totalSec = all.reduce((a, r) => a + r.sec, 0);
    const totalNew = all.reduce((a, r) => a + r.newSeen, 0);
    const last14 = recs.filter((x) => P.diffDays(x.iso, o.today) < 14).map((x) => x.rec);
    const q14 = last14.reduce((a, r) => a + r.q, 0), c14 = last14.reduce((a, r) => a + r.c, 0);
    const accOverall = pct(totalC, totalQ), acc14 = q14 ? pct(c14, q14) : accOverall;
    const consistencyPct = studyDaysElapsed ? clamp(Math.round(activeDays / studyDaysElapsed * 100), 0, 100) : 0;
    const best = recs.slice().sort((a, b) => b.rec.q - a.rec.q)[0] || null;
    const trend = recs.slice(-14).map((x) => ({ iso: x.iso, acc: pct(x.rec.c, x.rec.q), q: x.rec.q }));
    const board = chapterBoard(recs.filter((x) => P.diffDays(x.iso, o.today) < 30).map((x) => x.rec), 8);
    const mocks = [];
    recs.forEach((x) => (x.rec.mocks || []).forEach((m) => mocks.push({ iso: x.iso, pct: m.pct, total: m.total })));

    // Scores out of 100. Coverage is judged against the plan, not against the calendar.
    let coverage = 100;
    if (plan && plan.remaining > 0) {
      coverage = clamp(100 - Math.round(plan.behindBy / Math.max(1, plan.totalAll) * 300), 0, 100);
      if (plan.compressed) coverage = Math.min(coverage, 50);
    }
    const accuracy = totalQ ? acc14 : 0;
    const consistency = consistencyPct;
    const overall = totalQ ? Math.round(coverage * 0.4 + accuracy * 0.35 + consistency * 0.25) : 0;
    const grade = !totalQ ? '\u2014' : overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B' : overall >= 60 ? 'C' : 'D';

    // Pace and projection (new questions per study day, last 7 days).
    const rate = P.recentRate(days, o.today, o.rest, o.off, 7);
    const finish = plan ? P.projectFinish(plan.remaining, rate, o.today, o.rest, o.off) : null;
    let projection = null;
    if (plan) {
      if (plan.remaining === 0) projection = 'The whole Level 7 and GK syllabus has been covered.';
      else if (!finish) projection = 'No new questions were covered in the last week, so a finish date cannot be projected yet. Today\u2019s target is ' + plan.quotaToday + '.';
      else {
        const gap = P.diffDays(finish, plan.learnEnd);
        const when = gap >= 0 ? plural(gap, 'day') + ' before' : plural(-gap, 'day') + ' after';
        projection = 'At your recent pace (' + Math.round(rate) + ' new questions per study day) the syllabus finishes on ' + finish + ', ' + when + ' the Learn phase ends.';
      }
    }

    // One sentence pointing at the weakest of the three scores.
    const focus = [['coverage', coverage], ['accuracy', accuracy], ['consistency', consistency]].sort((a, b) => a[1] - b[1])[0][0];
    const advice = !totalQ ? 'Complete your first practice session to start your report.'
      : focus === 'coverage' ? 'Focus: coverage. Finish today\u2019s new-question target to get back on schedule.'
      : focus === 'accuracy' ? 'Focus: accuracy. Slow down and review explanations, especially in your weakest chapters.'
      : 'Focus: consistency. A short session every study day beats a long one now and then.';

    return {
      studyDaysElapsed, activeDays, consistencyPct, totalQ, totalC, totalSec, totalNew,
      accOverall, acc14, trend, best, mocks, weakest: board.weakest, strongest: board.strongest,
      scores: { coverage, accuracy, consistency, overall }, grade, rate, finish, projection, advice,
      streak: Number(o.streak) || 0,
    };
  }

  /** Plain-text version for "Copy report" (WhatsApp / notes friendly). */
  function reportText(sum, o) {
    const plan = o.plan;
    const L = [];
    L.push('Abhyas \u00b7 60-day sprint report');
    L.push('Day ' + plan.dayNum + ' of ' + plan.N + ' (' + plan.phase + ' phase) \u00b7 exam ' + plan.exam);
    L.push('');
    L.push('Grade: ' + sum.grade + ' (overall ' + sum.scores.overall + '/100)');
    L.push('Syllabus covered: ' + plan.coveragePct + '% \u00b7 Level 7 ' + plan.levels.l7.pct + '% \u00b7 GK ' + plan.levels.gk.pct + '%');
    L.push('Remaining new questions: ' + plan.remaining);
    L.push('Questions answered: ' + sum.totalQ + ' \u00b7 accuracy ' + sum.accOverall + '% (last 14 days ' + sum.acc14 + '%)');
    L.push('Active days: ' + sum.activeDays + ' of ' + sum.studyDaysElapsed + ' study days \u00b7 streak ' + sum.streak);
    L.push('Time studied: ' + fmtMin(sum.totalSec));
    if (sum.weakest.length) L.push('Weakest: ' + sum.weakest.map((w) => w.name + ' ' + w.acc + '%').join(', '));
    if (sum.strongest.length) L.push('Strongest: ' + sum.strongest.map((w) => w.name + ' ' + w.acc + '%').join(', '));
    if (sum.mocks.length) L.push('Mock tests: ' + sum.mocks.slice(-5).map((m) => m.pct + '%').join(', '));
    if (sum.projection) { L.push(''); L.push(sum.projection); }
    L.push(sum.advice);
    return L.join('\n');
  }

  window.SPRINT_REPORT = { dayRemark, summarize, reportText, chapterBoard, fmtMin, accTier, pct };
})();

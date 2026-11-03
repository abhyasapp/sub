// js/core/progress.js — 60-day sprint planning, chapter mastery, exam-timer
// warnings. Pure functions. Every plan is built from real question counts.

const SPRINT_DAYS = 60, SPRINT_LEARN_END = 35, SPRINT_DRILL_END = 52;

function sprintDayNumber(startISO, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startISO || ''));
  if (!m) return 0;
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000) + 1;
}

function sprintPlan(o) {
  if ((o.totalQ | 0) > 0) return sprintPlanQ(o);
  const day = sprintDayNumber(o.startISO, o.now || new Date());
  if (!day || day < 1) return { state: 'notstarted' };
  if (day > SPRINT_DAYS) return { state: 'finished', day };

  const total = Math.max(1, o.totalTopics | 0);
  const covered = Math.min(total, Math.max(0, o.coveredTopics | 0));
  const due = Math.max(0, o.dueReview | 0);
  const doneQ = Math.max(0, o.questionsToday | 0);
  const left = total - covered;

  let phase, label, qTarget, mins, newTopics = 0, mock = false, expectedPct;
  if (day <= SPRINT_LEARN_END) {
    phase = 'learn'; label = 'Learn'; qTarget = 40; mins = 90;
    newTopics = Math.min(left, Math.max(1, Math.ceil(left / (SPRINT_LEARN_END - day + 1))));
    expectedPct = day / SPRINT_LEARN_END;
  } else if (day <= SPRINT_DRILL_END) {
    phase = 'drill'; label = 'Drill'; qTarget = 80; mins = 120;
    newTopics = Math.min(left, Math.ceil(left / (SPRINT_DRILL_END - day + 1)));
    expectedPct = 1;
  } else {
    phase = 'mock'; label = 'Mock'; qTarget = 100; mins = 150; mock = true;
    expectedPct = 1;
  }

  const actualPct = covered / total;
  const gap = actualPct - expectedPct;
  const pace = gap >= 0.05 ? 'ahead' : gap <= -0.1 ? 'behind' : 'on-track';
  const expectedQ = Math.round(expectedPct * total);

  return {
    state: 'active', day, daysLeft: SPRINT_DAYS - day, phase, label,
    qTarget, mins, newTopics, mock, due, doneQ,
    qRemaining: Math.max(0, qTarget - doneQ),
    covered, total, pace, expectedPct, expectedQ, gapQ: covered - expectedQ,
    coveragePct: Math.round(actualPct * 100),
    goalMet: doneQ >= qTarget && due === 0
  };
}

const SPRINT_CATCHUP_EVERY = 7;
const SPRINT_REVIEW_CAP = 30;
const SPRINT_REVIEW_CAP_BEHIND = 15;
const SPRINT_FEAS_OK = 120;
const SPRINT_FEAS_TIGHT = 200;
const SPRINT_MIN_DAYS = 14;

function sprintIsoAdd(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
}

function sprintTotalDays(startISO, examISO) {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startISO || ''));
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(examISO || ''));
  if (!a || !b) return SPRINT_DAYS;
  const gap = Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86400000);
  return Math.max(SPRINT_MIN_DAYS, Math.min(SPRINT_DAYS, gap));
}

function sprintPlanQ(o) {
  const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
  const D = sprintTotalDays(o.startISO, o.examISO);
  const day = sprintDayNumber(o.startISO, o.now || new Date());
  if (!day || day < 1) return { state: 'notstarted' };
  if (day > D) return { state: 'finished', day, totalDays: D };

  const learnEnd = Math.round(D * 35 / 60);
  const drillEnd = Math.round(D * 52 / 60);
  const off = new Set(Array.isArray(o.offDays) ? o.offDays : []);
  const isOff = d => off.has(sprintIsoAdd(o.startISO, d - 1));
  const isCatch = d => d <= learnEnd && d % SPRINT_CATCHUP_EVERY === 0;
  const working = (a, b, skipCatch) => {
    let n = 0;
    for (let d = a; d <= b; d++) if (!isOff(d) && !(skipCatch && isCatch(d))) n++;
    return n;
  };

  const totalQ = Math.max(1, o.totalQ | 0);
  const attempted = clamp(0, totalQ, o.attemptedQ | 0);
  const wrongQ = clamp(0, attempted, o.wrongQ | 0);
  const due = Math.max(0, o.dueReview | 0);
  const doneQ = Math.max(0, o.questionsToday | 0);
  const remainingNew = totalQ - attempted;
  const secPerQ = clamp(20, 180, Number(o.secPerQ) || 60);
  const paper = (o.paperSize | 0) > 0 ? (o.paperSize | 0) : 100;

  const learnWork = Math.max(1, working(1, learnEnd, true));
  const expectedPct = day <= learnEnd
    ? Math.min(1, working(1, Math.min(day, learnEnd), true) / learnWork)
    : 1;
  const actualPct = attempted / totalQ;
  const gap = actualPct - expectedPct;
  const pace = gap >= 0.05 ? 'ahead' : gap <= -0.1 ? 'behind' : 'on-track';
  const expectedQ = Math.round(expectedPct * totalQ);
  const gapQ = attempted - expectedQ;
  const reviewQ = Math.min(due, pace === 'behind' ? SPRINT_REVIEW_CAP_BEHIND : SPRINT_REVIEW_CAP);

  const learnDaysLeft = day <= learnEnd ? working(day, learnEnd, true) : 0;
  const drillDaysLeft = day <= drillEnd
    ? Math.max(1, working(Math.max(day, learnEnd + 1), drillEnd, false))
    : 0;
  let phase = day <= learnEnd ? 'learn' : day <= drillEnd ? 'drill' : 'mock';
  let label = phase === 'learn' ? 'Learn' : phase === 'drill' ? 'Drill' : 'Mock';
  let newQ = 0, qTarget = 0, mock = false, catchup = false, rest = false, backlogQ = 0;

  if (isOff(day)) {
    rest = true; label = 'Rest day';
  } else if (phase === 'learn') {
    if (isCatch(day)) {
      catchup = true; label = 'Catch-up';
      backlogQ = Math.max(0, Math.round(totalQ * expectedPct) - attempted);
      newQ = Math.min(backlogQ, remainingNew, 150);
      qTarget = newQ > 0 ? newQ + reviewQ : reviewQ + 20;
    } else {
      newQ = (learnDaysLeft > 0 && remainingNew > 0) ? Math.ceil(remainingNew / learnDaysLeft) : 0;
      qTarget = newQ + reviewQ;
      if (!qTarget) qTarget = 20;
    }
  } else if (phase === 'drill') {
    const need = remainingNew + wrongQ;
    newQ = Math.min(remainingNew, Math.ceil(remainingNew / drillDaysLeft));
    qTarget = clamp(40, 150, Math.ceil(need / drillDaysLeft) + reviewQ);
  } else {
    mock = true; qTarget = paper;
  }

  const raw = rest ? 0 : mock ? qTarget * secPerQ / 60 + 30 : Math.max(15, qTarget * secPerQ / 60);
  const mins = rest ? 0 : Math.ceil(raw / 5) * 5;

  const needDays = phase === 'learn' ? learnDaysLeft : drillDaysLeft;
  const neededPerDay = remainingNew > 0 && needDays > 0
    ? Math.ceil(remainingNew / needDays)
    : (remainingNew > 0 ? remainingNew : 0);
  const feasibility = remainingNew === 0 ? 'done'
    : neededPerDay <= SPRINT_FEAS_OK ? 'ok'
    : neededPerDay <= SPRINT_FEAS_TIGHT ? 'tight'
    : 'unrealistic';

  return {
    state: 'active', sized: true, day, totalDays: D, daysLeft: D - day,
    learnEnd, drillEnd, phase, label, qTarget, mins, newQ, reviewQ, backlogQ,
    catchup, rest, mock, due, doneQ,
    qRemaining: Math.max(0, qTarget - doneQ), newTopics: 0,
    covered: attempted, total: totalQ, pace, expectedPct, expectedQ, gapQ,
    coveragePct: Math.round(actualPct * 100),
    goalMet: rest ? true : doneQ >= qTarget,
    neededPerDay, feasibility, learnDaysLeft
  };
}

function sprintToday(plan, chapters) {
  if (!plan || plan.state !== 'active') return [];
  if (plan.rest) return [{ kind: 'rest', label: 'Rest day. Nothing planned.', questions: 0 }];
  const items = [];
  if (plan.mock) {
    items.push({ kind: 'mock', label: 'Full mock paper', questions: plan.qTarget });
    if (plan.reviewQ > 0) items.push({ kind: 'review', label: 'Review missed questions', questions: plan.reviewQ });
    return items;
  }
  if (plan.reviewQ > 0) items.push({ kind: 'review', label: 'Review missed questions', questions: plan.reviewQ });
  const list = (Array.isArray(chapters) ? chapters : []).filter(c => c && c.total > 0);

  const fill = (cands, budget, kind, need) => {
    for (const c of cands) {
      if (budget <= 0) break;
      const take = Math.min(need(c), budget);
      if (take > 0) {
        items.push({ kind, lv: c.lv, ch: c.ch, label: c.label, questions: take });
        budget -= take;
      }
    }
    return budget;
  };
  const newNeed = c => Math.max(0, c.total - c.attempted);

  const newPick = budget => {
    const pool = list.filter(c => newNeed(c) > 0);
    pool.sort((a, b) => (b.attempted > 0) - (a.attempted > 0));
    const gk = pool.filter(c => c.lv === 'gk');
    const l7 = pool.filter(c => c.lv !== 'gk');
    const gkRem = gk.reduce((n, c) => n + newNeed(c), 0);
    const l7Rem = l7.reduce((n, c) => n + newNeed(c), 0);
    let gkBudget = gkRem > 0
      ? Math.min(gkRem, Math.max(Math.min(10, budget), Math.round(budget * gkRem / (gkRem + l7Rem))))
      : 0;
    let l7Budget = budget - gkBudget;
    l7Budget = fill(l7, l7Budget, 'new', newNeed);
    gkBudget = fill(gk, gkBudget + l7Budget, 'new', newNeed);
    if (gkBudget > 0) {
      fill(l7.filter(c => !items.some(i => i.lv === c.lv && i.ch === c.ch && i.kind === 'new')), gkBudget, 'new', newNeed);
    }
  };
  const weakPick = budget => {
    const need = c => newNeed(c) + Math.max(0, c.wrong || 0);
    const pool = list.filter(c => c.state !== 'complete' && need(c) > 0);
    pool.sort((a, b) => (a.attempted ? (a.accuracy == null ? 0.5 : a.accuracy) : 0.6)
                       - (b.attempted ? (b.accuracy == null ? 0.5 : b.accuracy) : 0.6));
    fill(pool, budget, 'weak', need);
  };

  const budget = Math.max(0, plan.qTarget - plan.reviewQ);
  if (plan.phase === 'learn' && !plan.catchup) newPick(plan.newQ);
  else if (plan.catchup && plan.newQ > 0) newPick(plan.newQ);
  else weakPick(budget);
  return items;
}

/* One source of truth for "which sessions belong to this day". Sprint,
   Home's study-time widget, insights and Today Plan must all agree, so they
   all call this instead of each re-deriving local midnight. */
function sessionsOnDay(sessions, isoDate) {
  const day = String(isoDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const isoOf = d => (typeof localISODate === 'function')
    ? localISODate(d)
    : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return (Array.isArray(sessions) ? sessions : []).filter(s => {
    if (!s) return false;
    const at = Number(s.at || s.ts || s.date);
    if (!at) return false;
    return isoOf(new Date(at)) === day;
  });
}

function sprintDayStats(sessions, iso) {
  const day = String(iso || '');
  const out = { q: 0, correct: 0, mins: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return out;
  let secs = 0;
  (Array.isArray(sessions) ? sessions : []).forEach(s => {
    if (!s || !s.at) return;
    const d = new Date(s.at), p = n => String(n).padStart(2, '0');
    if (d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) !== day) return;
    out.q += Number(s.total) || 0;
    out.correct += Number(s.correct) || 0;
    secs += Number(s.durationSec) || 0;
  });
  out.mins = Math.round(secs / 60);
  return out;
}

function sprintMissedOpen(qres, wr) {
  const open = new Set((Array.isArray(wr) ? wr : [])
    .filter(x => x && !x._withdrawn && x.uid != null).map(x => x.uid));
  return (Array.isArray(qres) ? qres : [])
    .filter(q => q && q.ok === false && open.has(q.uid)).length;
}

function sprintForecast(o) {
  o = o || {};
  const left = Math.max(0, (o.totalQ | 0) - (o.attemptedQ | 0));
  const perDay = Math.max(0, Number(o.perDay) || 0);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(o.todayISO || '')) ? o.todayISO : '';
  const end = sprintIsoAdd(o.startISO, Math.max(0, o.totalDays | 0) - 1);
  const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!perDay || !today) return { perDay, days: null, finishISO: '', lateBy: null, left };
  const days = left ? Math.max(1, Math.ceil(left / perDay)) : 0;
  const finishISO = left ? sprintIsoAdd(today, days) : today;
  let lateBy = null;
  if (isoOk(finishISO) && isoOk(end)) {
    lateBy = Math.round((Date.parse(finishISO + 'T00:00:00Z') - Date.parse(end + 'T00:00:00Z')) / 86400000);
  }
  return { perDay, days, finishISO, lateBy, left };
}

const EXAM_WARN_AT = [600, 300, 60];

function examWarning(left, total, warned) {
  const done = Array.isArray(warned) ? warned.slice() : [];
  let fire = 0;
  EXAM_WARN_AT.forEach(t => {
    if (left <= t && done.indexOf(t) === -1) {
      done.push(t);
      if (t < total && left > t - 5) fire = t;
    }
  });
  return { fire, warned: done };
}

const MASTERY_THRESHOLD = 0.85;
const SPRINT_LEVELS = ['level7', 'gk'];

function sprintRefs(refs) {
  return (Array.isArray(refs) ? refs : []).filter(r => r && SPRINT_LEVELS.indexOf(r.lv) !== -1);
}

function chapterMastery(o) {
  o = o || {};
  const fids = Array.isArray(o.fids) ? o.fids : [];
  const fcount = o.fcount || {}, cov = o.cov || {};
  const need = Number(o.threshold) > 0 ? Number(o.threshold) : MASTERY_THRESHOLD;
  let total = 0, right = 0, wrong = 0, known = 0;
  fids.forEach(f => {
    const n = fcount[f];
    if (n != null) { total += Number(n) || 0; known++; }
    const p = (cov[f] && cov[f].p) ? String(cov[f].p) : '';
    for (let i = 0; i < p.length; i++) {
      if (p[i] === '1') right++;
      else if (p[i] === '2') wrong++;
    }
  });
  const attempted = right + wrong;
  const set = new Set(fids);
  const wrongLeft = (Array.isArray(o.wr) ? o.wr : [])
    .filter(q => q && set.has(q.fileId) && !q._withdrawn).length;
  const accuracy = attempted ? right / attempted : null;
  const out = { attempted, right, wrong, total, accuracy, wrongLeft, needs: [] };
  if (!fids.length || known < fids.length || total <= 0) { out.state = 'unknown'; return out; }
  if (!attempted) { out.state = 'not-started'; out.needs.push('Start practising this chapter'); return out; }
  if (attempted < total) {
    out.needs.push((total - attempted) + ' question' + (total - attempted === 1 ? '' : 's') + ' not attempted yet');
  }
  if (accuracy < need) out.needs.push('Accuracy ' + Math.round(accuracy * 100) + '% (need ' + Math.round(need * 100) + '%)');
  if (wrongLeft > 0) out.needs.push(wrongLeft + ' in your wrong bank');
  out.state = out.needs.length ? 'in-progress' : 'complete';
  return out;
}
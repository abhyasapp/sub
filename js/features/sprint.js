/* ===================================================================
 * js/features/sprint.js — 60-day sprint page + Home strip (v2).
 *
 * Brain:   js/features/sprint-plan.js    (what to study on which day; pure, tested)
 * Memory:  js/features/sprint-log.js     (one durable record per day)
 * Words:   js/features/sprint-report.js  (daily remarks, grade, text report)
 * This file connects them to the real app: reads coverage, draws the screen,
 * launches the practice, and listens for finished sessions.
 * =================================================================== */
(function () {
  'use strict';

  /* Falls back to English when i18n.js is not loaded (or the key is missing). */
  const T = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v) : s);

  const P = window.SPRINT_PLAN, LOG = window.SPRINT_LOG, REP = window.SPRINT_REPORT;

  const KEY_START = 'abhyas_sprint_start';
  const KEY_EXAM_LEGACY = 'abhyas_sprint_exam';   // older builds: never settable from any screen
  const KEY_EXAM  = 'abhyas_exam_date';           // the ONE exam date (Home countdown, Today plan and the sprint share it)
  const KEY_REST  = 'abhyas_sprint_rest';
  const KEY_OFF   = 'abhyas_sprint_off';

  const PERMIN = 0.9;                    // minutes per practice question (unchanged from v1)
  let _inited = false;
  let _counting = false;                 // "Count my syllabus" is running
  let _countMsg = '';

  // ── settings (kept in the same localStorage keys, so Reset Progress and cloud sync keep working) ──
  function _iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function _todayIso() { return _iso(new Date()); }
  /** start, the real exam date (may be ''), and `end` = the last day of the sprint:
   *  60 days, or the day before the exam if that comes sooner (as the exam-date dialog promises). */
  function _read() {
    let start = null, examDate = '', rest = [], off = [];
    try {
      start = localStorage.getItem(KEY_START);
      examDate = localStorage.getItem(KEY_EXAM) || '';
      if (!P.validIso(examDate)) examDate = localStorage.getItem(KEY_EXAM_LEGACY) || '';
      rest  = JSON.parse(localStorage.getItem(KEY_REST) || '[]');
      off   = JSON.parse(localStorage.getItem(KEY_OFF)  || '[]');
    } catch (e) { /* use defaults */ }
    if (!Array.isArray(rest)) rest = [];
    if (!Array.isArray(off)) off = [];
    if (!P.validIso(start)) { start = _todayIso(); try { localStorage.setItem(KEY_START, start); } catch (e) {} }
    if (!P.validIso(examDate) || examDate <= start) examDate = '';
    let end = P.addDays(start, 59);
    if (examDate && P.addDays(examDate, -1) < end) end = P.addDays(examDate, -1);
    return { start, end, examDate, rest: rest.filter(P.validIso), off: off.filter(P.validIso) };
  }
  function _write(field, value) {
    try {
      localStorage.setItem(
        field === 'rest' ? KEY_REST : field === 'off' ? KEY_OFF : field === 'exam' ? KEY_EXAM : KEY_START,
        typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) { /* storage full / private mode */ }
  }

  // ── eligible pool: Level 7 + GK, excluding "original" books ─────────────────────────────
  function isEligible(meta) {
    if (!meta) return false;
    const lvl = String(meta.level || '').toLowerCase();
    if (lvl !== 'level7' && lvl !== 'gk') return false;
    const book = String(meta.book || meta.bookName || meta.title || '');
    return !/original/i.test(book);
  }
  function _eligibleRefs() {
    try {
      if (typeof ChapterData === 'undefined' || !ChapterData.allFileRefs) return [];
      return ChapterData.allFileRefs().filter((r) => isEligible({ level: r.lv, book: r.book }));
    } catch (e) { return []; }
  }
  const _S = () => (typeof S !== 'undefined' ? S : {});

  function _seenIn(fid, n) {
    const c = (_S().cov || {})[fid];
    if (!c || !c.p) return 0;
    let seen = 0;
    for (let i = 0; i < c.p.length && i < n; i++) if (c.p[i] !== '0') seen++;
    return seen;
  }

  /** The syllabus as the planner needs it. Files whose size is not known yet are counted separately. */
  function _syllabus() {
    const fcount = _S().fcount || {};
    const units = [], unknown = [];
    _eligibleRefs().forEach((r) => {
      const n = fcount[r.fid];
      if (n == null) { unknown.push(r); return; }
      let name = r.fid;
      try { name = ChapterData.chapterName(r.lv, r.ch) || r.fid; } catch (e) {}
      units.push({ fid: r.fid, lv: r.lv, ch: r.ch, book: r.book, name, n: Number(n) || 0, seen: _seenIn(r.fid, Number(n) || 0) });
    });
    return { units, unknown };
  }

  function _dueReviews() {
    try { if (typeof REV !== 'undefined' && REV.dueWrong) return REV.dueWrong().length; } catch (e) {}
    const now = Date.now();
    return ((_S().wr) || []).filter((q) => q && !q._withdrawn && (q._nextDue == null || Number(q._nextDue) <= now)).length;
  }

  function _streak() {
    try { return (typeof STREAK !== 'undefined' && STREAK.currentStreak) ? STREAK.currentStreak() : 0; } catch (e) { return 0; }
  }

  // ── plan + today's targets ───────────────────────────────────────────────────────────────
  function _plan() {
    const cfg = _read();
    const today = _todayIso();
    const { units, unknown } = _syllabus();
    const seenAll = units.reduce((a, u) => a + u.seen, 0);
    if (!LOG.baseline() || LOG.baseline().start !== cfg.start) LOG.setBaseline(cfg.start, seenAll - (LOG.dayRec(today).newSeen || 0));
    const base = LOG.baseline();
    const plan = P.buildPlan({
      units, today, start: cfg.start, exam: cfg.end, rest: cfg.rest, off: cfg.off,
      newDoneToday: (LOG.days()[today] || {}).newSeen || 0, baselineSeen: base ? base.seen : 0,
    });
    plan.unknownFiles = unknown;
    plan.cfg = cfg;
    plan.mastery = _syllabusAccuracy(plan);
    plan.mastered = plan.status === 'complete' && plan.mastery.met;
    return plan;
  }

  function _targets(plan) {
    const today = _todayIso();
    const rec = LOG.days()[today] || { q: 0, sec: 0, newSeen: 0, kinds: {}, mocks: [] };
    const kinds = rec.kinds || {};
    const phase = plan.phase;
    const due = _dueReviews();
    const reviewDone = kinds.review || 0;

    const newT = plan.unknownFiles.length ? plan.quotaToday : (((LOG.days()[today] || {}).planned || {}).new || plan.quotaToday);
    if (!plan.unknownFiles.length && plan.quotaToday) LOG.setPlanned(today, plan.quotaToday);

    const reviewT = Math.min(30, due + reviewDone);                               // only what actually exists
    const wrongCount = ((_S().wr) || []).filter((q) => q && !q._withdrawn).length;
    const drillT = phase === 'Learn' ? (wrongCount ? Math.min(15, wrongCount + (kinds.drill || 0)) : 0)
                 : phase === 'Drill' ? 40 : (wrongCount ? 20 : 0);
    const mockT = phase === 'Mock' ? 1 : 0;

    const mockDone = (rec.mocks || []).length;
    const minutes = Math.round((newT + reviewT + drillT) * PERMIN + mockT * 75);
    return {
      phase,
      new:     { done: rec.newSeen || 0, target: newT },
      reviews: { done: reviewDone, target: reviewT },
      drill:   phase === 'Mock' ? { done: mockDone, target: mockT, label: T('Mock test') } : { done: kinds.drill || 0, target: drillT, label: 'Drill' },
      time:    { done: Math.round((rec.sec || 0) / 60), target: Math.max(10, minutes) },
      due,
    };
  }

  // ── helpers for drawing ──────────────────────────────────────────────────────────────────
  function _esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function _setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  function _fmtMinutes(m) { if (m < 60) return m + 'm'; const h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? ' ' + r + 'm' : ''); }
  function _fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()] + ', ' + d + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()];
  }
  function _bar(label, pct, cls) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="bar thin ' + (cls || '') + '" role="progressbar" aria-label="' + _esc(label) + '" aria-valuenow="' + p + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + p + '%"></i></div>';
  }
  function _pill(text, tone) { return '<span class="sp-pill ' + (tone || '') + '">' + _esc(text) + '</span>'; }
  function _lvLabel(lv) { return String(lv).toLowerCase() === 'gk' ? 'GK' : 'Level 7'; }

  /* "Complete" means two things: every question has been seen AND accuracy on the syllabus is at least
     MASTERY_GOAL%. Accuracy comes from practice sessions that belong to a syllabus chapter (session.fid). */
  const MASTERY_GOAL = 85;
  function _syllabusAccuracy(plan) {
    const fids = new Set((plan.perUnit || []).map((u) => u.fid));
    const by = {}; let c = 0, t = 0;
    ((typeof S !== 'undefined' && S.prog && S.prog.sessions) || []).forEach((x) => {
      const tot = Number(x && x.total) || 0;
      if (!tot || !fids.has(x.fid)) return;
      const k = by[x.fid] || (by[x.fid] = { t: 0, c: 0 });
      k.t += tot; k.c += Number(x.correct) || 0; t += tot; c += Number(x.correct) || 0;
    });
    const below = (plan.perUnit || []).filter((u) => by[u.fid] && by[u.fid].t >= 5 && Math.round(by[u.fid].c / by[u.fid].t * 100) < MASTERY_GOAL)
      .map((u) => ({ name: u.name, acc: Math.round(by[u.fid].c / by[u.fid].t * 100) })).sort((a, b) => a.acc - b.acc);
    const overall = t >= 20 ? Math.round(c / t * 100) : null;      // too few answers to judge
    return { goal: MASTERY_GOAL, overall, attempted: t, below, met: overall !== null && overall >= MASTERY_GOAL };
  }

  const STATUS = {
    'covered':    { icon: 'ph-target',        cls: 'warn', text: T('All covered — raise accuracy to 85%') },
    'ahead':      { icon: 'ph-trend-up',      cls: 'ok',   text: T('Ahead of schedule') },
    'on-track':   { icon: 'ph-check-circle',  cls: 'ok',   text: T('On track for exam day') },
    'behind':     { icon: 'ph-warning',       cls: 'warn', text: T('Behind schedule') },
    'compressed': { icon: 'ph-warning',       cls: 'warn', text: T('Syllabus still unfinished') },
    'complete':   { icon: 'ph-seal-check',    cls: 'ok',   text: T('Syllabus complete') },
  };

  // ── Home strip ───────────────────────────────────────────────────────────────────────────
  function renderHomeStrip() {
    const el = document.getElementById('sprint-card');
    if (!el) return;
    const plan = _plan();
    const t = _targets(plan);
    const pct = Math.round(plan.dayNum / plan.N * 100);
    let sub;
    if (plan.unknownFiles.length) sub = T('Set up your syllabus to get daily chapters');
    else if (plan.status === 'complete' && !plan.mastered) sub = 'All covered \u00b7 accuracy ' + (plan.mastery.overall === null ? '\u2014' : plan.mastery.overall + '%') + ' (goal ' + MASTERY_GOAL + '%)';
    else if (plan.status === 'complete') sub = 'Syllabus complete \u00b7 ' + t.reviews.target + ' reviews due';
    else if (plan.status === 'behind' || plan.status === 'compressed') sub = plan.todayRemaining + ' new today \u00b7 behind by ' + plan.behindBy;
    else sub = plan.todayRemaining + ' new \u00b7 ' + t.due + ' reviews due';
    el.style.display = '';
    el.setAttribute('data-on-click', "UI.go('sprint')");
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.innerHTML =
      '<div class="sp-ic"><i class="ph ph-calendar-check"></i></div>' +
      '<div class="sp-body">' +
        '<div class="sp-title">Day ' + plan.dayNum + ' <small>' + plan.phase + '</small></div>' +
        '<div class="sp-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sp-sub">' + _esc(sub) + '</div>' +
      '</div>' +
      '<div class="sp-chev"><i class="ph ph-arrow-right"></i></div>';
  }

  // ── Page ─────────────────────────────────────────────────────────────────────────────────
  function renderPage() {
    let plan;
    try { plan = _plan(); } catch (e) { console.error('[SPRINT] plan failed', e); return; }
    const t = _targets(plan);
    const steps = [
      () => _renderHeader(plan, t),
      () => _renderToday(plan, t),
      () => _renderCoverage(plan),
      () => _renderUpcoming(plan),
      () => _renderWeek(plan),
      () => _renderReports(plan),
      () => _renderJourney(plan),
      () => _renderSettings(plan),
    ];
    steps.forEach((fn) => { try { fn(); } catch (e) { console.error('[SPRINT] render step failed', e); } });
  }

  function _renderHeader(plan, t) {
    _setText('sprint-phase-label', plan.phase + ' phase');
    _setText('sprint-day-meta', 'Day ' + plan.dayNum + ' of ' + plan.N);
    _setText('sprint-today-date', _fmtDate(_todayIso()));
    const applicable = ['new', 'reviews', 'drill', 'time'].filter((k) => t[k].target > 0);
    const score = applicable.length ? applicable.reduce((a, k) => a + Math.min(1, t[k].done / t[k].target), 0) / applicable.length : 1;
    const doneN = applicable.filter((k) => t[k].done >= t[k].target).length;
    const pct = Math.round(score * 100);
    _setHtml('sprint-today-pct', pct + '<span class="pct">%</span>');
    _setHtml('sprint-today-cap',
      '<strong>' + doneN + ' of ' + applicable.length + '</strong> targets done<br>' +
      '<span class="streak"><i class="ph ph-flame"></i><span><span id="sprint-streak">' + _streak() + '</span>-day streak</span></span>');
    const bar = document.querySelector('#sprint-today-bar > i');
    if (bar) bar.style.width = pct + '%';
    const host = document.getElementById('sprint-today-bar');
    if (host) host.setAttribute('aria-valuenow', pct);

    ['new', 'reviews', 'drill', 'time'].forEach((key) => {
      const tgt = document.querySelector('.target[data-target="' + key + '"]');
      if (!tgt) return;
      const d = t[key];
      const lbl = tgt.querySelector('.target-lbl');
      if (lbl) lbl.textContent = key === 'new' ? 'New' : key === 'reviews' ? 'Reviews' : key === 'drill' ? (d.label || 'Drill') : 'Time';
      const v = tgt.querySelector('.v'), of = tgt.querySelector('.of'), fill = tgt.querySelector('.bar > i');
      if (v) v.textContent = key === 'time' ? _fmtMinutes(d.done) : String(d.done);
      if (of) of.textContent = d.target > 0 ? '/ ' + (key === 'time' ? _fmtMinutes(d.target) : d.target) : T('none due ✓');
      if (fill) fill.style.width = (d.target > 0 ? Math.min(100, Math.round(d.done / d.target * 100)) : 100) + '%';
      tgt.classList.toggle('done', d.target > 0 && d.done >= d.target);
    });
    const hint = document.getElementById('sprint-targets-hint');
    if (hint) hint.textContent = T('Resets at midnight');

    // plan status line
    const st = STATUS[plan.status === 'complete' && !plan.mastered ? 'covered' : plan.status] || STATUS['on-track'];
    const paceEl = document.getElementById('sprint-pace-verdict');
    if (paceEl) {
      let detail = '';
      if (plan.status === 'behind') detail = ' \u2014 ' + plan.behindBy + ' questions behind; ' + plan.requiredPerDay + ' a day finishes it by ' + _fmtDate(plan.finishesOn || plan.learnEnd);
      else if (plan.status === 'compressed') detail = ' \u2014 ' + plan.remaining + ' left; ' + plan.requiredPerDay + ' a day finishes by ' + _fmtDate(plan.finishesOn || plan.exam);
      else if (plan.status === 'ahead') detail = ' by ' + plan.aheadBy + ' questions';
      paceEl.className = 'pace-item ' + st.cls;
      paceEl.innerHTML = '<i class="ph ' + st.icon + '"></i><span><strong>' + st.text + '</strong>' + _esc(detail) + '</span>';
    }
    const examEl = document.getElementById('sprint-exam-date');
    if (examEl) examEl.innerHTML = plan.cfg.examDate
      ? '<i class="ph ph-calendar"></i><span>Exam <strong>' + _esc(_fmtDate(plan.cfg.examDate)) + '</strong></span>'
      : '<i class="ph ph-calendar"></i><span>Sprint ends <strong>' + _esc(_fmtDate(plan.exam)) + '</strong> \u00b7 set your exam date below</span>';
  }

  function _row(icon, cls, title, sub, label, attrs, done) {
    return '<div class="list-row' + (done ? ' is-done' : '') + '">' +
      '<div class="row-ic ' + cls + '"><i class="ph ' + icon + '"></i></div>' +
      '<div class="row-body"><div class="row-title">' + _esc(title) + '</div><div class="row-sub">' + _esc(sub) + '</div></div>' +
      (done ? '<span class="row-done"><i class="ph ph-check-circle"></i> ' + T('Done') + '</span>'
            : '<button class="row-btn' + (cls === 'review' ? ' ghost' : '') + '" type="button" ' + attrs + '>' + _esc(label) + '</button>') +
      '</div>';
  }

  function _renderToday(plan, t) {
    const host = document.getElementById('sprint-today-list');
    if (!host) return;
    const rows = [];

    if (plan.unknownFiles.length) {
      rows.push(_row('ph-books', '', T('Set up your syllabus'), T('Count the questions so every chapter gets a day'), T('Set up'), 'data-sprint="count"'));
    }
    const onRest = plan.quotaToday === 0 && plan.remaining > 0 && plan.status !== 'compressed';
    if (plan.remaining > 0 && plan.todaySlices.length) {
      plan.todaySlices.forEach((s) => {
        rows.push(_row('ph-chart-line', '', s.name,
          s.count + ' new question' + (s.count === 1 ? '' : 's') + ' \u00b7 ' + _lvLabel(s.lv) + ' \u00b7 about ' + _fmtMinutes(Math.round(s.count * PERMIN)),
          'Start', 'data-sprint="new" data-fid="' + _esc(s.fid) + '" data-count="' + s.count + '"'));
      });
    } else if (plan.remaining > 0 && plan.todayRemaining === 0 && plan.quotaToday > 0) {
      rows.push(_row('ph-check-circle', '', T('New questions for today'), plan.quotaToday + ' of ' + plan.quotaToday + ' covered', '', '', true));
    } else if (onRest) {
      rows.push(_row('ph-moon', '', T('Rest day'), T('No new questions today. The plan has spread them over the other days.'), '', '', true));
    } else if (plan.remaining === 0 && !plan.unknownFiles.length) {
      rows.push(_row('ph-seal-check', '', T('Syllabus complete'), T('Every Level 7 and GK question has been seen. Time to sharpen.'), '', '', true));
    }

    if (t.reviews.target > 0) {
      rows.push(_row('ph-arrows-clockwise', 'review', 'Review due',
        t.due + ' question' + (t.due === 1 ? '' : 's') + ' \u00b7 spaced repetition', 'Review', 'data-sprint="review"', t.reviews.done >= t.reviews.target));
    }
    if (plan.phase === 'Mock') {
      rows.push(_row('ph-timer', 'drill', T('Timed mock test'), '50 mixed questions, exam conditions (90 seconds each)', 'Start', 'data-sprint="mock"', t.drill.done >= t.drill.target));
    } else if (t.drill.target > 0) {
      rows.push(_row('ph-lightning', 'drill', T('Drill your weak spots'),
        'Up to ' + Math.min(20, t.drill.target) + ' questions you missed or find hard', 'Drill', 'data-sprint="drill"', t.drill.done >= t.drill.target));
    }
    if (!rows.length) rows.push(_row('ph-smiley', '', T('Nothing due'), T('You are all caught up for today.'), '', '', true));
    host.innerHTML = rows.join('');
  }

  function _renderCoverage(plan) {
    _setHtml('sprint-cov-pct', plan.coveragePct + '<span class="pct">%</span>');
    _setText('sprint-cov-hint', plan.seenAll + ' of ' + plan.totalAll + ' questions');
    let cap;
    if (plan.status === 'complete' && !plan.mastered) {
      const m = plan.mastery, weak = m.below.slice(0, 3).map((x) => _esc(x.name) + ' ' + x.acc + '%').join(' \u00b7 ');
      cap = T('Every Level 7 and GK question has been seen.') + ' ' +
        (m.overall === null ? T('No accuracy data yet') : T('Accuracy is {a}%. Bring every chapter to {g}% to finish.', { a: m.overall, g: MASTERY_GOAL })) +
        (weak ? '<br><span class="t-foot">' + weak + '</span>' : '');
    }
    else if (plan.status === 'complete') cap = T('Every Level 7 and GK question has been seen.');
    else cap = '<strong>' + plan.remaining + '</strong> new questions left \u00b7 scheduled to finish on <strong>' + _esc(_fmtDate(plan.finishesOn || plan.learnEnd)) + '</strong>';
    _setHtml('sprint-cov-cap', cap);
    const bar = document.querySelector('#sprint-cov-bar > i');
    if (bar) bar.style.width = plan.coveragePct + '%';
    const barHost = document.getElementById('sprint-cov-bar');
    if (barHost) barHost.setAttribute('aria-valuenow', plan.coveragePct);

    _setHtml('sprint-cov-levels',
      '<div class="cov-lv"><span>Level 7</span><strong>' + plan.levels.l7.pct + '%</strong>' + _bar('Level 7 covered', plan.levels.l7.pct) + '</div>' +
      '<div class="cov-lv"><span>General Knowledge</span><strong>' + plan.levels.gk.pct + '%</strong>' + _bar('General Knowledge covered', plan.levels.gk.pct) + '</div>' +
      '<div class="cov-lv"><span>' + T('Accuracy goal') + ' ' + MASTERY_GOAL + '%</span><strong>' + (plan.mastery.overall === null ? '\u2014' : plan.mastery.overall + '%') + '</strong>' +
        _bar('Accuracy on the syllabus', plan.mastery.overall === null ? 0 : plan.mastery.overall, plan.mastery.met ? 'ok' : '') + '</div>');

    const banner = document.getElementById('sprint-count-banner');
    if (banner) {
      const u = plan.unknownFiles.length;
      if (_counting) {
        banner.hidden = false;
        banner.innerHTML = '<i class="ph ph-hourglass"></i><div><strong>' + T('Counting your syllabus…') + '</strong><br><span id="sprint-count-msg">' + _esc(_countMsg) + '</span></div>';
      } else if (u) {
        banner.hidden = false;
        banner.innerHTML = '<i class="ph ph-info"></i><div><strong>' + u + ' question set' + (u === 1 ? '' : 's') + ' not counted yet.</strong><br>' +
          'Until they are, the plan covers only the sets already counted. Counting downloads them once, and they then work offline.</div>' +
          '<button class="row-btn" type="button" data-sprint="count">' + T('Count now') + '</button>';
      } else banner.hidden = true;
    }

    // per-chapter list, grouped by chapter, in syllabus order
    const groups = [], idx = {};
    plan.perUnit.forEach((u) => {
      const k = u.lv + '|' + u.ch;
      if (!(k in idx)) { idx[k] = groups.length; groups.push({ lv: u.lv, name: u.name, n: 0, seen: 0, fids: [] }); }
      const g = groups[idx[k]]; g.n += u.n; g.seen += u.seen; g.fids.push(u.fid);
    });
    const dateOf = (fids) => { const d = plan.schedule.find((s) => s.slices.some((x) => fids.indexOf(x.fid) !== -1)); return d ? d.iso : null; };
    _setHtml('sprint-chapters', groups.map((g) => {
      const pct = g.n ? Math.round(g.seen / g.n * 100) : 100;
      const when = pct >= 100 ? T('Done') : (dateOf(g.fids) ? 'Scheduled ' + _fmtDate(dateOf(g.fids)) : 'Scheduled');
      const icon = pct >= 100 ? 'ph-check-circle' : pct > 0 ? 'ph-circle-half' : 'ph-circle';
      return '<div class="chap-row2 ' + (pct >= 100 ? 'is-done' : '') + '"><i class="ph ' + icon + '"></i>' +
        '<div class="chap-main"><div class="chap-top"><span class="chap-name">' + _esc(g.name) + '</span><span class="chap-meta">' + g.seen + '/' + g.n + '</span></div>' +
        _bar(g.name + ' covered', pct) + '<div class="chap-when">' + _esc(_lvLabel(g.lv) + ' \u00b7 ' + when) + '</div></div></div>';
    }).join('') || '<p class="t-foot">' + T('Chapters appear here once your syllabus is counted.') + '</p>');
  }

  function _renderUpcoming(plan) {
    const host = document.getElementById('sprint-upcoming');
    if (!host) return;
    const startIdx = plan.schedule.length && plan.schedule[0].iso === plan.today ? 1 : 0;
    const next = plan.schedule.slice(startIdx, startIdx + 5).filter((d) => d.slices.length);
    host.innerHTML = next.length ? next.map((d) => {
      const parts = {};
      d.slices.forEach((s) => { parts[s.name] = (parts[s.name] || 0) + s.count; });
      const text = Object.keys(parts).slice(0, 3).map((n) => n + ' (' + parts[n] + ')').join(' \u00b7 ') + (Object.keys(parts).length > 3 ? ' \u00b7 \u2026' : '');
      return '<div class="up-row"><div class="up-date"><strong>' + _esc(_fmtDate(d.iso)) + '</strong><span>Day ' + d.dayNum + '</span></div><div class="up-text">' + _esc(text) + '</div><div class="up-n">' + d.newTarget + '</div></div>';
    }).join('') : '<p class="t-foot">' + (plan.remaining === 0 ? 'No more new questions to schedule.' : T('Nothing scheduled yet.')) + '</p>';
  }

  function _renderWeek(plan) {
    const host = document.getElementById('sprint-week');
    if (!host) return;
    const { rest, off } = plan.cfg;
    const restSet = new Set(rest), offSet = new Set(off);
    const logDays = LOG.days();
    const stk = new Set((_S().stk && Array.isArray(_S().stk.days)) ? _S().stk.days : []);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7;
    let done = 0, possible = 0, html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() - dow + i);
      const iso = _iso(d), isToday = iso === _iso(today), future = d > today;
      const studied = !!(logDays[iso] && logDays[iso].q > 0) || stk.has(iso);
      const cls = ['day']; if (isToday) cls.push('today');
      if (studied) { cls.push('full'); done++; possible++; }
      else if (restSet.has(iso)) cls.push('rest');
      else if (offSet.has(iso)) cls.push('off');
      else if (!future) possible++;
      html += '<div class="' + cls.join(' ') + '"><div class="day-lbl">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i] + '</div><div class="day-dot"></div></div>';
    }
    host.innerHTML = html;
    _setText('sprint-week-hint', done + ' of ' + possible + ' days');
  }

  // ── Reports ──────────────────────────────────────────────────────────────────────────────
  function _renderReports(plan) {
    const days = LOG.days();
    const { rest, off, start } = plan.cfg;
    const today = _todayIso();
    const restSet = new Set(rest), offSet = new Set(off);

    // today, live
    const tr = REP.dayRemark(days[today], { iso: today, today, isRest: restSet.has(today), isOff: offSet.has(today) });
    _setHtml('sprint-report-today',
      '<div class="rep-tone ' + tr.tone + '"><div class="rep-title">' + _esc(tr.title) + '</div>' +
      tr.lines.map((l) => '<p>' + _esc(l) + '</p>').join('') + '</div>');

    // last 14 days
    const rows = [];
    for (let i = 1; i <= 14; i++) {
      const iso = P.addDays(today, -i);
      if (iso < start) break;
      const rec = days[iso];
      const rm = REP.dayRemark(rec, { iso, today, isRest: restSet.has(iso), isOff: offSet.has(iso) });
      const meta = rec && rec.q ? rec.q + ' Q \u00b7 ' + rm.acc + '%' : (rm.tone === 'rest' ? 'Rest' : T('No practice'));
      rows.push(
        '<div class="rep-day ' + rm.tone + '">' +
          '<button class="rep-head" type="button" data-sprint="toggle-day" aria-expanded="false" aria-controls="rep-' + iso + '">' +
            '<span class="rep-dot"></span>' +
            '<span class="rep-date"><strong>' + _esc(_fmtDate(iso)) + '</strong><small>Day ' + (P.diffDays(start, iso) + 1) + '</small></span>' +
            '<span class="rep-meta">' + _esc(meta) + '</span><i class="ph ph-caret-down"></i>' +
          '</button>' +
          '<div class="rep-body" id="rep-' + iso + '" hidden><div class="rep-title">' + _esc(rm.title) + '</div>' + rm.lines.map((l) => '<p>' + _esc(l) + '</p>').join('') + '</div>' +
        '</div>');
    }
    _setHtml('sprint-report-days', rows.join('') || '<p class="t-foot">' + T('Your daily reports appear here after your first day.') + '</p>');

    // sprint-wide
    const sum = REP.summarize(days, { today, start, exam: plan.exam, rest, off, plan, streak: _streak() });
    plan._sum = sum;
    const gradeCls = sum.grade === '\u2014' ? '' : sum.scores.overall >= 80 ? 'ok' : sum.scores.overall >= 60 ? 'mid' : 'low';
    const scoreRow = (label, v) => '<div class="score-row"><span>' + label + '</span><strong>' + Math.round(v) + '</strong>' + _bar(label + ' score', v) + '</div>';
    const board = (title, list) => list.length
      ? '<div class="board"><h3>' + title + '</h3>' + list.map((c) => '<div class="board-row"><span>' + _esc(c.name) + '</span><strong>' + c.acc + '%</strong></div>').join('') + '</div>' : '';
    _setHtml('sprint-summary',
      '<div class="grade-row"><div class="grade-badge ' + gradeCls + '" aria-label="Sprint grade ' + _esc(sum.grade) + '">' + _esc(sum.grade) + '</div>' +
      '<div class="grade-text"><strong>' + T('Sprint grade') + '</strong><span>' + (sum.totalQ ? 'Overall ' + sum.scores.overall + ' / 100' : T('Starts after your first session')) + '</span></div></div>' +
      '<div class="scores">' + scoreRow('Coverage', sum.scores.coverage) + scoreRow('Accuracy', sum.scores.accuracy) + scoreRow('Consistency', sum.scores.consistency) + '</div>' +
      '<div class="stat-grid">' +
        '<div><strong>' + sum.totalQ + '</strong><span>Answered</span></div>' +
        '<div><strong>' + (sum.totalQ ? sum.accOverall + '%' : '\u2014') + '</strong><span>Accuracy</span></div>' +
        '<div><strong>' + sum.activeDays + '/' + sum.studyDaysElapsed + '</strong><span>' + T('Active days') + '</span></div>' +
        '<div><strong>' + _fmtMinutes(Math.round(sum.totalSec / 60)) + '</strong><span>Studied</span></div>' +
      '</div>' + _sparkline(sum.trend) +
      (sum.mocks.length ? '<div class="mock-row"><span>Mock tests</span>' + sum.mocks.slice(-5).map((m) => _pill(m.pct + '%', m.pct >= 60 ? 'ok' : 'warn')).join('') + '</div>' : '') +
      board(T('Needs the most work'), sum.weakest) + board('Strongest', sum.strongest) +
      '<p class="rep-proj">' + _esc(sum.projection || '') + '</p><p class="rep-advice">' + _esc(sum.advice) + '</p>');
  }

  function _sparkline(trend) {
    if (!trend || trend.length < 2) return '';
    const w = 300, h = 56, pad = 6;
    const pts = trend.map((t, i) => [pad + i * (w - 2 * pad) / (trend.length - 1), h - pad - (t.acc / 100) * (h - 2 * pad)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return '<div class="spark"><div class="spark-lbl">Accuracy, last ' + trend.length + ' active days</div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Accuracy trend, from ' + trend[0].acc + '% to ' + trend[trend.length - 1].acc + '%"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      pts.map((p) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="currentColor"/>').join('') + '</svg></div>';
  }

  function _renderJourney(plan) {
    _setText('sprint-day-count', 'Day ' + plan.dayNum + ' / ' + plan.N);
    const target = plan.cfg.examDate || plan.exam;
    const left = Math.max(0, P.diffDays(_todayIso(), target));
    _setText('sprint-journey-sub', left + ' day' + (left === 1 ? '' : 's') + (plan.cfg.examDate ? ' to your exam' : ' left in the sprint') + ' \u00b7 ' + _fmtDate(target));
    const sp = plan.split;
    const ranges = { learn: [1, sp.learn], drill: [sp.learn + 1, sp.learn + sp.drill], mock: [sp.learn + sp.drill + 1, plan.N] };
    ['learn', 'drill', 'mock'].forEach((name) => {
      const el = document.getElementById('sprint-phase-' + name);
      if (!el) return;
      const [from, to] = ranges[name];
      const rangeEl = el.querySelector('.phase-range');
      if (rangeEl) rangeEl.textContent = to >= from ? 'Day ' + from + '\u2013' + to : 'Day \u2014';
      el.classList.remove('active', 'past', 'future');
      let progress = 0, state = 'Upcoming';
      if (to < from) { el.classList.add('future'); state = T('Not used'); }
      else if (plan.dayNum > to) { el.classList.add('past'); progress = 100; state = 'Complete'; }
      else if (plan.dayNum >= from) { el.classList.add('active'); progress = Math.round((plan.dayNum - from + 1) / (to - from + 1) * 100); state = T('In progress'); }
      else el.classList.add('future');
      const stateEl = el.querySelector('.phase-state'); if (stateEl) stateEl.textContent = state;
      const fill = el.querySelector('.bar > i'); if (fill) fill.style.width = progress + '%';
      const b = el.querySelector('.bar'); if (b) b.setAttribute('aria-valuenow', progress);
    });
  }

  function _renderSettings(plan) {
    const ex = document.getElementById('sprint-exam-input');
    if (ex && document.activeElement !== ex) { ex.value = plan.cfg.examDate || ''; ex.min = P.addDays(_todayIso(), 1); }
    const restIn = document.getElementById('sprint-rest-input');
    if (restIn) { restIn.min = _todayIso(); restIn.max = plan.exam; }
    const list = document.getElementById('sprint-rest-list');
    if (list) {
      const upcoming = plan.cfg.rest.filter((d) => d >= _todayIso()).sort();
      list.innerHTML = upcoming.length ? upcoming.map((d) =>
        '<span class="rest-chip">' + _esc(_fmtDate(d)) + '<button type="button" data-sprint="remove-rest" data-iso="' + d + '" aria-label="Remove rest day ' + _esc(_fmtDate(d)) + '"><i class="ph ph-x"></i></button></span>').join('')
        : '<span class="t-foot">' + T('No rest days planned.') + '</span>';
    }
  }

  // ── Launchers: real practice, not just a link to a list ─────────────────────────────────
  const RUN = {
    _ref(fid) { return _eligibleRefs().find((r) => r.fid === fid) || (ChapterData.allFileRefs().find((r) => r.fid === fid)); },
    async _load(ref) { return normQ(await QUIZ._fetch(ref.fid, ref.key), ref.fid); },
    _seenQ(q) {
      const uid = String((q && q.uid) || ''), i = uid.lastIndexOf('_');
      if (i < 1) return false;
      const c = (_S().cov || {})[uid.slice(0, i)];
      if (!c || !c.p) return false;
      const ch = c.p[parseInt(uid.slice(i + 1), 10)];
      return !!ch && ch !== '0';
    },

    async startNew(fid, count) {
      const ref = RUN._ref(fid);
      if (!ref) { toast(T('That set is not available.')); return; }
      QUIZ._showLoader(T('Opening today’s questions…'));
      let qs = [];
      try { qs = await RUN._load(ref); } catch (e) { /* handled below */ }
      QUIZ._hideLoader();
      if (!qs.length) { toast(T('Could not load this set. Open it once while online, then it works offline.'), 5000); return; }
      const fresh = qs.filter((q) => !RUN._seenQ(q));
      if (!fresh.length) { toast(T('Nothing new is left in this set.')); renderPage(); return; }
      const picked = fresh.slice(0, Math.max(1, count || fresh.length));
      const name = ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book;
      QUIZ._doStart(picked, 'flashcard', name, false, { lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid, sprint: 'new' });
    },

    startReview() {
      let arr;
      try { arr = REV.dueWrong(); } catch (e) { arr = []; }
      if (!arr.length) { toast(T('Nothing due for review right now 🎉')); return; }
      QUIZ._doStart(shuf(arr.slice()).slice(0, 30), 'flashcard', '\uD83D\uDD01 Wrong Bank (Due Today)', true, { sprint: 'review' });
    },

    async startDrill() {
      const n = 20;
      const eligible = new Set(_eligibleRefs().map((r) => r.fid));
      const fidOf = (q) => { const u = String((q && q.uid) || ''), i = u.lastIndexOf('_'); return i > 0 ? u.slice(0, i) : ''; };
      let pool = ((_S().wr) || []).filter((q) => q && !q._withdrawn && eligible.has(fidOf(q)));
      pool = shuf(pool.slice()).slice(0, n);
      if (pool.length < n) {                                  // top up from the weakest chapters
        try {
          const weak = (typeof CHAPSTATS !== 'undefined' ? CHAPSTATS.entries() : []).filter((e) => e.attempted >= 3).sort((a, b) => a.accuracy - b.accuracy).slice(0, 2);
          for (const w of weak) {
            const ref = _eligibleRefs().find((r) => ChapterData.chapterName(r.lv, r.ch) === w.chapter);
            if (!ref) continue;
            const have = new Set(pool.map((q) => q.uid));
            const more = shuf((await RUN._load(ref)).filter((q) => !have.has(q.uid)));
            pool = pool.concat(more.slice(0, n - pool.length));
            if (pool.length >= n) break;
          }
        } catch (e) { /* offline: use what we have */ }
      }
      if (!pool.length) { toast(T('Your drill appears once you have a few missed questions. Keep practising.'), 4500); return; }
      QUIZ._doStart(pool, 'flashcard', '\uD83C\uDFAF Sprint drill', true, { sprint: 'drill' });
    },

    async startMock(n) {
      n = n || 50;
      const refs = shuf(_eligibleRefs().filter((r) => (_S().fcount || {})[r.fid] > 0));
      if (!refs.length) { toast(T('Count your syllabus first so a mock can be built.')); return; }
      QUIZ._showLoader(T('Building your mock test…'));
      let pool = [], i = 0;
      const worker = async () => {
        while (i < refs.length && i < 14 && pool.length < n * 2) {
          const ref = refs[i++];
          try { pool = pool.concat(await RUN._load(ref)); } catch (e) { /* skip */ }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      QUIZ._hideLoader();
      if (pool.length < 10) { toast(T('Could not build a mock. Check your connection and try again.'), 4500); return; }
      QUIZ._doStart(shuf(pool).slice(0, n), 'exam', T('Sprint mock test'), true, { sprint: 'mock' });
    },

    async count() {
      if (_counting) return;
      const todo = _plan().unknownFiles.slice();
      if (!todo.length) { renderPage(); return; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast(T('Connect to the internet once to count your syllabus.'), 4500); return; }
      _counting = true; let done = 0, failed = 0, i = 0;
      const tick = () => { _countMsg = done + ' of ' + todo.length + ' sets'; const m = document.getElementById('sprint-count-msg'); if (m) m.textContent = _countMsg; };
      renderPage(); tick();
      const worker = async () => {
        while (i < todo.length) {
          const ref = todo[i++];
          const n = await CNT.forFile(ref);
          if (n == null) failed++;
          done++; tick();
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      _counting = false;
      toast(failed ? failed + ' set(s) could not be counted. Try again later.' : T('Syllabus counted. Your daily plan is ready.'), 4500);
      renderPage(); renderHomeStrip();
    },
  };

  // ── Copy report ──────────────────────────────────────────────────────────────────────────
  async function _copyReport() {
    const plan = _plan();
    const days = LOG.days();
    const sum = plan._sum || REP.summarize(days, { today: _todayIso(), start: plan.start, exam: plan.exam, rest: plan.cfg.rest, off: plan.cfg.off, plan, streak: _streak() });
    const text = REP.reportText(sum, { plan });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
      toast(T('Report copied. Paste it anywhere to share.'));
    } catch (e) { toast(T('Could not copy. Select the report and copy it manually.')); }
  }

  // ── Settings actions ─────────────────────────────────────────────────────────────────────
  function setExamDate(iso) {
    if (!P.validIso(iso)) { toast(T('Pick a valid exam date.')); return false; }
    if (iso <= _todayIso()) { toast(T('Pick a date after today.')); return false; }
    if (iso > P.addDays(_todayIso(), 800)) { toast(T('That is too far away.')); return false; }
    _write('exam', iso);
    try { if (typeof HOME !== 'undefined' && HOME.render) HOME.render(); } catch (e) { /* ignore */ }
    renderPage(); renderHomeStrip();
    toast(T('Exam date saved. Your plan has been re-spread.'));
    return true;
  }
  function addRestDay(iso) {
    if (!P.validIso(iso)) return;
    const { rest } = _read();
    if (!rest.includes(iso)) rest.push(iso);
    _write('rest', rest); renderPage(); renderHomeStrip();
  }
  function removeRestDay(iso) {
    const { rest } = _read();
    const i = rest.indexOf(iso);
    if (i >= 0) rest.splice(i, 1);
    _write('rest', rest); renderPage(); renderHomeStrip();
  }
  function takeTodayOff() {
    const today = _todayIso();
    const { off } = _read();
    if (!off.includes(today)) off.push(today);
    _write('off', off);
    if (typeof toast === 'function') toast(T('Today is a rest day. The other days carry a little more.'));
    renderPage(); renderHomeStrip();
  }

  // ── Event delegation for the sprint screen (no inline handlers) ──────────────────────────
  function _onClick(e) {
    const el = e.target.closest && e.target.closest('[data-sprint]');
    if (!el) return;
    const act = el.getAttribute('data-sprint');
    if (act === 'new') RUN.startNew(el.getAttribute('data-fid'), Number(el.getAttribute('data-count')) || 0);
    else if (act === 'review') RUN.startReview();
    else if (act === 'drill') RUN.startDrill();
    else if (act === 'mock') RUN.startMock(50);
    else if (act === 'count') RUN.count();
    else if (act === 'copy-report') _copyReport();
    else if (act === 'save-exam') { const i = document.getElementById('sprint-exam-input'); if (i) setExamDate(i.value); }
    else if (act === 'add-rest') {
      const i = document.getElementById('sprint-rest-input');
      if (!i || !i.value) { toast(T('Pick a date first.')); return; }
      addRestDay(i.value); i.value = '';
    }
    else if (act === 'remove-rest') removeRestDay(el.getAttribute('data-iso'));
    else if (act === 'toggle-day') {
      const body = document.getElementById(el.getAttribute('aria-controls'));
      const open = el.getAttribute('aria-expanded') === 'true';
      el.setAttribute('aria-expanded', open ? 'false' : 'true');
      el.closest('.rep-day').classList.toggle('open', !open);
      if (body) body.hidden = open;
    }
  }

  // ── Tracking: exact "new questions" and a durable day log ────────────────────────────────
  function _countNew(qres) {
    if (!Array.isArray(qres) || !qres.length) return;
    const fcount = _S().fcount || {};
    const eligible = _eligibleRefs().reduce((m, r) => { m[r.fid] = true; return m; }, {});
    const cov = _S().cov || {};
    const seen = {};
    let fresh = 0;
    qres.forEach((q) => {
      const uid = String((q && q.uid) || ''), i = uid.lastIndexOf('_');
      if (i < 1 || seen[uid]) return;
      seen[uid] = true;
      const fid = uid.slice(0, i), idx = parseInt(uid.slice(i + 1), 10);
      if (!eligible[fid] || !isFinite(idx) || idx < 0) return;
      if (fcount[fid] != null && idx >= fcount[fid]) return;
      const c = cov[fid];
      const ch = c && c.p ? c.p[idx] : undefined;
      if (!ch || ch === '0') fresh++;
    });
    if (fresh) LOG.addNew(_todayIso(), fresh);
  }

  let _refreshT = null;
  function _refreshSoon() {
    if (_refreshT) return;
    _refreshT = setTimeout(() => {
      _refreshT = null;
      try {
        const v = document.getElementById('view-sprint');
        if (v && v.classList.contains('on')) renderPage();
        renderHomeStrip();
      } catch (e) { /* ignore */ }
    }, 250);
  }

  function _hookTracking() {
    if (typeof COV === 'undefined' || typeof PROG === 'undefined') { setTimeout(_hookTracking, 100); return; }
    if (COV._sprintHooked) return;
    COV._sprintHooked = true;
    const origRecord = COV.record.bind(COV);
    COV.record = function (qres) {
      try { _countNew(qres); } catch (e) { console.error('[SPRINT] countNew', e); }
      return origRecord(qres);
    };
    const origSession = PROG.recordSession.bind(PROG);
    PROG.recordSession = function (sess) {
      const out = origSession(sess);
      try { LOG.recordSession(sess, _todayIso()); _refreshSoon(); } catch (e) { console.error('[SPRINT] log', e); }
      return out;
    };
  }

  window.SPRINT_PAGE = {
    init() {
      if (!_inited) {
        _read();
        const v = document.getElementById('view-sprint');
        if (v) v.addEventListener('click', _onClick);
        const strip = document.getElementById('sprint-card');
        if (strip) strip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (window.UI) window.UI.go('sprint'); } });
        _inited = true;
      }
      renderHomeStrip(); renderPage();
    },
    render() { renderHomeStrip(); renderPage(); },
    renderHomeStrip, renderPage, isEligible,
    takeTodayOff, setExamDate, addRestDay, removeRestDay,
    run: RUN, plan: _plan, targets: () => _targets(_plan()),
  };

  window.SPRINT = window.SPRINT || {};
  ['takeTodayOff', 'setExamDate', 'addRestDay', 'removeRestDay', 'renderPage', 'renderHomeStrip'].forEach((k) => { window.SPRINT[k] = window.SPRINT_PAGE[k]; });
  window.SPRINT.run = RUN;

  function _hookNav() {
    if (!window.UI || typeof window.UI.go !== 'function') { setTimeout(_hookNav, 50); return; }
    if (window.UI._sprintPageHooked) return;
    window.UI._sprintPageHooked = true;
    const orig = window.UI.go.bind(window.UI);
    window.UI.go = function (view) {
      const out = orig.apply(null, arguments);
      if (view === 'sprint') setTimeout(() => window.SPRINT_PAGE.renderPage(), 0);
      if (view === 'home')   setTimeout(() => window.SPRINT_PAGE.renderHomeStrip(), 0);
      return out;
    };
  }

  function _boot() { window.SPRINT_PAGE.init(); _hookNav(); _hookTracking(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot, { once: true });
  else _boot();
})();

// js/features/quiz-wrappers.js — every monkey-patch that adds behaviour ON TOP
// of the base QUIZ engine. MUST load AFTER objective.js and AFTER quiz-extras.js
// (this file's wrappers call CONF, READALOUD, FAST_GUESS, etc).

(function quizUIWrappers() {
  if (typeof QUIZ === 'undefined') return;

  /* Shared helpers used by the wrappers below. */
  function _cleanChip(id) {
    const e = document.getElementById(id);
    if (!e) return;
    e.textContent = e.textContent.replace(/^[^\w(]+/, '').trim();
  }
  function _ctr(id, cur, tot) {
    const e = document.getElementById(id);
    if (e) e.innerHTML = cur + '<em>/' + tot + '</em>';
  }
  function _syncSkip() {
    if (!S.quiz || !S.quiz.ans) return;
    const n = S.quiz.ans.filter(a => a === null).length;
    const btn = document.getElementById('ex-skip-nav');
    if (btn) { btn.style.display = n ? '' : 'none'; document.getElementById('ex-skip-count').textContent = n; }
    const tot = S.quiz.qs ? S.quiz.qs.length : 0;
    const cntEl = document.getElementById('ex-bottom-count');
    if (cntEl) cntEl.textContent = (tot - n) + ' / ' + tot;
    const bskip = document.getElementById('ex-bottom-skip');
    if (bskip) { bskip.hidden = !n; const l = document.getElementById('ex-bottom-left'); if (l) l.textContent = n; }
  }

  /* ── 1. _doStart: reset everything that needs a fresh start ── */
  const _doStart = QUIZ._doStart.bind(QUIZ);
  QUIZ._doStart = function () {
    if (typeof FAST_GUESS !== 'undefined') FAST_GUESS.reset();
    try { if (typeof RECOVERY !== 'undefined') RECOVERY.markActive(); } catch (e) {}
    try { if (typeof READALOUD !== 'undefined') READALOUD.stop(); } catch (e) {}
    if (S && S.quiz) S.quiz.conf = {};
    return _doStart.apply(QUIZ, arguments);
  };

  /* ── 2. fcAnswer: track fast-guess + persist resume ── */
  const _fcAnswer = QUIZ.fcAnswer.bind(QUIZ);
  QUIZ.fcAnswer = function (i) {
    if (S.quiz && !S.quiz.reviewOnly && S.quiz.ans[S.quiz.idx] === null) {
      if (typeof FAST_GUESS !== 'undefined') FAST_GUESS.markAnswered(S.quiz.idx);
    }
    const r = _fcAnswer(i);
    try { if (typeof PRACTICE_RESUME !== 'undefined') PRACTICE_RESUME.snapshot(); } catch (e) {}
    return r;
  };

  /* ── 3. _showResults: daily10, auto-bookmark marked, wrong-first reorder ── */
  const _origShowResults = QUIZ._showResults.bind(QUIZ);
  QUIZ._showResults = function () {
    _origShowResults();
    try {
      if (S.quiz && S.quiz.scope && S.quiz.scope.daily10 && typeof DAILY10 !== 'undefined') {
        DAILY10.markDone();
        DAILY10.render();
      }
      if (typeof PRACTICE_RESUME !== 'undefined') { PRACTICE_RESUME.clear(); PRACTICE_RESUME.render(); }
    } catch (e) {}
    try {
      const stats = document.getElementById('res-stats');
      const marked = (S.quiz && S.quiz.marked) ? S.quiz.marked : new Set();
      if (marked.size && S.quiz && S.quiz.qs) {
        let added = 0;
        marked.forEach(idx => {
          const q = S.quiz.qs[idx];
          if (!q || !q.uid) return;
          const existing = (S.bk || []).find(b => b.uid === q.uid);
          if (!existing) { S.bk.push(Object.assign({}, q, { tag: 'Need Check' })); added++; }
          else if (!existing.tag) { existing.tag = 'Need Check'; added++; }
        });
        if (added) {
          _save(LS.BK, S.bk);
          try { if (typeof HOME !== 'undefined' && HOME.updateBadges) HOME.updateBadges(); } catch (e) {}
        }
      }
      if (stats && !stats.parentElement.querySelector('.marked-line') && marked.size > 0) {
        const p = document.createElement('p');
        p.className = 'marked-line t-foot';
        p.style.cssText = 'text-align:center;color:var(--warning);margin-top:.4rem';
        p.innerHTML = '<i class="ph ph-flag"></i> You marked ' + marked.size +
          ' question' + (marked.size === 1 ? '' : 's') + ' for review';
        stats.parentElement.insertBefore(p, stats.nextSibling);
      }
      const box = document.getElementById('res-review');
      if (box && S.quiz && S.quiz.qs) {
        const cards = Array.from(box.children);
        if (cards.length === S.quiz.qs.length) {
          const pairs = cards.map((c, i) => {
            const a = S.quiz.ans[i];
            const ok = isOk(a, S.quiz.qs[i].correct);
            const rank = (a === null) ? 1 : (ok ? 3 : 0);
            return { c, rank, i };
          });
          pairs.sort((x, y) => x.rank - y.rank || x.i - y.i);
          pairs.forEach(p => box.appendChild(p.c));
        }
      }
    } catch (e) {}
  };

  /* ── 4. _renderFlashcard: clean chip, extras, count, icons ── */
  const _rf = QUIZ._renderFlashcard.bind(QUIZ);
  QUIZ._renderFlashcard = function () {
    _rf();
    _cleanChip('fc-chip');
    if (typeof FAST_GUESS !== 'undefined') FAST_GUESS.markShown(S.quiz.idx);
    try { if (typeof CONF !== 'undefined') CONF.render(); } catch (e) {}
    try { if (typeof READALOUD !== 'undefined') READALOUD.render(); } catch (e) {}
    if (!S.quiz.qs) return;
    const i = S.quiz.idx, n = S.quiz.qs.length, last = i === n - 1;
    _ctr('fc-ctr', i + 1, n);
    const nav = document.getElementById('fc-nav-n');
    if (nav) nav.textContent = (i + 1) + ' / ' + n;
    const prev = document.getElementById('fc-prev');
    if (prev) prev.innerHTML = '<i class="ph ph-arrow-left"></i> <span class="fc-nav-lbl">Back</span>';
    const next = document.getElementById('fc-next');
    if (next) {
      next.innerHTML = S.quiz.reviewOnly
        ? (last ? '<i class="ph ph-check"></i> Done' : 'Next <i class="ph ph-arrow-right"></i>')
        : (last ? '<i class="ph ph-check-circle"></i> Finish' : 'Next <i class="ph ph-arrow-right"></i>');
      next.setAttribute('aria-label', last ? 'Finish and see results' : 'Next question');
    }
  };

  /* ── 5. fcNav: debounce ── */
  const _fcNav = QUIZ.fcNav.bind(QUIZ);
  let _navAt = 0;
  QUIZ.fcNav = function (dir) {
    const now = Date.now();
    if (now - _navAt < 200) return;
    _navAt = now;
    _fcNav(dir);
    try { if (typeof PRACTICE_RESUME !== 'undefined') PRACTICE_RESUME.snapshot(); } catch (e) {}
  };

  /* ── 6. _updateFcCounts: progress bar ── */
  const _uc = QUIZ._updateFcCounts.bind(QUIZ);
  QUIZ._updateFcCounts = function () {
    _uc();
    if (S.quiz.qs) { const pf = document.getElementById('fc-pf'); if (pf) pf.style.width = ((S.quiz.idx / S.quiz.qs.length) * 100) + '%'; }
  };

  /* ── 7. startWith: mode pill + counters ── */
  const _sw = QUIZ.startWith.bind(QUIZ);
  QUIZ.startWith = function (qs, mode, ch, scope) {
    _sw(qs, mode, ch, scope);
    const nm = String(ch || 'Practice').replace(/^[^\w(]+/, '').trim();
    const fc = document.getElementById('fc-chip'); if (fc) fc.textContent = nm;
    const ex = document.getElementById('ex-chip'); if (ex) ex.textContent = nm;
    const isReview = !!(scope && scope.weeklyReviewMode);
    const fmp = document.getElementById('fc-mode-pill'); if (fmp) fmp.textContent = isReview ? 'Review' : (mode === 'exam' ? 'Timed test' : 'Practice');
    const emp = document.getElementById('ex-mode-pill'); if (emp) emp.textContent = 'Timed test';
    _ctr('fc-ctr', 1, qs.length);
    _ctr('ex-ctr', 0, qs.length);
  };

  /* ── 8. _showLimitPicker: shuffle default unchecked ── */
  const _origShowLimit = QUIZ._showLimitPicker.bind(QUIZ);
  QUIZ._showLimitPicker = function (qsArr, mode, chapterName, scope) {
    _origShowLimit(qsArr, mode, chapterName, scope);
    const cb = document.getElementById('qlm-shuffle');
    if (cb && !cb.disabled) cb.checked = false;
  };

  /* ── 9. _renderExam: clean chip + counters ── */
  const _re = QUIZ._renderExam.bind(QUIZ);
  QUIZ._renderExam = function () {
    _re();
    _cleanChip('ex-chip');
    _ctr('ex-ctr', S.quiz.ans.filter(a => a !== null).length, S.quiz.qs.length);
    _syncSkip();
  };

  /* ── 10. exAnswer: track changes + urgency + sync ── */
  const _ea = QUIZ.exAnswer.bind(QUIZ);
  QUIZ.exAnswer = function (qi, oi) {
    try {
      if (S.quiz && S.quiz.ans && S.quiz.ans[qi] !== null && S.quiz.ans[qi] !== undefined && S.quiz.ans[qi] !== oi) {
        if (!S.quiz.changed) S.quiz.changed = {};
        const prev = S.quiz.ans[qi];
        const wasRight = isOk(prev, S.quiz.qs[qi].correct);
        const nowRight = isOk(oi, S.quiz.qs[qi].correct);
        if (!S.quiz.changed[qi]) S.quiz.changed[qi] = { from: prev, to: oi, wasRight, nowRight };
        else { S.quiz.changed[qi].to = oi; S.quiz.changed[qi].nowRight = nowRight; }
      }
    } catch (e) {}
    _ea(qi, oi);
    const ans = S.quiz.ans.filter(a => a !== null).length, tot = S.quiz.qs.length;
    _ctr('ex-ctr', ans, tot);
    const pf = document.getElementById('ex-pf');
    if (pf) pf.style.width = ((ans / tot) * 100) + '%';
    _paintUrgency();
    _syncSkip();
  };

  /* ── 11. _startTimer: urgency tick ── */
  function _paintUrgency() {
    if (!S.quiz || !S.quiz.active) return;
    const el = S.quiz.mode === 'exam' ? document.getElementById('ex-tmr') : null;
    if (el) el.classList.toggle('urgent', S.quiz.left > 0 && S.quiz.left < S.quiz.qs.length * 18);
  }
  const _st = QUIZ._startTimer.bind(QUIZ);
  QUIZ._startTimer = function () {
    _st();
    if (QUIZ._urgTimer) clearInterval(QUIZ._urgTimer);
    QUIZ._urgTimer = setInterval(() => {
      if (!S.quiz || !S.quiz.active) { clearInterval(QUIZ._urgTimer); QUIZ._urgTimer = null; return; }
      _paintUrgency();
    }, 1000);
  };

  /* ── 12. Body class: `quiz-on` while a quiz is open ── */
  const qw = document.getElementById('quiz-wrap'), res = document.getElementById('res-wrap');
  if (qw && window.MutationObserver) {
    const paint = () => document.body.classList.toggle('quiz-on',
      qw.style.display !== 'none' && (!res || res.style.display === 'none'));
    const mo = new MutationObserver(paint);
    mo.observe(qw, { attributes: true, attributeFilter: ['style'] });
    if (res) mo.observe(res, { attributes: true, attributeFilter: ['style'] });
    paint();
  }

  /* ── 13. Fast-guess line on the results card ── */
  (function () {
    const r = document.getElementById('res-wrap');
    if (!r || !window.MutationObserver) return;
    new MutationObserver(() => {
      if (r.style.display === 'none') return;
      const stats = document.getElementById('res-stats');
      if (!stats || stats.parentNode.querySelector('.fast-guess-line')) return;
      if (typeof FAST_GUESS === 'undefined' || !S.quiz) return;
      const fast = FAST_GUESS.fastWrongIndexes(S.quiz);
      if (!fast.length) return;
      const line = document.createElement('p');
      line.className = 'fast-guess-line';
      line.innerHTML = '<i class="ph ph-lightning"></i> ' + fast.length +
        ' wrong answer' + (fast.length > 1 ? 's' : '') +
        ' in under 10 seconds \u2014 you may have been guessing. Slow down on the next attempt.';
      stats.parentNode.insertBefore(line, stats.nextSibling);
    }).observe(r, { attributes: true, attributeFilter: ['style'] });
  })();

  /* ── 14. HOURLY's timeLimitSec override ── */
  const _prevDoStart = QUIZ._doStart.bind(QUIZ);
  QUIZ._doStart = function (qsArr, mode, chapterName, doShuffle, scope) {
    _prevDoStart(qsArr, mode, chapterName, doShuffle, scope);
    if (scope && scope.timeLimitSec && S.quiz && S.quiz.mode === 'exam') {
      S.quiz.left = scope.timeLimitSec;
      S.quiz.examEndAt = Date.now() + scope.timeLimitSec * 1000;
      const tEl = document.getElementById('ex-tmr');
      if (tEl) tEl.textContent = fmt(S.quiz.left);
      if (typeof QUIZ._snapshotExam === 'function') QUIZ._snapshotExam(true);
    }
  };

  /* ── 15. HOURLY result recording ── */
  const _prevShowResults = QUIZ._showResults.bind(QUIZ);
  QUIZ._showResults = function () {
    _prevShowResults();
    try {
      const scope = S.quiz && S.quiz.scope;
      if (scope && scope.hourlySprint && typeof HOURLY !== 'undefined') {
        const total = S.quiz.qs.length;
        let correct = 0;
        S.quiz.qs.forEach((q, i) => { if (isOk(S.quiz.ans[i], q.correct)) correct++; });
        const pct = total ? Math.round((correct / total) * 100) : 0;
        HOURLY._recordObjResult(correct, total, pct);
      }
    } catch (e) {}
  };

  /* ── 16. Update the Progress due badge ── */
  if (typeof HOME !== 'undefined' && HOME.updateBadges) {
    const _ub = HOME.updateBadges.bind(HOME);
    HOME.updateBadges = function () {
      _ub();
      const due = (typeof REV !== 'undefined' && REV.dueCount) ? REV.dueCount() : 0;
      const dot = document.getElementById('bn-badge');
      const tab = document.getElementById('bn-progress');
      if (tab) tab.classList.toggle('has-badge', due > 0);
      if (dot) dot.style.display = 'none';
    };
  }

  /* ── 17. AUTH._enter wrapper: name chip + post-login refresh ── */
  if (typeof AUTH !== 'undefined' && AUTH._enter) {
    const _origEnter = AUTH._enter.bind(AUTH);
    AUTH._enter = function (u) {
      _origEnter(u);
      const chip = document.getElementById('uchip');
      if (chip) chip.textContent = (u && (u.name || u.username)) || 'Student';
      setTimeout(() => {
        if (typeof APP_SWITCH !== 'undefined') APP_SWITCH.refresh();
        else { try { _setAdminVisible(!!(S.user && S.user.adminCapable)); } catch (e) {} }
        _refreshHints();
        if (typeof MY_SUBJ !== 'undefined') MY_SUBJ.load(true);
        if (typeof SIDEBAR_SEARCH !== 'undefined') SIDEBAR_SEARCH.init();
        if (typeof BADGES_UI !== 'undefined') BADGES_UI.render();
      }, 300);
      setTimeout(() => {
        try {
          if (typeof SUBJ !== 'undefined' && typeof SUBJ.init === 'function' && !SUBJ.ready()) SUBJ.init();
        } catch (e) {}
      }, 1800);
    };
  }
})();
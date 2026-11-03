// js/features/session.js — the 30-minute session builder and mid-quiz resume.

window.SESSION = {
  COUNT: 30,
  REVIEW_CAP_LEARN: 8,
  REVIEW_CAP_DRILL: 12,
  MISCONCEPTION_CAP_LEARN: 4,
  MISCONCEPTION_CAP_DRILL: 8,
  _pending: null,
  _cache: { at: 0, data: null },

  _phase() {
    try {
      const start = localStorage.getItem('abhyas_sprint_start') || '';
      if (!start) return 'learn';
      const exam = localStorage.getItem('abhyas_exam_date') || '';
      const day = sprintDayNumber(start, new Date());
      const total = sprintTotalDays(start, exam);
      const learnEnd = Math.round(total * 35 / 60);
      const drillEnd = Math.round(total * 52 / 60);
      if (!day || day < 1) return 'learn';
      if (day <= learnEnd) return 'learn';
      if (day <= drillEnd) return 'drill';
      return 'mock';
    } catch (e) { return 'learn'; }
  },

  async _buildWithBreakdown() {
    const phase = this._phase();
    const out = [], seen = new Set();
    const push = q => {
      if (!q || !q.uid || seen.has(q.uid)) return false;
      if (out.length >= this.COUNT) return false;
      seen.add(q.uid); out.push(q); return true;
    };
    const breakdown = { reviews: 0, misconceptions: 0, fresh: 0, weak: 0, fill: 0 };

    const due = (typeof REV !== 'undefined' && REV.dueWrong) ? REV.dueWrong() : [];
    const dueCap = phase === 'drill' ? this.REVIEW_CAP_DRILL : this.REVIEW_CAP_LEARN;
    for (const q of due) { if (out.length >= dueCap) break; if (push(q)) breakdown.reviews++; }

    const misc = (S.wr || []).filter(q => q._misconception && !q._withdrawn);
    const miscCap = out.length + (phase === 'drill' ? this.MISCONCEPTION_CAP_DRILL : this.MISCONCEPTION_CAP_LEARN);
    for (const q of misc) { if (out.length >= miscCap) break; if (push(q)) breakdown.misconceptions++; }

    if (phase === 'learn') {
      const fresh = await this._fresh(this.COUNT - out.length);
      for (const q of fresh) { if (push(q)) breakdown.fresh++; }
    } else if (phase === 'drill') {
      const weak = await this._weak(this.COUNT - out.length);
      for (const q of weak) { if (push(q)) breakdown.weak++; }
    } else {
      const mixed = await this._randomFill(this.COUNT - out.length);
      for (const q of mixed) { if (push(q)) breakdown.weak++; }
    }

    if (out.length < this.COUNT) {
      const fill = await this._randomFill(this.COUNT - out.length);
      for (const q of fill) { if (push(q)) breakdown.fill++; }
    }

    const headCount = Math.min(out.length, breakdown.reviews + breakdown.misconceptions);
    const ordered = out.slice(0, headCount).concat(shuf(out.slice(headCount)));
    return { qs: ordered, breakdown };
  },

  async _fresh(limit) {
    if (limit <= 0) return [];
    const cov = S.cov || {};
    const fcount = S.fcount || {};
    const refs = (typeof ChapterData !== 'undefined') ? ChapterData.allFileRefs() : [];
    const scored = refs.map(r => {
      const c = cov[r.fid];
      const total = fcount[r.fid] || 0;
      const seen = c ? (c.a || 0) : 0;
      return { ref: r, pct: total ? seen / total : 0, total };
    }).filter(x => x.total > 0 && x.pct < MASTERY_THRESHOLD);
    scored.sort((a, b) => a.pct - b.pct);
    const picked = [];
    for (const s of scored) {
      if (picked.length >= limit) break;
      try {
        const raw = await QUIZ._fetch(s.ref.fid, s.ref.key);
        const qs = normQ(raw, s.ref.fid);
        const c = cov[s.ref.fid];
        const unseen = qs.filter(q => {
          const parts = q.uid.split('_');
          const idx = parseInt(parts[parts.length - 1], 10);
          return !c || !c.p || c.p[idx] === '0';
        });
        const pool = shuf(unseen.length ? unseen : qs);
        for (const q of pool) { picked.push(q); if (picked.length >= limit) break; }
      } catch (e) {}
    }
    return picked;
  },

  async _weak(limit) {
    if (limit <= 0) return [];
    let entries = [];
    try { entries = (typeof CHAPSTATS !== 'undefined') ? CHAPSTATS.entries() : []; } catch (e) {}
    const weak = entries
      .filter(e => e.attempted >= 5 && e.accuracy < MASTERY_THRESHOLD * 100)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 6);
    const picked = [];
    for (const w of weak) {
      if (picked.length >= limit) break;
      const refs = ChapterData.allFileRefs().filter(r => ChapterData.chapterName(r.lv, r.ch) === w.chapter);
      for (const ref of refs) {
        if (picked.length >= limit) break;
        try {
          const raw = await QUIZ._fetch(ref.fid, ref.key);
          for (const q of shuf(normQ(raw, ref.fid))) { picked.push(q); if (picked.length >= limit) break; }
        } catch (e) {}
      }
    }
    return picked;
  },

  async _randomFill(limit) {
    if (limit <= 0) return [];
    const refs = (typeof ChapterData !== 'undefined') ? ChapterData.allFileRefs() : [];
    const picked = [];
    for (const ref of shuf(refs)) {
      if (picked.length >= limit) break;
      try {
        const raw = await QUIZ._fetch(ref.fid, ref.key);
        for (const q of shuf(normQ(raw, ref.fid))) { picked.push(q); if (picked.length >= limit) break; }
      } catch (e) {}
    }
    return picked;
  },

  async start() {
    if (S.quiz && S.quiz.active) {
      const ok = await ASK.confirm({
        title: 'Session already running',
        body: 'A quiz is in progress. Start a fresh 30-minute session anyway?',
        ok: 'Start new'
      });
      if (!ok) return;
    }
    const now = Date.now();
    if (this._cache.data && now - this._cache.at < 60000) {
      this._pending = this._cache.data.qs;
      this._showPreview(this._cache.data.qs, this._cache.data.breakdown);
      return;
    }
    QUIZ._showLoader('Building your session…');
    let qs = [], breakdown = { reviews: 0, misconceptions: 0, fresh: 0, weak: 0, fill: 0 };
    try { const r = await this._buildWithBreakdown(); qs = r.qs; breakdown = r.breakdown; }
    catch (e) { console.warn('[SESSION] build failed', e); }
    QUIZ._hideLoader();
    if (!qs.length) { toast('Nothing to practice yet. Open Chapters once while online to download a set.', 6000); return; }
    this._cache = { at: Date.now(), data: { qs, breakdown } };
    this._pending = qs;
    this._showPreview(qs, breakdown);
  },

  _showPreview(qs, breakdown) {
    const phase = this._phase();
    const phaseName = phase === 'learn' ? 'Learn' : phase === 'drill' ? 'Drill' : 'Mock';
    const phaseIcon = phase === 'learn' ? 'ph-books' : phase === 'drill' ? 'ph-target' : 'ph-note-pencil';
    const mins = Math.max(5, Math.round(qs.length * 0.8));
    const row = (icon, label, count, tone) => count > 0
      ? '<div class="sprint-row" style="padding:var(--sp-2) var(--sp-3)">' +
          '<i class="ph ' + icon + '" style="color:var(--' + (tone || 'ink-3') + ')"></i>' +
          '<span class="grow"><b>' + esc(label) + '</b>' +
            '<span class="t-cap" style="display:block;color:var(--ink-3)">' + this._describe(label) + '</span>' +
          '</span>' +
          '<span class="mono" style="font-weight:700;color:var(--ink)">' + count + '</span>' +
        '</div>'
      : '';
    const rows =
      row('ph-arrow-counter-clockwise', 'Reviews due', breakdown.reviews, 'accent') +
      row('ph-warning-circle', 'Misconceptions', breakdown.misconceptions, 'warning') +
      (phase === 'learn'
        ? row('ph-sparkle', 'New material', breakdown.fresh, 'accent')
        : row('ph-target', 'Weakest chapters', breakdown.weak, 'accent')) +
      (breakdown.fill ? row('ph-shuffle', 'Mixed fill', breakdown.fill, 'ink-3') : '');
    const body =
      '<div class="qotd-head" style="margin-bottom:var(--sp-3)">' +
        '<div><div class="qotd-meta">' + phaseName + ' session</div>' +
          '<div style="font-size:.9rem;font-weight:700;color:var(--ink);margin-top:.15rem">' +
            qs.length + ' questions \u00b7 about ' + mins + ' min' + '</div></div>' +
        '<div class="qotd-marks"><i class="ph ' + phaseIcon + '"></i></div></div>' +
      '<p class="t-callout" style="margin-bottom:var(--sp-3);line-height:1.55">' + this._why(phase) + '</p>' +
      '<div class="sprint-list" style="margin-bottom:var(--sp-4)">' + rows + '</div>' +
      '<button class="btn btn-solid btn-lg btn-blk" data-on-click="MODAL.close(\'sheet\');SESSION._begin()">' +
        '<i class="ph ph-play-circle"></i> Begin session</button>' +
      '<button class="btn btn-quiet btn-blk mt2" data-on-click="MODAL.close(\'sheet\')">Cancel</button>';
    MODAL.sheet('Your 30-minute session', body, { wide: false });
  },

  _why(phase) {
    if (phase === 'learn') return 'Reviews and misconceptions first — those are the questions you\u2019re about to forget or that you\u2019ve already got wrong. Then new material from the chapters you\u2019ve covered least.';
    if (phase === 'drill') return 'Reviews and misconceptions first, then questions from your weakest chapters. In this phase we stop adding new material and start converting what you\u2019ve seen into confident answers.';
    return 'Reviews first, then a mixed set from every level — a simulation run so nothing feels unfamiliar on exam day.';
  },

  _describe(label) {
    if (label === 'Reviews due') return 'Ready again on their spacing schedule';
    if (label === 'Misconceptions') return 'You were sure and got them wrong — these cost the most marks';
    if (label === 'New material') return 'From chapters you\u2019ve covered least';
    if (label === 'Weakest chapters') return 'Lowest accuracy so far';
    if (label === 'Mixed fill') return 'Extra questions to reach the session length';
    return '';
  },

  _begin() {
    const phase = this._phase();
    const label = phase === 'learn' ? '📚 Learn session'
                : phase === 'drill' ? '🎯 Drill session'
                : '📝 Mock session';
    if (!this._pending) { toast('Session expired, tap again.'); return; }
    const qs = this._pending;
    this._pending = null;
    QUIZ._doStart(qs, 'flashcard', label, false,
      { session: true, phase, sessionKind: phase === 'drill' ? 'drill' : 'new' });
  }
};

window.PRACTICE_RESUME = {
  KEY: 'abhyas_practice_snap',
  MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
  SIZE_CEILING: 500 * 1024,

  get() { try { const r = localStorage.getItem(this.KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} },

  snapshot() {
    try {
      if (!S.quiz || !S.quiz.active) return;
      if (S.quiz.mode !== 'flashcard') return;
      if (S.quiz.reviewOnly) return;
      if (!S.user || !S.user.username) return;
      if (S.quiz.scope && (S.quiz.scope.daily10 || S.quiz.scope.weeklyId)) return;
      const answered = (S.quiz.ans || []).filter(a => a !== null && a !== undefined).length;
      if (answered === 0) return;
      let snap = {
        username: S.user.username, ch: S.quiz.ch || 'Practice',
        qs: S.quiz.qs, ans: S.quiz.ans.slice ? S.quiz.ans.slice() : [],
        idx: S.quiz.idx || 0, scope: S.quiz.scope || null,
        startedAt: S.quiz.startedAt || Date.now(), savedAt: Date.now()
      };
      let json = JSON.stringify(snap);
      if (json.length > this.SIZE_CEILING) {
        snap.qs = snap.qs.map(q => { const { img, imgCaption, ...rest } = q; return rest; });
        json = JSON.stringify(snap);
      }
      if (json.length > this.SIZE_CEILING) return;
      localStorage.setItem(this.KEY, json);
    } catch (e) {}
  },

  valid() {
    const s = this.get();
    if (!s || !s.username || !Array.isArray(s.qs) || !s.qs.length) return null;
    if (!S.user || S.user.username !== s.username) return null;
    if (Date.now() - (s.savedAt || 0) > this.MAX_AGE_MS) return null;
    if ((s.ans || []).filter(a => a !== null && a !== undefined).length === 0) return null;
    return s;
  },

  render() {
    const box = document.getElementById('practice-resume-slot');
    if (!box) return;
    const s = this.valid();
    if (!s) { box.innerHTML = ''; return; }
    const answered = (s.ans || []).filter(a => a !== null && a !== undefined).length;
    const mins = Math.max(1, Math.round((Date.now() - (s.savedAt || 0)) / 60000));
    const when = mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + ' h ago';
    box.innerHTML =
      '<section class="card" style="border-color:var(--accent-line);background:var(--accent-soft)">' +
        '<div class="card-hd"><h3><i class="ph ph-arrow-clockwise"></i> Unfinished practice</h3></div>' +
        '<p class="t-foot" style="margin-bottom:var(--sp-3);line-height:1.55;color:var(--ink-2)">' +
          'You were ' + answered + ' of ' + s.qs.length + ' through <b>' + esc(s.ch || 'a practice session') + '</b>, last touched ' + when + '.' +
        '</p>' +
        '<div class="bg"><button class="btn btn-solid grow" data-on-click="PRACTICE_RESUME.start()"><i class="ph ph-play"></i> Continue</button>' +
          '<button class="btn btn-quiet" data-on-click="PRACTICE_RESUME.discard()">Discard</button></div>' +
      '</section>';
  },

  start() {
    const s = this.valid();
    if (!s) { toast('That session is no longer available.'); this.render(); return; }
    while (s.ans.length < s.qs.length) s.ans.push(null);
    if (s.ans.length > s.qs.length) s.ans = s.ans.slice(0, s.qs.length);
    S.quiz = {
      qs: s.qs.slice(), ans: s.ans.slice(), mode: 'flashcard',
      idx: Math.max(0, Math.min(s.idx | 0, s.qs.length - 1)),
      timer: null, elapsed: 0, left: 0, active: true, ch: s.ch || 'Practice',
      skipped: new Set(), shown: new Set(), scope: s.scope || null,
      startedAt: s.startedAt || Date.now(), reviewOnly: false
    };
    document.getElementById('quiz-wrap').style.display = '';
    document.querySelectorAll('.view').forEach(e => e.classList.remove('on'));
    document.getElementById('ex-wrap').style.display = 'none';
    document.getElementById('fc-wrap').style.display = '';
    document.getElementById('res-wrap').style.display = 'none';
    try { QUIZ._renderFlashcard(); QUIZ._startTimer(); } catch (e) {}
    window.scrollTo(0, 0);
    this.clear();
    this.render();
    toast('Resumed where you left off', 3000);
  },

  discard() { this.clear(); this.render(); toast('Practice session discarded'); }
};
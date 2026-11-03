// js/features/weekly.js — weekly test sets, one graded attempt + local retakes.

const WEEKLY = {
  LS_RETAKES: 'abhyas_weekly_last_retake',
  LS_PAPERS:  'abhyas_weekly_papers',
  _retakes: null,

  _loadRetakes() {
    if (this._retakes) return this._retakes;
    try {
      const raw = localStorage.getItem(this.LS_RETAKES);
      this._retakes = raw ? JSON.parse(raw) : {};
      if (!this._retakes || typeof this._retakes !== 'object') this._retakes = {};
    } catch (e) { this._retakes = {}; }
    return this._retakes;
  },
  _saveRetakeScore(id, stats) {
    const all = this._loadRetakes();
    all[id] = {
      correct: Number(stats.correct) || 0,
      wrong:   Number(stats.wrong)   || 0,
      skipped: Number(stats.skipped) || 0,
      total:   Number(stats.total)   || 0,
      pct:     Number(stats.pct)     || 0,
      at: Date.now()
    };
    try { localStorage.setItem(this.LS_RETAKES, JSON.stringify(all)); } catch (e) {}
  },
  _lastAttemptFor(id) {
    const retake = this._loadRetakes()[id];
    return retake || this.attempts[id] || null;
  },

  _savePaper(id, qs, ans) {
    if (!id || !Array.isArray(qs) || !qs.length) return false;
    try {
      const all = _load(this.LS_PAPERS, {}) || {};
      const paper = { at: Date.now(), qs: qs.map(q => ({ ...q })), ans: (ans || []).slice() };
      let json = JSON.stringify(paper);
      if (json.length > 400000) {
        paper.qs = paper.qs.map(q => { const { img, imgCaption, explanation, ...rest } = q; return rest; });
        json = JSON.stringify(paper);
      }
      if (json.length > 400000) {
        paper.qs = paper.qs.map(q => ({ q: q.q, options: q.options, correct: q.correct, uid: q.uid }));
        json = JSON.stringify(paper);
      }
      if (json.length > 800000) return false;
      all[id] = paper;
      localStorage.setItem(this.LS_PAPERS, JSON.stringify(all));
      return true;
    } catch (e) { return false; }
  },
  _loadPaper(id) {
    if (!id) return null;
    try {
      const all = _load(this.LS_PAPERS, {}) || {};
      const p = all[id];
      if (!p || !Array.isArray(p.qs) || !p.qs.length) return null;
      if (Date.now() - (p.at || 0) > 120 * 24 * 60 * 60 * 1000) return null;
      return p;
    } catch (e) { return null; }
  },

  loksewaScore(attempt) {
    if (!attempt) return null;
    const total = Number(attempt.total) || 0;
    if (!total) return null;
    const correct = Number(attempt.correct) || 0;
    const skipped = Number(attempt.skipped) || 0;
    const wrong   = Math.max(0, total - correct - skipped);
    const score   = correct - wrong * 0.2;
    return {
      score:   Math.round(score * 10) / 10,
      pct:     Math.round((score / total) * 1000) / 10,
      correct, wrong, skipped, total
    };
  },

  sets: [],
  attempts: S.weeklyAttempts || {},
  _tickTimer: null,

  _saveAttempts() { S.weeklyAttempts = this.attempts; _save(LS.WK_ATTEMPTS, this.attempts); },

  async init() {
    if (!S.online || S.forcedOffline || !S.user || !S.user.token) { this._renderHomeCard(); this._startTick(); return; }
    try {
      const post = (action) => netFetch(APPS, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, username: S.user.username, token: S.user.token })
      }, 15000).then(r => r.json()).catch(() => ({ success: false }));
      
      const [setsRes, attemptsRes] = await Promise.all([
        post('listWeeklySets'),
        post('getMyWeeklyAttempts')
      ]);
      
      if (setsRes && setsRes.success) this.sets = setsRes.sets || [];
      if (attemptsRes && attemptsRes.success && Array.isArray(attemptsRes.attempts)) {
        for (const a of attemptsRes.attempts) {
          const local = this.attempts[a.weeklyId];
          if (local && !local.synced) continue;
          if (local && local.standing) a.standing = local.standing;
          this.attempts[a.weeklyId] = a;
        }
        this._saveAttempts();
      }
      this._renderHomeCard();
      this._startTick();
      this._loadStandings();
    } catch (e) { 
      console.warn('[WEEKLY.init] failed', e);
      this._renderHomeCard(); 
    }
  },

  examCloseAt(s) {
    if (!s || !s.releaseAt) return null;
    const t = new Date(s.releaseAt).getTime();
    return isNaN(t) ? null : t + WEEKLY_EXAM_WINDOW_HOURS * 60 * 60 * 1000;
  },
  examOpen(s) {
    if (!s || !s.released) return false;
    const closeAt = this.examCloseAt(s);
    return closeAt !== null && Date.now() < closeAt;
  },
  hasAttempt(id) { return !!this.attempts[id]; },

  _renderHomeCard() {
    const outer = document.getElementById('weekly-sets-outer');
    const box = document.getElementById('weekly-sets-card');
    if (!box || !outer) return;
    
    if (!this.sets.length) { outer.style.display = 'none'; box.innerHTML = ''; return; }
    outer.style.display = '';
    
    requestAnimationFrame(() => {
      box.innerHTML = this.sets.map(s => {
        const attempted = this.attempts[s.id];
        const idJson = JSON.stringify(String(s.id));

        if (!s.released) {
          const when = s.releaseAt ? new Date(s.releaseAt) : null;
          const whenTxt = (when && !isNaN(when.getTime())) ? when.toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'soon';
          return `<div class="qb-btn" style="width:100%;justify-content:flex-start;opacity:.6;cursor:default">
            <i class="ph ph-lock-simple"></i> ${esc(s.title)} <span style="opacity:.7">— unlocks ${whenTxt}</span>
          </div>`;
        }

        if (attempted) {
          const lastRetake = this._loadRetakes()[s.id];
          const shown = lastRetake || attempted;
          const isRetake = !!lastRetake;
          const canRetake = s.status !== 'archived';
          const lkLast = this.loksewaScore(shown);
          const lkOff  = this.loksewaScore(attempted);
          const lastPct = lkLast ? lkLast.pct : (Number(shown.pct) || 0);
          const offPct  = lkOff  ? lkOff.pct  : (Number(attempted.pct) || 0);
          const tag = isRetake
            ? '↻ Last practice ' + lastPct + '% · Official ' + offPct + '%'
            : '✓ ' + lastPct + '%' + (attempted.standing ? ' · Rank ' + attempted.standing.rank + '/' + attempted.standing.total : '');
          const hint = canRetake ? ' · Tap to review or retest' : ' · Tap to review';
          return `<div class="qb-btn ok" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center;opacity:.92" data-on-click='WEEKLY.open(${idJson})'>
            <span><i class="ph ph-check-circle"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
            <span class="ctag tg" style="font-size:.62rem;font-weight:700">${tag}${hint}</span>
          </div>`;
        }

        const open = this.examOpen(s);
        const closeAt = this.examCloseAt(s);
        if (open) {
          return `<div class="qb-btn ok" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center" data-on-click='WEEKLY.open(${idJson})'>
            <span><i class="ph ph-note-pencil"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
            <span class="mono" id="weekly-countdown-${esc(s.id)}" data-close="${closeAt}" style="font-size:.68rem;font-weight:700;color:var(--ros)" title="Time left — one attempt only">${formatTime(Math.max(0,Math.round((closeAt-Date.now())/1000)))}</span>
          </div>`;
        }

        return `<div class="qb-btn" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center;opacity:.75" data-on-click='WEEKLY.open(${idJson})'>
          <span><i class="ph ph-note-pencil"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
          <span style="font-size:.62rem;opacity:.75">Practice</span>
        </div>`;
      }).join('');
    });
  },

  async _loadStandings() {
    if (!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    let changed = false;
    for (const s of this.sets) {
      const a = this.attempts[s.id];
      if (!a || a.standing || !s.releaseAt || this.examOpen(s)) continue;
      try {
        const r = await netFetch(APPS, {
          method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({action:'getWeeklyStanding', username:S.user.username, token:S.user.token, weeklyId:s.id})
        }, 15000);
        const res = await r.json();
        if (res && res.success && res.ready && res.attempted) {
          a.standing = {rank:res.rank, total:res.total, percentile:res.percentile};
          changed = true;
        }
      } catch (e) {}
    }
    if (changed) { this._saveAttempts(); this._renderHomeCard(); }
  },

  async _startOnServer(s) {
    if (!S.online || S.forcedOffline || !S.user || !S.user.token) return 'go';
    let res;
    try {
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'startWeeklyAttempt', username:S.user.username, token:S.user.token, weeklyId:s.id})
      }, 15000);
      res = await r.json();
    } catch (e) { return 'go'; }
    
    if (!res || !res.success) return 'go';
    
    if (res.alreadyAttempted && res.attempt) {
      this.attempts[s.id] = res.attempt; this._saveAttempts(); this._renderHomeCard();
      toast('Already submitted. Showing your recorded result.', 4000);
      this._startReview(s, res.attempt);
      return 'stop';
    }
    if (res.windowClosed) {
      toast('The exam window has closed. Viewing answers only.', 4000);
      this._startReview(s, null);
      return 'stop';
    }
    if (res.resumed) {
      const snap = _load(LS.EXAM_SNAP, null);
      const mine = !!(snap && snap.scope && snap.scope.weeklyId === s.id && snap.username === S.user.username && snap.qs && snap.qs.length);
      if (mine) {
        const adj = (snap.left || 0) - Math.floor((Date.now() - (snap.savedAt || Date.now())) / 1000);
        if (adj <= 0) {
          QUIZ._resumeSnapshot(snap, 0);
          toast('Time ran out while you were away. Submitting what you had.', 5000);
          QUIZ.submitExam();
        } else {
          QUIZ._resumeSnapshot(snap, adj);
          toast('Continuing your test where you left off.', 3000);
        }
        return 'stop';
      }
      toast('You started this test earlier without submitting, so your one attempt is used. Showing the answers.', 7000);
      this._startReview(s, null);
      return 'stop';
    }
    return 'go';
  },

  _startTick() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    const anyCountdown = this.sets.some(s => s.released && !this.attempts[s.id] && this.examCloseAt(s) !== null);
    if (!anyCountdown) return;
    
    this._tickTimer = setInterval(() => {
      let anyExpired = false;
      let anyLive = false;
      this.sets.forEach(s => {
        if (!s.released || this.attempts[s.id]) return;
        const closeAt = this.examCloseAt(s);
        if (closeAt === null) return;
        const el = document.getElementById('weekly-countdown-' + s.id);
        const left = Math.round((closeAt - Date.now()) / 1000);
        if (left <= 0) { anyExpired = true; return; }
        anyLive = true;
        if (el) el.textContent = formatTime(left);
      });
      if (anyExpired) this._renderHomeCard();
      if (!anyLive && !anyExpired) {
        clearInterval(this._tickTimer);
        this._tickTimer = null;
      }
    }, 1000);
  },

  async open(id) {
    const s = this.sets.find(x => x.id === id);
    if (!s || !s.released) { toast('Not unlocked yet.'); return; }
    if (!s.fileId) { toast('This weekly set has no question file attached. Ask your admin to fix it.', 7000); return; }

    let attempt = this.attempts[id];
    if (!attempt && S.online && !S.forcedOffline) {
      try {
        const r = await netFetch(APPS, {
          method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({action:'getWeeklyAttempt', username:S.user.username, token:S.user.token, weeklyId:id})
        }, 15000);
        const res = await r.json();
        if (res && res.success && res.attempt) {
          attempt = res.attempt;
          this.attempts[id] = attempt;
          this._saveAttempts();
          this._renderHomeCard();
        }
      } catch (e) { }
    }

    if (attempt) {
      if (s.status === 'archived') {
        toast(`🔒 Archived — showing your recorded result (${attempt.pct}%)`, 3500);
        this._startReview(s, attempt);
        return;
      }
      this._showRetakeModal(s, attempt);
      return;
    }

    if (!this.examOpen(s)) {
      const ok = await ASK.confirm({
        title: 'Practice exam — ' + s.title,
        body:  'The ' + WEEKLY_EXAM_WINDOW_HOURS + '-hour window for the official attempt on this set has closed. ' +
               'You can still sit it as a practice run — it will be scored on this device ' +
               'and will not change the record on the server.',
        ok:    'Start practice'
      });
      if (!ok) return;
      this._startRetake(s.id);
      return;
    }

    toast(`📝 Graded exam — one official attempt. Retests are practice only.`, 5000);
    if (await WEEKLY._startOnServer(s) === 'stop') return;
    
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'exam', s.title, {
      weeklyId: s.id, weeklyTitle: s.title, weeklyFirstAttempt: true
    });
  },

  _showRetakeModal(s, attempt) {
    const last = this._lastAttemptFor(s.id) || attempt;
    const lk = this.loksewaScore(last) || { correct:0, wrong:0, skipped:0, total:0, pct:0 };
    const correct = lk.correct;
    const total   = lk.total;
    const skipped = lk.skipped;
    const wrong   = lk.wrong;
    const pct     = lk.pct;
    const isRetake = last !== attempt;
    const stamp = last.at ? new Date(last.at).toLocaleString() : '';
    const lkOff = this.loksewaScore(attempt);
    const officialPct = lkOff ? lkOff.pct : (Number(attempt && attempt.pct) || 0);

    MODAL.sheet('Weekly test — ' + s.title,
      '<div class="qotd-head" style="margin-bottom:var(--sp-4)">' +
        '<div>' +
          '<div class="qotd-meta">' + (isRetake ? 'Your last practice run' : 'Your official attempt') + '</div>' +
          '<div style="font-size:.95rem;font-weight:700;color:var(--t1);margin-top:.15rem">' + esc(s.title) + '</div>' +
          (stamp ? '<div class="t-cap" style="margin-top:.15rem">' + esc(stamp) + '</div>' : '') +
        '</div>' +
        '<div class="qotd-marks">' + pct + '%</div>' +
      '</div>' +
      '<div class="stats-row" style="margin-bottom:var(--sp-4)">' +
        '<div class="scard"><div class="sv tc2">' + correct + '</div><div class="stat-lbl">Correct</div></div>' +
        '<div class="scard"><div class="sv tb2">' + wrong   + '</div><div class="stat-lbl">Wrong</div></div>' +
        '<div class="scard"><div class="sv ta2">' + skipped + '</div><div class="stat-lbl">Skipped</div></div>' +
        '<div class="scard"><div class="sv">' + total + '</div><div class="stat-lbl">Total</div></div>' +
      '</div>' +
      '<p class="t-cap text-center" style="margin-bottom:var(--sp-3)">Loksewa marking: +1 per correct, −0.2 per wrong, 0 for skipped.</p>' +
      (isRetake
        ? '<div class="banner banner-info" style="margin-bottom:var(--sp-3)"><i class="ph ph-info"></i><span>Your <b>official score</b> for this set is <b>' + officialPct + '%</b> — the first attempt. Retests are practice only and are never recorded for the admin.</span></div>'
        : '') +
      '<p class="t-callout mb4" style="text-align:center">Review your answers, or sit the exam again?</p>' +
      '<div class="flex g2 mt4">' +
        '<button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\');WEEKLY.reviewById(\'' + escAttrJs(s.id) + '\')">' +
          '<i class="ph ph-eye"></i> Review' +
        '</button>' +
        '<button class="btn btn-solid" style="flex:1" data-on-click="MODAL.close(\'sheet\');WEEKLY._startRetake(\'' + escAttrJs(s.id) + '\')">' +
          '<i class="ph ph-repeat"></i> Retest' +
        '</button>' +
      '</div>',
      { wide:false }
    );
  },

  async _startRetake(id) {
    const s = this.sets.find(x => x.id === id);
    if (!s) { toast('Not available.'); return; }
    if (!s.fileId) {
      toast('This weekly set has no question file attached. Ask your admin to fix it.', 7000);
      return;
    }
    toast('🎯 Retest — for practice. Your official score will not change.', 4000);
    QUIZ.load(s.fileId, `weekly_${s.id}_retake`, 'exam', s.title, {
      weeklyId: s.id, weeklyTitle: s.title, weeklyRetake: true
    });
  },

  reviewById(id) {
    const s = (WEEKLY.sets || []).find(x => x.id === id);
    if (s) WEEKLY._startReview(s, (WEEKLY.attempts && WEEKLY.attempts[id]) || null);
  },

  async _startReview(s, attempt) {
    if (!s) { toast('Weekly set not found.', 5000); return; }

    const paper = this._loadPaper(s.id);
    if (paper && paper.qs.length) {
      const qs = paper.qs.slice();
      const ans = (paper.ans && paper.ans.length === qs.length)
        ? paper.ans.slice()
        : new Array(qs.length).fill(null);
      QUIZ._doStart(qs, 'flashcard', s.title, false, {
        weeklyId: s.id, weeklyTitle: s.title,
        weeklyReviewMode: true,
        weeklyAttempt: Object.assign({}, attempt || {}, { answers: ans })
      });
      return;
    }

    if (!s.fileId) {
      toast('No saved paper on this device and no attached file to review.', 7000);
      return;
    }
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'flashcard', s.title, {
      weeklyId: s.id, weeklyTitle: s.title,
      weeklyReviewMode: true, weeklyAttempt: attempt || null
    });
  },

  async _recordAttempt(quiz, stats) {
    const weeklyId = quiz.scope?.weeklyId;
    if (!weeklyId) return;

    if (quiz.scope && quiz.scope.weeklyRetake) {
      try { this._savePaper(weeklyId, quiz.qs, quiz.ans); } catch (e) {}
      this._saveRetakeScore(weeklyId, stats);
      return;
    }

    const attempt = {
      weeklyId,
      answers: (quiz.ans || []).slice(),
      total: stats.total,
      correct: stats.correct,
      skipped: stats.skipped,
      pct: stats.pct,
      startedAt: quiz.startedAt || Date.now(),
      submittedAt: Date.now(),
      durationSec: Math.min(6*60*60, Math.round((Date.now()-(quiz.startedAt||Date.now()))/1000)),
      synced: false
    };
    this.attempts[weeklyId] = attempt;
    this._saveAttempts();
    try { this._savePaper(weeklyId, quiz.qs, quiz.ans); } catch (e) {}
    this._renderHomeCard();
    await this._syncAttempt(attempt);
  },

  async _syncAttempt(attempt) {
    if (!S.online || S.forcedOffline || !S.user?.token) return;
    try {
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({
          action: 'submitWeeklyAttempt',
          username: S.user.username,
          token: S.user.token,
          weeklyId: attempt.weeklyId,
          answers: JSON.stringify(attempt.answers),
          correctCount: attempt.correct,
          startedAt: attempt.startedAt,
          durationSec: attempt.durationSec
        })
      }, 20000);
      const res = await r.json();
      if (res && res.success && res.attempt) {
        this.attempts[attempt.weeklyId] = res.attempt;
        this._saveAttempts();
        this._renderHomeCard();
      } else if (res && res.alreadyAttempted && res.attempt) {
        this.attempts[attempt.weeklyId] = res.attempt;
        this._saveAttempts();
        this._renderHomeCard();
        toast('ℹ️ This set was already submitted on another device — showing the recorded result.', 5000);
      }
    } catch (e) { }
  },

  retryUnsynced() {
    if (!S.online || S.forcedOffline) return;
    Object.values(this.attempts).forEach(a => {
      if (a && !a.synced) this._syncAttempt(a);
    });
  }
};

window.WEEKLY = WEEKLY;
// js/features/subj-queue.js — the offline written-answer queue.
// One pending item per (user, kind, questionId): a retake replaces the
// previous queued item instead of stacking.

const SUBJ_QUEUE = {
  KEY: 'abhyas_subj_queue_v1',
  MAX_BYTES: 2 * 1024 * 1024,
  MAX_ATTEMPTS: 5,

  read() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]') || []; }
    catch (e) { return []; }
  },
  write(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list || [])); } catch (e) {}
  },
  add(item) {
    const list = this.read().filter(x => !(
      x.username === item.username &&
      x.kind === item.kind &&
      x.questionId === item.questionId
    ));
    list.push(Object.assign({}, item, { queuedAt: Date.now(), attempts: 0 }));
    this.write(list);
  },
  removeFor(username, kind, questionId) {
    this.write(this.read().filter(x => !(
      x.username === username && x.kind === kind && x.questionId === questionId
    )));
  },
  forUser(username) {
    return this.read().filter(x => x.username === username);
  },

  async process() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    let user = null;
    try { user = (typeof S !== 'undefined' && S && S.user) ? S.user : null; } catch (e) {}
    if (!user || !user.token) return;
    const list = this.read();
    if (!list.length) return;
    const remaining = [];
    let sentAny = false;
    for (const item of list) {
      if (item.username !== user.username) { remaining.push(item); continue; }
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts > this.MAX_ATTEMPTS) continue;
      try {
        const res = await this._send(item, user);
        if (res && res.success) { sentAny = true; this._markSubmitted(item); }
        else if (res && res.sessionInvalid) { remaining.push(item); }
        else if (res && res.alreadySubmitted) { sentAny = true; this._markSubmitted(item); }
      } catch (e) {
        remaining.push(item);
      }
    }
    this.write(remaining);
    if (sentAny && typeof toast === 'function') toast('✅ Queued answer sent.', 4500);
    try { if (typeof SUBJ !== 'undefined') { SUBJ._renderQotd(); SUBJ._renderExam(); } } catch (e) {}
    try { if (typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh(); } catch (e) {}
  },

  _markSubmitted(item) {
    if (item.kind === 'qotd') {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_QOTD) || 'null');
        if (raw) { raw.submitted = true; raw.submittedAt = Date.now(); raw.queued = false; localStorage.setItem(LS_QOTD, JSON.stringify(raw)); }
      } catch (e) {}
      try { if (typeof QOTD !== 'undefined' && QOTD) { QOTD.submitted = true; QOTD.submittedAt = Date.now(); QOTD.queued = false; } } catch (e) {}
    }
    if (item.kind === 'exam') {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_EXAM) || 'null');
        if (raw) { raw.submitted = true; raw.submittedAt = Date.now(); raw.queued = false; localStorage.setItem(LS_EXAM, JSON.stringify(raw)); }
      } catch (e) {}
      try { if (typeof EXAM !== 'undefined' && EXAM) { EXAM.submitted = true; EXAM.submittedAt = Date.now(); EXAM.queued = false; } } catch (e) {}
    }
  },

  async _send(item, user) {
    /* submitSubjectiveAnswer is Supabase per handover §3. Route explicitly
       rather than going through GAS_URL, which would 404. */
    const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.SUPABASE_URL) || '';
    if (!url) return { success: false, error: 'Backend URL not configured.' };
    const body = JSON.stringify({
      action: 'submitSubjectiveAnswer',
      username: user.username, token: user.token,
      kind: item.kind,
      questionId: item.questionId,
      questionText: item.questionText,
      chapterId: item.chapterId,
      marks: item.marks,
      solveSec: item.solveSec,
      startedAt: item.startedAt,
      pdfData: item.pdfData,
      filename: item.filename
    });
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 45000) : null;
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body, signal: ctrl && ctrl.signal
      });
      if (timer) clearTimeout(timer);
      if (!r.ok) return { success: false, error: 'HTTP ' + r.status };
      return await r.json();
    } catch (e) {
      if (timer) clearTimeout(timer);
      throw e;
    }
  },

  _scheduled: false,
  scheduleProcess() {
    if (this._scheduled) return;
    this._scheduled = true;
    setTimeout(() => {
      this._scheduled = false;
      this.process().catch(() => {});
    }, 1200);
  }
};

window.addEventListener('online', () => SUBJ_QUEUE.scheduleProcess());
setTimeout(() => SUBJ_QUEUE.scheduleProcess(), 3000);
setInterval(() => { try { SUBJ_QUEUE.process(); } catch (e) {} }, 60000);
window.SUBJ_QUEUE = SUBJ_QUEUE;
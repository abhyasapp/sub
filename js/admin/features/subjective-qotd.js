// js/admin/features/subjective-qotd.js — grade daily questions by date.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, TOAST, BUSY),
// features/subjective-grade-card.js (gradeCard, saveGrade, regradeSheet),
// features/subjective-store.js (SUBJ_STORE).
// Uses ASK, PDN, printable helpers at call time only.

const SUBJ_QOTD = {
  async load(force){
    const list = $('qotd-list');
    if (!list) return;
    list.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    await SUBJ_STORE.load(force);
    this.render();
  },
  render(){
    const banner = $('qotd-banner'), list = $('qotd-list');
    if (!banner || !list) return;
    const dateInput = $('qotd-date');
    if (!dateInput.value) {
      const t = new Date(), p = n => String(n).padStart(2, '0');
      dateInput.value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
    }
    const dateStr = dateInput.value;
    const statusFilter = $('qotd-status').value;

    const items = SUBJ_STORE.byKind('qotd').filter(s => {
      if (!s.submittedAt) return false;
      const d = new Date(s.submittedAt), p = n => String(n).padStart(2, '0');
      if (d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) !== dateStr) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });

    const graded = items.filter(s => s.status === 'graded');
    const pending = items.length - graded.length;
    const avg = graded.length ? Math.round(graded.reduce((a, s) => a + (Number(s.score) || 0), 0) / graded.length * 10) / 10 : '—';
    const sample = items[0];

    /* The backend returns the most recent 500 submissions. Say so rather
       than letting an older date look empty. */
    const truncNote = (SUBJ_STORE.truncated && !items.length)
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' +
        'The most recent ' + SUBJ_STORE.all.length + ' of ' + SUBJ_STORE.totalCount +
        ' submissions are loaded, so this day may be further back than that. ' +
        '<button class="btn btn-sm btn-secondary" style="margin-left:.4rem" data-on-click="SUBJ_QOTD.loadDay()">Fetch ' +
        esc(dateStr) + ' from the server</button></span></div>'
      : '';

    banner.innerHTML = truncNote + '<div class="qotd-head">' +
      '<h2 class="t-t3">' + (sample ? 'The question students answered' : 'Nothing submitted on this date') + '</h2>' +
      (sample
        ? '<div class="qotd-text">' + esc(sample.questionText || 'The question text was not stored with these submissions.') + '</div>' +
          '<div class="sub-meta mt3"><span>Worth ' + (sample.questionMarks || '?') + ' marks</span><span>' + esc(sample.chapterId || 'chapter unknown') + '</span></div>'
        : '<p class="t-callout mt2">Pick another date, or wait for the first student to submit.</p>') +
      '<div class="qotd-stats">' +
        '<div><strong>' + items.length + '</strong><span>Submitted</span></div>' +
        '<div><strong>' + pending + '</strong><span>Ungraded</span></div>' +
        '<div><strong>' + graded.length + '</strong><span>Graded</span></div>' +
        '<div><strong>' + avg + '</strong><span>Average</span></div>' +
      '</div></div>';

    list.innerHTML = items.length
      ? items.map(s => gradeCard(s, 'SUBJ_QOTD', 10, false)).join('')
      : '<div class="empty"><i class="ph ph-sun-horizon"></i><div class="t">No submissions for ' + esc(dateStr) + '</div>' +
        '<div class="d">Change the date above to look at another day.</div></div>';
  },
  /* Pulls one specific day straight from the server and folds it into the
     store, for when the day sits behind the 500-row window. */
  async loadDay(){
    const dateStr = $('qotd-date').value;
    if (!dateStr) return;
    BUSY.start();
    try {
      const r = await ADMIN.post('adminListSubjectiveSubmissions', {
        kind: 'qotd', dateFrom: dateStr, dateTo: dateStr
      });
      if (!r.success) throw new Error(r.error || 'Could not load that day.');
      const fetched = r.submissions || [];
      if (!fetched.length) {
        TOAST.show('Nothing was submitted on ' + dateStr, 'info', 4000);
      } else {
        const seen = new Set(SUBJ_STORE.all.map(s => s.id));
        fetched.forEach(s => { if (!seen.has(s.id)) SUBJ_STORE.all.push(s); });
        TOAST.show('Loaded ' + plural(fetched.length, 'submission') + ' from ' + dateStr, 'success');
      }
      this.render();
    } catch(e){
      /* An older deployment predates the date filter — say so plainly. */
      TOAST.show(/dateFrom|Unknown action/i.test(e.message || '')
        ? 'This backend build does not support fetching a single day yet. Redeploy code.gs (v1.12).'
        : (e.message || 'Could not load that day.'), 'error', 7000);
    }
    BUSY.stop();
  },
  _setDate(dt){
    const p = n => String(n).padStart(2, '0');
    $('qotd-date').value = dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
    this.render();
  },
  shiftDate(days){
    const cur = $('qotd-date').value;
    const base = cur ? new Date(cur + 'T12:00:00') : new Date();
    base.setDate(base.getDate() + days);
    this._setDate(base);
  },
  goToday(){ this._setDate(new Date()); },
  save(id, marks){ saveGrade('SUBJ_QOTD', id, marks, () => this.render()); },
  regrade(id){ regradeSheet('SUBJ_QOTD', id, 10, () => this.render()); }
};

window.SUBJ_QOTD = SUBJ_QOTD;
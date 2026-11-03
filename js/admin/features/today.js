// js/admin/features/today.js — the today queue + badges.
// MUST load AFTER: core.js (ADMIN, $, $$, plural). Uses SUBJ_STORE, QREPORTS
// at call time — both must be non-stub for TODAY.render / BADGES.update.

const TODAY = {
  render(){
    const el = $('queue');
    if (!el) return;
    const pendingPay   = (ADMIN.data.payments || []).filter(p => p && p.status === 'pending').length;
    /* SUBJ_STORE.all is initialised to [] in the store module, but the
       store may not be loaded yet when this first runs. Guard both. */
    const subsAll = (typeof SUBJ_STORE !== 'undefined' && Array.isArray(SUBJ_STORE.all)) ? SUBJ_STORE.all : [];
    const qotdPending  = subsAll.filter(s => s && (s.kind || 'qotd') === 'qotd' && s.status !== 'graded').length;
    const examPending  = subsAll.filter(s => s && s.kind === 'exam' && s.status !== 'graded').length;
    const reportList   = (typeof QREPORTS !== 'undefined' && Array.isArray(QREPORTS.all)) ? QREPORTS.all : [];
    const openReports  = reportList.filter(r => r && r.status === 'open').length;
    const expiringEl   = $('expiring-list');
    /* EXPIRING.load() sets dataset.count only after its network call returns.
       On the first paint the tile would show 0 until the next refresh, so
       kick the load off here — it re-renders when the count arrives. */
    if (expiringEl && !(expiringEl.dataset && expiringEl.dataset.count) &&
        typeof EXPIRING !== 'undefined' && typeof EXPIRING.load === 'function') {
      try { EXPIRING.load(); } catch (e) {}
    }
    const expiring     = Number((expiringEl && expiringEl.dataset && expiringEl.dataset.count) || 0);

    const items = [
      { n:pendingPay,  tone:'money',  icon:'ph-credit-card',
        t:'Payments to verify', done:'No payments waiting', busy:'Students are waiting for access',
        go:"UI.nav('payments')" },
      { n:qotdPending, tone:'urgent', icon:'ph-sun-horizon',
        t:'Daily answers to grade', done:'Every answer graded', busy:'Written answers from today',
        go:"UI.nav('subj-qotd')" },
      { n:examPending, tone:'urgent', icon:'ph-note-pencil',
        t:'Exam papers to grade', done:'No papers waiting', busy:'Full papers submitted as PDF',
        go:"UI.nav('subj-exam')" },
      { n:openReports, tone:'alert',  icon:'ph-flag',
        t:'Flagged questions', done:'Nothing flagged', busy:'Students found a problem',
        go:"UI.nav('qreports')" },
      { n:expiring,    tone:'urgent', icon:'ph-hourglass-medium',
        t:'Trials ending soon', done:'No trials ending', busy:'Within your selected window',
        go:"document.getElementById('expiring-panel')?.scrollIntoView({behavior:'smooth',block:'center'})" }
    ];
    const open = items.filter(i => i.n > 0).length;

    el.innerHTML = items.map(i =>
      '<button class="queue-row ' + (i.n ? i.tone : 'clear') + '" data-on-click="' + i.go + '">' +
        '<span class="q-icon"><i class="ph ' + i.icon + '"></i></span>' +
        '<span class="q-body">' +
          '<span class="q-title">' + esc(i.t) + '</span>' +
          '<span class="q-sub">' + esc(i.n ? i.busy : i.done) + '</span>' +
        '</span>' +
        '<span class="q-count">' + i.n + '</span>' +
        '<i class="ph ph-caret-right q-chev"></i>' +
      '</button>'
    ).join('');

    const head = $('today-date');
    if (head) {
      head.textContent = new Date().toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long' }) +
        ' · ' + (open ? plural(open, 'thing') + ' need your attention' : 'Nothing needs your attention');
    }
  }
};

const BADGES = {
  set(id, n){
    const el = $(id);
    if (!el) return;
    if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; el.setAttribute('aria-label', n + ' waiting'); }
    else el.hidden = true;
  },
  update(){
    const reportList = (typeof QREPORTS !== 'undefined' && Array.isArray(QREPORTS.all)) ? QREPORTS.all : [];
    const subsAll    = (typeof SUBJ_STORE !== 'undefined' && Array.isArray(SUBJ_STORE.all)) ? SUBJ_STORE.all : [];
    this.set('badge-payments', (ADMIN.data.payments || []).filter(p => p && p.status === 'pending').length);
    this.set('badge-qreports', reportList.filter(r => r && r.status === 'open').length);
    this.set('badge-subjective', subsAll.filter(s => s && s.status !== 'graded').length);
    this.set('tab-count-qotd', subsAll.filter(s => s && (s.kind || 'qotd') === 'qotd' && s.status !== 'graded').length);
    this.set('tab-count-hourly', subsAll.filter(s => s && s.kind === 'hourly' && s.status !== 'graded').length);
    this.set('tab-count-exam', subsAll.filter(s => s && s.kind === 'exam' && s.status !== 'graded').length);
  }
};

window.TODAY  = TODAY;
window.BADGES = BADGES;
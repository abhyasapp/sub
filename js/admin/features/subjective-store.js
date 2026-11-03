// js/admin/features/subjective-store.js — the shared grading data store.
// MUST load AFTER: core.js (ADMIN). Calls BADGES.update / TODAY.render
// (from features/today.js) at call time only — both are now real (batch 1).

const SUBJ_STORE = {
  all: [], loaded: false, loading: false, truncated: false, totalCount: 0,
  async load(force){
    if (this.loaded && !force) return this.all;
    if (this.loading) return this.all;
    this.loading = true;
    try {
      const r = await ADMIN.post('adminListSubjectiveSubmissions', { status: '' });
      if (r.success) {
        this.all = r.submissions || [];
        this.truncated = !!r.truncated;
        this.totalCount = r.totalCount || this.all.length;
        this.loaded = true;
        /* today.js may not have parsed yet (or may have failed to load).
           A bare call would throw ReferenceError inside this try/catch and
           silently skip the repaint — so guard both. */
        try { if (typeof BADGES !== 'undefined') BADGES.update(); } catch (e) {}
        try { if (typeof TODAY !== 'undefined') TODAY.render(); } catch (e) {}
      }
    } catch(e){}
    this.loading = false;
    return this.all;
  },
  byKind(kind){ return this.all.filter(s => (s.kind || 'qotd') === kind); }
};

const SUBJ_TABS = {
  current: 'qotd',
  go(tab){
    this.current = tab;
    $$('#view-subjective .tabbar button').forEach(t => {
      const on = t.dataset.tab === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['qotd','hourly','exam','add'].forEach(t => { const p = $('subj-panel-' + t); if (p) p.hidden = (t !== tab); });
    if (tab === 'qotd')   SUBJ_QOTD.load(false);
    if (tab === 'hourly') SUBJ_HOURLY.load(false);
    if (tab === 'exam')   SUBJ_EXAM.load(false);
    if (tab === 'add')    SUBJADMIN._populateFilters();
  }
};

window.SUBJ_STORE = SUBJ_STORE;
window.SUBJ_TABS  = SUBJ_TABS;
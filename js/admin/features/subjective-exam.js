// js/admin/features/subjective-exam.js — grade 100-mark papers.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, TOAST, BUSY),
// features/subjective-grade-card.js (gradeCard, saveGrade, regradeSheet),
// features/subjective-store.js (SUBJ_STORE).

const SUBJ_EXAM = {
  async load(force){
    const list = $('exam-list');
    if (!list) return;
    list.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    await SUBJ_STORE.load(force);
    this.render();
  },
  render(){
    const list = $('exam-list');
    if (!list) return;
    const statusFilter = $('exam-status').value;
    const term = ($('exam-search').value || '').toLowerCase().trim();
    const items = SUBJ_STORE.byKind('exam').filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (term && !(s.username || '').toLowerCase().includes(term)) return false;
      return true;
    });
    list.innerHTML = items.length
      ? items.map(s => gradeCard(s, 'SUBJ_EXAM', 100, true)).join('')
      : '<div class="empty"><i class="ph ph-note-pencil"></i><div class="t">No exam papers here</div>' +
        '<div class="d">' + (term || statusFilter !== 'all' ? 'Clear the search or status filter to see everything.' : 'Papers appear once a student uploads one.') + '</div></div>';
  },
  save(id, marks){ saveGrade('SUBJ_EXAM', id, marks, () => this.render()); },
  regrade(id){ regradeSheet('SUBJ_EXAM', id, 100, () => this.render()); }
};

window.SUBJ_EXAM = SUBJ_EXAM;
// js/admin/features/subjective-hourly.js — grade hourly written questions.
// MUST load AFTER: core.js (ADMIN, $, esc), features/subjective-grade-card.js
// (gradeCard, saveGrade, regradeSheet), features/subjective-store.js (SUBJ_STORE).

const SUBJ_HOURLY = {
  async load(force){
    const list = $('hourly-list');
    if (!list) return;
    list.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    await SUBJ_STORE.load(force);
    this.render();
  },
  render(){
    const list = $('hourly-list');
    if (!list) return;
    const statusFilter = $('hourly-status').value;
    const term = ($('hourly-search').value || '').toLowerCase().trim();
    const items = SUBJ_STORE.all.filter(s => s.kind === 'hourly').filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (term && !(s.username || '').toLowerCase().includes(term)) return false;
      return true;
    });
    list.innerHTML = items.length
      ? items.map(s => gradeCard(s, 'SUBJ_HOURLY', 10, true)).join('')
      : '<div class="empty"><i class="ph ph-clock-countdown"></i><div class="t">No hourly submissions</div><div class="d">They arrive as students take each hour\'s question.</div></div>';
  },
  save(id, marks){ saveGrade('SUBJ_HOURLY', id, marks, () => this.render()); },
  regrade(id){ regradeSheet('SUBJ_HOURLY', id, 10, () => this.render()); }
};

window.SUBJ_HOURLY = SUBJ_HOURLY;
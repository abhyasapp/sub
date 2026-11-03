// js/features/subj-public.js — the SUBJ hub every handler talks to.
// MUST load AFTER: subj-bank.js (BANK, _allQuestions, loadBank),
// subj-qotd.js (_restoreQotd, _qotdPhase, _startQotdTick),
// subj-exam.js (_restoreExam, _startExamTick),
// subj-list.js (_renderList).

function _emptyCard(icon, title, subtitle, action){
  return `<div class="card" style="text-align:center;padding:1.6rem 1rem">
    <div class="empty-i" style="opacity:.6"><i class="ph ${icon}" style="font-size:2rem"></i></div>
    <p style="font-weight:600;color:var(--t2);margin-top:.5rem">${esc(title)}</p>
    ${subtitle ? `<p style="font-size:.72rem;color:var(--t3);margin-top:.2rem;line-height:1.55;max-width:38ch;margin-left:auto;margin-right:auto">${esc(subtitle)}</p>` : ''}
    ${action || ''}
  </div>`;
}
const _retryBtn = '<button class="btn btn-a" style="margin-top:.9rem" data-on-click="SUBJ.refreshBank()"><i class="ph ph-arrow-clockwise"></i> Try again</button>';

function _chapterNameOf(chapterId){
  const c = (window.SUBJECTIVE_CHAPTERS || []).find(x => x.id === chapterId);
  return c ? `${c.icon || ''} ${c.name}`.trim() : (chapterId || 'Subjective');
}
function _hasBank() { return BANK.loaded && _allQuestions().length > 0; }

function _refreshBadge() {
  const b = document.getElementById('subj-qotd-badge');
  if (!b) return;
  const fresh = _hasBank() &&
    (!QOTD || QOTD.date !== _todayKey() || (!QOTD.submitted && _qotdPhase() === 'expired'));
  b.hidden = !fresh;
  b.style.display = fresh ? '' : 'none';
}

const SUBJ = {
  async init() {
    await loadBank();
    _restoreQotd();
    _restoreExam();
    _renderQotd();
    _renderExam();
    _renderList();
    _refreshBadge();
    if (QOTD && !QOTD.submitted && _qotdPhase() !== 'expired') _startQotdTick();
    if (EXAM && !EXAM.submitted && EXAM.deadlineAt > Date.now()) _startExamTick();
    if (typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
  },
  ready() { return BANK.loaded; },
  async refreshBank() {
    toast('Reloading the question bank…');
    await loadBank(true);
    _renderQotd();
    _renderExam();
    _renderList();
    _refreshBadge();
    if (typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
    toast('🔄 Question bank refreshed');
  },

  _qotdPublicState,
  _hasBank,

  _qotdBegin,
  _qotdFile,
  _qotdClearFile,
  _qotdSubmit,

  _examGenerate,
  _examFile,
  _examClearFile,
  _examSubmit,
  _examReset,

  _renderQotd,
  _renderExam,
  _renderList,

  _buildCustomExam,

  customExamCooldownRemainingMs: _customExamCooldownRemainingMs,
  customExamIsLocked: _customExamIsLocked,
  customExamCooldownLabel() {
    const ms = _customExamCooldownRemainingMs();
    return ms > 0 ? _fmtCooldown(ms) : '';
  },

  _listFilter: { query: '', chapter: '' },
  _filterList(query) {
    if (typeof query === 'string') this._listFilter.query = query.toLowerCase();
    const sel = document.getElementById('subj-list-chapter');
    if (sel) this._listFilter.chapter = sel.value;
    _renderList();
  },

  _refreshBadge
};

window.SUBJ = SUBJ;
window.SUBJ_QUEUE = SUBJ_QUEUE;
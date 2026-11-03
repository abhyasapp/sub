// js/admin/features/subjective-grade-card.js — the reusable grading card.
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, badge, initials,
// relTime, fullTime, TOAST, BUSY, MODAL). Uses openPdf, SUBJ_PDF.open,
// PDF_ANNOTATE.open, SUBJ_STORE at call time only — those buttons work
// once batch 3 ships. Save/regrade work now.

function gradeCard(s, ns, defaultMarks, showQuestion){
  const graded = s.status === 'graded';
  const marks = s.questionMarks || defaultMarks;
  const id = escAttrJs(s.id);
  const hasPdf = !!(s.pdfUrl && typeof driveFileId === 'function' && driveFileId(s.pdfUrl));
  const replaced = !!s.pdfReplacedAt;
  const canGrade = ADMIN.can('subjective_grade');
  return '<div class="sub-card' + (graded ? ' graded' : '') + '">' +
    '<div class="sub-top">' +
      '<div><div class="sub-user"><span class="avatar">' + esc(initials(s.username)) + '</span>' + esc(s.username) + '</div>' +
      '<div class="sub-meta"><span title="' + esc(fullTime(s.submittedAt)) + '">' + relTime(s.submittedAt) + '</span>' +
      '<span>Out of ' + marks + '</span></div></div>' +
      '<div class="flex g2 center wrap">' +
        (replaced ? '<span class="badge badge-success flat" title="Replaced ' + esc(fullTime(s.pdfReplacedAt)) + (s.pdfReplacedBy ? ' by ' + esc(s.pdfReplacedBy) : '') + '"><i class="ph ph-check-circle"></i> PDF updated</span>' : '') +
        badge(graded ? 'graded' : 'ungraded', graded ? 'Graded' : 'Needs a score') +
      '</div>' +
    '</div>' +
    (showQuestion && s.questionText ? '<div class="sub-q">' + esc(s.questionText) + '</div>' : '') +
    '<div class="sub-acts">' +
      (hasPdf
        ? '<button class="btn btn-secondary btn-sm" data-on-click="openPdf(\'' + id + '\',\'' + escAttrJs(s.username || '') + '\')"><i class="ph ph-file-pdf"></i> Open answer PDF</button>'
        : '<button class="btn btn-secondary btn-sm" disabled><i class="ph ph-file-pdf"></i> No PDF attached</button>') +
      (hasPdf && canGrade
        ? '<button class="btn btn-quiet btn-sm" data-on-click="SUBJ_PDF.open(\'' + id + '\',\'' + escAttrJs(s.username || '') + '\',\'' + escAttrJs(s.pdfUrl || '') + '\')" title="Overwrite the Drive file with an uploaded copy"><i class="ph ph-upload-simple"></i> Replace PDF</button>'
        : '') +
      (hasPdf && canGrade
        ? '<button class="btn btn-quiet btn-sm" data-on-click="PDF_ANNOTATE.open(\'' + id + '\',\'' + escAttrJs(s.username || '') + '\',\'' + escAttrJs(s.pdfUrl || '') + '\')" title="Read and mark the paper in the browser"><i class="ph ph-highlighter-circle"></i> Mark the paper</button>'
        : '') +
      (graded
        ? '<span class="sub-score">' + s.score + ' / ' + marks + '</span>' +
          '<span class="t-cap">by ' + esc(s.gradedBy || 'admin') + '</span>' +
          '<button class="btn btn-quiet btn-sm" style="margin-left:auto" data-on-click="' + ns + '.regrade(\'' + id + '\')"><i class="ph ph-pencil-simple"></i> Change score</button>'
        : '<label class="sr-only" for="' + ns + '-score-' + id + '">Score out of ' + marks + '</label>' +
          '<input class="input grade-input" type="number" inputmode="numeric" min="0" max="' + marks + '" placeholder="0–' + marks + '" id="' + ns + '-score-' + id + '">' +
          '<label class="sr-only" for="' + ns + '-fb-' + id + '">Feedback</label>' +
          '<input class="input feedback-input" type="text" placeholder="Feedback for the student (optional)" id="' + ns + '-fb-' + id + '">' +
          '<button class="btn btn-primary btn-sm" data-on-click="' + ns + '.save(\'' + id + '\',' + marks + ')">Save score</button>') +
    '</div>' +
    (graded && s.feedback ? '<div class="sub-feedback">' + esc(s.feedback) + '</div>' : '') +
  '</div>';
}

async function saveGrade(ns, id, maxMarks, rerender){
  const scoreEl = $(ns + '-score-' + id);
  const fbEl = $(ns + '-fb-' + id);
  const score = parseInt(scoreEl?.value, 10);
  if (isNaN(score) || score < 0 || score > maxMarks) {
    if (scoreEl) { scoreEl.classList.add('invalid'); scoreEl.focus(); }
    return TOAST.show('Enter a score between 0 and ' + maxMarks, 'error');
  }
  BUSY.start();
  try {
    const r = await ADMIN.post('adminGradeSubjectiveSubmission', { id, score, feedback: fbEl?.value || '' });
    if (!r.success) throw new Error(r.error || 'Could not save that score.');
    TOAST.show('Score saved', 'success', 2000);
    await SUBJ_STORE.load(true);
    rerender();
  } catch(e){ TOAST.show(e.message, 'error'); }
  BUSY.stop();
}

function regradeSheet(ns, id, defaultMarks, rerender){
  const s = SUBJ_STORE.all.find(x => x.id === id);
  if (!s) return;
  const marks = s.questionMarks || defaultMarks;
  MODAL.sheet('Change score — ' + s.username,
    '<div class="field"><label for="rg-score">Score out of ' + marks + '</label>' +
    '<input class="input mono" type="number" id="rg-score" min="0" max="' + marks + '" value="' + (s.score ?? '') + '"></div>' +
    '<div class="field"><label for="rg-fb">Feedback</label>' +
    '<textarea class="textarea" id="rg-fb" placeholder="Optional note for the student">' + esc(s.feedback || '') + '</textarea></div>' +
    '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
    '<button class="btn btn-primary" style="flex:1" id="rg-save" data-on-click="_regradeCommit(\'' + escAttrJs(id) + '\',' + marks + ')">Save score</button></div>',
    { wide:false });
  window._regradeAfter = rerender;
}
async function _regradeCommit(id, marks){
  const n = parseInt($('rg-score').value, 10);
  if (isNaN(n) || n < 0 || n > marks) { $('rg-score').classList.add('invalid'); return TOAST.show('Enter a score between 0 and ' + marks, 'error'); }
  const btn = $('rg-save');
  btn.classList.add('loading');
  try {
    const r = await ADMIN.post('adminGradeSubjectiveSubmission', { id, score:n, feedback: $('rg-fb').value });
    if (!r.success) throw new Error(r.error);
    MODAL.close('sheet');
    TOAST.show('Score updated', 'success');
    await SUBJ_STORE.load(true);
    if (window._regradeAfter) window._regradeAfter();
  } catch(e){ TOAST.show(e.message, 'error'); }
  btn.classList.remove('loading');
}

window._regradeCommit = _regradeCommit;
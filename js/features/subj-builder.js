// js/features/subj-builder.js — the custom-paper generator, rate-limited
// to one every six hours per user.

function _buildCustomExam(chapterIds, targetMarks, markFilter) {
  const cdMs = _customExamCooldownRemainingMs();
  if (cdMs > 0) {
    toast('⏳ Custom paper is on cooldown — available again in ' + _fmtCooldown(cdMs), 5000);
    return;
  }
  const all = _allQuestions();
  if (!all || !all.length) { toast('Question bank not loaded yet'); return; }
  
  let pool = chapterIds && chapterIds.length
    ? all.filter(q => chapterIds.includes(q.chapterId))
    : all;
  if (markFilter === '5')  pool = pool.filter(q => q.marks === 5);
  if (markFilter === '10') pool = pool.filter(q => q.marks === 10);
  if (!pool.length) { toast('No questions match those filters'); return; }

  const shuffled = _shuffle(pool);
  const picked = [];
  let total = 0;
  for (const q of shuffled) {
    if (total >= targetMarks && picked.length >= 3) break;
    if (total + q.marks > targetMarks + 10) continue;
    picked.push(q);
    total += q.marks;
    if (total >= targetMarks) break;
  }
  if (!picked.length) { toast('Could not build a paper — try a lower total'); return; }

  /* Reassign, do not mutate: EXAM starts as null until an exam exists. */
  const now = Date.now();
  EXAM = {
    generatedAt: now,
    deadlineAt: now + TIMERS.examSeconds * 1000,
    uploadEndsAt: now + (TIMERS.examSeconds + TIMERS.examUploadSeconds) * 1000,
    sections: [{
      group: 'custom',
      name: 'Custom Paper — ' + picked.length + ' questions',
      targetMarks: total,
      questions: picked
    }],
    submitted: false,
    submittedAt: 0,
    queued: false
  };

  _persistExam();
  _markCustomExamUsed();
  
  if (typeof _renderExam === 'function') {
    try { _renderExam(); } catch(e) { console.error('[subj-builder] render failed', e); }
  }
  
  toast('✅ Custom paper ready · ' + picked.length + ' Qs · ' + total + ' marks · next custom paper in 6h', 5000);
}

function _notifyBuilder() {
  try {
    if (window.SUBJ_BUILDER && typeof window.SUBJ_BUILDER._updateCooldownUI === 'function') {
      window.SUBJ_BUILDER._updateCooldownUI();
    }
  } catch (e) {}
}

function _markCustomExamUsed() {
  _setCustomExamLast(Date.now());
  setTimeout(() => {
    if (document.getElementById('view-subj-exam')?.classList.contains('on')) {
      if (typeof _renderExam === 'function') _renderExam();
    }
    _notifyBuilder();
  }, 50);
}
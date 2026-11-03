// js/features/subj-exam.js — the 100-mark paper and its 3-hour + 20-minute
// two-phase timer.

const EXAM_GROUPS = {
  A: { name: "Group A — Structure + Geotech",    marks: 30, chapterIds: ["structure","geotech"] },
  B: { name: "Group B — Water Resource",         marks: 25, chapterIds: ["irrigationAndCo"] },
  C: { name: "Group C — Transportation",         marks: 25, chapterIds: ["transportAndCo"] },
  D: { name: "Group D — Public Health & Misc",   marks: 20, chapterIds: ["publicHealth","miscellaneous"] }
};

let EXAM = null;
let _examTick = null;
let _pendingExamFile = null;

function _restoreExam() {
  try {
    const raw = localStorage.getItem(LS_EXAM);
    EXAM = raw ? JSON.parse(raw) : null;
  } catch (e) { EXAM = null; }
  if (EXAM && !EXAM.deadlineAt) EXAM = null;
}
function _persistExam() {
  try {
    if (EXAM) localStorage.setItem(LS_EXAM, JSON.stringify(EXAM));
    else localStorage.removeItem(LS_EXAM);
  } catch (e) {}
}
function _clearExam() {
  EXAM = null;
  try { localStorage.removeItem(LS_EXAM); } catch (e) {}
}

function _questionsByGroup(gKey){
  const meta = EXAM_GROUPS[gKey];
  if(!meta) return [];
  return meta.chapterIds.flatMap(id => _questionsByChapter(id));
}

function _generateExam(){
  const sections = [];
  for(const [key, meta] of Object.entries(EXAM_GROUPS)){
    const pool = _questionsByGroup(key).map(q => ({ ...q, marks: (q.marks === 5 || q.marks === 10) ? q.marks : 10 }));
    const picked = [];
    const used = new Set();
    let remaining = meta.marks;
    for(const q of _shuffle(pool)){
      if(q.marks <= remaining){
        picked.push(q);
        used.add(q.id);
        remaining -= q.marks;
      }
      if(remaining <= 0) break;
    }
    if(remaining > 0){
      for(const q of _shuffle(pool)){
        if(used.has(q.id)) continue;
        const m = Math.min(q.marks, remaining);
        picked.push({ ...q, marks: m });
        used.add(q.id);
        remaining -= m;
        if(remaining <= 0) break;
      }
    }
    sections.push({ group: key, name: meta.name, targetMarks: meta.marks, questions: picked });
  }
  const now = Date.now();
  return {
    generatedAt: now,
    deadlineAt: now + TIMERS.examSeconds * 1000,
    /* v1.32: the upload window opens when the write timer hits zero. */
    uploadEndsAt: now + (TIMERS.examSeconds + TIMERS.examUploadSeconds) * 1000,
    sections,
    submitted: false,
    submittedAt: 0
  };
}

function _renderExam(){
  const body = document.getElementById('subj-exam-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching the syllabus.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-note-pencil','No paper to build yet',
      BANK.error || 'No written questions have been added yet.',
      BANK.error ? _retryBtn : '');
    return;
  }

  /* v1.32: migrate an EXAM saved before uploadEndsAt existed. */
  if(EXAM && EXAM.deadlineAt && !EXAM.uploadEndsAt){
    EXAM.uploadEndsAt = EXAM.deadlineAt + TIMERS.examUploadSeconds * 1000;
    _persistExam();
  }

  if(EXAM && EXAM.submitted){
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Exam Submitted</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--grn);margin-top:.15rem">Sent for grading</div>
          </div>
          <div class="qotd-marks">100</div>
        </div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.55;margin-bottom:.85rem">
          Submitted at ${new Date(EXAM.submittedAt).toLocaleString()}. Admin will grade it and you'll get a push notification when it's done.
        </p>
        <button class="btn btn-r btn-blk" data-on-click="SUBJ._examReset()">
          <i class="ph ph-arrow-counter-clockwise"></i> Discard &amp; Start a Fresh Paper
        </button>
      </div>`;
    return;
  }

  if(!EXAM){
    const cdMs = _customExamCooldownRemainingMs();
    const cooldownNote = cdMs > 0
      ? `<p style="font-size:.7rem;color:var(--ros);margin-top:.6rem;text-align:center"><i class="ph ph-clock"></i> Custom builder available again in <b>${_fmtCooldown(cdMs)}</b></p>`
      : '';
    body.innerHTML = `
      <div class="card">
        <div class="card-hd"><h3><i class="ph ph-note-pencil"></i> Proper Exam — 100 Marks</h3>
          <span class="ctag ta">Group A/B/C/D</span></div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.6;margin-bottom:.85rem">
          A full paper: 30 marks Structure+Geotech, 25 Water Resource, 25 Transportation,
          20 Public Health &amp; Misc — matching the Loksewa L7 Civil pattern. You get
          <b>3 hours</b> to write, then <b>20 minutes</b> to photograph your answers and
          upload a single PDF. Submit before the upload window closes.
        </p>
        <button class="btn btn-solid btn-lg btn-blk" data-on-click="SUBJ._examGenerate()">
          <i class="ph ph-dice-five"></i> Generate a Random Paper
        </button>
        ${cooldownNote}
      </div>`;
    return;
  }

  const _now = Date.now();
  const _writing = _now < EXAM.deadlineAt;
  const _uploading = !_writing && _now < EXAM.uploadEndsAt;
  const _expired = !_writing && !_uploading;
  const writeLeftSec  = Math.max(0, Math.round((EXAM.deadlineAt  - _now) / 1000));
  const uploadLeftSec = Math.max(0, Math.round((EXAM.uploadEndsAt - _now) / 1000));

  const _phaseLabel = _writing ? 'Total exam time left'
                    : _uploading ? 'Upload window closes in'
                    : 'Time is up';
  const _phaseClass = _uploading ? ' upload' : '';
  const _timerText  = _writing ? formatTime(writeLeftSec, true) : formatTime(uploadLeftSec, true);
  const _urgent = (_writing && writeLeftSec < 300) || (_uploading && uploadLeftSec < 120);

  const parts = [];
  parts.push(`
    <div class="card">
      <div class="qotd-head">
        <div>
          <div class="qotd-meta">Proper Exam — ${_writing ? 'In Progress' : _uploading ? 'Upload Phase' : 'Time is Up'}</div>
          <div style="font-size:1rem;font-weight:800;color:var(--t1);margin-top:.15rem">Full 100-Mark Paper</div>
        </div>
        <div class="qotd-marks">100</div>
      </div>
      <div class="qotd-timer${_phaseClass}${_urgent ? ' urgent' : ''}" id="exam-tmr">${_timerText}</div>
      <div class="qotd-timer-lbl" id="exam-tmr-lbl">${_phaseLabel}</div>
    </div>`);

  EXAM.sections.forEach(sec => {
    parts.push(`
      <div class="card">
        <div class="card-hd"><h3>${esc(sec.name)}</h3><span class="ctag tg">${sec.targetMarks} marks</span></div>
        ${sec.questions.length
          ? sec.questions.map((q,i) => `
              <div class="subj-q-row">
                <span class="qn">${i+1}.</span>
                <span class="qt">${esc(q.q)}</span>
                <span class="qm ${q.marks===10?'m10':'m5'}">${q.marks}M</span>
              </div>`).join('')
          : '<p style="font-size:.72rem;color:var(--t3);padding:.4rem .3rem">No questions available for this group yet.</p>'}
      </div>`);
  });

  if(_expired){
    parts.push(`
      <div class="card">
        <div class="card-hd"><h3><i class="ph ph-clock-countdown"></i> Time is up</h3></div>
        <div class="banner banner-danger" style="margin:0 0 var(--sp-3)">
          <i class="ph ph-clock-countdown"></i>
          <span>The 3-hour writing window and the ${Math.round(TIMERS.examUploadSeconds/60)}-minute upload window for this paper have both closed. Start a fresh paper to try again.</span>
        </div>
        <button class="btn btn-r btn-blk" data-on-click="SUBJ._examReset()">
          <i class="ph ph-arrow-counter-clockwise"></i> Start a Fresh Paper
        </button>
      </div>`);
  } else {
    parts.push(`
      <div class="card">
        <div class="card-hd"><h3><i class="ph ph-file-arrow-up"></i> Upload Answer PDF</h3></div>
        ${_uploading ? '<div class="banner banner-warning" style="margin-bottom:var(--sp-3)"><i class="ph ph-hourglass"></i><span><b>Writing time is over.</b> Upload your paper \u2014 the window closes in ' + formatTime(uploadLeftSec, true) + '.</span></div>' : ''}
        <label class="qotd-drop" for="exam-pdf">
          <input type="file" id="exam-pdf" accept="application/pdf,.pdf,image/*" multiple data-on-change="SUBJ._examFile(this)">
          <span class="ii"><i class="ph ph-file-pdf"></i></span>
          <span class="dn">Choose photos or a PDF of your paper</span>
          <span class="ds">Select all page photos at once (or one PDF), under 8 MB</span>
        </label>
        <div id="exam-file-slot"></div>
        <button class="btn btn-solid btn-lg btn-blk" id="exam-submit" style="margin-top:.7rem" ${_pendingExamFile ? '' : 'disabled'} data-on-click="SUBJ._examSubmit()">
          <i class="ph ph-paper-plane-tilt"></i> Submit Paper for Grading
        </button>
        <button class="btn btn-r btn-blk" style="margin-top:.5rem" data-on-click="SUBJ._examReset()">
          <i class="ph ph-arrow-counter-clockwise"></i> Discard &amp; Start Over
        </button>
      </div>`);
  }

  body.innerHTML = parts.join('');
  if(_pendingExamFile){
    const slot = document.getElementById('exam-file-slot');
    if(slot) slot.innerHTML = `<div class="qotd-file-chip">
      <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
      <span class="fn">${esc(_pendingExamFile.filename)}</span>
      <span style="font-size:.66rem;color:var(--t3)">${Math.round(_pendingExamFile.size/1024)} KB</span>
      <button type="button" aria-label="Remove file" data-on-click="SUBJ._examClearFile()"><i class="ph ph-x"></i></button>
    </div>`;
  }
  _startExamTick();
}

/* v1.32: phase-aware countdown. The timer first counts the 3-hour write
   window, then the 20-minute upload window, then stops. Phase changes
   trigger a single re-render each, so the card header and labels swap
   correctly without a full-page refresh. */
function _startExamTick(){
  _stopExamTick();
  _examTick = setInterval(() => {
    if(!EXAM || EXAM.submitted){ _stopExamTick(); return; }
    const el  = document.getElementById('exam-tmr');
    const lbl = document.getElementById('exam-tmr-lbl');
    if(!el){ _stopExamTick(); return; }

    const now = Date.now();
    const writing   = now < EXAM.deadlineAt;
    const uploading = !writing && now < EXAM.uploadEndsAt;
    const expired   = !writing && !uploading;

    if(writing){
      const left = Math.max(0, Math.round((EXAM.deadlineAt - now) / 1000));
      el.textContent = formatTime(left, true);
      el.classList.remove('upload');
      el.classList.toggle('urgent', left < 300);
      if(lbl) lbl.textContent = 'Total exam time left';
      if(left <= 0 && !EXAM._enteredUpload){
        EXAM._enteredUpload = true;
        _persistExam();
        toast('⏰ Writing time is up — upload your PDF now. You have ' + Math.round(TIMERS.examUploadSeconds/60) + ' minutes.', 8000);
        _renderExam();
      }
    } else if(uploading){
      const left = Math.max(0, Math.round((EXAM.uploadEndsAt - now) / 1000));
      el.textContent = formatTime(left, true);
      el.classList.add('upload');
      el.classList.toggle('urgent', left < 120);
      if(lbl) lbl.textContent = 'Upload window closes in';
      if(!EXAM._enteredUpload){
        EXAM._enteredUpload = true;
        _persistExam();
        _renderExam();
      }
    } else if(expired){
      el.textContent = '00:00:00';
      el.classList.remove('urgent', 'upload');
      if(lbl) lbl.textContent = 'Time is up';
      if(!EXAM._enteredExpired){
        EXAM._enteredExpired = true;
        _persistExam();
        toast('⏰ Upload window closed. This paper cannot be submitted.', 8000);
        _stopExamTick();
        _renderExam();
      }
    }
  }, 1000);
}
function _stopExamTick(){
  if(_examTick){ clearInterval(_examTick); _examTick = null; }
}

function _examGenerate(){
  EXAM = _generateExam();
  _pendingExamFile = null;
  _persistExam();
  _renderExam();
}

async function _examReset(){
  const body = (EXAM && !EXAM.submitted)
    ? 'Any answers you have written on paper will not be submitted.'
    : 'This clears the submitted paper. You can generate a new one afterwards.';
  const ok = await ASK.confirm({
    title: 'Discard this paper?',
    body:  body,
    ok:    'Discard',
    danger: true
  });
  if(!ok) return;
  _clearExam();
  _pendingExamFile = null;
  _stopExamTick();
  _renderExam();
}

async function _examFile(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;
  if(files.some(f => /^image\//i.test(f.type || ''))) toast('Preparing your PDF…', 2500);
  try{
    const picked = await _prepareUpload(files);
    _pendingExamFile = picked;
    const slot = document.getElementById('exam-file-slot');
    if(slot) slot.innerHTML = `<div class="qotd-file-chip">
      <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
      <span class="fn">${esc(picked.filename)}</span>
      <span style="font-size:.66rem;color:var(--t3)">${Math.round(picked.size/1024)} KB</span>
      <button type="button" aria-label="Remove file" data-on-click="SUBJ._examClearFile()"><i class="ph ph-x"></i></button>
    </div>`;
    const btn = document.getElementById('exam-submit'); if(btn) btn.disabled = false;
  }catch(e){
    toast('❌ ' + (e.message || 'Could not read that file'));
    input.value = '';
  }
}
function _examFileLegacy(input){
  const f = input.files && input.files[0];
  if(!f) return;
  if(f.size > MAX_PDF_BYTES){
    toast('❌ PDF too large — max ' + Math.round(MAX_PDF_BYTES/1024/1024) + ' MB');
    input.value = '';
    return;
  }
  const looksPdf = /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name);
  if(!looksPdf){
    toast('❌ Only PDF files are accepted');
    input.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = e => {
    _pendingExamFile = { dataUrl: e.target.result, filename: f.name, size: f.size };
    const slot = document.getElementById('exam-file-slot');
    if(slot) slot.innerHTML = `<div class="qotd-file-chip">
      <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
      <span class="fn">${esc(f.name)}</span>
      <span style="font-size:.66rem;color:var(--t3)">${Math.round(f.size/1024)} KB</span>
      <button type="button" aria-label="Remove file" data-on-click="SUBJ._examClearFile()"><i class="ph ph-x"></i></button>
    </div>`;
    const btn = document.getElementById('exam-submit'); if(btn) btn.disabled = false;
  };
  r.onerror = () => toast('❌ Could not read that file');
  r.readAsDataURL(f);
}
function _examClearFile(){
  _pendingExamFile = null;
  const input = document.getElementById('exam-pdf'); if(input) input.value = '';
  const slot = document.getElementById('exam-file-slot'); if(slot) slot.innerHTML = '';
  const btn = document.getElementById('exam-submit'); if(btn) btn.disabled = true;
}

async function _examSubmit(){
  if(!EXAM || !_pendingExamFile){ toast('Attach the PDF first'); return; }
  /* v1.32: the exam now has two windows — 3 hours to write, then 20 minutes
     to upload. Submitting past the upload window is refused. */
  if(EXAM.uploadEndsAt && Date.now() > EXAM.uploadEndsAt){
    toast('❌ The upload window for this paper has closed. Start a fresh paper from the Full paper tab.', 7000);
    return;
  }
  const btn = document.getElementById('exam-submit');
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Uploading…'; }

  /* v1.29: offline → queue instead of failing. */
  const _offline = (typeof navigator !== 'undefined' && !navigator.onLine)
    || (typeof S !== 'undefined' && S && (S.forcedOffline || !S.online));
  if(_offline){
    if(_pendingExamFile.dataUrl.length * 0.75 > SUBJ_QUEUE.MAX_BYTES){
      if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Paper for Grading'; }
      toast('❌ That paper is too large to queue offline. Reconnect and try again.', 6000);
      return;
    }
    const paperTextQ = EXAM.sections.map(s =>
      `[${s.name}]\n` + s.questions.map((q,i) => `${i+1}. ${q.q} [${q.marks}]`).join('\n')
    ).join('\n\n').slice(0, 3000);
    SUBJ_QUEUE.add({
      username: (typeof S !== 'undefined' && S && S.user ? S.user.username : ''),
      kind: 'exam',
      questionId: 'exam_' + EXAM.generatedAt,
      questionText: paperTextQ,
      chapterId: 'exam',
      marks: 100,
      solveSec: TIMERS.examSeconds,
      startedAt: EXAM.generatedAt,
      pdfData: _pendingExamFile.dataUrl,
      filename: _pendingExamFile.filename
    });
    EXAM.submitted = true;
    EXAM.submittedAt = Date.now();
    EXAM.queued = true;
    _persistExam();
    _pendingExamFile = null;
    _stopExamTick();
    toast('💾 Saved on this device — it will send automatically when you are back online.', 6000);
    _renderExam();
    SUBJ_QUEUE.scheduleProcess();
    return;
  }

  const paperText = EXAM.sections.map(s =>
    `[${s.name}]\n` + s.questions.map((q,i) => `${i+1}. ${q.q} [${q.marks}]`).join('\n')
  ).join('\n\n').slice(0, 3000);

  const res = await _api('submitSubjectiveAnswer', {
    kind: 'exam',
    questionId: 'exam_' + EXAM.generatedAt,
    questionText: paperText,
    chapterId: 'exam',
    marks: 100,
    solveSec: TIMERS.examSeconds,
    startedAt: EXAM.generatedAt,
    pdfData: _pendingExamFile.dataUrl,
    filename: _pendingExamFile.filename
  }, 'POST');

  if(!res || !res.success){
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Paper for Grading'; }
    toast('❌ ' + ((res && res.error) || 'Submit failed'));
    return;
  }

  EXAM.submitted = true;
  EXAM.submittedAt = Date.now();
  _persistExam();
  _pendingExamFile = null;
  _stopExamTick();
  toast('✅ Paper submitted for grading');
  _renderExam();
}
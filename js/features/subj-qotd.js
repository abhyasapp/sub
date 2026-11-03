// js/features/subj-qotd.js — daily written question: pick, phase machine,
// render, upload, tick.
// MUST load AFTER: subj-bank.js (TIMERS, LS_QOTD, BANK, _allQuestions,
// _todayKey-related helpers), subj-pdf.js (_prepareUpload),
// core/subjective-api.js (_api), subj-queue.js (SUBJ_QUEUE),
// core/modal.js (ASK), core/toast.js (toast).

let QOTD = {
  date: '',
  questionId: '',
  marks: 0,
  startedAt: 0,
  solveEndsAt: 0,
  uploadEndsAt: 0,
  submitted: false,
  queued: false
};
let _qotdTick = null;
let _pendingQotdFile = null;
let _lastQotdPhase = null;
let _hintTick = 0;

function _todayKey() {
  return (typeof window.today === 'function') ? window.today() : new Date().toISOString().slice(0, 10);
}

function _restoreQotd() {
  try {
    const raw = localStorage.getItem(LS_QOTD);
    QOTD = raw ? JSON.parse(raw) : null;
    if (QOTD && QOTD.date !== _todayKey()) QOTD = null;
  } catch (e) { QOTD = null; }
  // Ensure default shape if null
  if (!QOTD) {
    QOTD = { date: '', questionId: '', marks: 0, startedAt: 0, solveEndsAt: 0, uploadEndsAt: 0, submitted: false, queued: false };
  }
}

function _persistQotd() {
  try { localStorage.setItem(LS_QOTD, JSON.stringify(QOTD)); } catch (e) {}
}
function _clearQotd() {
  QOTD = { date: '', questionId: '', marks: 0, startedAt: 0, solveEndsAt: 0, uploadEndsAt: 0, submitted: false, queued: false };
  try { localStorage.removeItem(LS_QOTD); } catch (e) {}
}

function _solveSecFor(marks) {
  if (marks === 5)  return TIMERS.solveSecondsFor5;
  if (marks === 10) return TIMERS.solveSecondsFor10;
  return TIMERS.solveSecondsFallback;
}

function _fmtMins(sec) {
  const m = Math.round(sec / 60);
  return m === 60 ? '1 hour' : `${m} minutes`;
}

function _todayPick() {
  const all = _allQuestions();
  if (!all.length) return null;
  const day = _todayKey();
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return all[h % all.length];
}

function _qotdPhase(){
  if(!QOTD || !QOTD.date) return 'idle';
  if(QOTD.submitted) return 'submitted';
  const now = Date.now();
  if(now < QOTD.solveEndsAt) return 'solving';
  if(QOTD.uploadEndsAt && now < QOTD.uploadEndsAt) return 'upload';
  return 'expired';
}

function _qotdPublicState(){
  if(!QOTD || !QOTD.date) return { phase: 'idle' };
  const phase = _qotdPhase();
  if(phase === 'submitted') return { phase, marks: QOTD.marks };
  if(phase === 'solving'){
    const leftSec = Math.max(0, Math.round((QOTD.solveEndsAt - Date.now()) / 1000));
    return { phase, leftSec, left: formatTime(leftSec), marks: QOTD.marks };
  }
  if(phase === 'upload'){
    const leftSec = Math.max(0, Math.round((QOTD.uploadEndsAt - Date.now()) / 1000));
    return { phase, leftSec, left: formatTime(leftSec), marks: QOTD.marks };
  }
  return { phase: 'expired', marks: QOTD.marks };
}

function _renderQotd(){
  const body = document.getElementById('subj-qotd-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching today\'s question.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-sun-horizon','No question today',
      BANK.error || 'No written questions have been added yet. Check back soon.',
      BANK.error ? _retryBtn : '');
    return;
  }

  if(QOTD.date && !QOTD.submitted && !QOTD.uploadEndsAt && Date.now() >= QOTD.solveEndsAt){
    QOTD.uploadEndsAt = QOTD.solveEndsAt + TIMERS.uploadSeconds * 1000;
    _persistQotd();
  }

  const phase = _qotdPhase();
  const q = (QOTD.date && QOTD.questionId)
    ? (_allQuestions().find(x => x.id === QOTD.questionId) || _todayPick())
    : _todayPick();

  if(!q){ body.innerHTML = _emptyCard('ph-sun-horizon','Nothing today','Check back tomorrow.'); return; }

  if(phase === 'idle'){
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Today's Question</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--t1);margin-top:.15rem">${esc(_chapterNameOf(q.chapterId))}</div>
            <div style="font-size:.66rem;color:var(--t3);margin-top:.1rem">${esc(q.topic || '')}</div>
          </div>
          <div class="qotd-marks ${q.marks===10?'m10':''}">${q.marks} marks</div>
        </div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.55;margin-bottom:.85rem">
          You get <b>${_fmtMins(_solveSecFor(q.marks))}</b> to write, then <b>${TIMERS.uploadSeconds/60} minutes</b>
          to photograph/scan and upload a PDF. Admin grades it after that. One attempt.
        </p>
        <button class="btn btn-solid btn-lg btn-blk" data-on-click="SUBJ._qotdBegin()">
          <i class="ph ph-play"></i> Start ${q.marks}-Mark Question
        </button>
      </div>`;
    return;
  }

  if(phase === 'submitted'){
    if(QOTD.queued){
      body.innerHTML = `
        <div class="card qotd-done">
          <span class="big"><i class="ph ph-cloud-slash" style="color:var(--amb)"></i></span>
          <h3 style="color:var(--amb)">Queued on this device</h3>
          <p>Your answer is saved locally and will be sent to admin the moment you are back online.</p>
          <div class="bg mt3" style="justify-content:center">
            <button class="btn btn-sm btn-a" data-on-click="SUBJ_QUEUE.process()"><i class="ph ph-paper-plane-tilt"></i> Try sending now</button>
          </div>
        </div>`;
      _stopQotdTick();
      return;
    }
    body.innerHTML = `
      <div class="card qotd-done">
        <span class="big"><i class="ph ph-check-circle" style="color:var(--grn)"></i></span>
        <h3>Submitted for review</h3>
        <p>Your answer was sent to admin at ${new Date(QOTD.submittedAt).toLocaleTimeString()}.</p>
        <p style="margin-top:.5rem">Come back tomorrow for a fresh question.</p>
      </div>`;
    _stopQotdTick();
    return;
  }

  if(phase === 'solving'){
    const left = Math.max(0, Math.round((QOTD.solveEndsAt - Date.now()) / 1000));
    const total = _solveSecFor(QOTD.marks);
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Now Solving</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--t1);margin-top:.15rem">${esc(_chapterNameOf(q.chapterId))}</div>
            <div style="font-size:.66rem;color:var(--t3);margin-top:.1rem">${esc(q.topic || '')}</div>
          </div>
          <div class="qotd-marks ${q.marks===10?'m10':''}">${q.marks} marks</div>
        </div>
        <div class="qotd-q">${esc(q.q)}</div>
        ${q.hint ? `<div style="font-size:.72rem;color:var(--t3);font-style:italic;margin-top:-.4rem;margin-bottom:.85rem">${esc(q.hint)}</div>` : ''}
        <div class="qotd-timer ${left < 120 ? 'urgent' : ''}" id="qotd-tmr">${formatTime(left)}</div>
        <div class="qotd-timer-lbl">Time left to write</div>
        <div class="qotd-phase-bar"><div class="qotd-phase-fill" id="qotd-bar" style="width:${(left/total)*100}%"></div></div>
        <p style="font-size:.72rem;color:var(--t3);text-align:center;line-height:1.55">
          Write on paper. A <b>${TIMERS.uploadSeconds/60}-minute upload window</b> opens automatically when the timer hits zero.
        </p>
      </div>`;
    _startQotdTick();
    return;
  }

  if(phase === 'upload'){
    const left = Math.max(0, Math.round((QOTD.uploadEndsAt - Date.now()) / 1000));
    const total = TIMERS.uploadSeconds;
    body.innerHTML = `
      <div class="card">
        <div class="qotd-head">
          <div>
            <div class="qotd-meta">Upload Window</div>
            <div style="font-size:.9rem;font-weight:700;color:var(--sky);margin-top:.15rem">Send your answer now</div>
          </div>
          <div class="qotd-marks ${q.marks===10?'m10':''}">${q.marks} marks</div>
        </div>
        <div class="qotd-timer upload ${left < 60 ? 'urgent' : ''}" id="qotd-tmr">${formatTime(left)}</div>
        <div class="qotd-timer-lbl">Upload closes in</div>
        <div class="qotd-phase-bar"><div class="qotd-phase-fill upload" id="qotd-bar" style="width:${(left/total)*100}%"></div></div>
        <label class="qotd-drop" for="qotd-pdf">
          <input type="file" id="qotd-pdf" accept="application/pdf,.pdf,image/*" multiple data-on-change="SUBJ._qotdFile(this)">
          <span class="ii"><i class="ph ph-file-pdf"></i></span>
          <span class="dn">Choose photos or a PDF of your answer</span>
          <span class="ds">Select all your page photos at once. We turn them into one PDF for you.</span>
        </label>
        <div id="qotd-file-slot"></div>
        <button class="btn btn-solid btn-lg btn-blk" id="qotd-submit" style="margin-top:.7rem" disabled data-on-click="SUBJ._qotdSubmit()">
          <i class="ph ph-paper-plane-tilt"></i> Submit for Review
        </button>
      </div>`;
    if(_pendingQotdFile){
      _renderQotdFileChip(_pendingQotdFile);
      const b = document.getElementById('qotd-submit'); if(b) b.disabled = false;
    }
    _startQotdTick();
    return;
  }

  body.innerHTML = `
    <div class="card qotd-done">
      <span class="big"><i class="ph ph-clock-countdown" style="color:var(--ros)"></i></span>
      <h3 style="color:var(--ros)">Upload window closed</h3>
      <p>Nothing was submitted for today's question in time.</p>
    </div>`;
  _stopQotdTick();
}

function _renderQotdFileChip(fileInfo){
  const slot = document.getElementById('qotd-file-slot');
  if(!slot || !fileInfo) return;
  slot.innerHTML = `<div class="qotd-file-chip">
    <i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>
    <span class="fn">${esc(fileInfo.filename)}</span>
    <span style="font-size:.66rem;color:var(--t3)">${Math.round(fileInfo.size/1024)} KB</span>
    <button type="button" aria-label="Remove file" data-on-click="SUBJ._qotdClearFile()"><i class="ph ph-x"></i></button>
  </div>`;
}

function _paintQotdTimer(){
  if(!QOTD || !QOTD.date) return;
  const el = document.getElementById('qotd-tmr');
  if(!el) return;
  const phase = _qotdPhase();
  let left, total;
  if(phase === 'solving'){
    left = Math.max(0, Math.round((QOTD.solveEndsAt - Date.now()) / 1000));
    total = _solveSecFor(QOTD.marks);
    el.classList.toggle('urgent', left < 120);
  } else if(phase === 'upload'){
    left = Math.max(0, Math.round((QOTD.uploadEndsAt - Date.now()) / 1000));
    total = TIMERS.uploadSeconds;
    el.classList.toggle('urgent', left < 60);
  } else return;
  el.textContent = formatTime(left);
  const bar = document.getElementById('qotd-bar');
  if(bar) bar.style.width = ((left / total) * 100) + '%';
}

function _startQotdTick(){
  _stopQotdTick();
  _lastQotdPhase = _qotdPhase();
  _qotdTick = setInterval(() => {
    if (document.hidden) return;            // nothing to repaint in a background tab; the next visible tick catches up
    const phase = _qotdPhase();
    if(phase !== _lastQotdPhase){ _lastQotdPhase = phase; _renderQotd(); }
    else _paintQotdTimer();
    if(++_hintTick % 10 === 0 && typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
  }, 1000);
}
function _stopQotdTick(){
  if(_qotdTick){ clearInterval(_qotdTick); _qotdTick = null; }
}

function _qotdBegin(){
  const q = _todayPick();
  if(!q){ toast('No question available'); return; }
  const now = Date.now();
  const solveSec = _solveSecFor(q.marks);
  QOTD = {
    date: _todayKey(),
    questionId: q.id,
    marks: q.marks,
    startedAt: now,
    solveEndsAt: now + solveSec * 1000,
    uploadEndsAt: 0,
    submitted: false,
    queued: false
  };
  _persistQotd();
  _renderQotd();
  if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
}

async function _qotdFile(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;
  if(files.some(f => /^image\//i.test(f.type || ''))) toast('Preparing your PDF…', 2500);
  try{
    const picked = await _prepareUpload(files);
    _pendingQotdFile = picked;
    _renderQotdFileChip(picked);
    const btn = document.getElementById('qotd-submit'); if(btn) btn.disabled = false;
  }catch(e){
    toast('❌ ' + (e.message || 'Could not read that file'));
    input.value = '';
  }
}
function _qotdClearFile(){
  _pendingQotdFile = null;
  const input = document.getElementById('qotd-pdf'); if(input) input.value = '';
  const slot = document.getElementById('qotd-file-slot'); if(slot) slot.innerHTML = '';
  const btn = document.getElementById('qotd-submit'); if(btn) btn.disabled = true;
}

let _qotdSubmitting = false;
async function _qotdSubmit(){
  if(_qotdSubmitting) return;
  _qotdSubmitting = true;
  try { return await _qotdSubmitInner(); } finally { _qotdSubmitting = false; }
}
async function _qotdSubmitInner(){
  if(!QOTD || !QOTD.date || !_pendingQotdFile){ toast('Attach a PDF first'); return; }
  const q = _allQuestions().find(x => x.id === QOTD.questionId);
  if(!q){ toast('❌ Question no longer available'); return; }
  const btn = document.getElementById('qotd-submit');
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Uploading…'; }

  const _offline = (typeof navigator !== 'undefined' && !navigator.onLine)
    || (typeof S !== 'undefined' && S && (S.forcedOffline || !S.online));
  if(_offline){
    if(_pendingQotdFile.dataUrl.length * 0.75 > SUBJ_QUEUE.MAX_BYTES){
      if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for Review'; }
      toast('❌ That answer is too large to queue offline. Reconnect and try again.', 6000);
      return;
    }
    SUBJ_QUEUE.add({
      username: (typeof S !== 'undefined' && S && S.user ? S.user.username : ''),
      kind: 'qotd',
      questionId: QOTD.questionId,
      questionText: String(q.q || '').slice(0, 2000),
      chapterId: q.chapterId,
      marks: QOTD.marks,
      solveSec: _solveSecFor(QOTD.marks),
      startedAt: QOTD.startedAt,
      pdfData: _pendingQotdFile.dataUrl,
      filename: _pendingQotdFile.filename
    });
    QOTD.submitted = true;
    QOTD.submittedAt = Date.now();
    QOTD.queued = true;
    _persistQotd();
    _pendingQotdFile = null;
    _stopQotdTick();
    toast('💾 Saved on this device — it will send automatically when you are back online.', 6000);
    _renderQotd();
    if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
    SUBJ_QUEUE.scheduleProcess();
    return;
  }

  const res = await _api('submitSubjectiveAnswer', {
    kind: 'qotd',
    questionId: QOTD.questionId,
    questionText: q.q.slice(0, 2000),
    chapterId: q.chapterId,
    marks: QOTD.marks,
    solveSec: _solveSecFor(QOTD.marks),
    startedAt: QOTD.startedAt,
    pdfData: _pendingQotdFile.dataUrl,
    filename: _pendingQotdFile.filename
  }, 'POST');

  if(!res || !res.success){
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for Review'; }
    toast('❌ ' + ((res && res.error) || 'Submit failed'));
    return;
  }

  QOTD.submitted = true;
  QOTD.submittedAt = Date.now();
  _persistQotd();
  _pendingQotdFile = null;
  _stopQotdTick();
  toast('✅ Submitted — admin will grade it');
  _renderQotd();
  if(typeof window.SB_HINTS !== 'undefined') window.SB_HINTS.refresh();
}
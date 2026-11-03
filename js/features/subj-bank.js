// js/features/subj-bank.js — the written-answer question bank, plus every
// constant other files depend on.
// MUST load AFTER: core/config.js (abhyasEndpointFor), core/constants.js,
// core/state.js, core/storage.js (QDB, _load, _save),
// core/net.js (GETFILE_GATE, _authParams).
// Uses baseUrl (built from ABHYAS_CONFIG) / _authParams / abhyasEndpointFor at call time.

/* ── Constants ── */
const TIMERS = {
  solveSecondsFor5:  10 * 60,
  solveSecondsFor10: 20 * 60,
  solveSecondsFallback: 15 * 60,
  uploadSeconds: 10 * 60,
  examSeconds:  3 * 60 * 60,
  examUploadSeconds: 20 * 60
};

const LS_QOTD = 'abhyas_subj_qotd_v1';
const LS_EXAM = 'abhyas_subj_exam_v1';
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;
const SUBJ_FILE_REFS = window.SUBJECTIVE_FILE_REFS || [];

const CUSTOM_EXAM_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function _customExamKey() {
  const u = (typeof S !== 'undefined' && S && S.user && S.user.username) || 'anon';
  return 'abhyas_subj_custom_last_' + String(u).toLowerCase();
}
function _getCustomExamLast() {
  try {
    const raw = localStorage.getItem(_customExamKey());
    const n = Number(raw);
    return isFinite(n) && n > 0 ? n : 0;
  } catch (e) { return 0; }
}
function _setCustomExamLast(ts) {
  try { localStorage.setItem(_customExamKey(), String(ts)); } catch (e) {}
}
function _customExamCooldownRemainingMs() {
  const last = _getCustomExamLast();
  if (!last) return 0;
  const remaining = CUSTOM_EXAM_COOLDOWN_MS - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}
function _customExamIsLocked() { return _customExamCooldownRemainingMs() > 0; }
function _fmtCooldown(ms) {
  if (ms <= 0) return 'now';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function _shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

let BANK = { byChapter: {}, loaded: false, loading: false, error: null };
const _fetchPromises = {};

function _parseMarks(raw) {
  if (typeof raw === 'number' && isFinite(raw)) return (raw === 5 || raw === 10) ? raw : 10;
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 10;
  const eq = s.lastIndexOf('=');
  if (eq > -1) {
    const m = s.slice(eq + 1).match(/\d+(?:\.\d+)?/);
    if (m) {
      const n = Math.round(parseFloat(m[0]));
      return (n === 5 || n === 10) ? n : 10;
    }
  }
  if (s.includes('+')) {
    const parts = s.split('+').map(x => parseFloat(x)).filter(x => isFinite(x));
    if (parts.length) {
      const sum = Math.round(parts.reduce((a, b) => a + b, 0));
      return (sum === 5 || sum === 10) ? sum : 10;
    }
  }
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return 10;
  const n = Math.round(parseFloat(m[0]));
  return (n === 5 || n === 10) ? n : 10;
}

function _normalizeSubjRaw(raw, fileId, chapterId, chapterName){
  // ── Supabase getfile response shape: { success, content: "<JSON string>" }
  //    Unwrap it in case old cache still holds this shape.
  if(raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.content === 'string'){
    try {
      raw = JSON.parse(raw.content);
    } catch (e) {
      console.warn('[SUBJ] Cached content is a string but not valid JSON for', fileId);
      return [];
    }
  }

  if(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.success === false){
    console.warn('[SUBJ] Server error for', fileId, '—', raw.error);
    return [];
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.sections)) {
    const out = [];
    raw.sections.forEach(sec => {
      const secTopic = String(sec.section || chapterName || 'General').trim();
      const qs = Array.isArray(sec.questions) ? sec.questions : [];
      qs.forEach((q, i) => {
        if (!q || typeof q !== 'object') return;
        const text = String(q.q || q.question || '').trim();
        if (!text) return;
        out.push({
          id: q.id || `${fileId}_${secTopic}_${i}`,
          chapterId,
          topic: secTopic,
          q: text,
          marks: _parseMarks(q.marks),
          hint: String(q.hint || '').trim(),
          modelAnswer: String(q.modelAnswer || '').trim()
        });
      });
    });
    return out;
  }

  let arr = Array.isArray(raw) ? raw
          : (raw && Array.isArray(raw.questions) ? raw.questions : null);
  if (!Array.isArray(arr) || !arr.length) {
    console.warn('[SUBJ] No questions found in', fileId);
    return [];
  }
  const out = [];
  arr.forEach((q, i) => {
    if (!q || typeof q !== 'object') return;
    const text = String(q.q || q.question || '').trim();
    if (!text) return;
    out.push({
      id: q.id || `${fileId}_${i}`,
      chapterId,
      topic: String(q.chapter || chapterName || 'General').trim(),
      q: text,
      marks: _parseMarks(q.marks),
      hint: String(q.hint || '').trim(),
      modelAnswer: String(q.modelAnswer || '').trim()
    });
  });
  return out;
}

async function _fetchSubjFileFromNetwork(ref, cacheKey){
  const a = _authParams();
  if(typeof GETFILE_GATE !== 'undefined') await GETFILE_GATE.take();

  const isSupa = (typeof abhyasEndpointFor === 'function')
    ? abhyasEndpointFor('getfile', { fileId: ref.fileId }) === 'supabase'
    : false;
  const actionName = isSupa ? 'getfile' : 'getFile';
  const timeout = isSupa ? 15000 : 25000;
  const baseUrl = isSupa ? ABHYAS_CONFIG.SUPABASE_URL : ABHYAS_CONFIG.GAS_URL;

  let r;
  try {
    if (isSupa) {
      // Supabase edge fn expects POST body (avoids putting tokens in the URL)
      r = await netFetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: actionName,
          fileId: ref.fileId,
          username: a.username,
          token: a.token
        })
      }, timeout);
    } else {
      // GAS expects GET with URL params
      const query = new URLSearchParams({
        action: actionName,
        fileId: ref.fileId,
        username: a.username,
        token: a.token
      }).toString();
      r = await netFetch(baseUrl + '?' + query, {}, timeout);
    }
  } catch (e) {
    if (!BANK.lastError) BANK.lastError = e && e.message;
    console.warn('[subj-bank] fetch failed/aborted — using cache', e && e.message);
    return [];
  }

  if (!r || !r.ok) {
    console.warn('[subj-bank] no fresh data (status=' + (r ? r.status : 'none') + ', backend=' + (isSupa ? 'supabase' : 'gas') + ')');
    return [];
  }

  const data = await r.json();
  if(data && data.rateLimited){
    if(typeof GETFILE_GATE !== 'undefined') GETFILE_GATE.backoff(12000);
    throw new Error('The server asked us to slow down. Try again in a moment.');
  }
  if(data && data.sessionInvalid) throw new Error('Your session expired — sign in again.');
  if(data && data.needsPayment) throw new Error('Your access has ended. Complete the payment to open the written bank.');
  if(data && data.success === false) throw new Error(data.error || 'Server error');
  let payload = (data && data.result !== undefined) ? data.result : data;

  // ── Supabase getfile returns { success: true, content: "<JSON text>" }.
  //    Unwrap the content string so downstream code sees questions/sections.
  if(payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.content === 'string'){
    try {
      payload = JSON.parse(payload.content);
    } catch (e) {
      console.warn('[subj-bank] content is a string but not valid JSON for', ref.fileId);
      return [];
    }
  }

  if(typeof QDB !== 'undefined') QDB.set(cacheKey, payload).catch(() => {});
  return _normalizeSubjRaw(payload, ref.fileId, ref.chapterId, ref.name);
}

async function _fetchSubjFile(ref){
  if(_fetchPromises[ref.fileId]) return _fetchPromises[ref.fileId];
  const cacheKey = 'subj_' + ref.fileId;
  const promise = (async () => {
    if(typeof QDB !== 'undefined'){
      try{
        const cached = await QDB.get(cacheKey);
        const isValid = cached && !(typeof cached === 'object' && !Array.isArray(cached) && cached.success === false);
        if(isValid){
          if(typeof S !== 'undefined' && S.online && !S.forcedOffline){
            _fetchSubjFileFromNetwork(ref, cacheKey).catch(() => {});
          }
          return _normalizeSubjRaw(cached, ref.fileId, ref.chapterId, ref.name);
        }
      }catch(e){ /* fall through */ }
    }
    const off = (typeof S !== 'undefined' && (!S.online || S.forcedOffline));
    if(off) return [];
    try{
      return await _fetchSubjFileFromNetwork(ref, cacheKey);
    }catch(e){
      console.warn('[SUBJ] fetch failed for', ref.fileId, e.message);
      BANK.lastError = e.message || 'Could not reach the server.';
      return [];
    }
  })();
  _fetchPromises[ref.fileId] = promise.finally(() => { delete _fetchPromises[ref.fileId]; });
  return _fetchPromises[ref.fileId];
}

async function loadBank(force){
  if(BANK.loaded && !force) return BANK;
  if(BANK.loading) return BANK;
  BANK.loading = true;

  const refs = SUBJ_FILE_REFS.filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));

  if(!refs.length){
    BANK = { byChapter: {}, loaded: true, loading: false, error: 'No chapter files configured in subjective-data.js' };
    return BANK;
  }

  const byChapter = {};
  BANK.lastError = null;
  let i = 0;
  async function worker(){
    while(i < refs.length){
      const ref = refs[i++];
      const qs = await _fetchSubjFile(ref);
      if(qs.length){
        (byChapter[ref.chapterId] = byChapter[ref.chapterId] || []).push(...qs);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, refs.length) }, worker));

  Object.keys(byChapter).forEach(ch => {
    byChapter[ch].sort((a, b) => String(a.topic).localeCompare(String(b.topic)));
  });

  /* An empty bank is nearly always a failed fetch, not an empty syllabus —
     say which, so the student knows whether to reconnect or wait for the
     admin to upload something. */
  const offline = (typeof S !== 'undefined' && (!S.online || S.forcedOffline));
  const empty = !Object.keys(byChapter).length;
  BANK = {
    byChapter, loaded: true, loading: false,
    lastError: BANK.lastError || null,
    error: !empty ? null
         : offline ? 'You are offline. Connect once and the written questions will be saved to this device.'
         : (BANK.lastError || 'The question bank could not be loaded. Check your connection and try again.')
  };
  return BANK;
}

function _allQuestions() {
  return Object.values(BANK.byChapter).flat();
}

function _questionsByChapter(chId) {
  return BANK.byChapter[chId] || [];
}
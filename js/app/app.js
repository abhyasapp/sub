/* ═══════════════════════════════════════════════════════════════════════
   APP.JS — Abhyas: Your path to mastery  (V1 – Cloud Sync)
   CORE — state, storage, sync, auth, PWA, weekly sets, home dashboard,
          timetable, offline cache, progress tracking, data management,
          tutorial, and app boot.
   Companion modules loaded AFTER this file:
     • objective.js  — MCQ quiz engine (QUIZ), online study (ON),
                       local file (LOC), psycho mode (PSY), review
                       lists (REV), count/progress helpers (CNT,
                       ONPROG), scope utilities.
     • subjective.js — daily question, subjective exam, topic list.
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════ 1. CONFIG & CONSTANTS ═══════════════ */
const APP_CONFIG = { APPS_URL: ABHYAS_CONFIG.GAS_URL };
const APPS = APP_CONFIG.APPS_URL;

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const BK_TAGS = ['Need Check','Interesting','Debating','Confusing','Formulae'];
const SR_INTERVALS = [1, 3, 7, 14];   // days for spaced repetition

const WEEKLY_EXAM_WINDOW_HOURS = 12;

const LS = {
  USER:'abhyas_session',
  PROG:'abhyas_prog', BK:'abhyas_bk', FL:'abhyas_fl', WR:'abhyas_wr',
  QC:'abhyas_qc_', TT:'abhyas_tt', TT_NOTIFIED:'abhyas_tt_notified', STK:'abhyas_stk',
  FORCED_OFFLINE:'abhyas_forced_off',
  EXAM_SNAP:'abhyas_exam_snap',
  FCOUNT:'abhyas_fcount',
  CLOUD:'abhyas_cloud',
  PROFILE:'abhyas_profile',
  CHAPSTATS:'abhyas_chapstats',
  LAST_USER:'abhyas_last_user',
  WK_ATTEMPTS:'abhyas_weekly_attempts',
  COV:'abhyas_cov'
};

const APP_NAME = 'Abhyas V1';

/* ═══════════════ 2. APP STATE ═══════════════ */
const S = {
  user: null,
  online: navigator.onLine,
  forcedOffline: _load(LS.FORCED_OFFLINE, false),
  bk: _load(LS.BK, []),
  fl: _load(LS.FL, []),
  wr: _load(LS.WR, []),
  prog: _load(LS.PROG, {total:0,correct:0,sessions:[]}),
  tt: _load(LS.TT, {sessions:[], reminders:{enabled:false, leadMinutes:5}}),
  stk: _load(LS.STK, {days:[],last:''}),
  fcount: _load(LS.FCOUNT, {}),
  chapStats: _load(LS.CHAPSTATS, {}),
  weeklyAttempts: _load(LS.WK_ATTEMPTS, {}),
  cov: _load(LS.COV, {}),
  dpi: null,
  localQs: null,
  quiz: {qs:[],ans:[],mode:'',idx:0,timer:null,elapsed:0,left:0,active:false,ch:'',scope:null},
  cloud: _load(LS.CLOUD, {fid:''}),
  profile: _load(LS.PROFILE, {ver:1, id:''})
};
if(!S.tt.reminders) S.tt.reminders = {enabled:false, leadMinutes:5};
if(!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
if(!S.stk.days) S.stk.days = [];
if(!S.weeklyAttempts || typeof S.weeklyAttempts !== 'object') S.weeklyAttempts = {};

(function () {
  let debug = false;
  try {
    debug = localStorage.getItem('abhyas_debug') === '1'
         || (typeof window.ABHYAS_DEBUG === 'boolean' && window.ABHYAS_DEBUG === true);
  } catch (e) {}
  window.ABHYAS_DEBUG = debug;
  if (debug) return;
  const _warn = console.warn.bind(console);
  const _info = console.info.bind(console);
  const QUIET_WARN = /^\[(normQ|SUBJ|HOURLY|adaptive|daily|retake|chapters-loader|cross-tab|AUTH|PAY_QUEUE|reset-snapshot|PDFVIEW|marking)\]/;
  const QUIET_INFO = /^\[(HOURLY|Session bridge|PDFVIEW|PAY_QUEUE)\]/;
  console.warn = function () {
    const first = String((arguments[0] == null ? '' : arguments[0]));
    if (QUIET_WARN.test(first)) return;
    _warn.apply(null, arguments);
  };
  console.info = function () {
    const first = String((arguments[0] == null ? '' : arguments[0]));
    if (QUIET_INFO.test(first)) return;
    _info.apply(null, arguments);
  };
})();

/* ═══════════════ 3. UTILITIES ═══════════════ */
function _load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const PSYNC_KEYS = new Set([LS.BK, LS.FL, LS.WR, LS.PROG, LS.STK, LS.CHAPSTATS, LS.COV]);
let _lastStorageWarnAt = 0;
function _save(k,v){
  try{
    localStorage.setItem(k,JSON.stringify(v));
    if(PSYNC_KEYS.has(k)) PSYNC.scheduleSync();
    return true;
  }catch(e){
    const now = Date.now();
    if(now - _lastStorageWarnAt > 30000){
      _lastStorageWarnAt = now;
      const isQuota = e && (e.name==='QuotaExceededError' || e.code===22 || e.code===1014);
      toast(isQuota
        ? '⚠️ Device storage is full — new progress/bookmarks may not be saved. Try removing some old bookmarks or flagged questions to free space.'
        : '⚠️ Could not save — some data may not have been saved.', 5000);
    }
    return false;
  }
}

const QDB = (() => {
  const DB_NAME = 'abhyas_question_cache';
  const STORE = 'sets';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function get(key) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  }
  async function set(key, value) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  }
  async function del(key) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function keys() {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return []; }
  }
  async function clear() {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function migrateFromLocalStorage() {
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(LS.QC));
    if (!oldKeys.length) return;
    for (const k of oldKeys) {
      try {
        const value = JSON.parse(localStorage.getItem(k));
        await set(k.slice(LS.QC.length), value);
      } catch (e) {}
      localStorage.removeItem(k);
    }
  }
  return { get, set, del, keys, clear, migrateFromLocalStorage };
})();

function renderMath(el){
  if(!el || typeof window.renderMathInElement !== 'function') return;
  try{
    window.renderMathInElement(el, {
      delimiters: [
        {left:'$$', right:'$$', display:true},
        {left:'$', right:'$', display:false}
      ],
      throwOnError:false
    });
  }catch(e){}
}
function shuf(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
function fmt(s){if(s<0)s=0;return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function fmtHMS(s){
  if(s<0)s=0;
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function today(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function localDateOffset(baseDate, daysOffset){
  const d=new Date(baseDate);
  d.setDate(d.getDate()+daysOffset);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isOk(sel,cor){
  if(sel===null||sel===undefined||cor===null||cor===undefined)return false;
  const s=String(sel).trim(),c=String(cor).trim();
  return(!isNaN(s)&&!isNaN(c)&&s!==''&&c!=='')?Number(s)===Number(c):s.toLowerCase()===c.toLowerCase();
}
function _resolveQImg(raw){
  const v = String(raw || '').trim();
  if(!v) return null;
  if(v.startsWith('data:image')) return v;
  if(/^https?:\/\//.test(v)){
    const m = v.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || v.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200` : v;
  }
  if(/^[a-zA-Z0-9_-]{10,}$/.test(v)) return `https://drive.google.com/thumbnail?id=${v}&sz=w1200`;
  return null;
}
function qImgHtml(q){
  if(!q.img) return '';
  const alt = q.imgCaption || 'Question figure';
  return `<div style="margin:.4rem 0"><img src="${esc(q.img)}" alt="${esc(alt)}" style="max-width:100%;border-radius:8px;border:1px solid var(--b1);display:block" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`;
}

const GOOGLE_PROMPT_MAX = 1400;

const GOOGLE_PROMPT_HEAD =
  'You are a tutor for Nepal Lok Sewa Aayog Level 7 Civil Engineering. ' +
  'Analyse this exam question and reply with: ' +
  '(1) the correct option and exactly why, ' +
  '(2) why each wrong option is a trap, ' +
  '(3) the full concept it tests — definition, formula, principle, ' +
  '(4) related concepts a similar exam question could ask, ' +
  '(5) the common confusions to avoid on this topic, ' +
  '(6) a one-line memory trick. Keep it exam-focused. ';

function _buildRichQuery(q){
  if(!q) return '';
  const opts = (q.options || [])
    .map((o, i) => String.fromCharCode(65 + i) + ') ' + String(o))
    .join(' ');
  const stem = String(q.q || '').trim();
  const body = 'Question: ' + stem + '  Options: ' + opts + '.';
  const full = GOOGLE_PROMPT_HEAD + body;
  return full.slice(0, GOOGLE_PROMPT_MAX).trim();
}

function qSearchHtml(q){
  const query = encodeURIComponent(_buildRichQuery(q));
  return `<a class="ib" href="https://www.google.com/search?q=${query}" target="_blank" rel="noopener" `
       + `title="Ask Google AI to analyse this question" `
       + `aria-label="Ask Google AI to analyse this question">`
       + `<i class="ph ph-magnifying-glass"></i></a>`;
}
/* The "report a problem with this question" button. Shown wherever a question appears, except for questions
   from a bank the student made on their own device (there is nothing for the admin to correct). */
function qReportHtml(q, call, label){
  if(!q || !q.uid || q.fileId === 'local' || String(q.uid).indexOf('local_') === 0) return '';
  return `<button type="button" class="ib" onclick="${call}" title="Report an issue with this question" aria-label="${label || 'Report an issue with this question'}"><i class="ph ph-warning-circle"></i></button>`;
}
function normQ(raw,fid){
  if(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.success === false){
    console.warn('[normQ] Server error for', fid, '—', raw.error);
    return [];
  }
  let a = Array.isArray(raw) ? raw
        : (raw?.questions || raw?.data || raw?.quiz || raw?.items || raw?.result || null);
  if(!Array.isArray(a) && a === null && raw && typeof raw === 'object'){
    const vals = Object.values(raw);
    if(vals.length && vals[0] && (vals[0].q || vals[0].question || vals[0].Question)){
      a = vals;
    }
  }
  if(!Array.isArray(a)){
    console.warn('[normQ] Unrecognised format for', fid, '— got:', typeof raw, Array.isArray(raw)?'array':JSON.stringify(raw).slice(0,120));
    return [];
  }
  const result = [];
  let skipped = 0;
  a.forEach((q,i)=>{
    if(!q || typeof q !== 'object'){ skipped++; return; }
    const text = q.q || q.question || q.Question || q.stem || q.ques || q.text || '';
    if(!text){ skipped++; return; }
    let options = q.options || q.opts || q.choices || q.Options;
    if(!Array.isArray(options)){
      const lettered = [q.a||q.A, q.b||q.B, q.c||q.C, q.d||q.D, q.e||q.E].filter(x=>x!==undefined && x!==null && x!=='');
      if(lettered.length >= 2) options = lettered;
    }
    if(!Array.isArray(options) || options.length < 2){ skipped++; return; }
    let correct = q.correct !== undefined ? q.correct
                : q.answer  !== undefined ? q.answer
                : q.ans     !== undefined ? q.ans
                : q.Answer  !== undefined ? q.Answer : undefined;
    if(typeof correct === 'string' && /^[a-eA-E]$/.test(correct.trim())){
      correct = 'abcde'.indexOf(correct.trim().toLowerCase());
    }
    result.push({
      q: String(text).trim(),
      options: options.map(String),
      correct,
      explanation: q.explanation||q.explain||q.exp||q.solution||q.hint||'',
      img: _resolveQImg(q.img || q.image || q.Image || q.figure || q.diagram || ''),
      imgCaption: String(q.imgCaption || q.imgAlt || q.figureCaption || q.caption || '').trim(),
      fileId: fid||'local',
      uid: `${fid||'local'}_${i}`
    });
  });
  if(skipped>0) console.warn(`[normQ] ${skipped}/${a.length} questions skipped in ${fid}`);
  if(!result.length) console.warn('[normQ] Zero valid questions from', fid, '— raw sample:', JSON.stringify(a[0]).slice(0,200));
  return result;
}
function toast(msg,dur=3200){
  const c=document.getElementById('toasts');
  if(!c)return;
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300)},dur);
}
function toastUndo(msg, onUndo, dur=6000){
  const c=document.getElementById('toasts');
  if(!c)return;
  const t=document.createElement('div');
  t.className='toast';
  t.style.cssText='display:flex;align-items:center;gap:.6rem';
  const label=document.createElement('span'); label.textContent=msg;
  const btn=document.createElement('button');
  btn.textContent='Undo';
  btn.style.cssText='background:none;border:none;color:var(--amb);font-weight:700;font-size:.76rem;cursor:pointer;padding:.1rem .3rem;flex-shrink:0';
  let undone=false;
  btn.onclick=()=>{
    undone=true;
    onUndo && onUndo();
    t.classList.add('out'); setTimeout(()=>t.remove(),300);
  };
  t.appendChild(label); t.appendChild(btn);
  c.appendChild(t);
  setTimeout(()=>{ if(!undone){ t.classList.add('out'); setTimeout(()=>t.remove(),300); } }, dur);
}
function openMod(title,html){
  document.getElementById('mtitle').textContent=title;
  document.getElementById('mbody').innerHTML=html;
  document.getElementById('mbg').classList.add('show');
}
function closeMod(){document.getElementById('mbg').classList.remove('show')}

function _anyModalOpen(){
  if(document.getElementById('mbg')?.classList.contains('show')) return true;
  return [
    '#quiz-limit-modal','#exam-resume-modal','#quiz-exit-modal',
    '#quiz-error-card','#quiz-loader'
  ].some(sel => {
    const el = document.querySelector(sel);
    return el && el.offsetParent !== null;
  });
}

function qs(params){return Object.entries(params).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}

const GETFILE_GATE = {
  MAX: 45,
  BG_MAX: 15,
  WINDOW: 60000,
  _hits: [],
  _penaltyUntil: 0,
  async take(kind){
    const ceiling = kind === 'bg' ? this.BG_MAX : this.MAX;
    for(;;){
      const now = Date.now();
      if(now < this._penaltyUntil){
        await new Promise(r=>setTimeout(r, Math.min(this._penaltyUntil - now, 15000)));
        continue;
      }
      this._hits = this._hits.filter(t => now - t < this.WINDOW);
      if(this._hits.length < ceiling){ this._hits.push(now); return; }
      const oldest = this._hits[0] || now;
      const waitMs = Math.min(this.WINDOW, Math.max(250, this.WINDOW - (now - oldest) + 100));
      await new Promise(r=>setTimeout(r, waitMs));
    }
  },
  backoff(ms = 10000){ this._penaltyUntil = Date.now() + ms; this._hits = []; },
  etaSeconds(n){
    const perMin = this.MAX;
    return n <= perMin ? 0 : Math.round(((n - perMin) / perMin) * 60);
  }
};
async function netFetch(url, opts, timeoutMs=20000){
  if(S.forcedOffline) throw new Error('OFFLINE');
  if(!S.online) throw new Error('OFFLINE');
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {...(opts||{}), signal:controller.signal});
    clearTimeout(timer);
    return res;
  }catch(err){
    clearTimeout(timer);
    if(err.name==='AbortError') throw new Error('Request timed out — the server is taking too long. Try again or check your connection.');
    throw err;
  }
}

function _buildSearchQuery(){
  const q = S.quiz?.qs?.[S.quiz.idx];
  if(!q) return '';
  return _buildRichQuery(q);
}
const SRCH = {
  quickSearch(){
    const text = _buildSearchQuery();
    if(!text){ toast('No question to search'); return; }
    SRCH._openGoogle(text);
  },
  _openGoogle(text){
    const q = encodeURIComponent(text); if(!q) return;
    const url = `https://www.google.com/search?q=${q}`;
    const win = window.open(url, '_blank', 'noopener');
    if(!win) window.location.href = url;
  }
};

const NETCHECK = {
  _timer: null,
  _failCount: 0,
  FAILS_BEFORE_OFFLINE: 3,

  async ping(){
    if(S.forcedOffline) return S.online;
    const wasOnline = S.online;
    let ok = false;
    try { ok = await pingBackend(APPS); } catch(e){ ok = false; }

    if(ok){
      this._failCount = 0;
      S.online = true;
    } else {
      this._failCount++;
      if(!navigator.onLine || this._failCount >= this.FAILS_BEFORE_OFFLINE){
        S.online = false;
      }
    }

    if(S.online !== wasOnline){ _updateNetBtn(); _updateOfflineWarn(); }
    return S.online;
  },

  start(){
    if(NETCHECK._timer) return;
    NETCHECK._timer = setInterval(()=>NETCHECK.ping(), 30000);
  },

  reset(){ this._failCount = 0; }
};

const CHAPSTATS = {
  record(sess){
    const key = sess.chapter || 'Unknown';
    const rec = S.chapStats[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
    rec.attempted += sess.total || 0;
    rec.correct += sess.correct || 0;
    rec.sessions += 1;
    rec.lastAt = sess.at || Date.now();
    S.chapStats[key] = rec;
    _save(LS.CHAPSTATS, S.chapStats);
  },
  entries(){
    return Object.entries(S.chapStats)
      .map(([chapter, d]) => ({
        chapter, attempted: d.attempted, correct: d.correct,
        accuracy: d.attempted ? Math.round((d.correct/d.attempted)*100) : 0,
        sessions: d.sessions, lastAt: d.lastAt
      }))
      .sort((a,b)=>b.lastAt-a.lastAt);
  },
  rebuildFromSessions(){
    const rebuilt = {};
    (S.prog.sessions||[]).forEach(s=>{
      const key = s.chapter || 'Unknown';
      const rec = rebuilt[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
      rec.attempted += s.total || 0;
      rec.correct += s.correct || 0;
      rec.sessions += 1;
      if((s.at||0) > rec.lastAt) rec.lastAt = s.at||0;
      rebuilt[key] = rec;
    });
    Object.entries(rebuilt).forEach(([key, rec])=>{
      if(!S.chapStats[key]) S.chapStats[key] = rec;
    });
    _save(LS.CHAPSTATS, S.chapStats);
  }
};

const COV = {
  _ok(){
    if(!S.cov || typeof S.cov !== 'object' || Array.isArray(S.cov)) S.cov = {};
    return true;
  },
  _add(q){
    if(!q || !q.uid) return;
    const uid = String(q.uid);
    const i = uid.lastIndexOf('_');
    if(i < 1) return;
    const fid = uid.slice(0, i);
    if(fid === 'local') return;
    const idx = parseInt(uid.slice(i + 1), 10);
    if(!isFinite(idx) || idx < 0 || idx > 20000) return;
    const rec = S.cov[fid] || (S.cov[fid] = {p:'', a:0, c:0});
    rec.t = Date.now();      /* v1.33: lets a reset on another device tell old coverage from new */
    if(rec.p.length <= idx) rec.p = rec.p.padEnd(idx + 1, '0');
    rec.p = rec.p.slice(0, idx) + (q.ok ? '1' : '2') + rec.p.slice(idx + 1);
    rec.a = (rec.a || 0) + 1;
    if(q.ok) rec.c = (rec.c || 0) + 1;
  },
  record(qres){
    if(!Array.isArray(qres) || !COV._ok()) return;
    qres.forEach(q => COV._add(q));
    _save(LS.COV, S.cov);
  },
  rebuildFromSessions(){
    if(!COV._ok()) return;
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    for(let i = sessions.length - 1; i >= 0; i--){
      (sessions[i].qres || []).forEach(q => COV._add(q));
    }
    _save(LS.COV, S.cov);
  },
  merge(remote){
    if(!remote || typeof remote !== 'object' || !COV._ok()) return;
    Object.keys(remote).forEach(fid => {
      const r = remote[fid];
      if(!r || typeof r !== 'object') return;
      const rp = String(r.p || '');
      const l = S.cov[fid];
      if(!l){ S.cov[fid] = {p: rp, a: Number(r.a) || 0, c: Number(r.c) || 0, t: Number(r.t) || 0}; return; }
      let out = '';
      const n = Math.max(rp.length, l.p.length);
      for(let i = 0; i < n; i++){
        const a = l.p[i] || '0', b = rp[i] || '0';
        out += (a !== '0') ? a : b;
      }
      l.p = out;
      l.a = Math.max(l.a || 0, Number(r.a) || 0);
      l.c = Math.max(l.c || 0, Number(r.c) || 0);
    });
    _save(LS.COV, S.cov);
  }
};

const ASK = {
  confirm(o){
    o = o || {};
    return new Promise(resolve => {
      const prev = document.activeElement;
      const need = o.requireText ? String(o.requireText) : '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:var(--scrim);backdrop-filter:blur(4px)';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML = `<div style="width:100%;max-width:380px;background:var(--surface-2,var(--surface));border:1px solid var(--sep);border-radius:var(--r-sheet);box-shadow:var(--sh-modal,var(--sh-3));padding:1.25rem">
        <div style="font-size:var(--fs-t3);font-weight:650;margin-bottom:.4rem">${esc(o.title || 'Are you sure?')}</div>
        <div class="t-callout" style="margin-bottom:${need ? '.8rem' : '1.1rem'};line-height:1.55">${esc(o.body || '')}</div>
        ${need ? `<input class="input" id="ask-typed" autocomplete="off" placeholder="Type ${esc(need)} to confirm" style="margin-bottom:1rem">` : ''}
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-quiet" id="ask-no" style="flex:1" type="button">Cancel</button>
          <button class="btn ${o.danger ? 'btn-r' : 'btn-solid'}" id="ask-yes" style="flex:1" type="button" ${need ? 'disabled' : ''}>${esc(o.ok || 'Confirm')}</button>
        </div></div>`;
      document.body.appendChild(wrap);
      const onKey = e => { if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); done(false); } };
      const done = v => {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        try{ if(prev && prev.focus) prev.focus(); }catch(e){}
        resolve(v);
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => { if(e.target === wrap) done(false); });
      wrap.querySelector('#ask-no').onclick = () => done(false);
      const yes = wrap.querySelector('#ask-yes');
      yes.onclick = () => done(true);
      const typed = wrap.querySelector('#ask-typed');
      if(typed){
        typed.addEventListener('input', () => { yes.disabled = typed.value.trim().toUpperCase() !== need.toUpperCase(); });
        typed.focus();
      } else { yes.focus(); }
    });
  }
};

const AUTH = {
  async restore(){
    const u = _load(LS.USER, null);
    if(!u || u.type !== 'user' || !u.username){
      AUTH._bounce();
      return;
    }
    if(S.forcedOffline || !S.online){
      if(AUTH._isValidOffline(u)) AUTH._enter(u);
      else AUTH._bounce();
      return;
    }

    const age = Date.now() - (Number(u.lastVerified) || 0);
    if (age >= 0 && age < 30 * 1000 && AUTH._isValidOffline(u)) {
      AUTH._enter(u);
      return;
    }

    try{
      const { res } = await AUTH._checkSessionOnce(u);
      if(!res.success){
        if(AUTH._isValidOffline(u)) AUTH._enter(u);
        else AUTH._bounce();
        return;
      }
      const updated = AUTH._buildSession(u, res);
      _save(LS.USER, updated);
      if(updated.access.level === 'permanent' || updated.access.level === 'trial'){
        AUTH._enter(updated);
      } else {
        AUTH._bounce();
      }
    }catch{
      if(AUTH._isValidOffline(u)) AUTH._enter(u);
      else AUTH._bounce();
    }
  },
  async _checkSessionOnce(u){
    const r = await netFetch(APPS, {
      method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({action:'checkSession', token:u.token, username:u.username})
    }, 15000);
    const res = await r.json();
    return { res };
  },
  _isValidOffline(u){
    const a = u.access || {};
    if(a.level === 'permanent') return true;
    if(a.level === 'trial' && a.trialExpiresAt) return new Date(a.trialExpiresAt) > Date.now();
    return false;
  },
  _buildSession(prevSession, res){
    const user = res.user || {};
    const access = computeAccessLevel(res, user);
    return {
      ...prevSession,
      username: user.username || prevSession.username,
      name: user.name || prevSession.name,
      email: user.email || prevSession.email,
      mobile: user.mobile || prevSession.mobile,
      access,
      adminCapable: prevSession.adminCapable || !!res.adminCapable,
      lastVerified: Date.now()
    };
  },
  _bounce(){
    const onScreen = () => { const w = document.getElementById('quiz-wrap'); return !!(w && w.style.display !== 'none'); };
    if(onScreen()){
      if(AUTH._bounceWaiting) return;
      AUTH._bounceWaiting = true;
      toast('Your access has changed. Finish this quiz and you will be taken to sign in.', 7000);
      const t = setInterval(() => { if(!onScreen()){ clearInterval(t); window.location.href = 'index.html'; } }, 1500);
      return;
    }
    window.location.href = 'index.html';
  },
  _resetUserScopedLocalDataIfDifferentUser(username){
    const lastUser = _load(LS.LAST_USER, '');
    /* Compared case-insensitively and trimmed: "Sita" and "sita" are the same account (a Google sign-in and a password
       sign-in can differ only in capitals) and must never wipe this device's data. */
    const norm = v => String(v || '').trim().toLowerCase();
    if(lastUser && norm(lastUser) !== norm(username)){
      /* keep a copy for the PREVIOUS student, recoverable only when they sign in again */
      try { const keepUser = S.user; S.user = { username: lastUser }; PSYNC._snapshot('before-account-switch'); S.user = keepUser; } catch(e){}
      [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.TT, LS.COV].forEach(k=>{
        try{ localStorage.removeItem(k); }catch(e){}
      });
      S.prog = {total:0, correct:0, sessions:[]};
      S.bk = []; S.fl = []; S.wr = [];
      S.stk = {days:[], last:''}; S.cov = {};
      S.chapStats = {};
      S.tt = {sessions:[], reminders:{enabled:false, leadMinutes:5}};
    }
    _save(LS.LAST_USER, username);
  },
  _enter(user){
    S.user = user;
    AUTH._resetUserScopedLocalDataIfDifferentUser(user.username);
    document.getElementById('sg').style.display='none';
    document.getElementById('app').classList.add('on');
    document.getElementById('uchip').textContent = '👤 ' + (user?.name||user?.username||'Student');
    AUTH._updateSidebarCard(user);
    if(!S.online) document.getElementById('offbar').classList.add('show');
    APP.init();
    TUTORIAL.maybeAutoOpen(user);
    PSYNC.pullIfEmpty();
    TT._startReminderChecker();
    if(typeof PUSH!=='undefined') PUSH.silentRefresh();
    WEEKLY.init();
    if(typeof SB_HINTS !== 'undefined') setTimeout(() => SB_HINTS.refresh(), 200);
  },
  _updateSidebarCard(user){
    const nameEl = document.getElementById('sb-uname');
    const statusEl = document.getElementById('sb-ustatus');
    if(nameEl) nameEl.textContent = user?.name || user?.username || 'Student';
    if(statusEl){
      const a = user?.access || {};
      if(a.level==='permanent' && a.accessType==='yearly'){
        statusEl.textContent = a.accessExpiresAt ? `📅 Access until ${new Date(a.accessExpiresAt).toLocaleDateString()}` : '📅 Yearly access';
      } else if(a.level==='permanent'){
        statusEl.textContent = '✅ Permanent access';
      } else if(a.level==='trial'){
        statusEl.textContent = a.trialExpiresAt ? `⏳ Trial until ${new Date(a.trialExpiresAt).toLocaleString()}` : '⏳ Trial access';
      } else {
        statusEl.textContent = '—';
      }
    }
  },
  async logout(){
    if(!(await ASK.confirm({title:'Log out?', body:'Your progress is saved to your account.', ok:'Log out'}))) return;
    if(S.user && S.user.token && S.online && !S.forcedOffline && PSYNC._timer){
      let confirmed = false;
      try{
        await Promise.race([
          PSYNC.pushNow().then(() => { confirmed = true; }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('logout-push-timeout')), 1500))
        ]);
      }catch(e){
        console.warn('[AUTH.logout] pushNow did not complete in 1.5s — falling back to beacon:', e && e.message);
      }
      if(!confirmed) PSYNC._beaconSync();
    }
    localStorage.removeItem(LS.USER);
    window.location.href = 'index.html';
  },
  _revalidateTimer:null,
  _visibilityBound:false,
  RECHECK_MS: 10*60*1000,
  startPeriodicRecheck(){
    if(AUTH._revalidateTimer) clearInterval(AUTH._revalidateTimer);
    AUTH._revalidateTimer = setInterval(()=>AUTH._periodicRecheckTick(), AUTH.RECHECK_MS);
    if(!AUTH._visibilityBound){
      AUTH._visibilityBound = true;
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'visible' && S.user){
          const last = S.user.lastVerified || 0;
          if(Date.now() - last > AUTH.RECHECK_MS) AUTH._periodicRecheckTick();
        }
      });
    }
  },
  async _periodicRecheckTick(){
    if(document.visibilityState === 'hidden') return;
    if(!S.online || S.forcedOffline || !S.user) return;
    try{
      const { res } = await AUTH._checkSessionOnce(S.user);
      if(res.success){
        const updated = AUTH._buildSession(S.user, res);
        _save(LS.USER, updated);
        if(updated.access.level === 'permanent' || updated.access.level === 'trial'){
          S.user = updated;
        } else {
          AUTH._bounce();
        }
      } else if(res.sessionInvalid){
        try{ localStorage.setItem('abhyas_notice', 'You were signed out because this account was used on another device, or the session expired. Please sign in again.'); }catch(e){}
        localStorage.removeItem(LS.USER);
        AUTH._bounce();
      }
    }catch(e){ console.warn('[AUTH] periodic session recheck failed, will retry next interval:', e); }
  }
};

const PSYNC = {
  _timer: null,
  _state: 'idle',
  _setStatus(msg){
    const el = document.getElementById('psync-status');
    if(el) el.textContent = msg;
  },
  _setState(state){
    this._state = state;
    const dot = document.getElementById('tb-sync-dot');
    const btn = document.getElementById('tb-sync-btn');
    if(!dot || !btn) return;
    const cfg = {
      idle:    {color:'var(--t3)', title:'Not synced yet this session', anim:false},
      pending: {color:'var(--amb)', title:'Sync pending…',              anim:false},
      syncing: {color:'var(--sky)', title:'Syncing…',                   anim:true},
      synced:  {color:'var(--grn)', title:'Progress backed up',         anim:false},
      error:   {color:'var(--ros)', title:'Sync failed — will retry',   anim:false}
    }[state] || {color:'var(--t3)', title:'', anim:false};
    dot.style.background = cfg.color;
    dot.style.animation = cfg.anim ? 'pulse 1s ease-in-out infinite' : 'none';
    btn.title = 'Sync status — ' + cfg.title;
    btn.setAttribute('aria-label', btn.title);
  },
  scheduleSync(){
    if(!S.user || !S.user.token) return;
    this._setState('pending');
    clearTimeout(this._timer);
    this._timer = setTimeout(()=>this.pushNow(), 8000);
  },
  _beaconSync(){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    try{
      /* The page is closing, so nothing can be compressed or awaited here. Only a copy that fits as it is
         is sent; otherwise the next normal save (which compresses) does it. The device always keeps everything. */
      const json = JSON.stringify(this._fullLocal());
      if(json.length > this._SYNC_PAYLOAD_CEILING) return;
      const body = JSON.stringify({ action:'saveProgress', username: S.user.username, token: S.user.token, data: json, baseUpdatedAt: this._rev() });
      navigator.sendBeacon?.(APPS, new Blob([body], {type:'text/plain'}));
    }catch(e){ }
  },
  flushOnHide(){
    if(!this._timer) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._beaconSync();
  },
  _SYNC_PAYLOAD_CEILING: 44000,
  _SNAP_KEY: 'abhyas_presync_backup',

  /* The COMPLETE state of this device. Nothing here is ever cut down: merges start from this,
     and the cloud copy is made from it (compressed when large). */
  _fullLocal(){
    let qnotes = {};
    try { const raw = localStorage.getItem('abhyas_qnotes'); qnotes = raw ? JSON.parse(raw) : {}; } catch(e){ qnotes = {}; }
    if (!qnotes || typeof qnotes !== 'object' || Array.isArray(qnotes)) qnotes = {};
    let sprint = '';
    try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
    return {
      prog: S.prog || {total:0,correct:0,sessions:[]}, chapStats: S.chapStats || {}, cov: S.cov || {},
      bk: S.bk || [], fl: S.fl || [], wr: S.wr || [], stk: S.stk || {days:[],last:''}, qnotes, sprint,
      resets: (typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.load() : {}
    };
  },
  _counts(d){
    d = d || {};
    return { wr:(d.wr||[]).length, bk:(d.bk||[]).length, fl:(d.fl||[]).length, sessions:((d.prog&&d.prog.sessions)||[]).length, notes:Object.keys(d.qnotes||{}).length };
  },

  /* A merge only ever ADDS. This is the last line of defence: if a merged result is ever smaller than what
     this device already had, it is thrown away and nothing is changed. */
  _mergeKeepsEverything(local, merged){
    const a = this._counts(local), b = this._counts(merged);
    return b.wr >= a.wr && b.bk >= a.bk && b.fl >= a.fl && b.notes >= a.notes && b.sessions >= Math.min(a.sessions, 50)
      && (Number(merged.prog.total)||0) >= (Number((local.prog||{}).total)||0)
      && (Number(merged.prog.correct)||0) >= (Number((local.prog||{}).correct)||0);
  },

  /* Rolling safety copies (the last 3) of this device's data taken just before any sync changes it,
     so any sync can be undone from Data > Recover. They belong to the signed-in student only. */
  _snapshot(reason){
    try {
      const full = this._fullLocal();
      const c = this._counts(full);
      if(!c.wr && !c.bk && !c.fl && !c.sessions && !c.notes) return false;       // nothing worth keeping
      const user = (S.user && S.user.username) ? String(S.user.username).toLowerCase() : '';
      let list = []; try { list = JSON.parse(localStorage.getItem(this._SNAP_KEY) || '[]'); } catch(e){ list = []; }
      if(!Array.isArray(list)) list = [];
      const json = JSON.stringify(full);
      if(list[0] && list[0].user === user && JSON.stringify(list[0].data) === json) return true;   // unchanged since last copy
      list.unshift({ at: Date.now(), reason: String(reason||'sync'), user, counts: c, data: full });
      for(let keep = Math.min(list.length, 3); keep >= 1; keep--){
        try { localStorage.setItem(this._SNAP_KEY, JSON.stringify(list.slice(0, keep))); return true; } catch(e){ /* storage full: keep fewer */ }
      }
    } catch(e){}
    return false;     /* merging is additive, so it is still safe to carry on without a snapshot */
  },
  listSnapshots(){
    const user = (S.user && S.user.username) ? String(S.user.username).toLowerCase() : '';
    try { return (JSON.parse(localStorage.getItem(this._SNAP_KEY) || '[]') || []).filter(x => x && x.user === user); } catch(e){ return []; }
  },

  /* Write a merged result into the app and onto the device. */
  _applyMergedObject(m){
    S.prog = m.prog; if(typeof migrateSessionScopes === 'function') migrateSessionScopes(); _save(LS.PROG, S.prog);
    S.chapStats = m.chapStats; _save(LS.CHAPSTATS, S.chapStats);
    S.cov = m.cov; _save(LS.COV, S.cov);
    S.bk = m.bk; _save(LS.BK, S.bk);
    S.fl = m.fl; _save(LS.FL, S.fl);
    S.wr = m.wr; _save(LS.WR, S.wr);
    S.stk = m.stk; _save(LS.STK, S.stk);
    try {
      localStorage.setItem('abhyas_qnotes', JSON.stringify(m.qnotes));
      if(typeof QNOTE !== 'undefined') QNOTE._cache = m.qnotes;
      if(m.sprint) localStorage.setItem('abhyas_sprint_start', m.sprint);
    } catch(e){}
    if(typeof PROGRESS_RESET !== 'undefined') PROGRESS_RESET.save(m.resets || {});
    try { if(typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; if(typeof QHIST !== 'undefined') QHIST._cache = null; } catch(e){}
    if(typeof HOME!=='undefined') HOME.render();
    if(typeof PROG!=='undefined') PROG.render();
    if(typeof HOME!=='undefined' && HOME.updateBadges) HOME.updateBadges();
  },

  /* Add another copy (cloud, other device, snapshot) to this device's data. Returns { ok, added } and
     never removes anything. `remote` may be an object, a JSON string or a compressed "gz1:" string. */
  async mergeIn(remote, reason){
    let r = remote;
    try { if(typeof r === 'string') r = await syncDecode(r); } catch(e){ return { ok:false, error:'That copy could not be read.' }; }
    if(!r || typeof r !== 'object') return { ok:false, error:'That copy is empty.' };
    const local = this._fullLocal();
    const merged = mergeSyncData(local, r);
    /* A reset made on another device legitimately makes this device's copy smaller. The safety copy is taken
       first (so Data > Recover can bring it back); every other merge must still only ever add. */
    const resetsChanged = JSON.stringify(merged.resets || {}) !== JSON.stringify(local.resets || {});
    if(!resetsChanged && !this._mergeKeepsEverything(local, merged)) return { ok:false, error:'The merge was cancelled because it would have removed data. Nothing was changed.' };
    this._snapshot(reason || 'before-merge');
    const before = this._counts(local);
    this._applyMergedObject(merged);
    const after = this._counts(merged);
    return { ok:true, added:{ wr:after.wr-before.wr, bk:after.bk-before.bk, fl:after.fl-before.fl, sessions:after.sessions-before.sessions, notes:after.notes-before.notes } };
  },

  _REV_KEY: 'abhyas_progress_rev',
  _rev(){ try { return localStorage.getItem(this._REV_KEY) || ''; } catch(e){ return ''; } },
  _setRev(v){ try { if(v) localStorage.setItem(this._REV_KEY, String(v)); } catch(e){} },

  async pushNow(_isRetry){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._setState('syncing');
    /* The cloud copy is the COMPLETE state, compressed when it is large. If it still does not fit, nothing is
       cut down and nothing is sent: the data stays whole on this device. */
    const payload = await syncEncode(JSON.stringify(this._fullLocal()), this._SYNC_PAYLOAD_CEILING);
    if(payload === null){
      this._setStatus('Your data is too large for the cloud copy right now. It is safe on this device; export a backup file from Data.');
      this._setState('error');
      return;
    }
    try{
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'saveProgress', username:S.user.username, token:S.user.token, data:payload, baseUpdatedAt:this._rev()})
      }, 15000);
      const res = await r.json();
      if(res && res.success){
        this._setRev(res.updatedAt);
        this._setStatus('Last backed up: ' + new Date().toLocaleString()); this._setState('synced');
      } else if(res && res.conflict && !_isRetry){
        /* Another device saved first. Its copy is ADDED to this device's data (nothing is removed),
           and the combined copy is saved back. */
        const out = await this.mergeIn(res.data, 'before-sync');
        if(!out.ok){ this._setStatus('Sync paused: ' + out.error); this._setState('error'); return; }
        this._setRev(res.updatedAt);
        toast('\ud83d\udd04 Combined with your other device. Nothing was removed.');
        return this.pushNow(true);
      } else { this._setStatus('Backup failed \u2014 will retry automatically.'); this._setState('error'); }
    }catch(e){ this._setStatus('Backup failed (offline?) \u2014 will retry automatically.'); this._setState('error'); }
  },
  async pullIfEmpty(){
    if(!S.online || !S.user || !S.user.token) return;
    const looksEmpty = (!S.prog || !S.prog.sessions || !S.prog.sessions.length)
      && (!S.bk || !S.bk.length) && (!S.fl || !S.fl.length) && (!S.wr || !S.wr.length);
    if(!looksEmpty) return;
    await this._pull(false);
  },
  async forceRestore(){
    if(!S.online || !S.user || !S.user.token){ toast('Need internet to check your cloud backup'); return; }
    await this._pull(true);
  },
  /* "Restore" now ADDS the cloud copy to this device. It never replaces or removes anything here. */
  async _pull(force){
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'getProgress', username:S.user.username, token:S.user.token})
      }, 15000);
      const res = await r.json();
      if(!res.success || !res.data){
        if(force) toast('No cloud backup found for this account yet.');
        return;
      }
      const out = await this.mergeIn(res.data, 'before-restore');
      if(!out.ok){ if(force) toast(out.error, 6000); return; }
      this._setRev(res.updatedAt);
      const a = out.added, n = a.wr + a.bk + a.fl + a.sessions + a.notes;
      toast(n > 0 ? '\u2705 Added your saved progress from the cloud. Nothing on this device was removed.' : '\u2705 Already up to date. Nothing was removed.', 5000);
      this._setStatus('Checked cloud backup: ' + new Date().toLocaleString());
      if(n >= 0) this.scheduleSync();     // save the combined copy back so every device gets it
    }catch(e){
      if(force) toast('Could not reach your cloud backup. Check your connection and try again.');
    }
  },

  /* ── Recovery (Data > Recover): add back an earlier copy. Always additive. ── */
  async listCloudHistory(){
    const r = await netFetch(APPS, { method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({action:'getProgressHistory', username:S.user.username, token:S.user.token}) }, 15000);
    const res = await r.json();
    if(!res || !res.success) throw new Error((res && res.error) || 'Could not load earlier cloud copies.');
    return res.entries || [];
  },
  async recoverCloud(slot){
    const r = await netFetch(APPS, { method:'POST', headers:{'Content-Type':'text/plain'},
      body: JSON.stringify({action:'getProgressHistory', username:S.user.username, token:S.user.token, slot}) }, 15000);
    const res = await r.json();
    if(!res || !res.success || !res.data) return { ok:false, error:(res && res.error) || 'That copy is not available.' };
    const out = await this.mergeIn(res.data, 'before-recover');
    if(out.ok) this.scheduleSync();
    return out;
  },
  async recoverSnapshot(i){
    const snap = this.listSnapshots()[i];
    if(!snap) return { ok:false, error:'That copy is no longer on this device.' };
    const out = await this.mergeIn(snap.data, 'before-recover');
    if(out.ok) this.scheduleSync();
    return out;
  }
};
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') PSYNC.flushOnHide(); });
window.addEventListener('pagehide', ()=>PSYNC.flushOnHide());

const PUSH = {
  _messaging: null,
  supported(){
    return typeof FIREBASE_CONFIGURED !== 'undefined' && FIREBASE_CONFIGURED
      && 'Notification' in window && 'serviceWorker' in navigator
      && typeof firebase !== 'undefined';
  },
  status(){
    if(!this.supported()) return 'unsupported';
    return Notification.permission;
  },
  async enable(){
    if(!this.supported()){
      toast('❌ Notifications need setup on the backend first — ask your admin.');
      return;
    }
    if(Notification.permission === 'denied'){
      toast('🔕 Notifications are blocked for this site — enable them in your browser\'s site settings, then try again.');
      return;
    }
    try{
      const permission = await Notification.requestPermission();
      if(permission !== 'granted'){ toast('Notifications not enabled.'); return; }
      if(!this._messaging){
        firebase.initializeApp(FIREBASE_CONFIG);
        this._messaging = firebase.messaging();
      }
      const reg = await navigator.serviceWorker.ready;
      const token = await this._messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
      if(!token){ toast('❌ Could not get a notification token — try again.'); return; }
      if(!S.user || !S.user.token){ toast('✅ Notifications enabled — will sync once you\'re logged in.'); return; }
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'savePushToken', username:S.user.username, token:S.user.token, fcmToken:token})
      }, 15000);
      const res = await r.json();
      if(res && res.success) toast('🔔 Notifications enabled');
      else toast('⚠️ Enabled locally, but couldn\'t sync to your account — try again while online.');
    }catch(e){
      toast('❌ Could not enable notifications: ' + (e.message||e));
    }
  },
  async silentRefresh(){
    if(!this.supported() || Notification.permission !== 'granted') return;
    if(!S.user || !S.user.token) return;
    try{
      if(!this._messaging){
        firebase.initializeApp(FIREBASE_CONFIG);
        this._messaging = firebase.messaging();
      }
      const reg = await navigator.serviceWorker.ready;
      const token = await this._messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: reg });
      if(!token) return;
      await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'savePushToken', username:S.user.username, token:S.user.token, fcmToken:token})
      }, 15000);
    }catch(e){ }
  },
  refreshButtonUI(){
    const btn = document.getElementById('push-enable-btn');
    const desc = document.getElementById('push-status-desc');
    if(!btn || !desc) return;
    const state = this.status();
    if(state === 'unsupported'){
      btn.style.display = 'none';
      desc.textContent = 'Notifications aren\'t set up for this deployment yet.';
    } else if(state === 'granted'){
      btn.innerHTML = '<i class="ph ph-bell-ringing"></i> Notifications Enabled';
      btn.disabled = true;
      btn.style.opacity = '.7';
      desc.textContent = 'You\'ll be notified about trial expiry and payment status, even when the app is closed.';
    } else if(state === 'denied'){
      btn.innerHTML = '<i class="ph ph-bell-slash"></i> Blocked — check browser settings';
      desc.textContent = 'Notifications are blocked for this site. Enable them in your browser\'s site settings, then reload.';
    } else {
      btn.innerHTML = '<i class="ph ph-bell"></i> Enable Notifications';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
};

const PWA = {
  init(){
    window.addEventListener('beforeinstallprompt', e=>{
      e.preventDefault(); S.dpi=e;
      const btn=document.getElementById('installBtn');
      if(btn){ btn.style.display=''; btn.title='Install App'; }
      PWA._showInstallBanner();
    });
    window.addEventListener('appinstalled', ()=>{
      S.dpi=null;
      toast('📲 App installed!');
      const btn=document.getElementById('installBtn');
      if(btn) btn.style.display='none';
      const bar=document.getElementById('pwa-install-banner');
      if(bar) bar.remove();
    });
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{});
      navigator.serviceWorker.addEventListener('message', (e) => {
        if(e.data?.type === 'SW_ACTIVATED' && e.data.version !== (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '')){
          if(!S.quiz.active){
            toast('🔄 Update ready — reload to get the latest version.', 8000);
          }
        }
      });
    }
  },
  _showInstallBanner(){
    if(document.getElementById('pwa-install-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-install-banner';
    bar.style.cssText = 'position:fixed;left:.75rem;right:.75rem;bottom:calc(var(--bn-h,0px) + .75rem + var(--safe-b,0px));background:var(--c2);border:1px solid var(--bd);border-radius:var(--r2);padding:.7rem .9rem;display:flex;align-items:center;gap:.6rem;z-index:9997;box-shadow:var(--sh3)';
    bar.innerHTML = `
      <div style="font-size:1.3rem"><i class="ph ph-device-mobile"></i></div>
      <div style="flex:1;font-size:.76rem;color:var(--t2);line-height:1.3">Install this app for faster, offline access</div>
      <button id="pwa-install-go" style="padding:.4rem .75rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r1);color:var(--on-accent,#0F0A00);font-weight:700;font-size:.76rem;cursor:pointer;font-family:var(--ff)">Install</button>
      <button id="pwa-install-x" aria-label="Dismiss install prompt" style="background:none;border:none;color:var(--t3);font-size:.9rem;cursor:pointer;padding:.2rem"><i class="ph ph-x"></i></button>
    `;
    document.body.appendChild(bar);
    document.getElementById('pwa-install-go').onclick = ()=> { PWA.install(); bar.remove(); };
    document.getElementById('pwa-install-x').onclick = ()=> bar.remove();
  },
  install(){
    if(S.dpi){ S.dpi.prompt(); S.dpi.userChoice.then(()=>{ S.dpi=null; }); const b=document.getElementById('installBtn'); if(b) b.style.display='none'; }
    else toast('Install option not available — try your browser\'s "Add to Home Screen" menu.');
  },
  toggleFullscreen(){
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>toast('Fullscreen not supported here'));
    else document.exitFullscreen?.();
  }
};

/* ═══════════════ 5b. WEEKLY SETS ═══════════════
   Weekly tests are simply the admin's uploaded question file (s.fileId).
   No Loksewa mock, no chapter pools, no Group A/B/C/D — that machinery
   belongs to the subjective module, not here.
   - Sit once for an official, server-recorded attempt.
   - Retest reuses the same file, scored locally.
   - Review replays the exact paper the student sat, from the saved copy
     on the device, falling back to reloading s.fileId. */
const WEEKLY = {
  LS_RETAKES: 'abhyas_weekly_last_retake',
  LS_PAPERS:  'abhyas_weekly_papers',
  _retakes: null,

  _loadRetakes(){
    if (this._retakes) return this._retakes;
    try {
      const raw = localStorage.getItem(this.LS_RETAKES);
      this._retakes = raw ? JSON.parse(raw) : {};
      if (!this._retakes || typeof this._retakes !== 'object') this._retakes = {};
    } catch(e){ this._retakes = {}; }
    return this._retakes;
  },
  _saveRetakeScore(id, stats){
    const all = this._loadRetakes();
    all[id] = {
      correct: Number(stats.correct) || 0,
      wrong:   Number(stats.wrong)   || 0,
      skipped: Number(stats.skipped) || 0,
      total:   Number(stats.total)   || 0,
      pct:     Number(stats.pct)     || 0,
      at: Date.now()
    };
    try { localStorage.setItem(this.LS_RETAKES, JSON.stringify(all)); } catch(e){}
  },
  _lastAttemptFor(id){
    const retake = this._loadRetakes()[id];
    return retake || this.attempts[id] || null;
  },

  /* Keep the paper the student actually sat, on this device, so Review
     and Retest always have questions to work with even if the file can't
     be re-fetched. Strips images and explanations if the payload grows
     past the localStorage budget — questions and answer indices are what
     matter for replay. */
  _savePaper(id, qs, ans){
    if(!id || !Array.isArray(qs) || !qs.length) return false;
    try {
      const all = _load(this.LS_PAPERS, {}) || {};
      const paper = { at: Date.now(), qs: qs.map(q => ({...q})), ans: (ans || []).slice() };
      let json = JSON.stringify(paper);
      if(json.length > 400000){
        paper.qs = paper.qs.map(q => { const {img, imgCaption, explanation, ...rest} = q; return rest; });
        json = JSON.stringify(paper);
      }
      if(json.length > 400000){
        paper.qs = paper.qs.map(q => ({ q: q.q, options: q.options, correct: q.correct, uid: q.uid }));
        json = JSON.stringify(paper);
      }
      if(json.length > 800000) return false;
      all[id] = paper;
      localStorage.setItem(this.LS_PAPERS, JSON.stringify(all));
      return true;
    } catch(e){ return false; }
  },
  _loadPaper(id){
    if(!id) return null;
    try {
      const all = _load(this.LS_PAPERS, {}) || {};
      const p = all[id];
      if(!p || !Array.isArray(p.qs) || !p.qs.length) return null;
      if(Date.now() - (p.at || 0) > 120*24*60*60*1000) return null;
      return p;
    } catch(e){ return null; }
  },

  /* Loksewa marking: +1 correct, −0.2 wrong, 0 skipped. Display only. */
  loksewaScore(attempt){
    if (!attempt) return null;
    const total = Number(attempt.total) || 0;
    if (!total) return null;
    const correct = Number(attempt.correct) || 0;
    const skipped = Number(attempt.skipped) || 0;
    const wrong   = Math.max(0, total - correct - skipped);
    const score   = correct - wrong * 0.2;
    return {
      score:   Math.round(score * 10) / 10,
      pct:     Math.round((score / total) * 1000) / 10,
      correct, wrong, skipped, total
    };
  },

  sets: [],
  attempts: S.weeklyAttempts || {},
  _tickTimer: null,

  _saveAttempts(){
    S.weeklyAttempts = this.attempts;
    _save(LS.WK_ATTEMPTS, this.attempts);
  },

  async init(){
    if(!S.online || S.forcedOffline){ this._renderHomeCard(); this._startTick(); return; }
    try{
      const post = (action) => netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({ action, username:S.user.username, token:S.user.token })
      }, 15000).then(r=>r.json()).catch(()=>({success:false}));
      const [setsRes, attemptsRes] = await Promise.all([
        post('listWeeklySets'),
        post('getMyWeeklyAttempts')
      ]);
      if(setsRes.success) this.sets = setsRes.sets || [];
      if(attemptsRes.success && Array.isArray(attemptsRes.attempts)){
        for(const a of attemptsRes.attempts){
          const local = this.attempts[a.weeklyId];
          if(local && !local.synced) continue;
          if(local && local.standing) a.standing = local.standing;
          this.attempts[a.weeklyId] = a;
        }
        this._saveAttempts();
      }
      this._renderHomeCard();
      this._startTick();
      this._loadStandings();
    }catch(e){ this._renderHomeCard(); }
  },

  examCloseAt(s){
    if(!s.releaseAt) return null;
    const t = new Date(s.releaseAt).getTime();
    return isNaN(t) ? null : t + WEEKLY_EXAM_WINDOW_HOURS*60*60*1000;
  },
  examOpen(s){
    if(!s.released) return false;
    const closeAt = this.examCloseAt(s);
    return closeAt !== null && Date.now() < closeAt;
  },
  hasAttempt(id){ return !!this.attempts[id]; },

  _renderHomeCard(){
    const outer = document.getElementById('weekly-sets-outer');
    const box = document.getElementById('weekly-sets-card');
    if(!box || !outer) return;
    if(!this.sets.length){ outer.style.display = 'none'; box.innerHTML = ''; return; }
    outer.style.display = '';
    box.innerHTML = this.sets.map(s=>{
      const attempted = this.attempts[s.id];
      const idJson = JSON.stringify(String(s.id));

      if(!s.released){
        const when = s.releaseAt ? new Date(s.releaseAt) : null;
        const whenTxt = when ? when.toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : 'soon';
        return `<div class="qb-btn" style="width:100%;justify-content:flex-start;opacity:.6;cursor:default">
          <i class="ph ph-lock-simple"></i> ${esc(s.title)} <span style="opacity:.7">— unlocks ${whenTxt}</span>
        </div>`;
      }

      if(attempted){
        const lastRetake = this._loadRetakes()[s.id];
        const shown = lastRetake || attempted;
        const isRetake = !!lastRetake;
        const canRetake = s.status !== 'archived';
        const lkLast = this.loksewaScore(shown);
        const lkOff  = this.loksewaScore(attempted);
        const lastPct = lkLast ? lkLast.pct : (Number(shown.pct) || 0);
        const offPct  = lkOff  ? lkOff.pct  : (Number(attempted.pct) || 0);
        const tag = isRetake
          ? '↻ Last practice ' + lastPct + '% · Official ' + offPct + '%'
          : '✓ ' + lastPct + '%' + (attempted.standing ? ' · Rank ' + attempted.standing.rank + '/' + attempted.standing.total : '');
        const hint = canRetake ? ' · Tap to review or retest' : ' · Tap to review';
        return `<div class="qb-btn ok" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center;opacity:.92" onclick='WEEKLY.open(${idJson})'>
          <span><i class="ph ph-check-circle"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
          <span class="ctag tg" style="font-size:.62rem;font-weight:700">${tag}${hint}</span>
        </div>`;
      }

      const open = this.examOpen(s);
      const closeAt = this.examCloseAt(s);
      if(open){
        return `<div class="qb-btn ok" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center" onclick='WEEKLY.open(${idJson})'>
          <span><i class="ph ph-note-pencil"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
          <span class="mono" id="weekly-countdown-${esc(s.id)}" data-close="${closeAt}" style="font-size:.68rem;font-weight:700;color:var(--ros)" title="Time left — one attempt only">${fmtHMS(Math.max(0,Math.round((closeAt-Date.now())/1000)))}</span>
        </div>`;
      }

      return `<div class="qb-btn" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center;opacity:.75" onclick='WEEKLY.open(${idJson})'>
        <span><i class="ph ph-note-pencil"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
        <span style="font-size:.62rem;opacity:.75">Practice</span>
      </div>`;
    }).join('');
  },

  async _loadStandings(){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    let changed = false;
    for(const s of this.sets){
      const a = this.attempts[s.id];
      if(!a || a.standing || !s.releaseAt || this.examOpen(s)) continue;
      try{
        const r = await netFetch(APPS, {
          method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({action:'getWeeklyStanding', username:S.user.username, token:S.user.token, weeklyId:s.id})
        }, 15000);
        const res = await r.json();
        if(res && res.success && res.ready && res.attempted){
          a.standing = {rank:res.rank, total:res.total, percentile:res.percentile};
          changed = true;
        }
      }catch(e){}
    }
    if(changed){ this._saveAttempts(); this._renderHomeCard(); }
  },

  async _startOnServer(s){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return 'go';
    let res = null;
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'startWeeklyAttempt', username:S.user.username, token:S.user.token, weeklyId:s.id})
      }, 15000);
      res = await r.json();
    }catch(e){ return 'go'; }
    if(!res || !res.success) return 'go';
    if(res.alreadyAttempted && res.attempt){
      this.attempts[s.id] = res.attempt; this._saveAttempts(); this._renderHomeCard();
      toast('Already submitted. Showing your recorded result.', 4000);
      this._startReview(s, res.attempt);
      return 'stop';
    }
    if(res.windowClosed){
      toast('The exam window has closed. Viewing answers only.', 4000);
      this._startReview(s, null);
      return 'stop';
    }
    if(res.resumed){
      const snap = _load(LS.EXAM_SNAP, null);
      const mine = !!(snap && snap.scope && snap.scope.weeklyId === s.id && snap.username === S.user.username && snap.qs && snap.qs.length);
      if(mine){
        const adj = (snap.left || 0) - Math.floor((Date.now() - (snap.savedAt || Date.now())) / 1000);
        if(adj <= 0){
          QUIZ._resumeSnapshot(snap, 0);
          toast('Time ran out while you were away. Submitting what you had.', 5000);
          QUIZ.submitExam();
        } else {
          QUIZ._resumeSnapshot(snap, adj);
          toast('Continuing your test where you left off.', 3000);
        }
        return 'stop';
      }
      toast('You started this test earlier without submitting, so your one attempt is used. Showing the answers.', 7000);
      this._startReview(s, null);
      return 'stop';
    }
    return 'go';
  },

  _startTick(){
    if(this._tickTimer){ clearInterval(this._tickTimer); this._tickTimer = null; }
    const anyCountdown = this.sets.some(s=>s.released && !this.attempts[s.id] && this.examCloseAt(s) !== null);
    if(!anyCountdown) return;
    this._tickTimer = setInterval(()=>{
      let anyExpired = false;
      let anyLive = false;
      this.sets.forEach(s=>{
        if(!s.released || this.attempts[s.id]) return;
        const closeAt = this.examCloseAt(s);
        if(closeAt===null) return;
        const el = document.getElementById('weekly-countdown-'+s.id);
        const left = Math.round((closeAt - Date.now())/1000);
        if(left <= 0){ anyExpired = true; return; }
        anyLive = true;
        if(el) el.textContent = fmtHMS(left);
      });
      if(anyExpired) this._renderHomeCard();
      if(!anyLive && !anyExpired){
        clearInterval(this._tickTimer);
        this._tickTimer = null;
      }
    }, 1000);
  },

  /* Entry point from the home card.
     Loads exactly the admin's uploaded question file. */
  async open(id){
    const s = this.sets.find(x=>x.id===id);
    if(!s || !s.released){ toast('Not unlocked yet.'); return; }
    if(!s.fileId){ toast('This weekly set has no question file attached. Ask your admin to fix it.', 7000); return; }

    let attempt = this.attempts[id];
    if(!attempt && S.online && !S.forcedOffline){
      try{
        const r = await netFetch(APPS, {
          method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({action:'getWeeklyAttempt', username:S.user.username, token:S.user.token, weeklyId:id})
        }, 15000);
        const res = await r.json();
        if(res.success && res.attempt){
          attempt = res.attempt;
          this.attempts[id] = attempt;
          this._saveAttempts();
          this._renderHomeCard();
        }
      }catch(e){ }
    }

    if(attempt){
      if(s.status === 'archived'){
        toast(`🔒 Archived — showing your recorded result (${attempt.pct}%)`, 3500);
        this._startReview(s, attempt);
        return;
      }
      this._showRetakeModal(s, attempt);
      return;
    }

    if(!this.examOpen(s)){
      const ok = await ASK.confirm({
        title: 'Practice exam — ' + s.title,
        body:  'The ' + WEEKLY_EXAM_WINDOW_HOURS + '-hour window for the official attempt on this set has closed. ' +
               'You can still sit it as a practice run — it will be scored on this device ' +
               'and will not change the record on the server.',
        ok:    'Start practice'
      });
      if(!ok) return;
      this._startRetake(s.id);
      return;
    }

    toast(`📝 Graded exam — one official attempt. Retests are practice only.`, 5000);
    if(await WEEKLY._startOnServer(s) === 'stop') return;
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'exam', s.title, {
      weeklyId: s.id, weeklyTitle: s.title, weeklyFirstAttempt: true
    });
  },

  _showRetakeModal(s, attempt){
    const last = this._lastAttemptFor(s.id) || attempt;
    const lk = this.loksewaScore(last) || { correct:0, wrong:0, skipped:0, total:0, pct:0 };
    const correct = lk.correct;
    const total   = lk.total;
    const skipped = lk.skipped;
    const wrong   = lk.wrong;
    const pct     = lk.pct;
    const isRetake = last !== attempt;
    const stamp = last.at ? new Date(last.at).toLocaleString() : '';
    const lkOff = this.loksewaScore(attempt);
    const officialPct = lkOff ? lkOff.pct : (Number(attempt && attempt.pct) || 0);

    MODAL.sheet('Weekly test — ' + s.title,
      '<div class="qotd-head" style="margin-bottom:var(--sp-4)">' +
        '<div>' +
          '<div class="qotd-meta">' + (isRetake ? 'Your last practice run' : 'Your official attempt') + '</div>' +
          '<div style="font-size:.95rem;font-weight:700;color:var(--t1);margin-top:.15rem">' + esc(s.title) + '</div>' +
          (stamp ? '<div class="t-cap" style="margin-top:.15rem">' + esc(stamp) + '</div>' : '') +
        '</div>' +
        '<div class="qotd-marks">' + pct + '%</div>' +
      '</div>' +
      '<div class="stats-row" style="margin-bottom:var(--sp-4)">' +
        '<div class="scard"><div class="sv tc2">' + correct + '</div><div class="stat-lbl">Correct</div></div>' +
        '<div class="scard"><div class="sv tb2">' + wrong   + '</div><div class="stat-lbl">Wrong</div></div>' +
        '<div class="scard"><div class="sv ta2">' + skipped + '</div><div class="stat-lbl">Skipped</div></div>' +
        '<div class="scard"><div class="sv">' + total + '</div><div class="stat-lbl">Total</div></div>' +
      '</div>' +
      '<p class="t-cap text-center" style="margin-bottom:var(--sp-3)">Loksewa marking: +1 per correct, −0.2 per wrong, 0 for skipped.</p>' +
      (isRetake
        ? '<div class="banner banner-info" style="margin-bottom:var(--sp-3)"><i class="ph ph-info"></i><span>Your <b>official score</b> for this set is <b>' + officialPct + '%</b> — the first attempt. Retests are practice only and are never recorded for the admin.</span></div>'
        : '') +
      '<p class="t-callout mb4" style="text-align:center">Review your answers, or sit the exam again?</p>' +
      '<div class="flex g2 mt4">' +
        '<button class="btn btn-quiet" style="flex:1" onclick="MODAL.close(\'sheet\');WEEKLY._startReview(WEEKLY.sets.find(function(x){return x.id===\'' + escAttrJs(s.id) + '\'}), WEEKLY.attempts[\'' + escAttrJs(s.id) + '\'] || null)">' +
          '<i class="ph ph-eye"></i> Review' +
        '</button>' +
        '<button class="btn btn-solid" style="flex:1" onclick="MODAL.close(\'sheet\');WEEKLY._startRetake(\'' + escAttrJs(s.id) + '\')">' +
          '<i class="ph ph-repeat"></i> Retest' +
        '</button>' +
      '</div>',
      { wide:false }
    );
  },

  /* Retest — same questions as the admin uploaded, fresh attempt.
     Scored locally, never touches the server. */
  async _startRetake(id){
    const s = this.sets.find(x=>x.id===id);
    if(!s){ toast('Not available.'); return; }
    if(!s.fileId){
      toast('This weekly set has no question file attached. Ask your admin to fix it.', 7000);
      return;
    }
    toast('🎯 Retest — for practice. Your official score will not change.', 4000);
    QUIZ.load(s.fileId, `weekly_${s.id}_retake`, 'exam', s.title, {
      weeklyId: s.id, weeklyTitle: s.title, weeklyRetake: true
    });
  },

  /* Review — replays the exact paper the student sat, with their recorded
     answers already marked. Prefers the paper saved on this device;
     falls back to loading s.fileId if the saved copy is gone. */
  async _startReview(s, attempt){
    if(!s){ toast('Weekly set not found.', 5000); return; }

    const paper = this._loadPaper(s.id);
    if(paper && paper.qs.length){
      const qs = paper.qs.slice();
      const ans = (paper.ans && paper.ans.length === qs.length)
        ? paper.ans.slice()
        : new Array(qs.length).fill(null);
      QUIZ._doStart(qs, 'flashcard', s.title, false, {
        weeklyId: s.id, weeklyTitle: s.title,
        weeklyReviewMode: true,
        weeklyAttempt: Object.assign({}, attempt || {}, { answers: ans })
      });
      return;
    }

    if(!s.fileId){
      toast('No saved paper on this device and no attached file to review.', 7000);
      return;
    }
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'flashcard', s.title, {
      weeklyId: s.id, weeklyTitle: s.title,
      weeklyReviewMode: true, weeklyAttempt: attempt || null
    });
  },

  async _recordAttempt(quiz, stats){
    const weeklyId = quiz.scope?.weeklyId;
    if(!weeklyId) return;

    if(quiz.scope && quiz.scope.weeklyRetake){
      try { this._savePaper(weeklyId, quiz.qs, quiz.ans); } catch(e){}
      this._saveRetakeScore(weeklyId, stats);
      return;
    }

    const attempt = {
      weeklyId,
      answers: (quiz.ans || []).slice(),
      total: stats.total,
      correct: stats.correct,
      skipped: stats.skipped,
      pct: stats.pct,
      startedAt: quiz.startedAt || Date.now(),
      submittedAt: Date.now(),
      durationSec: Math.min(6*60*60, Math.round((Date.now()-(quiz.startedAt||Date.now()))/1000)),
      synced: false
    };
    this.attempts[weeklyId] = attempt;
    this._saveAttempts();
    try { this._savePaper(weeklyId, quiz.qs, quiz.ans); } catch(e){}
    this._renderHomeCard();
    await this._syncAttempt(attempt);
  },

  async _syncAttempt(attempt){
    if(!S.online || S.forcedOffline || !S.user?.token) return;
    try{
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({
          action: 'submitWeeklyAttempt',
          username: S.user.username,
          token: S.user.token,
          weeklyId: attempt.weeklyId,
          answers: JSON.stringify(attempt.answers),
          correctCount: attempt.correct,
          startedAt: attempt.startedAt,
          durationSec: attempt.durationSec
        })
      }, 20000);
      const res = await r.json();
      if(res.success && res.attempt){
        this.attempts[attempt.weeklyId] = res.attempt;
        this._saveAttempts();
        this._renderHomeCard();
      } else if(res.alreadyAttempted && res.attempt){
        this.attempts[attempt.weeklyId] = res.attempt;
        this._saveAttempts();
        this._renderHomeCard();
        toast('ℹ️ This set was already submitted on another device — showing the recorded result.', 5000);
      }
    }catch(e){ }
  },

  retryUnsynced(){
    if(!S.online || S.forcedOffline) return;
    Object.values(this.attempts).forEach(a => {
      if(a && !a.synced) this._syncAttempt(a);
    });
  }
};

const UI = {
  cur: 'home',
  /* Screen lifecycle (v1.32). Features register what should happen when a screen
     opens instead of wrapping UI._goRaw again and again:
       UI.onEnter('heatmap', fn)   runs when that screen opens
       UI.onEnterAny(fn)           runs on every screen change (fn receives the view id) */
  ALIAS: { 'subjective':'subj-qotd' },
  _enter: {},
  _enterAny: [],
  onEnter(view, fn){ (UI._enter[view] = UI._enter[view] || []).push(fn); },
  onEnterAny(fn){ UI._enterAny.push(fn); },
  _goRaw(v){
    v = UI.ALIAS[v] || v;
    document.getElementById('quiz-wrap').style.display='none';
    document.querySelectorAll('.view').forEach(e=>e.classList.remove('on'));
    const el=document.getElementById('view-'+v);
    if(el)el.classList.add('on');
    document.querySelectorAll('.sb-item').forEach(e=>e.classList.remove('active'));
    const ni=document.getElementById('nav-'+v);
    if(ni)ni.classList.add('active');
    if(typeof NAV!=='undefined' && NAV.reveal) NAV.reveal(v);

    if(UI.cur === 'home' && v !== 'home' && HOME._clockTimer){ clearInterval(HOME._clockTimer); HOME._clockTimer = null; }
    if(UI.cur === 'timetable' && v !== 'timetable' && TT._clockTimer){ clearInterval(TT._clockTimer); TT._clockTimer = null; }

    UI.cur=v;UI.sidebarClose();
    const mainEl = document.getElementById('main');
    if(mainEl) mainEl.scrollTop = 0;
    window.scrollTo(0,0);

    ({
      home:()=>HOME.render(),
      progress:()=>{ PROG.render(); if(typeof PUSH!=='undefined') PUSH.refreshButtonUI(); },
      online:()=>ONPROG.render(),
      offline:()=>CACHE.render(),
      bookmarks:()=>REV.renderList('bk'),
      flagged:()=>REV.renderList('fl'),
      wrong:()=>REV.renderList('wr'),
      timetable:()=>TT.render(),
      psycho:()=>PSY.init()
    })[v]?.();

    (UI._enter[v] || []).forEach(fn => { try { fn(v); } catch(e){ console.error('screen hook failed for', v, e); } });
    UI._enterAny.forEach(fn => { try { fn(v); } catch(e){ console.error('screen hook failed', e); } });
  },
  go(v){
    if(S.quiz.active && document.getElementById('quiz-wrap').style.display !== 'none'){
      QUIZ._exitGuard(()=>UI._goRaw(v));
      return;
    }
    UI._goRaw(v);
  },
  sidebarToggle(){
    document.getElementById('sb').classList.toggle('open');
    document.getElementById('ov').classList.toggle('show');
  },
  sidebarClose(){
    document.getElementById('sb').classList.remove('open');
    document.getElementById('ov').classList.remove('show');
  },
  theme(){
    document.body.classList.toggle('dark');
    _save('abhyas_theme', document.body.classList.contains('dark')?'dark':'light');
  }
};

const PROG = {
  track(correct){
    { const _d = today(); if(!S._tc || S._tc.d !== _d) S._tc = {d:_d, n:0}; S._tc.n++; if(S._tc.n === 5) STREAK.markToday(); }
    S.prog.total = (S.prog.total || 0) + 1;
    if(correct) S.prog.correct = (S.prog.correct || 0) + 1;
    PROG._saveSoon();
    HOME.updateStats();
    HOME.updateBadges();
  },

  _st: null,
  _saveSoon(){
    if(PROG._st) clearTimeout(PROG._st);
    PROG._st = setTimeout(() => { PROG._st = null; _save(LS.PROG, S.prog); }, 150);
  },
  flushNow(){
    if(PROG._st){ clearTimeout(PROG._st); PROG._st = null; _save(LS.PROG, S.prog); }
  },

  recordSession(sess){
    if(!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
    S.prog.sessions.unshift(sess);
    S.prog.sessions = S.prog.sessions.slice(0,50);
    _save(LS.PROG, S.prog);

    try { if (typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; } catch(e){}
    try { if (typeof QHIST !== 'undefined') QHIST._cache = null; } catch(e){}

    HOME.render();
  },

  predict(){
    const sessions = (S.prog.sessions||[]).filter(s=>s.total>0).slice(0,20);
    if(sessions.length < 3) return null;
    let wSum = 0, vSum = 0;
    sessions.forEach((s,i)=>{
      const recencyW = 1 - (i/sessions.length)*0.5;
      const modeW = s.mode==='exam' ? 1.5 : 1.0;
      const w = recencyW * modeW;
      vSum += (s.pct||0) * w;
      wSum += w;
    });
    const predicted = Math.round(vSum/wSum);
    const pcts = sessions.map(s=>s.pct||0);
    const mean = pcts.reduce((a,b)=>a+b,0)/pcts.length;
    const variance = pcts.reduce((a,b)=>a+(b-mean)**2,0)/pcts.length;
    const stdDev = Math.round(Math.sqrt(variance));
    const confidence = sessions.length>=10 && stdDev<15 ? 'High' : sessions.length>=5 ? 'Medium' : 'Low';
    return { predicted, margin: Math.max(3,stdDev), confidence, sampleSize: sessions.length };
  },

  renderPredict(){
    const el = document.getElementById('predict-card');
    if(!el) return;
    const p = PROG.predict();
    if(!p){
      el.innerHTML = `<div class="card"><div class="card-hd"><h3><i class="ph ph-target"></i> Predicted Exam Score</h3></div>
        <div class="empty"><div class="empty-i"><i class="ph ph-target"></i></div><p>Complete at least 3 quizzes (exam mode helps most) to unlock a prediction</p></div></div>`;
      return;
    }
    const barColor = p.predicted>=70?'var(--grn)':p.predicted>=50?'var(--amb)':'var(--ros)';
    const confColor = p.confidence==='High'?'tg':p.confidence==='Medium'?'ta':'tr';
    el.innerHTML = `<div class="card">
      <div class="card-hd"><h3><i class="ph ph-target"></i> Predicted Exam Score</h3><span class="ctag ${confColor}">${p.confidence} confidence</span></div>
      <div style="display:flex;align-items:baseline;gap:.5rem;margin:.3rem 0 .5rem">
        <span style="font-size:2rem;font-weight:800;color:var(--t1);font-family:var(--fd)">${p.predicted}%</span>
        <span style="font-size:.76rem;color:var(--t3)">± ${p.margin}% · based on your last ${p.sampleSize} session${p.sampleSize!==1?'s':''}</span>
      </div>
      <div class="pb"><div class="pb-f" style="width:${p.predicted}%;background:${barColor}"></div></div>
      <div style="font-size:.7rem;color:var(--t3);margin-top:.55rem">Recent and exam-mode sessions count more. Not a guarantee — use it to gauge where you stand.</div>
    </div>`;
  },

  render(){
    PROG.renderPredict();

    const total = S.prog.total, correct = S.prog.correct, wrong = total - correct;
    const pct = total ? Math.round((correct/total)*100) : 0;

    const statsEl = document.getElementById('prog-stats');
    if(statsEl){
      statsEl.innerHTML = `
        <div class="sc"><div class="sv tcy">${total}</div><div class="stat-lbl">Answered</div></div>
        <div class="sc"><div class="sv tc2">${correct}</div><div class="stat-lbl">Correct</div></div>
        <div class="sc"><div class="sv tb2">${wrong}</div><div class="stat-lbl">Wrong</div></div>
        <div class="sc"><div class="sv ta2">${pct}%</div><div class="stat-lbl">Accuracy</div></div>
      `;
    }

    const chapEl = document.getElementById('chap-acc');
    if(chapEl){
      let entries = CHAPSTATS.entries();
      if(!entries.length){
        const byChap = {};
        (S.prog.sessions||[]).forEach(s=>{
          const k = s.chapter||'Unknown';
          if(!byChap[k]) byChap[k] = {correct:0,total:0,sessions:0,lastAt:0};
          byChap[k].correct += s.correct||0;
          byChap[k].total += s.total||0;
          byChap[k].sessions++;
          if((s.at||0) > byChap[k].lastAt) byChap[k].lastAt = s.at||0;
        });
        entries = Object.entries(byChap)
          .map(([chapter,d])=>({chapter, attempted:d.total, correct:d.correct, accuracy:d.total?Math.round((d.correct/d.total)*100):0, sessions:d.sessions, lastAt:d.lastAt}))
          .sort((a,b)=>b.lastAt-a.lastAt);
      }

      if(!entries.length){
        chapEl.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-chart-bar"></i></div><p>Complete a quiz to see chapter breakdowns</p></div>';
      } else {
        const weak = entries.filter(e=> e.attempted>=5 && e.accuracy<60);
        const weakHtml = weak.length ? `
          <div style="background:var(--bad-bg);border:1px solid var(--bad-bd);border-radius:var(--r2);padding:.75rem 1rem;margin-bottom:.8rem">
            <div style="font-size:.72rem;font-weight:800;color:var(--ros);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.4rem"><i class="ph ph-warning"></i> Weak Topics — needs attention</div>
            ${weak.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:.2rem 0;font-size:.76rem"><span style="color:var(--t2)">${esc(e.chapter)}</span><span class="ctag tr">${e.accuracy}%</span></div>`).join('')}
            <div style="margin-top:.5rem;font-size:.7rem;color:var(--t3)">Tip: Use <i class="ph ph-x-circle"></i> Wrong Bank to drill these topics</div>
          </div>` : '';
        chapEl.innerHTML = weakHtml + entries.map(e=>{
          const p = e.accuracy;
          const barColor = p>=70?'var(--grn)':p>=50?'var(--amb)':'var(--ros)';
          return `<div class="pb-w">
            <div class="pb-l">
              <span style="font-size:.78rem">${esc(e.chapter)}</span>
              <div style="display:flex;align-items:center;gap:.35rem">
                <span style="font-size:.68rem;color:var(--t3)">${e.sessions} session${e.sessions!==1?'s':''} · ${e.correct}/${e.attempted}</span>
                <span class="ctag t${p>=70?'g':p>=50?'a':'r'}" style="font-size:.65rem">${p}%</span>
              </div>
            </div>
            <div class="pb"><div class="pb-f" style="width:${p}%;background:${barColor}"></div></div>
          </div>`;
        }).join('');
      }
    }
  }
};

const STREAK = {
  markToday(){
    const t = today();
    if(!S.stk.days) S.stk.days = [];
    if(!S.stk.days.includes(t)) S.stk.days.push(t);
    S.stk.last = t;
    if(S.stk.days.length>400) S.stk.days = S.stk.days.slice(-400);
    _save(LS.STK, S.stk);
    HOME.render();
  },
  currentStreak(){
    const set = new Set(S.stk.days||[]);
    if(!set.size) return 0;
    const hasToday = set.has(today());
    const hasYesterday = set.has(localDateOffset(new Date(), -1));
    if(!hasToday && !hasYesterday){
      if(!set.has(localDateOffset(new Date(), -2))) return 0;
    }
    let n = 0;
    let offset = hasToday ? 0 : 1;
    let skipBudget = 1;
    while(n <= 400){
      if(set.has(localDateOffset(new Date(), -offset))){
        n++;
        offset++;
        continue;
      }
      if(skipBudget > 0){
        skipBudget--;
        offset++;
        continue;
      }
      break;
    }
    return n;
  },
  current(){ return STREAK.currentStreak(); },
  longest(){
    if(!S.stk.days || !S.stk.days.length) return 0;
    const sorted = [...new Set(S.stk.days)].sort();
    let longest = 1, cur = 1;
    for(let i=1;i<sorted.length;i++){
      const prev = new Date(sorted[i-1]);
      const curD = new Date(sorted[i]);
      const diffDays = Math.round((curD-prev)/(24*60*60*1000));
      if(diffDays===1){ cur++; longest=Math.max(longest,cur); }
      else cur = 1;
    }
    return longest;
  },
  renderBar(){
    const el = document.getElementById('sk-bar');
    if(!el) return;
    const days = [];
    const d = new Date();
    for(let i=6;i>=0;i--) days.push(localDateOffset(d,-i));
    el.innerHTML = days.map(ds=>{
      const done = S.stk.days.includes(ds);
      const isToday = ds===today();
      const [yy,mm,dd] = ds.split('-').map(Number);
      const label = new Date(yy,mm-1,dd).toLocaleDateString(undefined,{weekday:'short'})[0];
      return `<div class="sk-d ${done?'done':''} ${isToday?'today':''}">${label}</div>`;
    }).join('');
    const tag = document.getElementById('stk-tag');
    if(tag) tag.textContent = `🔥 ${STREAK.currentStreak()} day streak`;
  }
};

const HOME = {
  render(){
    const h = new Date().getHours();
    const G = [
      {t:'Burning midnight oil?', i:'🌙', r:[0,5]},
      {t:'Good morning!',          i:'🌅', r:[5,12]},
      {t:'Good afternoon!',        i:'☀️', r:[12,17]},
      {t:'Good evening!',          i:'🌆', r:[17,21]},
      {t:'Working late?',          i:'🌙', r:[21,24]}
    ];
    const g = G.find(x=>h>=x.r[0] && h<x.r[1]) || G[1];

    const gt = document.getElementById('greeting-title'); if(gt) gt.textContent = g.t;
    const gi = document.getElementById('greeting-icon');  if(gi) gi.textContent = g.i;
    const gEl = document.getElementById('greeting');
    if(gEl) gEl.textContent = `${S.user?.name||S.user?.username||'Student'} — Nepal Engineering & PSC exam prep.`;

    HOME.updateStats();
    HOME.updateBadges();
    STREAK.renderBar();
    HOME.renderRecent();
    HOME.tickClock();

    if(typeof WEEKLY!=='undefined') WEEKLY._renderHomeCard();
    if(typeof SB_HINTS!=='undefined') SB_HINTS.refresh();
  },

  updateStats(){
    const total = S.prog.total, correct = S.prog.correct, wrong = total - correct;
    const pct = total ? Math.round((correct/total)*100) : 0;
    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent = v; };
    set('hs-tot', total); set('hs-cor', correct); set('hs-wrg', wrong); set('hs-pct', pct+'%');
    HOME._updateStudyTime();
  },

  _updateStudyTime(){
    const el = document.getElementById('hs-time');
    if(!el) return;
    const weekAgo = Date.now() - 7*24*60*60*1000;
    const totalSec = (S.prog.sessions||[])
      .filter(s => s.at >= weekAgo)
      .reduce((sum,s)=> sum + (s.durationSec||0), 0);
    const hrs = Math.floor(totalSec/3600);
    const mins = Math.round((totalSec%3600)/60);
    el.textContent = hrs>0 ? `${hrs}h ${mins}m` : `${mins}m`;
  },

  updateBadges(){
    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent = v; };
    const dueWr = (typeof REV !== 'undefined' && REV.dueCount) ? REV.dueCount() : 0;
    set('bkc', S.bk.length); set('flc', S.fl.length); set('wrc', S.wr.length);
    const wrDueEl = document.getElementById('wrc-due');
    if(wrDueEl) wrDueEl.textContent = dueWr;
    const total = S.bk.length + S.fl.length + dueWr;
    const bnBadge = document.getElementById('bn-badge');
    if(bnBadge){
      if(total>0){ bnBadge.textContent = total>99?'99+':total; bnBadge.style.display=''; }
      else bnBadge.style.display='none';
    }
    set('nav-bk-badge', S.bk.length);
    set('nav-fl-badge', S.fl.length);
    set('nav-wr-badge', S.wr.length);
    const oldDueBadge = document.getElementById('nav-wr-due-badge');
    if(oldDueBadge){ oldDueBadge.textContent = dueWr; oldDueBadge.style.display = dueWr>0?'':'none'; }
  },

  renderRecent(){
    const el = document.getElementById('recent-sessions');
    if(!el) return;
    const sessions = (S.prog.sessions||[]).slice(0,6);
    if(!sessions.length){
      el.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-trend-up"></i></div><p>No sessions yet — start a quiz!</p></div>';
      return;
    }
    const mIc = m => m==='exam' ? '<i class="ph ph-note-pencil"></i>'
                    : m==='flashcard' ? '<i class="ph ph-lightning"></i>'
                    : '<i class="ph ph-chart-bar"></i>';
    el.innerHTML = sessions.map(s=>{
      const ic = (s.chapter||'').includes('Wrong')     ? '<i class="ph ph-x-circle"></i>'
               : (s.chapter||'').includes('Daily')     ? '<i class="ph ph-star"></i>'
               : (s.chapter||'').includes('Bookmarks') ? '<i class="ph ph-star"></i>'
               : mIc(s.mode);
      const cls = s.pct>=70?'tg':s.pct>=40?'ta':'tr';
      const dt = new Date(s.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return `<div class="sess-row"><span class="sess-ic">${ic}</span><div class="sess-info"><div class="sess-ch">${esc(s.chapter||'Study')}</div><div class="sess-ts">${dt}</div></div><span class="ctag ${cls}">${s.pct}%</span></div>`;
    }).join('');
  },

  _clockTimer:null,
  tickClock(){
    if(HOME._clockTimer) clearInterval(HOME._clockTimer);
    const tick = ()=>{
      const now = new Date();
      const cl = document.getElementById('hclock'); if(cl) cl.textContent = now.toLocaleTimeString();
      const dt = document.getElementById('hdate');   if(dt) dt.textContent = now.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      TT.renderCurrentSessionWidget('h-session');
    };
    tick();
    HOME._clockTimer = setInterval(tick, 1000);
  }
};

const TT = {
  add(){
    const day = Number(document.getElementById('tt-day')?.value);
    const nameEl = document.getElementById('tt-name');
    const startEl = document.getElementById('tt-s');
    const endEl = document.getElementById('tt-e');
    if(nameEl && startEl && endEl){
      const name = nameEl.value.trim();
      const start = startEl.value;
      const end = endEl.value;
      if(!name || !start || !end){ toast('Fill in all fields'); return; }
      S.tt.sessions.push({id: Date.now()+'', day, name, start, end});
      _save(LS.TT, S.tt);
      nameEl.value = '';
      TT.render();
      toast('✅ Session added');
      return;
    }
    const timeEl = document.getElementById('tt-time');
    const labelEl = document.getElementById('tt-label');
    if(timeEl && labelEl){
      const time = timeEl.value;
      const label = labelEl.value.trim();
      if(!time){ toast('Pick a time'); return; }
      S.tt.sessions.push({
        id: Date.now()+'_'+Math.random().toString(36).slice(2),
        day, time, label,
        name: label || 'Study', start: time, end: ''
      });
      _save(LS.TT, S.tt);
      labelEl.value = '';
      TT.render();
      toast('✅ Session added');
    }
  },
  remove(id){
    S.tt.sessions = (S.tt.sessions||[]).filter(s=>s.id!==id);
    _save(LS.TT, S.tt);
    TT.render();
  },
  _reminderTimer:null,
  _notifiedToday:null,
  _lastCheckedDay:null,

  async toggleReminders(enabled){
    if(enabled){
      if(!('Notification' in window)){
        toast('❌ Notifications aren\'t supported in this browser');
        const t = document.getElementById('tt-remind-toggle'); if(t) t.checked = false;
        const t2 = document.getElementById('tt-reminders-toggle'); if(t2) t2.checked = false;
        return;
      }
      let perm = Notification.permission;
      if(perm === 'default') perm = await Notification.requestPermission();
      if(perm !== 'granted'){
        toast('❌ Notifications blocked — enable them in your browser/site settings');
        const t = document.getElementById('tt-remind-toggle'); if(t) t.checked = false;
        const t2 = document.getElementById('tt-reminders-toggle'); if(t2) t2.checked = false;
        return;
      }
    }
    S.tt.reminders.enabled = enabled;
    _save(LS.TT, S.tt);
    TT._startReminderChecker();
    toast(enabled ? '🔔 Reminders on' : '🔕 Reminders off');
  },
  setLeadMinutes(mins){
    const n = Math.max(0, Math.min(60, Number(mins)||0));
    S.tt.reminders.leadMinutes = n;
    _save(LS.TT, S.tt);
  },
  _startReminderChecker(){
    if(TT._reminderTimer) clearInterval(TT._reminderTimer);
    if(!S.tt.reminders.enabled) return;
    TT._loadNotifiedToday();
    TT._checkReminders();
    TT._reminderTimer = setInterval(TT._checkReminders, 20000);
  },
  _todayKey(){ return today(); },
  _loadNotifiedToday(){
    const saved = _load(LS.TT_NOTIFIED, {date:'', ids:[]});
    TT._notifiedToday = (saved.date === TT._todayKey()) ? new Set(saved.ids) : new Set();
  },
  _saveNotifiedToday(){
    _save(LS.TT_NOTIFIED, {date: TT._todayKey(), ids:[...TT._notifiedToday]});
  },
  async _checkReminders(){
    if(!S.tt.reminders.enabled) return;
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    if(!TT._notifiedToday) TT._loadNotifiedToday();
    const now = new Date();
    const todayKey = TT._todayKey();
    if(TT._lastCheckedDay !== todayKey){ TT._lastCheckedDay = todayKey; TT._loadNotifiedToday(); }

    const lead = S.tt.reminders.leadMinutes || 0;
    const nowMs = now.getTime();
    const todayDay = now.getDay();

    for(const s of (S.tt.sessions||[])){
      if(s.day !== todayDay) continue;
      const start = s.start || s.time;
      if(!start) continue;
      const dedupKey = `${todayKey}_${s.id}`;
      if(TT._notifiedToday.has(dedupKey)) continue;
      const [h,m] = start.split(':').map(Number);
      const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
      const fireAt = startMs - lead*60000;
      if(nowMs >= fireAt && nowMs < startMs + 5*60000){
        TT._fireReminder(s, lead);
        TT._notifiedToday.add(dedupKey);
        TT._saveNotifiedToday();
      }
    }
  },
  async _fireReminder(s, lead){
    const name = s.name || s.label || 'Study session';
    const title = lead > 0 ? `Starting in ${lead} min: ${name}` : `Now: ${name}`;
    const body = s.end ? `${s.start}–${s.end}` : (s.time || '');
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.ready){
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, { body, icon:'./icon-192.png', tag:'tt-'+s.id });
      } else {
        new Notification(title, { body, icon:'./icon-192.png' });
      }
    }catch(e){ }
  },
  _clockTimer:null,
  render(){
    const t1 = document.getElementById('tt-remind-toggle');   if(t1) t1.checked = !!S.tt.reminders.enabled;
    const t2 = document.getElementById('tt-reminders-toggle'); if(t2) t2.checked = !!S.tt.reminders.enabled;
    const leadEl = document.getElementById('tt-remind-lead');
    if(leadEl) leadEl.value = S.tt.reminders.leadMinutes ?? 5;

    TT._startReminderChecker();
    if(TT._clockTimer) clearInterval(TT._clockTimer);

    const tick = ()=>{
      const now = new Date();
      const cl = document.getElementById('tt-clock'); if(cl) cl.textContent = now.toLocaleTimeString();
      const dt = document.getElementById('tt-date');  if(dt) dt.textContent = now.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      TT.renderCurrentSessionWidget('tt-now');
    };
    tick();
    TT._clockTimer = setInterval(tick, 1000);

    const todayDay = new Date().getDay();
    const nowHHMM = new Date().toTimeString().slice(0,5);

    const sessionStart = s => s.start || s.time || '00:00';
    const sessionEnd   = s => s.end   || '23:59';
    const sessionName  = s => s.name  || s.label || 'Study';

    const todayEl = document.getElementById('tt-today');
    if(todayEl){
      const todaySessions = (S.tt.sessions||[]).filter(s=>s.day===todayDay).sort((a,b)=>sessionStart(a).localeCompare(sessionStart(b)));
      todayEl.innerHTML = todaySessions.length ? todaySessions.map(s=>{
        const isNow = sessionStart(s)<=nowHHMM && nowHHMM<sessionEnd(s);
        return `
        <div class="tt-row" style="${isNow?'background:rgba(245,166,35,.08);border-radius:8px;padding-left:.4rem':''}">
          <div class="tt-ti">${sessionStart(s)}${s.end?'–'+s.end:''}</div>
          <div class="tt-na">${isNow?'<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ros);margin-right:.35rem"></span>':''}${esc(sessionName(s))}</div>
          <button class="ib" onclick='TT.remove(${JSON.stringify(String(s.id))})' title="Remove this slot" aria-label="Remove this slot"><i class="ph ph-trash"></i></button>
        </div>`;
      }).join('') : '<div class="empty"><div class="empty-i"><i class="ph ph-calendar-blank"></i></div><p>Nothing scheduled today</p></div>';
    }

    const weekEl = document.getElementById('tt-week');
    if(weekEl){
      const todayIdx = new Date().getDay();
      weekEl.innerHTML = `
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <div style="display:grid;grid-template-columns:repeat(7,minmax(78px,1fr));gap:4px;margin-bottom:.5rem;min-width:560px">
          ${DAYS.map((d,i)=>`
            <div style="text-align:center;font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.6px;
              color:${i===todayIdx?'var(--neon)':'var(--t3)'};
              padding:.3rem .2rem;
              border-bottom:2px solid ${i===todayIdx?'var(--neon)':'var(--bd)'}">
              ${d.slice(0,3)}
            </div>
          `).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,minmax(78px,1fr));gap:4px;align-items:start;min-width:560px">
          ${DAYS.map((d,di)=>{
            const sess = (S.tt.sessions||[]).filter(s=>s.day===di).sort((a,b)=>sessionStart(a).localeCompare(sessionStart(b)));
            const isToday = di===todayIdx;
            return `<div style="min-height:60px;background:${isToday?'rgba(0,229,255,.04)':'var(--bg1)'};border-radius:var(--r1);border:1px solid ${isToday?'rgba(0,229,255,.18)':'var(--bd)'};padding:.3rem .25rem">
              ${sess.length ? sess.map(s=>`
                <div style="background:${isToday?'rgba(0,229,255,.1)':'var(--surf2)'};border:1px solid ${isToday?'rgba(0,229,255,.25)':'var(--bd)'};border-radius:6px;padding:.28rem .35rem;margin-bottom:3px;cursor:default"
                  title="${esc(sessionName(s))} ${sessionStart(s)}${s.end?'–'+s.end:''}">
                  <div style="font-size:.6rem;font-weight:700;color:${isToday?'var(--neon)':'var(--t3)'}">${sessionStart(s)}</div>
                  <div style="font-size:.65rem;font-weight:600;color:var(--t1);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(sessionName(s))}</div>
                  <button onclick='TT.remove(${JSON.stringify(String(s.id))})' style="background:none;border:none;color:var(--t3);font-size:.65rem;cursor:pointer;padding:0;float:right"><i class="ph ph-x"></i></button>
                </div>
              `).join('') : `<div style="text-align:center;color:var(--t3);font-size:.6rem;margin-top:.5rem">—</div>`}
            </div>`;
          }).join('')}
        </div>
        </div>
      `;
    }
  },

  renderCurrentSessionWidget(elId){
    const el = document.getElementById(elId);
    if(!el) return;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0,5);
    const todayDay = now.getDay();
    const sessionStart = s => s.start || s.time || '00:00';
    const sessionEnd   = s => s.end   || '23:59';
    const sessionName  = s => s.name  || s.label || 'Study';

    const active = (S.tt.sessions||[]).find(s=>s.day===todayDay && sessionStart(s)<=hhmm && hhmm<sessionEnd(s));
    const next   = (S.tt.sessions||[])
      .filter(s=>s.day===todayDay && sessionStart(s)>hhmm)
      .sort((a,b)=>sessionStart(a).localeCompare(sessionStart(b)))[0];

    if(active){
      el.innerHTML = `<div class="tt-now"><div class="tt-nl">Now</div><div class="tt-nn">${esc(sessionName(active))}</div><div class="tt-nt">until ${active.end || active.time || ''}</div></div>`;
    } else if(next){
      el.innerHTML = `<div class="tt-now"><div class="tt-nl">Next</div><div class="tt-nn">${esc(sessionName(next))}</div><div class="tt-nt">starts ${sessionStart(next)}</div></div>`;
    } else {
      el.innerHTML = `<div style="font-size:.74rem;color:var(--t3);text-align:center;padding:.4rem 0">No more sessions today</div>`;
    }
  },

  exportICS(){
    const sess = (S.tt.sessions || []).filter(s => (s.start || s.time));
    if(!sess.length){ toast('Add a session to your study plan first.'); return; }
    const pad = n => String(n).padStart(2, '0');
    const codes = ['SU','MO','TU','WE','TH','FR','SA'];
    const clean = t => String(t).replace(/([,;\\])/g, '\\$1').replace(/[\r\n]+/g, ' ');
    const lead = Math.max(0, Number(S.tt.reminders && S.tt.reminders.leadMinutes) || 5);
    const now = new Date();
    const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Abhyas//Study plan//EN', 'CALSCALE:GREGORIAN'];
    sess.forEach(s => {
      const st = String(s.start || s.time).split(':').map(Number);
      const en = s.end ? String(s.end).split(':').map(Number) : [(st[0] + 1) % 24, st[1]];
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() + (((Number(s.day) || 0) - d.getDay() + 7) % 7));
      const ymd = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
      lines.push('BEGIN:VEVENT', 'UID:abhyas-' + s.id + '@app.mku.name.np', 'DTSTAMP:' + stamp,
        'DTSTART:' + ymd + 'T' + pad(st[0]) + pad(st[1]) + '00',
        'DTEND:' + ymd + 'T' + pad(en[0]) + pad(en[1]) + '00',
        'RRULE:FREQ=WEEKLY;BYDAY=' + codes[Number(s.day) || 0],
        'SUMMARY:' + clean((s.name || s.label || 'Study') + ' (Abhyas)'),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Study session', 'TRIGGER:-PT' + lead + 'M', 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], {type:'text/calendar'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'abhyas-study-plan.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Open the file to add your study plan to your calendar.', 4500);
  },
  exportJ(){
    const blob = new Blob([JSON.stringify(S.tt,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable.json';
    a.click();
  },
  importJ(){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = ()=>{
      const f = inp.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = e=>{
        try{
          const data = JSON.parse(e.target.result);
          if(data && Array.isArray(data.sessions)){
            S.tt = data;
            if(!S.tt.reminders) S.tt.reminders = {enabled:false, leadMinutes:5};
            _save(LS.TT, S.tt);
            TT.render();
            toast('✅ Timetable imported');
          } else toast('❌ Invalid timetable file');
        }catch{ toast('❌ Invalid JSON'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }
};

const CACHE = {
  async render(){
    const refs = ChapterData.allFileRefs();
    const cachedKeys = new Set(await QDB.keys());
    const _isCached = key => cachedKeys.has(key);
    const _as = document.getElementById('autosync-toggle');
    if(_as) _as.checked = !!_load('abhyas_autosync', false);

    const tag = document.getElementById('cache-tag');
    const txt = document.getElementById('cache-txt');
    const grid = document.getElementById('cache-grid');
    if(tag && txt && grid){
      let cachedCount = 0;
      refs.forEach(r=>{ if(_isCached(r.key)) cachedCount++; });
      tag.textContent = cachedCount===refs.length && refs.length ? 'Fully cached'
                      : cachedCount>0 ? 'Partially cached'
                      : 'Not cached';
      tag.className = 'ctag ' + (cachedCount===refs.length && refs.length ? 'tg' : cachedCount>0 ? 'ta' : 'tr');
      txt.textContent = `${cachedCount} of ${refs.length} question ${refs.length===1?'set':'sets'} cached on this device for offline use.`;
      const levels = ChapterData.levels();
      const picked = new Set(CACHE._picked(levels));
      grid.innerHTML = levels.map(lv=>{
        const lvRefs = refs.filter(r=>r.lv===lv);
        const lvCached = lvRefs.filter(r=>_isCached(r.key)).length;
        return `<label class="ci" style="cursor:pointer;display:block">
          <div class="flex center between" style="gap:var(--sp-2)">
            <div class="ci-n" style="margin:0">${esc(ChapterData.levelLabel(lv))}</div>
            <input type="checkbox" class="dl-group" value="${esc(lv)}" ${picked.has(lv)?'checked':''} aria-label="Select ${esc(ChapterData.levelLabel(lv))} for download" onchange="CACHE.pick()">
          </div>
          <div class="ci-s"><div class="cd ${lvCached===lvRefs.length&&lvRefs.length?'y':'n'}"></div>${lvCached}/${lvRefs.length} cached</div></label>`;
      }).join('');
      CACHE._syncPickBtn(refs, cachedKeys);
    }

    const el = document.getElementById('cache-list');
    if(el){
      const keys = await QDB.keys();
      if(!keys.length){
        el.innerHTML = `<div class="empty"><div class="empty-i"><i class="ph ph-cloud-slash"></i></div><p>Nothing cached yet</p><p style="font-size:.72rem;color:var(--t3);margin-top:.15rem">Open any chapter while online to cache it automatically, or use "Cache All" below.</p></div>`;
      } else {
        el.innerHTML = keys.map(k=>{
          const parts = k.split('_');
          const label = parts.length>=4 ? `${parts[0]} · Ch${parts[1]} · ${parts[2]} · ${parts[3]}` : k;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .6rem;background:var(--b0);border-radius:8px;margin-bottom:.3rem;font-size:.78rem">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1"><i class="ph ph-package"></i> ${esc(label)}</div>
            <button class="ib cache-rm-btn" data-key="${escAttrJs(k)}" title="Remove from cache" aria-label="Remove from cache"><i class="ph ph-trash"></i></button>
          </div>`;
        }).join('');
        el.querySelectorAll('.cache-rm-btn').forEach(btn=>{
          btn.onclick = ()=> CACHE.remove(btn.dataset.key);
        });
      }
    }
  },

  async remove(key){
    await QDB.del(key);
    CACHE.render();
    toast('🗑 Removed from offline cache');
  },
  async clearAll(){
    if(!(await ASK.confirm({title:'Remove all downloads?', body:'You will need to be online to study again until you download the chapters again.', ok:'Remove all', danger:true}))) return;
    await QDB.clear();
    CACHE.render();
    toast('🗑 Offline cache cleared');
  },
  async clr(){ return CACHE.clearAll(); },

  /* Which download groups (level5 / level7 / gk) are ticked. Remembered on this device. */
  _picked(levels){
    const all = levels || ChapterData.levels();
    const saved = _load('abhyas_dl_groups', null);
    return Array.isArray(saved) ? saved.filter(lv => all.includes(lv)) : [];
  },
  pick(){
    const ticked = [...document.querySelectorAll('#cache-grid .dl-group:checked')].map(i => i.value);
    _save('abhyas_dl_groups', ticked);
    CACHE.render();
  },
  async _syncPickBtn(refs, cachedKeys){
    const btn = document.getElementById('dl-selected-btn');
    if(!btn) return;
    refs = refs || ChapterData.allFileRefs();
    cachedKeys = cachedKeys || new Set(await QDB.keys());
    const picked = new Set(CACHE._picked());
    const chosen = refs.filter(r => picked.has(r.lv));
    const missing = chosen.filter(r => !cachedKeys.has(r.key)).length;
    btn.disabled = !picked.size;
    btn.innerHTML = '<i class="ph ph-download-simple"></i> ' + (!picked.size ? 'Pick a group to download'
      : missing ? `Download selected (${missing} new)` : 'Selected groups already saved');
  },
  async dlSelected(){
    const picked = CACHE._picked();
    if(!picked.length){ toast('Tick Level 5, Level 7 or GK first'); return; }
    return CACHE.dl(picked);
  },

  /* Speed of the offline download (v1.34).
     Apps Script answers one request in about 1-4 s, so asking for one file at a time wastes most of the wait.
     The download therefore asks for BATCH_SIZE files per request (server action getFiles, at most 8) and keeps
     BATCH_WORKERS such requests going at once. Requests are still paced by GETFILE_GATE (45 a minute), and the server
     also limits each student to 360 files a minute. If the server is an older version without getFiles, the download
     falls back to one file per request with CONCURRENCY requests at once. Fewer workers on data saver or a 2G line. */
  CONCURRENCY: 4,
  BATCH_SIZE: 12,
  BATCH_WORKERS: 4,
  _noBatch: false,
  _poolSize(){
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(c && (c.saveData || /^(slow-2g|2g)$/i.test(c.effectiveType||''))) return 2;
    return CACHE._noBatch ? CACHE.CONCURRENCY : CACHE.BATCH_WORKERS;
  },

  async dl(groups){
    const only = Array.isArray(groups) && groups.length ? new Set(groups) : null;
    const refs = ChapterData.allFileRefs().filter(r => !only || only.has(r.lv));
    if(!refs.length){ toast('No content configured to cache'); return; }
    if(!S.online){ toast('❌ You need to be online to download the cache'); return; }
    const pb = document.getElementById('cpb');
    const pf = document.getElementById('cpf');
    const txt = document.getElementById('cptxt');
    if(pb) pb.style.display = '';
    let done = 0, failed = 0, fetched = 0, fatal = '', rlStreak = 0;
    const startedAt = Date.now();
    const etaText = () => {
      if(fetched < 3) return '';
      const perFile = (Date.now() - startedAt) / fetched;      /* wall-clock per file, so it already reflects the parallelism */
      const leftSec = Math.round((refs.length - done) * perFile / 1000);
      if(leftSec < 45) return ' · under a minute left';
      return ` · about ${Math.ceil(leftSec/60)} min left`;
    };
    if(CACHE._running){ toast('A download is already running'); return; }
    CACHE._running = true; CACHE._paused = false; CACHE._stop = false;
    CACHE._ctl(true);
    const paint = () => {
      if(txt) txt.textContent = `Downloading ${Math.min(done+1, refs.length)} of ${refs.length}${etaText()}`;
      if(pf) pf.style.width = `${(done/refs.length)*100}%`;
    };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    /* errors that every remaining file would hit too: stop at once instead of failing each one */
    const isFatal = m => /session expired|access has ended/i.test(m || '');
    const isValid = v => !!v && !(typeof v === 'object' && !Array.isArray(v) && v.success === false);
    const queue = refs.slice();

    /* one file by itself, with one retry (this is also the path used when a batch could not deliver a file) */
    const single = async ref => {
      try{
        await QUIZ._fetch(ref.fid, ref.key);
        fetched++;
      }catch(err){
        if(isFatal(err && err.message)){ fatal = err.message; failed++; CACHE._stop = true; done++; paint(); return; }
        if(txt) txt.textContent = `Retrying ${ref.subtopic || ref.name}…`;
        try{
          await sleep(2000);
          await QUIZ._fetch(ref.fid, ref.key);
          fetched++;
        }catch(err2){
          failed++;
          if(isFatal(err2 && err2.message)){ fatal = err2.message; CACHE._stop = true; }
        }
      }
      done++;
      paint();
    };
    const singles = async list => { for(const ref of list){ if(CACHE._stop) return; await single(ref); } };

    /* up to `size` files that are not saved yet; files already on the device are counted without any request */
    const nextBatch = async size => {
      const batch = [];
      while(batch.length < size && queue.length){
        const ref = queue.shift();
        if(isValid(await QDB.get(ref.key))){ done++; paint(); continue; }
        batch.push(ref);
      }
      return batch;
    };

    const worker = async () => {
      for(;;){
        while((CACHE._paused || !S.online || S.forcedOffline) && !CACHE._stop){
          if(txt && !CACHE._paused) txt.textContent = `Waiting for your connection… ${done} of ${refs.length} saved so far`;
          await sleep(500);
        }
        if(CACHE._stop) return;
        const batch = await nextBatch(CACHE._noBatch ? 1 : CACHE.BATCH_SIZE);
        if(!batch.length){ if(queue.length) continue; return; }
        paint();
        if(batch.length === 1){ await single(batch[0]); continue; }

        let res;
        try{
          res = await QUIZ._fetchBatch(batch);
        }catch(err){
          if(isFatal(err && err.message)){
            fatal = err.message; CACHE._stop = true;
            failed += batch.length; done += batch.length; paint();
            return;
          }
          await singles(batch);            /* network trouble: the one-by-one path retries and waits properly */
          continue;
        }
        if(res.unsupported){ CACHE._noBatch = true; await singles(batch); continue; }
        if(res.rateLimited){
          if(++rlStreak > 6){ failed += batch.length; done += batch.length; paint(); continue; }
          queue.unshift(...batch);
          if(txt) txt.textContent = `Server is busy — waiting ${res.waitSec}s…`;
          await sleep(res.waitSec * 1000);
          continue;
        }
        rlStreak = 0;
        done += res.saved.length; fetched += res.saved.length;
        if(res.deferred.length) queue.unshift(...res.deferred);   /* left out by the server to keep its answer small */
        paint();
        for(const f of res.failed){
          if(CACHE._stop) break;
          if(f.storageFull){ failed++; done++; paint(); continue; }
          await single(f.ref);
        }
      }
    };
    paint();
    await Promise.all(Array.from({length: Math.min(CACHE._poolSize(), refs.length)}, worker));
    const stopped = CACHE._stop && done < refs.length;
    CACHE._running = false; CACHE._paused = false; CACHE._ctl(false);
    const ok = done - failed;
    if(fatal){
      if(txt) txt.textContent = `${fatal} ${ok} of ${refs.length} saved.`;
      toast(`Download stopped — ${fatal}`, 6000);
      CACHE.render();
      return;
    }
    if(stopped){
      if(txt) txt.textContent = `Stopped. ${ok} of ${refs.length} saved. Tap download again to continue where you left off.`;
      toast(`Download stopped — ${ok} of ${refs.length} saved`);
      CACHE.render();
      return;
    }
    if(txt) txt.textContent = failed>0
      ? `Downloaded ${ok} of ${refs.length}. ${failed} did not come through — try again on a steadier connection.`
      : `All ${done} sets${only ? ' in the selected groups' : ''} are on this device.`;
    toast(failed>0 ? `${ok} of ${refs.length} downloaded — ${failed} failed` : (only ? 'Selected groups are downloaded for offline study' : 'Everything is downloaded for offline study'));
    CACHE.render();
  },

  async removeSelected(){
    const picked = new Set(CACHE._picked());
    if(!picked.size){ toast('Tick a group first'); return; }
    const keys = new Set(ChapterData.allFileRefs().filter(r=>picked.has(r.lv)).map(r=>r.key));
    const have = (await QDB.keys()).filter(k=>keys.has(k));
    if(!have.length){ toast('Nothing from those groups is saved on this device'); return; }
    const names = [...picked].map(lv=>ChapterData.levelLabel(lv)).join(', ');
    if(!(await ASK.confirm({title:`Remove ${names} downloads?`, body:`This frees space by removing ${have.length} saved question sets from this device. Your progress stays. You can download them again any time.`, ok:'Remove', danger:true}))) return;
    for(const k of have) await QDB.del(k);
    CACHE.render();
    toast(`🗑 Removed ${have.length} sets`);
  },

  /* While you study one set, quietly save the next set of the same chapter so it opens instantly.
     Skipped on mobile data, data saver, offline, or while a bulk download is running. */
  async prefetchNext(fileId){
    try{
      if(!S.online || S.forcedOffline || CACHE._running) return;
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if(conn && (conn.saveData || conn.type==='cellular' || /^(slow-2g|2g)$/i.test(conn.effectiveType||''))) return;
      const refs = ChapterData.allFileRefs();
      const i = refs.findIndex(r=>r.fid===fileId);
      if(i<0) return;
      const cur = refs[i];
      const next = refs.slice(i+1).find(r=>r.lv===cur.lv && r.ch===cur.ch);
      if(!next) return;
      if((await QDB.keys()).includes(next.key)) return;
      await QUIZ._fetch(next.fid, next.key, 1, 'bg');
    }catch(e){}
  },

  _running:false, _paused:false, _stop:false,
  _ctl(show){
    const box = document.getElementById('dl-ctl');
    if(box) box.style.display = show ? '' : 'none';
    const pb = document.getElementById('dl-pause-btn');
    if(pb) pb.innerHTML = '<i class="ph ph-pause"></i> Pause';
  },
  togglePause(){
    if(!CACHE._running) return;
    CACHE._paused = !CACHE._paused;
    const pb = document.getElementById('dl-pause-btn');
    if(pb) pb.innerHTML = CACHE._paused ? '<i class="ph ph-play"></i> Resume' : '<i class="ph ph-pause"></i> Pause';
    const txt = document.getElementById('cptxt');
    if(txt && CACHE._paused) txt.textContent += ' · paused (your connection is free)';
  },
  stopDl(){ if(CACHE._running){ CACHE._stop = true; CACHE._paused = false; } },

  async purgeStale(){
    let purged = 0;
    const keys = await QDB.keys();
    for(const k of keys){
      const v = await QDB.get(k);
      if(v && typeof v === 'object' && !Array.isArray(v) && v.success === false){
        await QDB.del(k);
        purged++;
      }
    }
    if(purged > 0){ toast(`🧹 Removed ${purged} stale error cache entry${purged>1?'s':''}`); CACHE.render(); }
    else toast('✅ No stale cache entries found');
  },

  async autoSync(){
    if(!_load('abhyas_autosync', false)) return;
    if(!S.online || S.forcedOffline) return;
    const cachedKeys = new Set(await QDB.keys());
    const missing = ChapterData.allFileRefs().filter(r=>!cachedKeys.has(r.key));
    if(!missing.length) return;

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isCellular = conn && (conn.type === 'cellular' || /^(slow-2g|2g|3g)$/i.test(conn.effectiveType || ''));
    const saver = conn && conn.saveData;
    if (isCellular || saver) {
      const lastOffer = _load('abhyas_autosync_offered_at', 0);
      if (Date.now() - lastOffer > 24*60*60*1000) {
        _save('abhyas_autosync_offered_at', Date.now());
        toast(`${missing.length} question sets aren't on this device yet. Open Downloads on Wi-Fi to save them for offline study.`, 7000);
      }
      return;
    }

    const BATCH = 40;
    const batch = missing.slice(0, BATCH);
    CACHE._badge(`Saving for offline · 0/${batch.length}`);
    let done = 0;
    for(const ref of batch){
      try{ await QUIZ._fetch(ref.fid, ref.key, 1, 'bg'); }catch{ }
      done++;
      CACHE._badge(`Saving for offline · ${done}/${batch.length}`);
    }
    CACHE._badge(null);
    if(UI.cur==='offline') CACHE.render();
  },

  _badge(msg){
    let el = document.getElementById('cache-autobadge');
    if(msg===null){ if(el) el.style.display = 'none'; return; }
    if(!el){
      el = document.createElement('div');
      el.id = 'cache-autobadge';
      el.style.cssText = 'position:fixed;bottom:calc(var(--bn-h,0px) + 1rem + var(--safe-b,0px));left:1rem;background:var(--c2);border:1px solid var(--bd);border-radius:999px;padding:.4rem .8rem;font-size:.7rem;color:var(--t2);z-index:9998;box-shadow:var(--sh3);display:flex;align-items:center;gap:.4rem';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'flex';
  }
};

const DATA = {
  exportAll(){
    const payload = {
      exportedAt: new Date().toISOString(),
      version: (typeof APP_VERSION!=='undefined' ? APP_VERSION : 1),
      prog: S.prog,
      chapStats: S.chapStats,
      cov: S.cov,
      bk: S.bk, fl: S.fl, wr: S.wr, stk: S.stk, tt: S.tt,
      weeklyAttempts: S.weeklyAttempts
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abhyas_backup_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📥 Backup downloaded');
  },
  importFile(){
    const input = document.getElementById('data-import-file');
    const file = input?.files?.[0];
    if(!file){ toast('Choose a backup file first'); return; }
    const r = new FileReader();
    r.onload = e=>{
      let data;
      try{ data = JSON.parse(e.target.result); }
      catch{ toast('❌ Invalid backup file'); return; }
      if(!confirm('Import this backup? It will be merged with your current data (existing chapter accuracy is kept if it\'s higher).')) return;
      DATA._applyImport(data);
    };
    r.onerror = ()=>toast('❌ Could not read file');
    r.readAsText(file);
  },

  imp(){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = ()=>{
      const f = inp.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = e=>{
        try{
          const data = JSON.parse(e.target.result);
          DATA._applyImport(data);
        }catch{ toast('❌ Invalid backup file'); }
      };
      r.readAsText(f);
    };
    inp.click();
  },

  /* Loading a backup file ADDS it to what is on this device. It never replaces or removes anything:
     an older file loaded by mistake can no longer wipe newer progress. */
  async _applyImport(data){
    /* a backup loaded on purpose must not be thrown away by an earlier reset */
    const lifted = (typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.liftAll() : false;
    const out = await PSYNC.mergeIn(data, 'before-import');
    if(!out.ok){ toast(out.error, 6000); return; }
    /* the study plan is not part of cloud sync, so a file only fills it in when this device has none */
    if(data.tt && (!S.tt || !(S.tt.sessions || []).length)){
      S.tt = data.tt; if(!S.tt.reminders) S.tt.reminders = {enabled:false,leadMinutes:5}; _save(LS.TT, S.tt);
    }
    if(data.weeklyAttempts && typeof data.weeklyAttempts === 'object'){
      Object.entries(data.weeklyAttempts).forEach(([wid, a])=>{
        if(!S.weeklyAttempts[wid]) S.weeklyAttempts[wid] = a;
      });
      if(typeof WEEKLY !== 'undefined') WEEKLY.attempts = S.weeklyAttempts;
      _save(LS.WK_ATTEMPTS, S.weeklyAttempts);
    }
    const a = out.added, n = a.wr + a.bk + a.fl + a.sessions + a.notes;
    toast(n > 0 ? '\u2705 Backup added to this device. Nothing was removed.' : '\u2705 That backup had nothing new. Nothing was removed.', 5000);
    PSYNC.scheduleSync();
    if(typeof WEEKLY !== 'undefined') WEEKLY._renderHomeCard();
    if(typeof RECOVER !== 'undefined') RECOVER.render();
  },

  async syncNow(){
    if(!S.online){ toast('❌ Need internet to back up'); return; }
    PSYNC._setStatus('Backing up…');
    await PSYNC.pushNow();
  },

  async restoreCloud(){
    if(!S.online){ toast('Need internet to check your cloud backup'); return; }
    PSYNC._setStatus('Checking your cloud backup\u2026');
    await PSYNC.forceRestore();
    if(typeof RECOVER !== 'undefined') RECOVER.render();
  },

  async clearQ(){
    if(!confirm('Clear cached question downloads? Your progress/bookmarks stay intact.')) return;
    await QDB.clear();
    toast('🧹 Question cache cleared');
  },

  async reset(){
    if(!(await ASK.confirm({title:'Reset this device?', body:'This deletes ALL progress, bookmarks, flags, wrong answers and study plan on this device. Your cloud backup is not touched.', ok:'Continue', danger:true}))) return;
    if(!(await ASK.confirm({title:'Are you absolutely sure?', body:'This cannot be undone.', ok:'Yes, reset', danger:true}))) return;
    RESET_SNAPSHOT.save('reset');
    [LS.PROG,LS.BK,LS.FL,LS.WR,LS.TT,LS.STK,LS.CHAPSTATS,LS.EXAM_SNAP,LS.TT_NOTIFIED,LS.FCOUNT,LS.COV].forEach(k=>localStorage.removeItem(k));
    toast('All data reset');
    location.reload();
  },
  async resetCloud(){
    if(!S.user || !S.user.token){ toast('Log in first'); return; }
    if(!S.online || S.forcedOffline){ toast('Go online first. This also clears your cloud copy.'); return; }
    if(!(await ASK.confirm({title:'Reset your progress everywhere?', body:'This deletes your progress, bookmarks, flags and wrong-answer bank from the server and from this device. Other devices keep their local copy until you reset them too. This cannot be undone.', ok:'Reset everywhere', danger:true, requireText:'RESET'}))){ toast('Cancelled. Nothing was changed.'); return; }
    RESET_SNAPSHOT.save('resetCloud');
    let res;
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'resetMyProgress', username:S.user.username, token:S.user.token, confirm:'RESET'})
      }, 30000);
      res = await r.json();
    }catch(e){ toast('Could not reach the server. Nothing was changed.'); return; }
    if(!res || !res.success){ toast((res && res.error) || 'Reset failed'); return; }
    clearTimeout(PSYNC._timer); PSYNC._timer = null;
    S.prog = {total:0,correct:0,sessions:[]}; S.bk = []; S.fl = []; S.wr = [];
    S.stk = {days:[],last:''}; S.chapStats = {}; S.fcount = {}; S.cov = {};
    [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.FCOUNT, LS.EXAM_SNAP, LS.COV].forEach(k=>localStorage.removeItem(k));
    toast('Progress reset everywhere. Reloading…');
    setTimeout(()=>location.reload(), 900);
  },
  async deleteAccount(){
    if(!S.user || !S.user.token){ toast('❌ Log in first'); return; }
    if(!S.online || S.forcedOffline){ toast('❌ Go online first — your account lives on the server'); return; }
    const pwEl = document.getElementById('del-pw');
    const cfEl = document.getElementById('del-typed');
    const password = pwEl ? pwEl.value : '';
    const typed = cfEl ? cfEl.value.trim().toUpperCase() : '';
    if(!password){ toast('Enter your password first'); return; }
    if(typed !== 'DELETE'){ toast('Type DELETE in the box to confirm'); return; }
    if(!(await ASK.confirm({title:'Delete your account?', body:'Your login, progress, payment record, weekly-set attempts and written answers (including uploaded files) are removed from the server. This cannot be undone.', ok:'Delete my account', danger:true}))) return;
    RESET_SNAPSHOT.save('deleteAccount');
    let res;
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'deleteMyAccount', username:S.user.username, token:S.user.token, password, confirm:'DELETE'})
      }, 45000);
      res = await r.json();
    }catch(e){ toast('❌ Could not reach the server — nothing was deleted'); return; }
    if(!res || !res.success){ toast('❌ ' + ((res && res.error) || 'Could not delete the account')); return; }
    clearTimeout(PSYNC._timer); PSYNC._timer = null;
    try{ Object.keys(localStorage).filter(k=>k.indexOf('abhyas')===0).forEach(k=>localStorage.removeItem(k)); }catch(e){}
    try{ await QDB.clear(); }catch(e){}
    toast('✅ Account deleted');
    setTimeout(()=>{ window.location.href = 'index.html'; }, 1200);
  }
};

/* ═══════════════ PROGRESS RESET (v1.33) ═══════════════
   Scoped resets with a backup offer, a typed confirmation and a 24-hour undo. Every reset leaves a marker
   (see mergeResets in shared.js) so the next sync cannot bring the old data back.
   Bookmarks, flags, notes, downloaded PDFs, reports and the study plan are never touched. */
const PROGRESS_RESET = {
  KEY: 'abhyas_resets',
  SCOPES: {
    all:    { label:'Reset all progress',  word:'START FRESH', help:'Questions answered, accuracy, chapter coverage, wrong bank, exam history, study days and the 60-day sprint all go back to zero.' },
    wr:     { label:'Only the wrong bank', word:'RESET',       help:'Empties the wrong bank. Your accuracy, chapters and exam history stay.' },
    sprint: { label:'Only the 60-day sprint', word:'RESET',    help:'Restarts the sprint from Day 1 today. Nothing else changes.' },
    chapter:{ label:'Only one chapter',    word:'RESET',       help:'Clears that chapter\u2019s accuracy, coverage, sessions and wrong-bank questions.' },
    exams:  { label:'Only exam history',   word:'RESET',       help:'Removes past timed-exam results from your history. Weekly-test results are kept (they are ranked on the server).' }
  },

  load(){ try { const v = JSON.parse(localStorage.getItem(this.KEY) || '{}'); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch(e){ return {}; } },
  save(r){ try { localStorage.setItem(this.KEY, JSON.stringify(r || {})); } catch(e){} },

  /* one question left the wrong bank (removed, or graduated after the 14-day review) */
  noteRemoved(uid){
    if(!uid) return;
    const r = this.load(); r.rm = r.rm || {};
    r.rm[String(uid)] = Date.now();
    const keys = Object.keys(r.rm);
    if(keys.length > 400){ keys.sort((x,y)=>r.rm[y]-r.rm[x]); const t = {}; keys.slice(0,400).forEach(k=>{ t[k] = r.rm[k]; }); r.rm = t; }
    this.save(r);
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
  },
  /* the whole wrong bank was cleared; returns the marker time so an undo can lift it */
  noteWrongCleared(){
    const T = Date.now(), r = this.load(); r.wr = T; this.save(r);
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return T;
  },
  /* undo: ignore the markers made at these times, everywhere */
  lift(times){
    const list = (times || []).map(Number).filter(v => v > 0);
    if(!list.length) return;
    const r = this.load();
    r.un = Array.from(new Set((r.un || []).concat(list))).slice(-40);
    ['all','wr','exams','sprint'].forEach(k => { if(list.indexOf(r[k]) !== -1) delete r[k]; });
    ['ch','rm'].forEach(k => { if(!r[k]) return; Object.keys(r[k]).forEach(id => { if(list.indexOf(r[k][id]) !== -1) delete r[k][id]; }); if(!Object.keys(r[k]).length) delete r[k]; });
    this.save(r);
  },
  /* loading an older backup file on purpose: its data must not be thrown away by an earlier reset */
  liftAll(){
    const r = this.load(), t = [];
    ['all','wr','exams','sprint'].forEach(k => { if(r[k]) t.push(r[k]); });
    ['ch','rm'].forEach(k => { Object.keys(r[k] || {}).forEach(id => t.push(r[k][id])); });
    this.lift(t);
    return t.length > 0;
  },

  chapters(){
    const out = [], seen = new Set();
    try {
      (ChapterData.allFileRefs() || []).forEach(ref => {
        const label = `${ChapterData.chapterName(ref.lv, ref.ch)} \u2014 ${ref.book}`;
        if(seen.has(label)) return;
        seen.add(label);
        out.push({ label, fids: (ChapterData.allFileRefs() || []).filter(r => `${ChapterData.chapterName(r.lv, r.ch)} \u2014 ${r.book}` === label).map(r => r.fid) });
      });
    } catch(e){}
    /* also offer chapters that only exist in the saved stats (a file that is no longer listed) */
    Object.keys(S.chapStats || {}).forEach(k => { if(!seen.has(k)){ seen.add(k); out.push({ label:k, fids:[] }); } });
    return out.sort((x,y)=>x.label.localeCompare(y.label));
  },

  _day(){ const d = new Date(), p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); },

  /* Does the work. Returns the marker time, or 0 when nothing was done. */
  run(scope, chapterLabel){
    if(!this.SCOPES[scope]) return 0;
    const T = Date.now();
    let chapter = null;
    if(scope === 'chapter'){
      chapter = this.chapters().find(c => c.label === chapterLabel);
      if(!chapter) return 0;
    }
    RESET_SNAPSHOT.save('scoped:' + scope, [T]);
    const r = this.load();
    if(scope === 'all'){
      S.prog = Object.assign({}, S.prog, { total:0, correct:0, sessions:[], gen:T });
      S.chapStats = {}; S.cov = {}; S.wr = []; S.stk = {days:[], last:''}; S.fcount = {};
      try { localStorage.setItem('abhyas_sprint_start', this._day()); } catch(e){}
      try { localStorage.removeItem('abhyas_sprint_off'); } catch(e){}
      r.all = T; r.sprint = T;
    } else if(scope === 'wr'){
      S.wr = []; r.wr = T;
    } else if(scope === 'sprint'){
      try { localStorage.setItem('abhyas_sprint_start', this._day()); localStorage.removeItem('abhyas_sprint_off'); } catch(e){}
      r.sprint = T;
    } else if(scope === 'exams'){
      S.prog.sessions = (S.prog.sessions || []).filter(s => !(s && s.mode === 'exam'));
      r.exams = T;
    } else if(scope === 'chapter'){
      const fids = new Set(chapter.fids), label = chapter.label;
      S.prog.sessions = (S.prog.sessions || []).filter(s => !(s && (fids.has(s.fid) || s.chapter === label)));
      delete S.chapStats[label];
      fids.forEach(f => { delete S.cov[f]; });
      S.wr = (S.wr || []).filter(q => !fids.has(q.fileId));
      r.ch = r.ch || {}; r.ch[label] = T; fids.forEach(f => { r.ch[f] = T; });
    }
    this.save(r);
    _save(LS.PROG, S.prog); _save(LS.CHAPSTATS, S.chapStats); _save(LS.COV, S.cov);
    _save(LS.WR, S.wr); _save(LS.STK, S.stk); _save(LS.FCOUNT, S.fcount);
    try { localStorage.removeItem(LS.EXAM_SNAP); } catch(e){}
    try { if(typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; if(typeof QHIST !== 'undefined') QHIST._cache = null; } catch(e){}
    try { HOME.render(); PROG.render(); HOME.updateBadges(); REV.renderList('wr'); if(typeof SPRINT !== 'undefined') SPRINT.render(); } catch(e){}
    try { RESET_SNAPSHOT.renderCard(); } catch(e){}
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return T;
  },

  /* ── the dialog ── */
  _scope: 'all',
  open(){
    this._scope = 'all';
    const opts = Object.keys(this.SCOPES).map(k => {
      const s = this.SCOPES[k];
      return `<label class="pr-opt"><input type="radio" name="pr-scope" value="${k}"${k==='all'?' checked':''} onchange="PROGRESS_RESET._pick('${k}')"><span><b>${esc(s.label)}</b><span class="t-foot" style="display:block">${esc(s.help)}</span></span></label>`;
    }).join('');
    const chs = this.chapters().map(c => `<option value="${esc(c.label)}">${esc(c.label)}</option>`).join('');
    openMod('Reset progress', `
      <p class="t-callout mb3">Bookmarks, flags, notes, downloaded PDFs and your reports are <b>never</b> removed.</p>
      <div class="pr-list" role="radiogroup" aria-label="What to reset">${opts}</div>
      <div id="pr-chapter-row" style="display:none;margin:var(--sp-2) 0"><label class="t-foot" for="pr-chapter">Chapter</label>
        <select class="input" id="pr-chapter">${chs || '<option value="">No chapters yet</option>'}</select></div>
      <div class="t-foot" style="margin:var(--sp-3) 0 var(--sp-1)"><b>Back up first</b> (recommended)</div>
      <div class="bg" style="margin-bottom:var(--sp-1)">
        <button type="button" class="btn btn-quiet btn-sm" onclick="PROGRESS_RESET._backupFile()"><i class="ph ph-download-simple"></i> Download backup (JSON)</button>
        <button type="button" class="btn btn-quiet btn-sm" onclick="PROGRESS_RESET._backupCloud()"><i class="ph ph-cloud-arrow-up"></i> Back up to cloud</button>
      </div>
      <div id="pr-backup-msg" class="t-foot" aria-live="polite" style="min-height:1.2em">No backup made yet. A 24-hour undo copy is kept on this device either way.</div>
      <label class="t-foot" for="pr-typed" style="display:block;margin-top:var(--sp-3)" id="pr-typed-lbl">Type START FRESH to confirm</label>
      <input class="input" id="pr-typed" autocomplete="off" autocapitalize="characters" oninput="PROGRESS_RESET._check()" style="margin:var(--sp-1) 0 var(--sp-3)">
      <div class="bg"><button type="button" class="btn btn-r" id="pr-go" disabled onclick="PROGRESS_RESET._go()"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
      <button type="button" class="btn btn-quiet" onclick="closeMod()">Cancel</button></div>`);
  },
  _pick(k){
    this._scope = k;
    const row = document.getElementById('pr-chapter-row'); if(row) row.style.display = (k === 'chapter') ? '' : 'none';
    const lbl = document.getElementById('pr-typed-lbl'); if(lbl) lbl.textContent = 'Type ' + this.SCOPES[k].word + ' to confirm';
    const t = document.getElementById('pr-typed'); if(t) t.value = '';
    this._check();
  },
  _check(){
    const t = document.getElementById('pr-typed'), go = document.getElementById('pr-go');
    if(!t || !go) return;
    const word = this.SCOPES[this._scope].word;
    const chOk = this._scope !== 'chapter' || !!(document.getElementById('pr-chapter') || {}).value;
    go.disabled = !(chOk && t.value.trim().toUpperCase() === word);
  },
  _backupFile(){
    try { DATA.exportAll(); this._msg('Backup file downloaded. Keep it somewhere safe.'); } catch(e){ this._msg('Could not make the file. Try again.'); }
  },
  async _backupCloud(){
    if(!S.user || !S.user.token){ this._msg('Log in to back up to the cloud.'); return; }
    if(!S.online || S.forcedOffline){ this._msg('You are offline. Download the file instead.'); return; }
    this._msg('Backing up\u2026');
    try { await PSYNC.pushNow(); this._msg('Cloud backup done.'); } catch(e){ this._msg('Cloud backup failed. Download the file instead.'); }
  },
  _msg(t){ const el = document.getElementById('pr-backup-msg'); if(el) el.textContent = t; },
  _go(){
    const scope = this._scope;
    const ch = (document.getElementById('pr-chapter') || {}).value || '';
    const T = this.run(scope, ch);
    closeMod();
    if(!T){ toast('Nothing was reset.'); return; }
    toastUndo('Reset done: ' + this.SCOPES[scope].label.replace(/^Reset /,'').toLowerCase(), () => {
      if(RESET_SNAPSHOT.restore()){ try { HOME.render(); PROG.render(); HOME.updateBadges(); REV.renderList('wr'); RESET_SNAPSHOT.renderCard(); } catch(e){} toast('Restored.'); }
    }, 12000);
  }
};
window.PROGRESS_RESET = PROGRESS_RESET;

const RESET_SNAPSHOT = {
  KEY: 'abhyas_pre_reset_snapshot',
  TTL_MS: 24 * 60 * 60 * 1000,

  save(reason, created){
    try {
      let sprint = ''; try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
      const snap = {
        at: Date.now(),
        reason: reason || 'reset',
        created: Array.isArray(created) ? created : [],
        sprint,
        sprintOff: (function(){ try { return localStorage.getItem('abhyas_sprint_off') || ''; } catch(e){ return ''; } })(),
        fcount:    S.fcount,
        prog:      S.prog,
        bk:        S.bk,
        fl:        S.fl,
        wr:        S.wr,
        stk:       S.stk,
        chapStats: S.chapStats,
        cov:       S.cov,
        tt:        S.tt
      };
      localStorage.setItem(this.KEY, JSON.stringify(snap));
      return true;
    } catch(e){
      console.warn('[reset-snapshot] save failed:', e);
      return false;
    }
  },

  read(){
    try {
      const raw = localStorage.getItem(this.KEY);
      if(!raw) return null;
      const snap = JSON.parse(raw);
      if(!snap || !snap.at) return null;
      if(Date.now() - snap.at > this.TTL_MS){ this.clear(); return null; }
      return snap;
    } catch(e){ return null; }
  },

  clear(){ try { localStorage.removeItem(this.KEY); } catch(e){} },

  restore(){
    const snap = this.read();
    if(!snap) return false;
    if(snap.prog)      S.prog      = snap.prog;
    if(snap.bk)        S.bk        = snap.bk;
    if(snap.fl)        S.fl        = snap.fl;
    if(snap.wr)        S.wr        = snap.wr;
    if(snap.stk)       S.stk       = snap.stk;
    if(snap.chapStats) S.chapStats = snap.chapStats;
    if(snap.cov)       S.cov       = snap.cov;
    if(snap.tt)        S.tt        = snap.tt;
    if(snap.fcount)    { S.fcount = snap.fcount; _save(LS.FCOUNT, S.fcount); }
    if(snap.sprint)    { try { localStorage.setItem('abhyas_sprint_start', snap.sprint); } catch(e){} }
    if(snap.sprintOff) { try { localStorage.setItem('abhyas_sprint_off', snap.sprintOff); } catch(e){} }
    /* undo the reset markers this reset made, so other devices stop applying them too */
    if(Array.isArray(snap.created) && snap.created.length) PROGRESS_RESET.lift(snap.created);
    _save(LS.PROG, S.prog);
    _save(LS.BK, S.bk);
    _save(LS.FL, S.fl);
    _save(LS.WR, S.wr);
    _save(LS.STK, S.stk);
    _save(LS.CHAPSTATS, S.chapStats);
    _save(LS.COV, S.cov);
    _save(LS.TT, S.tt);
    this.clear();
    if(typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return true;
  },

  renderCard(){
    const snap = this.read();
    const slot = document.getElementById('reset-recover-slot');
    if(!slot) return;
    if(!snap){ slot.innerHTML = ''; return; }
    const mins = Math.max(1, Math.round((Date.now() - snap.at) / 60000));
    const ago = mins < 60 ? mins + ' min ago' : Math.round(mins/60) + ' h ago';
    const labels = { reset:'Reset this device', resetCloud:'Reset progress everywhere', deleteAccount:'Delete account',
      'scoped:all':'Reset all progress', 'scoped:wr':'Reset wrong bank', 'scoped:sprint':'Reset 60-day sprint',
      'scoped:chapter':'Reset one chapter', 'scoped:exams':'Reset exam history' };
    slot.innerHTML =
      '<section class="card" style="border-color:var(--warning-line);background:var(--warning-soft)">' +
        '<div class="card-hd"><h3 style="color:var(--warning)"><i class="ph ph-arrow-counter-clockwise"></i> Recover your data?</h3></div>' +
        '<p class="t-callout" style="color:var(--ink);margin-bottom:var(--sp-3)">' +
          'You ran <b>' + esc(labels[snap.reason] || snap.reason) + '</b> ' + esc(ago) + '. ' +
          'A safety copy was kept on this device. Restore it to bring everything back?' +
        '</p>' +
        '<div class="bg">' +
          '<button class="btn btn-solid" onclick="RESET_SNAPSHOT._doRestore()"><i class="ph ph-arrow-counter-clockwise"></i> Restore</button>' +
          '<button class="btn btn-quiet" onclick="RESET_SNAPSHOT._dismiss()">Discard</button>' +
        '</div>' +
      '</section>';
  },

  _doRestore(){
    if(this.restore()){
      toast('✅ Your data has been restored.');
      try { HOME.render(); PROG.render(); } catch(e){}
      this.renderCard();
    } else {
      toast('Could not restore — the snapshot may have expired.');
      this.renderCard();
    }
  },

  _dismiss(){
    this.clear();
    this.renderCard();
    toast('Snapshot discarded.');
  }
};

const TUTORIAL = {
  _seenKey: 'abhyas_tut_seen',
  _idx: 0,
  _steps: [
    { icon: '<i class="ph ph-hand-waving"></i>', title: 'Welcome to Abhyas',
      body: `<p>This is your Smart Study Hub for Nepal Engineering (Level 5/7) and PSC/Loksewa prep. Once a chapter is cached it works fully offline — handy for load-shedding or weak signal.</p>` },
    { icon: '<i class="ph ph-key"></i>', title: 'Your account status',
      body: `<p>Check the sidebar under your name for your current status:</p>
        <ul style="margin:0 0 0 1.1rem;padding:0">
          <li><b><i class="ph ph-hourglass"></i> Trial</b> — free access, counts down live. Pay anytime from the payment screen to go permanent.</li>
          <li><b><i class="ph ph-check-circle"></i> Permanent</b> — verified, unlimited access forever, fully usable offline.</li>
          <li><b><i class="ph ph-calendar-blank"></i> Yearly</b> — active until the renewal date shown in the sidebar.</li>
        </ul>` },
    { icon: '<i class="ph ph-house"></i>', title: 'Your Dashboard',
      body: `<p>The Dashboard (<i class="ph ph-house"></i>) is home base:</p>
        <ul style="margin:0 0 0 1.1rem;padding:0">
          <li><b><i class="ph ph-star"></i> Daily Challenge</b> — 30 mixed questions, keeps your streak alive.</li>
          <li><b><i class="ph ph-lightning"></i> Adaptive Practice</b> — pulls the questions you're actually struggling with first.</li>
          <li>Quick stats and Quick Action tiles for everything else.</li>
        </ul>` },
    { icon: '<i class="ph ph-book-open"></i>', title: 'Studying a chapter',
      body: `<p>Open <b>Online Study</b> or <b>Local File</b>, pick a chapter, choose how many questions and whether to shuffle, then pick a mode:</p>
        <ul style="margin:0 0 0 1.1rem;padding:0">
          <li><b>Practice</b> — instant feedback.</li>
          <li><b>Exam</b> — timed, graded at the end.</li>
          <li><b>Flashcard</b> — quick flip-through review.</li>
        </ul>
        <p style="margin-top:.5rem">Shortcuts: <b>A/B/C/D</b> or <b>1–5</b> to answer, <b>←/→</b> between cards, <b>Esc</b> to quit.</p>` },
    { icon: '<i class="ph ph-star"></i>', title: 'Bookmarks, Flags & Wrong Bank',
      body: `<p>Tag any question while studying:</p>
        <ul style="margin:0 0 0 1.1rem;padding:0">
          <li><b><i class="ph ph-star"></i> Bookmarks</b> — save with a label.</li>
          <li><b><i class="ph ph-flag"></i> Flagged</b> — a quick "come back to this".</li>
          <li><b><i class="ph ph-x-circle"></i> Wrong Bank</b> — auto-collected; comes back after 1, 3, 7 and 14 days; get it right each time and it retires.</li>
        </ul>` },
    { icon: '<i class="ph ph-calendar-check"></i>', title: 'Weekly Sets',
      body: `<p>Every so often a fresh question set unlocks on the Dashboard. You get <b>exactly one attempt</b> — a graded, timed exam. Once you submit, you can only review.</p>` },
    { icon: '<i class="ph ph-pencil-line"></i>', title: 'Subjective',
      body: `<p>Under <b>Subjective</b> in the sidebar, three panels:</p>
        <ul style="margin:0 0 0 1.1rem;padding:0">
          <li><b>Q of the Day</b> — one question, timed write, then upload photos or a PDF of your answer.</li>
          <li><b>Proper Exam</b> — a full 100-mark paper on demand.</li>
          <li><b>Question List</b> — topic-wise index.</li>
        </ul>` },
    { icon: '<i class="ph ph-calendar-blank"></i>', title: 'Timetable & Progress',
      body: `<p><b>Timetable</b> blocks out study sessions by day/time — the Dashboard clock shows what's on now. <b>Progress</b> tracks accuracy and predicts likely exam marks.</p>` },
    { icon: '<i class="ph ph-package"></i>', title: 'Offline & installing the app',
      body: `<p>Chapters you open get cached automatically for offline use — check <b>Offline Cache</b> to manage what's stored.</p>
        <p style="margin-top:.5rem">Tap the <b><i class="ph ph-device-mobile"></i></b> icon in the top bar to install Abhyas to your home screen.</p>` }
  ],

  maybeAutoOpen(user){
    if(!user || !user.username) return;
    const seen = _load(TUTORIAL._seenKey, {});
    if(seen[user.username]) return;
    setTimeout(()=>TUTORIAL.open(), 600);
  },

  open(){
    if(document.getElementById('tut-modal')) return;
    TUTORIAL._idx = 0;
    const modal = document.createElement('div');
    modal.id = 'tut-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:10001;padding:1.2rem;backdrop-filter:blur(4px)';
    modal.innerHTML = `
      <div style="background:var(--c2);border:1px solid var(--bd);border-radius:var(--r3);padding:1.4rem;max-width:420px;width:100%;box-shadow:var(--sh3);max-height:88vh;display:flex;flex-direction:column">
        <div id="tut-dots" style="display:flex;gap:.3rem;margin-bottom:.9rem;justify-content:center"></div>
        <div style="flex:1;overflow-y:auto;min-height:0" id="tut-body"></div>
        <div style="display:flex;gap:.4rem;margin-top:1rem">
          <button id="tut-back" style="padding:.6rem .9rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r2);color:var(--t2);font-size:.82rem;cursor:pointer;font-family:var(--ff)">← Back</button>
          <button id="tut-next" style="flex:1;padding:.62rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r2);color:var(--on-accent);font-weight:700;font-size:.85rem;cursor:pointer;font-family:var(--ff)">Next →</button>
        </div>
        <button id="tut-skip" style="margin-top:.55rem;background:none;border:none;color:var(--t3);font-size:.72rem;cursor:pointer;font-family:var(--ff);text-decoration:underline">Skip tutorial</button>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('tut-back').onclick = ()=>TUTORIAL._go(-1);
    document.getElementById('tut-next').onclick = ()=>TUTORIAL._go(1);
    document.getElementById('tut-skip').onclick = ()=>TUTORIAL._finish();
    TUTORIAL._render();
  },

  _go(dir){
    const n = TUTORIAL._idx + dir;
    if(n < 0) return;
    if(n >= TUTORIAL._steps.length){ TUTORIAL._finish(); return; }
    TUTORIAL._idx = n;
    TUTORIAL._render();
  },

  _render(){
    const step = TUTORIAL._steps[TUTORIAL._idx];
    const body = document.getElementById('tut-body');
    if(!body) return;
    body.innerHTML = `
      <div style="font-size:1.6rem;margin-bottom:.3rem">${step.icon}</div>
      <div style="font-family:var(--fd);font-size:1rem;font-weight:700;color:var(--t1);margin-bottom:.5rem">${step.title}</div>
      <div style="font-size:.82rem;color:var(--t2);line-height:1.55">${step.body}</div>`;
    const dots = document.getElementById('tut-dots');
    if(dots){
      dots.innerHTML = TUTORIAL._steps.map((_,i)=>
        `<div style="width:${i===TUTORIAL._idx?'18px':'6px'};height:6px;border-radius:3px;background:${i===TUTORIAL._idx?'var(--amb)':'var(--b1)'};transition:.2s"></div>`
      ).join('');
    }
    const backBtn = document.getElementById('tut-back');
    if(backBtn) backBtn.style.visibility = TUTORIAL._idx===0 ? 'hidden' : 'visible';
    const nextBtn = document.getElementById('tut-next');
    if(nextBtn) nextBtn.textContent = TUTORIAL._idx===TUTORIAL._steps.length-1 ? "Got it — let's study! →" : 'Next →';
  },

  _finish(){
    const modal = document.getElementById('tut-modal');
    if(modal) modal.remove();
    if(S.user && S.user.username){
      const seen = _load(TUTORIAL._seenKey, {});
      seen[S.user.username] = true;
      _save(TUTORIAL._seenKey, seen);
    }
  }
};

const APP = {
  _booted: false,
  async init(){
    if(APP._booted) return;
    APP._booted = true;

    if(_load('abhyas_theme','light')==='dark') document.body.classList.add('dark');
    const verEl = document.getElementById('sb-version');
    if(verEl) verEl.textContent = `${APP_NAME} (v${typeof APP_VERSION!=='undefined'?APP_VERSION:'—'})`;

    await QDB.migrateFromLocalStorage();
    if(typeof migrateSessionScopes === 'function') migrateSessionScopes();
    if(!Object.keys(S.chapStats).length && S.prog.sessions?.length) CHAPSTATS.rebuildFromSessions();
    if(!S.cov || !Object.keys(S.cov).length) COV.rebuildFromSessions();
    if(window.CONTENT_INDEX && typeof window.CONTENT_INDEX === 'object'){
      Object.keys(window.CONTENT_INDEX).forEach(k => { if(S.fcount[k] == null) S.fcount[k] = window.CONTENT_INDEX[k]; });
    }

    const _appV = String(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '');
    const _scanned = _load('abhyas_qscan', '') === _appV;
    const qKeys = _scanned ? [] : await QDB.keys();
    _save('abhyas_qscan', _appV);
    for(const k of qKeys){
      try{
        const v = await QDB.get(k);
        if(v && typeof v==='object' && !Array.isArray(v) && v.success===false) await QDB.del(k);
      }catch{}
    }

    if(!S.profile.id){
      S.profile.id = 'ha-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2,9);
      _save(LS.PROFILE, S.profile);
    }

    /* Prune stale saved weekly papers (older than 60 days). */
    try {
      const all = _load(WEEKLY.LS_PAPERS, {}) || {};
      const cutoff = Date.now() - 60*24*60*60*1000;
      let changed = false;
      Object.keys(all).forEach(id => {
        if (!all[id] || !all[id].at || all[id].at < cutoff) { delete all[id]; changed = true; }
      });
      if (changed) localStorage.setItem(WEEKLY.LS_PAPERS, JSON.stringify(all));
    } catch(e){}

    UI.go('home');
    CACHE.render();
    _updateNetBtn();
    _updateOfflineWarn();
    AUTH.startPeriodicRecheck();
    CACHE.autoSync();
    if(typeof QUIZ !== 'undefined' && QUIZ.checkResumableExam) QUIZ.checkResumableExam();
    if(typeof PUSH!=='undefined') PUSH.refreshButtonUI();
  }
};

function _updateOfflineWarn(){
  const modern = document.getElementById('on-offline-warn');
  if(modern) modern.style.display = (S.online && !S.forcedOffline) ? 'none' : 'flex';
  const bar = document.getElementById('offbar');
  if(bar){
    if(!S.online){
      bar.textContent = '📡 Network offline — serving from local cache';
      bar.classList.add('show');
    } else if(S.forcedOffline){
      bar.textContent = '🔴 Offline mode forced — network blocked by you';
      bar.classList.add('show');
    } else {
      bar.classList.remove('show');
    }
  }
}

function _updateNetBtn(){
  const effectivelyOnline = S.online && !S.forcedOffline;
  const btn = document.getElementById('net-mode-btn');
  if(btn){
    btn.innerHTML = `<i class="ph ${effectivelyOnline ? 'ph-wifi-high' : 'ph-wifi-slash'}"></i>`;
    btn.title = effectivelyOnline ? 'Online mode — click to force offline'
              : S.forcedOffline ? 'Forced offline mode — click to go online'
              : 'Network offline — no connection';
    btn.setAttribute('aria-label', btn.title);
    btn.style.color = effectivelyOnline ? 'var(--grn)' : 'var(--ros)';
    btn.style.borderColor = effectivelyOnline ? 'rgba(34,197,94,.35)' : 'var(--bad-bd)';
    btn.style.background = effectivelyOnline ? 'rgba(34,197,94,.08)' : 'var(--bad-bg)';
    btn.classList.toggle('forced', S.forcedOffline);
    btn.setAttribute('aria-pressed', String(!!S.forcedOffline));
  }
  const dot = document.getElementById('net-dot');
  const txt = document.getElementById('net-txt');
  if(dot) dot.className = 'net-dot' + (effectivelyOnline ? '' : ' off');
  if(txt) txt.textContent = S.forcedOffline ? 'Offline (manual)' : (S.online ? 'Online' : 'Offline');
}

window.addEventListener('online', async ()=>{
  if(typeof NETCHECK !== 'undefined' && NETCHECK.reset) NETCHECK.reset();
  const reallyOnline = await NETCHECK.ping();
  if(!reallyOnline) return;
  if(!S.forcedOffline){
    toast('🌐 Back online');
    if(PSYNC._timer) PSYNC.pushNow();
    if(typeof WEEKLY !== 'undefined') WEEKLY.retryUnsynced();
    try { if(typeof QUIZ !== 'undefined' && QUIZ.flushReports) QUIZ.flushReports(); } catch(e){}
  } else {
    toast('🌐 Network restored — still in forced offline mode');
  }
});
/* v1.33: send any reports written offline shortly after the app opens */
setTimeout(()=>{ try { if(typeof QUIZ !== 'undefined' && QUIZ.flushReports) QUIZ.flushReports(); } catch(e){} }, 8000);
window.addEventListener('offline', ()=>{
  const wasForcedOff = S.forcedOffline;
  S.online = false;
  if(!wasForcedOff){
    toast('📡 Network lost — switched to offline mode automatically');
  }
  _updateNetBtn();
  _updateOfflineWarn();
});

const NET = {
  toggle(){
    if(!S.online && !S.forcedOffline){
      toast('📡 No network connection — connect to the internet first');
      return;
    }
    S.forcedOffline = !S.forcedOffline;
    _save(LS.FORCED_OFFLINE, S.forcedOffline);
    if(S.forcedOffline){
      toast('🔴 Offline mode on — all network requests blocked');
    } else {
      toast('🟢 Online mode restored — network requests allowed');
      if(PSYNC._timer) PSYNC.pushNow();
      if(typeof WEEKLY !== 'undefined') WEEKLY.retryUnsynced();
    }
    _updateNetBtn();
    _updateOfflineWarn();
  }
};

function pluralize(n, word, pluralWord){ return `${n} ${n===1 ? word : (pluralWord || word + 's')}`; }

(function crossTabSync(){
  const WATCH = new Set([LS.PROG, LS.BK, LS.FL, LS.WR, LS.COV, LS.STK, LS.CHAPSTATS, LS.USER]);
  let pending = null;

  window.addEventListener('storage', e => {
    if (!e.key || !WATCH.has(e.key)) return;
    if (e.newValue === e.oldValue) return;

    if (e.key === LS.USER){
      const before = e.oldValue ? (() => { try { return JSON.parse(e.oldValue).username; } catch(x){ return null; } })() : null;
      const after  = e.newValue ? (() => { try { return JSON.parse(e.newValue).username; } catch(x){ return null; } })() : null;
      if (!after || before !== after){ location.reload(); }
      return;
    }

    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      try {
        if (e.key === LS.PROG){ S.prog = _load(LS.PROG, S.prog); HOME.render(); }
        if (e.key === LS.BK)  { S.bk = _load(LS.BK, []); HOME.updateBadges(); }
        if (e.key === LS.FL)  { S.fl = _load(LS.FL, []); HOME.updateBadges(); }
        if (e.key === LS.WR)  { S.wr = _load(LS.WR, []); HOME.updateBadges(); }
        if (e.key === LS.COV) { S.cov = _load(LS.COV, {}); }
        if (e.key === LS.STK) { S.stk = _load(LS.STK, S.stk); HOME.render(); }
        if (e.key === LS.CHAPSTATS){ S.chapStats = _load(LS.CHAPSTATS, {}); }
      } catch (err){ console.warn('[cross-tab] refresh failed:', err); }
    }, 300);
  });
})();

const BOOT_ERROR = {
  show(err){
    try {
      const el = document.getElementById('sg');
      if (!el) return;
      const msg = String((err && err.message) || err || 'Something went wrong.');
      el.innerHTML =
        '<div style="max-width:340px;text-align:center;padding:0 var(--sp-4)">' +
          '<div style="font-size:2rem;color:var(--danger)"><i class="ph ph-warning-circle"></i></div>' +
          '<h2 class="t-t2" style="margin:var(--sp-3) 0 var(--sp-1)">Abhyas could not start</h2>' +
          '<p class="t-foot" style="line-height:1.55;margin-bottom:var(--sp-4)">' +
            esc(msg).slice(0, 200) +
          '</p>' +
          '<div class="bg" style="justify-content:center;flex-wrap:wrap">' +
            '<button class="btn btn-solid" type="button" onclick="location.reload()">' +
              '<i class="ph ph-arrow-clockwise"></i> Reload' +
            '</button>' +
            '<button class="btn btn-quiet" type="button" onclick="BOOT_ERROR.clearCache()">' +
              '<i class="ph ph-broom"></i> Clear cache and reload' +
            '</button>' +
          '</div>' +
        '</div>';
    } catch (e) { }
  },
  async clearCache(){
    try {
      if (typeof QDB !== 'undefined' && QDB.clear) await QDB.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {}
    location.reload();
  }
};

document.addEventListener('DOMContentLoaded', ()=>{
  try {
    if(_load('abhyas_theme','light')==='dark') document.body.classList.add('dark');

    PWA.init();
    _updateNetBtn();
    _updateOfflineWarn();

    NETCHECK.start();
    NETCHECK.ping();

    Promise.resolve()
      .then(() => AUTH.restore())
      .catch(err => {
        console.error('[boot] AUTH.restore failed:', err);
        try { BOOT_ERROR.show(err); } catch (e) {}
      });
  } catch (err) {
    console.error('[boot] DOMContentLoaded handler threw:', err);
    try { BOOT_ERROR.show(err); } catch (e) {}
  }
});

(function focusScroll() {
  if (!window.matchMedia || !matchMedia('(pointer:coarse)').matches) return;
  document.addEventListener('focusin', function (e) {
    const el = e.target;
    if (!el || !el.matches || !el.matches('input, textarea, select')) return;
    if (el.type === 'hidden' || el.readOnly || el.disabled) return;
    setTimeout(function () {
      try {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.top > vh * 0.55) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {}
    }, 300);
  });
})();

(function midnightRepaint() {
  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
  let last = dayStart(new Date());
  function check() {
    const now = dayStart(new Date());
    if (now === last) return;
    last = now;
    try { if (typeof EXAM_DATE !== 'undefined' && EXAM_DATE.render) EXAM_DATE.render(); } catch (e) {}
    try { if (typeof DAILY10 !== 'undefined' && DAILY10.render) DAILY10.render(); } catch (e) {}
    try { if (typeof SPRINT !== 'undefined' && SPRINT.render) SPRINT.render(); } catch (e) {}
    try { if (typeof TODAY_PLAN !== 'undefined' && TODAY_PLAN.render) TODAY_PLAN.render(); } catch (e) {}
    try { if (typeof SYLLABUS_MOCK !== 'undefined' && SYLLABUS_MOCK.render) SYLLABUS_MOCK.render(); } catch (e) {}
  }
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) check();
  });
})();

window.AUTH = AUTH;
window.NET = NET;
/* ═══════════════════════════════════════════════════════════════════════
   MODAL (student page) — v1.32
   WEEKLY._showRetakeModal called MODAL.sheet(), which only existed in
   admin.html, so opening an already-attempted weekly test threw a
   ReferenceError. This is a small self-building bottom sheet with the
   same sheet()/close() API. Esc and backdrop-click close it, and focus
   returns to the element that opened it.
   ═══════════════════════════════════════════════════════════════════════ */
window.MODAL = window.MODAL || {
  _el: null, _prevFocus: null, _onKey: null,
  _build(){
    if (this._el) return this._el;
    const ov = document.createElement('div');
    ov.id = 'ov-sheet';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'tt-sheet');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45)';
    ov.innerHTML =
      '<div class="dialog" style="background:var(--surface,var(--bg,#fff));color:var(--ink,inherit);width:100%;max-width:520px;max-height:90vh;overflow:auto;' +
        'border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<h3 id="tt-sheet" style="flex:1;margin:0;font-size:1rem"></h3>' +
          '<button type="button" class="btn btn-quiet" aria-label="Close" data-modal-close>&times;</button>' +
        '</div>' +
        '<div id="bd-sheet"></div>' +
      '</div>';
    ov.addEventListener('click', e => {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-modal-close]'))) MODAL.close('sheet');
    });
    document.body.appendChild(ov);
    return (this._el = ov);
  },
  sheet(title, html, opts){
    const ov = this._build();
    this._prevFocus = document.activeElement;
    ov.querySelector('#tt-sheet').textContent = String(title == null ? '' : title);
    ov.querySelector('#bd-sheet').innerHTML = html;
    const wide = !opts || opts.wide !== false;
    ov.querySelector('.dialog').style.maxWidth = wide ? '640px' : '520px';
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (!this._onKey) {
      this._onKey = e => { if (e.key === 'Escape') MODAL.close('sheet'); };
      document.addEventListener('keydown', this._onKey);
    }
    const first = ov.querySelector('#bd-sheet button, [data-modal-close]');
    if (first && first.focus) first.focus();
  },
  open(){ if (this._el) this._el.style.display = 'flex'; },
  close(){
    if (!this._el || this._el.style.display === 'none') return;
    this._el.style.display = 'none';
    document.body.style.overflow = '';
    if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
    try { if (this._prevFocus && this._prevFocus.focus) this._prevFocus.focus(); } catch (e) {}
    this._prevFocus = null;
  },
  closeAll(){ this.close(); }
};

window.UI = UI;
window.PWA = PWA;
window.PROG = PROG;
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') PROG.flushNow(); });
window.addEventListener('pagehide', () => PROG.flushNow());
window.HOME = HOME;
window.STREAK = STREAK;
window.TT = TT;
window.CACHE = CACHE;
window.DATA = DATA;
window.TUTORIAL = TUTORIAL;
window.APP = APP;
window.WEEKLY = WEEKLY;
window.CHAPSTATS = CHAPSTATS;
window.COV = COV;
window.ASK = ASK;
window.PSYNC = PSYNC;
window.NETCHECK = NETCHECK;
window.GETFILE_GATE = GETFILE_GATE;
window.SRCH = SRCH;
window.pluralize = pluralize;
window.today = today;
window.localDateOffset = localDateOffset;
/* ═══════════════════════════════════════════════════════════════════════
   APP.JS — Abhyas: Your path to mastery  (V1 – Cloud Sync)
   ─────────────────────────────────────────────────────────────────────
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

// Weekly Sets exam window — once released, the student has this many
// hours to take it as a timed, graded Exam. After the window closes,
// the set switches to unlimited Flashcard-mode review.
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
  WK_ATTEMPTS:'abhyas_weekly_attempts'
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
  dpi: null,
  localQs: null,
  // Quiz state — kept here because HOME/UI read S.quiz.active to gate nav.
  quiz: {qs:[],ans:[],mode:'',idx:0,timer:null,elapsed:0,left:0,active:false,ch:'',scope:null},
  cloud: _load(LS.CLOUD, {fid:''}),
  profile: _load(LS.PROFILE, {ver:1, id:''})
};
if(!S.tt.reminders) S.tt.reminders = {enabled:false, leadMinutes:5};
if(!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
if(!S.stk.days) S.stk.days = [];
if(!S.weeklyAttempts || typeof S.weeklyAttempts !== 'object') S.weeklyAttempts = {};

/* ═══════════════ 3. UTILITIES ═══════════════ */
function _load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
const PSYNC_KEYS = new Set([LS.BK, LS.FL, LS.WR, LS.PROG, LS.STK, LS.CHAPSTATS]);
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

/* ── QDB: IndexedDB-backed question-set cache ── */
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
    } catch (e) {
      // Callers decide whether a cache-write failure is worth surfacing.
      return false;
    }
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
function qSearchHtml(q){
  const optsText = (q.options||[]).map((o,i)=>String.fromCharCode(65+i)+') '+o).join('  ');
  const query = encodeURIComponent(((q.q||'')+'  '+optsText).trim().slice(0,300));
  return `<a class="ib" href="https://www.google.com/search?q=${query}" target="_blank" rel="noopener" title="Search on Google" aria-label="Search this question on Google"><i class="ph ph-magnifying-glass"></i></a>`;
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
  // Visibility-based check — the loader/error cards are created once and
  // only hidden, so a mere presence check would permanently return true
  // after the first quiz load, silently disabling every keyboard shortcut.
  return [
    '#quiz-limit-modal','#exam-resume-modal','#quiz-exit-modal',
    '#quiz-error-card','#quiz-loader'
  ].some(sel => {
    const el = document.querySelector(sel);
    return el && el.offsetParent !== null;
  });
}

function qs(params){return Object.entries(params).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}

/* ── getFile pacing ──────────────────────────────────────────────────
   The backend allows each account 60 getFile calls a minute (and 600
   across everyone). "Download everything" walks every configured file —
   roughly 200 of them — so without pacing the tail of the run comes back
   rate-limited and writes broken entries into the offline cache. This
   gate spaces the calls out instead, and backs right off if the server
   still says slow down. Every question fetch in the app goes through it. */
const GETFILE_GATE = {
  MAX: 45,            // stay under the server's 60, leaving room for retries
  BG_MAX: 15,         // background top-ups never eat the whole budget
  WINDOW: 60000,
  _hits: [],
  _penaltyUntil: 0,
  /* kind 'bg' is for the silent offline top-up. It is held to a third of the
     budget so that a student tapping a chapter is never stuck behind a
     download they never asked for. */
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
  /* Called when the server itself reports a rate limit. */
  backoff(ms = 10000){ this._penaltyUntil = Date.now() + ms; this._hits = []; },
  /* Rough seconds until `n` more files could be fetched — used for ETAs. */
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

/* ── SEARCH — opens a new tab with the current question on Google ── */
function _buildSearchQuery(){
  const q = S.quiz?.qs?.[S.quiz.idx]; if(!q) return '';
  const opts = (q.options||[]).map((o,i)=>String.fromCharCode(65+i)+') '+o).join('  ');
  return ((q.q||'') + '  ' + opts).trim().slice(0, 400);
}
const SRCH = {
  quickSearch(){
    const text = _buildSearchQuery();
    if(!text){ toast('No question to search'); return; }
    SRCH._openGoogle(text);
  },
  go(){ SRCH.quickSearch(); },
  toggle(){ SRCH.quickSearch(); },
  _openGoogle(text){
    const q = encodeURIComponent(text); if(!q) return;
    const url = `https://www.google.com/search?q=${q}`;
    const win = window.open(url, '_blank', 'noopener');
    if(!win) window.location.href = url;
  }
};

/* ═══════════════ 3b. NETCHECK ═══════════════ */
const NETCHECK = {
  _timer: null,
  async ping(){
    if(S.forcedOffline) return S.online;
    const wasOnline = S.online;
    S.online = await pingBackend(APPS);
    if(S.online !== wasOnline){ _updateNetBtn(); _updateOfflineWarn(); }
    return S.online;
  },
  start(){
    if(NETCHECK._timer) return;
    NETCHECK._timer = setInterval(()=>NETCHECK.ping(), 15000);
  }
};

/* ═══════════════ 3c. CHAPSTATS ═══════════════ */
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

/* ═══════════════ 4. AUTH ═══════════════ */
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
  /* POST, not GET: a session token in a query string ends up in the Apps
     Script execution log and in any proxy log on the way. */
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
    // Access-level computation lives in one place — shared.js's
    // computeAccessLevel() — so index.html and app.js never drift.
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
  _bounce(){ window.location.href = 'index.html'; },
  _resetUserScopedLocalDataIfDifferentUser(username){
    const lastUser = _load(LS.LAST_USER, '');
    if(lastUser && lastUser !== username){
      [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.TT].forEach(k=>{
        try{ localStorage.removeItem(k); }catch(e){}
      });
      S.prog = {total:0, correct:0, sessions:[]};
      S.bk = []; S.fl = []; S.wr = [];
      S.stk = {days:[], last:''};
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
    // Let the sidebar refresh its hints once everything is set.
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
    if(!confirm('Log out?'))return;
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
        localStorage.removeItem(LS.USER);
        AUTH._bounce();
      }
    }catch(e){ console.warn('[AUTH] periodic session recheck failed, will retry next interval:', e); }
  }
};

/* ═══════════════ 4b. PSYNC ═══════════════ */
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
      const body = JSON.stringify({
        action:'saveProgress',
        username: S.user.username,
        token: S.user.token,
        data: this._syncPayload()
      });
      navigator.sendBeacon?.(APPS, new Blob([body], {type:'text/plain'}));
    }catch(e){ /* best-effort */ }
  },
  flushOnHide(){
    if(!this._timer) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._beaconSync();
  },
  _MAX_SYNCED_SESSIONS: 500,
  _MAX_SYNCED_LIST_ITEMS: 300,
  _SYNC_PAYLOAD_CEILING: 44000,
  _capList(arr, max){
    return Array.isArray(arr) && arr.length > max ? arr.slice(-max) : arr;
  },
  _syncPayload(){
    const build = (bkMax, flMax, wrMax, sessMax) => {
      const prog = (S.prog && S.prog.sessions && S.prog.sessions.length > sessMax)
        ? { ...S.prog, sessions: S.prog.sessions.slice(-sessMax) }
        : S.prog;
      return JSON.stringify({
        prog,
        chapStats: S.chapStats,
        bk: this._capList(S.bk, bkMax),
        fl: this._capList(S.fl, flMax),
        wr: this._capList(S.wr, wrMax),
        stk: S.stk
      });
    };
    const full = this._MAX_SYNCED_LIST_ITEMS;
    const half = Math.max(20, Math.floor(full / 2));
    const quarter = Math.max(20, Math.floor(full / 4));
    const min = 20;
    const sessFull = this._MAX_SYNCED_SESSIONS;
    const sessHalf = Math.max(50, Math.floor(sessFull / 2));
    const sessMin = 50;

    const attempts = [
      [full, full, full, sessFull],
      [half, half, half, sessHalf],
      [quarter, quarter, quarter, sessHalf],
      [min, min, min, sessMin]
    ];
    for (const [bk, fl, wr, ss] of attempts) {
      const payload = build(bk, fl, wr, ss);
      if (payload.length <= this._SYNC_PAYLOAD_CEILING) return payload;
    }
    return build(min, min, min, sessMin);
  },
  async pushNow(){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._setState('syncing');
    const payload = this._syncPayload();
    try{
      const r = await netFetch(APPS, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'saveProgress', username:S.user.username, token:S.user.token, data:payload})
      }, 15000);
      const res = await r.json();
      if(res && res.success){ this._setStatus('Last backed up: ' + new Date().toLocaleString()); this._setState('synced'); }
      else { this._setStatus('Backup failed — will retry automatically.'); this._setState('error'); }
    }catch(e){ this._setStatus('Backup failed (offline?) — will retry automatically.'); this._setState('error'); }
  },
  async pullIfEmpty(){
    if(!S.online || !S.user || !S.user.token) return;
    const looksEmpty = (!S.prog || !S.prog.sessions || !S.prog.sessions.length)
      && (!S.bk || !S.bk.length) && (!S.fl || !S.fl.length) && (!S.wr || !S.wr.length);
    if(!looksEmpty) return;
    await this._pull(false);
  },
  async forceRestore(){
    if(!S.online || !S.user || !S.user.token){ toast('❌ Need internet to restore'); return; }
    await this._pull(true);
  },
  async _pull(force){
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'getProgress', username:S.user.username, token:S.user.token})
      }, 15000);
      const res = await r.json();
      if(!res.success || !res.data){
        if(force) toast('ℹ️ No cloud backup found for this account yet.');
        return;
      }
      const data = JSON.parse(res.data);
      if(data.prog){ S.prog=data.prog; if(typeof migrateSessionScopes === 'function') migrateSessionScopes(); _save(LS.PROG,S.prog); }
      if(data.chapStats){
        Object.entries(data.chapStats).forEach(([key, rec])=>{
          const existing = S.chapStats[key];
          if(!existing || rec.attempted > existing.attempted) S.chapStats[key] = JSON.parse(JSON.stringify(rec));
        });
        _save(LS.CHAPSTATS, S.chapStats);
      }
      if(data.bk){ S.bk=data.bk; _save(LS.BK,S.bk); }
      if(data.fl){ S.fl=data.fl; _save(LS.FL,S.fl); }
      if(data.wr){ S.wr=data.wr; _save(LS.WR,S.wr); }
      if(data.stk){ S.stk=data.stk; _save(LS.STK,S.stk); }
      toast('☁️ Restored your progress from a previous device');
      this._setStatus('Restored from cloud: ' + (res.updatedAt ? new Date(res.updatedAt).toLocaleString() : new Date().toLocaleString()));
      if(typeof HOME!=='undefined') HOME.render();
      if(typeof PROG!=='undefined') PROG.render();
    }catch(e){
      if(force) toast('❌ Restore failed — check your connection and try again.');
    }
  }
};
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') PSYNC.flushOnHide(); });
window.addEventListener('pagehide', ()=>PSYNC.flushOnHide());

/* ═══════════════ 4c. PUSH ═══════════════ */
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
    }catch(e){ /* best-effort */ }
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

/* ═══════════════ 5. PWA ═══════════════ */
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
      // Service Worker updated and new SW has claimed the page — show a
      // reload prompt. Never auto-reload (that would blow away an
      // in-progress quiz).
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
   Only the state + fetch/attempt plumbing lives here — the render and
   open() logic reads QUIZ, which loads in objective.js. Fine because
   _renderHomeCard() only runs at runtime, after all scripts loaded. */
const WEEKLY = {
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
          this.attempts[a.weeklyId] = a;
        }
        this._saveAttempts();
      }
      this._renderHomeCard();
      this._startTick();
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

      // Not yet released — locked countdown.
      if(!s.released){
        const when = s.releaseAt ? new Date(s.releaseAt) : null;
        const whenTxt = when ? when.toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : 'soon';
        return `<div class="qb-btn" style="width:100%;justify-content:flex-start;opacity:.6;cursor:default">
          <i class="ph ph-lock-simple"></i> ${esc(s.title)} <span style="opacity:.7">— unlocks ${whenTxt}</span>
        </div>`;
      }

      // Attempted — show recorded score. No countdown.
      if(attempted){
        return `<div class="qb-btn ok" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center;opacity:.92" onclick='WEEKLY.open(${idJson})'>
          <span><i class="ph ph-check-circle"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
          <span class="ctag tg" style="font-size:.62rem;font-weight:700">✓ ${attempted.pct}% · Review</span>
        </div>`;
      }

      // Not attempted, window still open — graded exam with live countdown.
      const open = this.examOpen(s);
      const closeAt = this.examCloseAt(s);
      if(open){
        return `<div class="qb-btn ok" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center" onclick='WEEKLY.open(${idJson})'>
          <span><i class="ph ph-note-pencil"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
          <span class="mono" id="weekly-countdown-${esc(s.id)}" data-close="${closeAt}" style="font-size:.68rem;font-weight:700;color:var(--ros)" title="Time left — one attempt only">${fmtHMS(Math.max(0,Math.round((closeAt-Date.now())/1000)))}</span>
        </div>`;
      }

      // Not attempted, window closed — review only.
      return `<div class="qb-btn" style="cursor:pointer;width:100%;justify-content:space-between;align-items:center;opacity:.75" onclick='WEEKLY.open(${idJson})'>
        <span><i class="ph ph-eye"></i> ${esc(s.title)}${s.chapterLabel?` <span style="opacity:.6">— ${esc(s.chapterLabel)}</span>`:''}</span>
        <span style="font-size:.62rem;opacity:.75">Review only</span>
      </div>`;
    }).join('');
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

  // Entry point from the home card. QUIZ lives in objective.js.
  async open(id){
    const s = this.sets.find(x=>x.id===id);
    if(!s || !s.released || !s.fileId){ toast('Not unlocked yet.'); return; }

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
      }catch(e){ /* network hiccup — fall through, let exam start */ }
    }

    if(attempt){
      toast(`🔒 One attempt only — showing your recorded result (${attempt.pct}%)`, 3500);
      this._startReview(s, attempt);
      return;
    }

    if(!this.examOpen(s)){
      toast('👁️ Exam window closed — viewing answers only', 3500);
      this._startReview(s, null);
      return;
    }

    toast(`📝 Graded exam — you get ONE attempt. ${fmtHMS(Math.max(0, Math.round((this.examCloseAt(s)-Date.now())/1000)))} left.`, 5000);
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'exam', s.title, {
      weeklyId: s.id,
      weeklyTitle: s.title,
      weeklyFirstAttempt: true
    });
  },

  _startReview(s, attempt){
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'flashcard', s.title, {
      weeklyId: s.id,
      weeklyTitle: s.title,
      weeklyReviewMode: true,
      weeklyAttempt: attempt || null
    });
  },

  // Called from QUIZ._showResults after a weekly exam completes.
  async _recordAttempt(quiz, stats){
    const weeklyId = quiz.scope?.weeklyId;
    if(!weeklyId) return;
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
    }catch(e){
      // Offline or transient error. Leave synced:false; retryUnsynced
      // picks it up on next reconnect.
    }
  },

  retryUnsynced(){
    if(!S.online || S.forcedOffline) return;
    Object.values(this.attempts).forEach(a => {
      if(a && !a.synced) this._syncAttempt(a);
    });
  }
};

/* ═══════════════ 6. UI ═══════════════ */
const UI = {
  cur: 'home',
  _goRaw(v){
    document.getElementById('quiz-wrap').style.display='none';
    document.querySelectorAll('.view').forEach(e=>e.classList.remove('on'));
    const el=document.getElementById('view-'+v);
    if(el)el.classList.add('on');
    document.querySelectorAll('.sb-item').forEach(e=>e.classList.remove('active'));
    const ni=document.getElementById('nav-'+v);
    if(ni)ni.classList.add('active');

    // Clear view-scoped intervals when leaving their view. Without this,
    // HOME._clockTimer and TT._clockTimer kept running forever after a
    // single visit.
    if(UI.cur === 'home' && v !== 'home' && HOME._clockTimer){ clearInterval(HOME._clockTimer); HOME._clockTimer = null; }
    if(UI.cur === 'timetable' && v !== 'timetable' && TT._clockTimer){ clearInterval(TT._clockTimer); TT._clockTimer = null; }

    UI.cur=v;UI.sidebarClose();
    // Scroll the actual scrolling pane (#main), not window.
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

/* ═══════════════ 10a. PROGRESS TRACKING ═══════════════
   PROG stays here — it's core data management, not quiz-specific. The
   quiz engine calls into it, but that's a one-way dependency. */
const PROG = {
  track(correct){
    S.prog.total = (S.prog.total || 0) + 1;
    if(correct) S.prog.correct = (S.prog.correct || 0) + 1;
    _save(LS.PROG, S.prog);
    HOME.updateStats();
    HOME.updateBadges();
  },

  recordSession(sess){
    if(!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
    S.prog.sessions.unshift(sess);
    S.prog.sessions = S.prog.sessions.slice(0,50);
    _save(LS.PROG, S.prog);
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

/* ═══════════════ 10b. STREAK ═══════════════ */
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
    if(!hasToday && !hasYesterday) return 0;
    let n = 0;
    let offset = hasToday ? 0 : 1;
    while(set.has(localDateOffset(new Date(), -offset))){
      n++;
      offset++;
      if(n > 400) break;
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

/* ═══════════════ 10c. HOME ═══════════════ */
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

/* ═══════════════ 10d. TIMETABLE ═══════════════ */
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
  _checkDue(){ return TT._checkReminders(); },
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
    }catch(e){ /* non-fatal */ }
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

/* ═══════════════ 10e. OFFLINE CACHE ═══════════════ */
const CACHE = {
  async render(){
    const refs = ChapterData.allFileRefs();
    const cachedKeys = new Set(await QDB.keys());
    const _isCached = key => cachedKeys.has(key);

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
      grid.innerHTML = levels.map(lv=>{
        const lvRefs = refs.filter(r=>r.lv===lv);
        const lvCached = lvRefs.filter(r=>_isCached(r.key)).length;
        return `<div class="ci"><div class="ci-n">${esc(ChapterData.levelLabel(lv))}</div>
          <div class="ci-s"><div class="cd ${lvCached===lvRefs.length&&lvRefs.length?'y':'n'}"></div>${lvCached}/${lvRefs.length} cached</div></div>`;
      }).join('');
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
    if(!confirm('Remove ALL cached question sets? You will need to be online to study again until you re-cache.')) return;
    await QDB.clear();
    CACHE.render();
    toast('🗑 Offline cache cleared');
  },
  async clr(){ return CACHE.clearAll(); },

  async dl(){
    const refs = ChapterData.allFileRefs();
    if(!refs.length){ toast('No content configured to cache'); return; }
    if(!S.online){ toast('❌ You need to be online to download the cache'); return; }
    const pb = document.getElementById('cpb');
    const pf = document.getElementById('cpf');
    const txt = document.getElementById('cptxt');
    if(pb) pb.style.display = '';
    let done = 0, failed = 0;
    const startedAt = Date.now();
    const etaText = () => {
      if(done < 3) return '';
      const perFile = (Date.now() - startedAt) / done;
      const leftSec = Math.round((refs.length - done) * perFile / 1000);
      if(leftSec < 45) return ' · under a minute left';
      return ` · about ${Math.ceil(leftSec/60)} min left`;
    };
    for(const ref of refs){
      if(txt) txt.textContent = `Downloading ${done+1} of ${refs.length}${etaText()}`;
      if(pf) pf.style.width = `${(done/refs.length)*100}%`;
      try{
        await QUIZ._fetch(ref.fid, ref.key);
      }catch(err){
        failed++;
        if(txt) txt.textContent = `Retrying ${ref.subtopic || ref.name}…`;
        try{
          await new Promise(r=>setTimeout(r,2000));
          await QUIZ._fetch(ref.fid, ref.key);
          failed--;
        }catch{}
      }
      done++;
      if(pf) pf.style.width = `${(done/refs.length)*100}%`;
    }
    const ok = done - failed;
    if(txt) txt.textContent = failed>0
      ? `Downloaded ${ok} of ${refs.length}. ${failed} did not come through — try again on a steadier connection.`
      : `All ${done} sets are on this device.`;
    toast(failed>0 ? `${ok} of ${refs.length} downloaded — ${failed} failed` : 'Everything is downloaded for offline study');
    CACHE.render();
  },

  async cacheAll(){
    if(!S.online){ toast('❌ Connect to the internet first'); return; }
    const refs = ChapterData.allFileRefs();
    if(!refs.length){ toast('No content configured'); return; }
    if(!confirm(`Download all ${refs.length} question sets for offline use? This may use significant data.`)) return;
    QUIZ._showLoader(`Caching 0/${refs.length}…`);
    let done = 0, failed = 0;
    for(const ref of refs){
      try{ await QUIZ._fetch(ref.fid, ref.key); done++; }
      catch(e){ failed++; }
      const msg = document.getElementById('quiz-loader-msg');
      if(msg) msg.textContent = `Caching ${done+failed}/${refs.length}…`;
    }
    QUIZ._hideLoader();
    toast(`✅ Cached ${done} set${done!==1?'s':''}${failed?`, ${failed} failed`:''}`);
    CACHE.render();
  },

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
    if(!S.online || S.forcedOffline) return;
    const cachedKeys = new Set(await QDB.keys());
    const missing = ChapterData.allFileRefs().filter(r=>!cachedKeys.has(r.key));
    if(!missing.length) return;

    /* Mobile data is expensive here. Never spend it on a download nobody
       asked for — offer it instead, every time, not just once. */
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isCellular = conn && /cellular|2g|3g|slow-2g/i.test(conn.effectiveType || conn.type || '');
    const saver = conn && conn.saveData;
    if ((isCellular || saver) && missing.length > 5) {
      const lastOffer = _load('abhyas_autosync_offered_at', 0);
      if (Date.now() - lastOffer > 24*60*60*1000) {
        _save('abhyas_autosync_offered_at', Date.now());
        toast(`${missing.length} question sets aren't on this device yet. Open Downloads on Wi-Fi to save them for offline study.`, 7000);
      }
      return;
    }

    /* A capped slice per session: the rest is picked up next time, or all at
       once from Downloads. Keeps the boot quiet and the data bill small. */
    const BATCH = 40;
    const batch = missing.slice(0, BATCH);
    CACHE._badge(`Saving for offline · 0/${batch.length}`);
    let done = 0;
    for(const ref of batch){
      try{ await QUIZ._fetch(ref.fid, ref.key, 1, 'bg'); }catch{ /* quietly skip */ }
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

/* ═══════════════ 10f. DATA MANAGEMENT ═══════════════ */
const DATA = {
  exportAll(){
    const payload = {
      exportedAt: new Date().toISOString(),
      version: (typeof APP_VERSION!=='undefined' ? APP_VERSION : 1),
      prog: S.prog,
      chapStats: S.chapStats,
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
  exp(){ return DATA.exportAll(); },

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

  _applyImport(data){
    if(data.prog){ S.prog = data.prog; if(typeof migrateSessionScopes==='function') migrateSessionScopes(); _save(LS.PROG,S.prog); }
    if(data.chapStats){
      Object.entries(data.chapStats).forEach(([key, rec])=>{
        const existing = S.chapStats[key];
        if(!existing || rec.attempted > existing.attempted) S.chapStats[key] = JSON.parse(JSON.stringify(rec));
      });
      _save(LS.CHAPSTATS, S.chapStats);
    }
    if(data.bk){ S.bk = data.bk; _save(LS.BK, S.bk); }
    if(data.fl){ S.fl = data.fl; _save(LS.FL, S.fl); }
    if(data.wr){ S.wr = data.wr; _save(LS.WR, S.wr); }
    if(data.stk){ S.stk = data.stk; _save(LS.STK, S.stk); }
    if(data.tt){ S.tt = data.tt; if(!S.tt.reminders) S.tt.reminders = {enabled:false,leadMinutes:5}; _save(LS.TT, S.tt); }
    if(data.weeklyAttempts && typeof data.weeklyAttempts === 'object'){
      Object.entries(data.weeklyAttempts).forEach(([wid, a])=>{
        if(!S.weeklyAttempts[wid]) S.weeklyAttempts[wid] = a;
      });
      if(typeof WEEKLY !== 'undefined') WEEKLY.attempts = S.weeklyAttempts;
      _save(LS.WK_ATTEMPTS, S.weeklyAttempts);
    }
    toast('✅ Backup imported');
    HOME.render();
    PROG.render();
    if(typeof WEEKLY !== 'undefined') WEEKLY._renderHomeCard();
  },

  async syncNow(){
    if(!S.online){ toast('❌ Need internet to back up'); return; }
    PSYNC._setStatus('Backing up…');
    await PSYNC.pushNow();
  },

  async restoreCloud(){
    if(!S.online){ toast('❌ Need internet to restore'); return; }
    if(!confirm('Replace progress, bookmarks, flags, and wrong-answer bank on THIS device with your last cloud backup? This cannot be undone.')) return;
    PSYNC._setStatus('Restoring…');
    await PSYNC.forceRestore();
  },

  async clearQ(){
    if(!confirm('Clear cached question downloads? Your progress/bookmarks stay intact.')) return;
    await QDB.clear();
    toast('🧹 Question cache cleared');
  },

  reset(){
    if(!confirm('⚠️ This deletes ALL progress, bookmarks, flags, wrong answers, and timetable on this device. Continue?')) return;
    if(!confirm('Are you absolutely sure? This cannot be undone.')) return;
    [LS.PROG,LS.BK,LS.FL,LS.WR,LS.TT,LS.STK,LS.CHAPSTATS,LS.EXAM_SNAP,LS.TT_NOTIFIED,LS.FCOUNT].forEach(k=>localStorage.removeItem(k));
    toast('⚠️ All data reset');
    location.reload();
  },

  async wipeDevice(){
    if(!confirm('Erase ALL local data on this device (progress, bookmarks, flags, wrong-bank, cached question sets)? This cannot be undone. Anything already backed up to the cloud will still be there next time you log in online.')) return;
    [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.TT, LS.EXAM_SNAP, LS.TT_NOTIFIED, LS.CLOUD, LS.PROFILE, LS.LAST_USER].forEach(k=>localStorage.removeItem(k));
    await QDB.clear();
    toast('🗑 Local data wiped — reloading…');
    setTimeout(()=>location.reload(), 1200);
  },

  /* ---- v1.13: cloud reset + account deletion ----------- ABHYAS_PATCH_1_13 ---- */
  async resetCloud(){
    if(!S.user || !S.user.token){ toast('❌ Log in first'); return; }
    if(!S.online || S.forcedOffline){ toast('❌ Go online first — this also clears your cloud copy'); return; }
    if(!confirm('Reset your progress EVERYWHERE?\n\nThis deletes your progress, bookmarks, flags and wrong-answer bank from the server and from this device. Other devices keep their local copy until you reset them too. This cannot be undone.')) return;
    const typed = prompt('Type RESET to confirm.');
    if(typed === null || typed.trim().toUpperCase() !== 'RESET'){ toast('Cancelled — nothing was changed'); return; }
    let res;
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'resetMyProgress', username:S.user.username, token:S.user.token, confirm:'RESET'})
      }, 30000);
      res = await r.json();
    }catch(e){ toast('❌ Could not reach the server — nothing was changed'); return; }
    if(!res || !res.success){ toast('❌ ' + ((res && res.error) || 'Reset failed')); return; }
    clearTimeout(PSYNC._timer); PSYNC._timer = null;
    S.prog = {total:0,correct:0,sessions:[]}; S.bk = []; S.fl = []; S.wr = [];
    S.stk = {days:[],last:''}; S.chapStats = {}; S.fcount = {};
    [LS.PROG, LS.BK, LS.FL, LS.WR, LS.STK, LS.CHAPSTATS, LS.FCOUNT, LS.EXAM_SNAP].forEach(k=>localStorage.removeItem(k));
    toast('✅ Progress reset everywhere — reloading…');
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
    if(!confirm('Permanently delete your account?\n\nYour login, progress, payment record, weekly-set attempts and written answers (including uploaded files) are removed from the server. This cannot be undone.')) return;
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

/* ═══════════════ 10g. TUTORIAL ═══════════════ */
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
          <li><b><i class="ph ph-x-circle"></i> Wrong Bank</b> — auto-collected; needs two correct in a row, spaced apart, before it retires.</li>
        </ul>` },
    { icon: '<i class="ph ph-calendar-check"></i>', title: 'Weekly Sets',
      body: `<p>Every so often a fresh question set unlocks on the Dashboard. You get <b>exactly one attempt</b> — a graded, timed exam. Once you submit, you can only review.</p>` },
    { icon: '<i class="ph ph-pencil-line"></i>', title: 'Subjective',
      body: `<p>Under <b>Subjective</b> in the sidebar, three panels:</p>
        <ul style="margin:0 0 0 1.1rem;padding:0">
          <li><b>Q of the Day</b> — one question, timed write, then a 5-minute PDF upload.</li>
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

/* ═══════════════ 11. APP BOOT ═══════════════ */
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

    const qKeys = await QDB.keys();
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

/* ═══════════════ 12. NETWORK STATE BINDING ═══════════════ */
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
  const reallyOnline = await NETCHECK.ping();
  if(!reallyOnline) return;
  if(!S.forcedOffline){
    toast('🌐 Back online');
    if(PSYNC._timer) PSYNC.pushNow();
    if(typeof WEEKLY !== 'undefined') WEEKLY.retryUnsynced();
  } else {
    toast('🌐 Network restored — still in forced offline mode');
  }
});
window.addEventListener('offline', ()=>{
  const wasForcedOff = S.forcedOffline;
  S.online = false;
  if(!wasForcedOff){
    toast('📡 Network lost — switched to offline mode automatically');
  }
  _updateNetBtn();
  _updateOfflineWarn();
});

/* ═══════════════ 12b. NET — manual toggle ═══════════════ */
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

function toggleForcedOffline(){
  S.forcedOffline = !S.forcedOffline;
  _save(LS.FORCED_OFFLINE, S.forcedOffline);
  _updateNetBtn();
  _updateOfflineWarn();
  toast(S.forcedOffline ? '📴 Manual offline mode on' : '📶 Back online');
  if(!S.forcedOffline){
    NETCHECK.ping();
    if(PSYNC._timer) PSYNC.pushNow();
    if(typeof WEEKLY !== 'undefined') WEEKLY.retryUnsynced();
  }
}

/* ═══════════════ 13. pluralize ═══════════════ */
function pluralize(n, word, pluralWord){ return `${n} ${n===1 ? word : (pluralWord || word + 's')}`; }

/* ═══════════════ 14. BOOT SEQUENCE ═══════════════ */
document.addEventListener('DOMContentLoaded', ()=>{
  if(_load('abhyas_theme','light')==='dark') document.body.classList.add('dark');

  PWA.init();
  _updateNetBtn();
  _updateOfflineWarn();

  NETCHECK.start();
  NETCHECK.ping();
  AUTH.restore();
});

/* ═══════════════ GLOBAL EXPOSURE ═══════════════
   Only core modules are exposed here; objective.js and subjective.js
   expose their own (QUIZ, ON, LOC, PSY, REV, CNT, ONPROG, SUBJ). */
window.AUTH = AUTH;
window.NET = NET;
window.UI = UI;
window.PWA = PWA;
window.PROG = PROG;
window.HOME = HOME;
window.STREAK = STREAK;
window.TT = TT;
window.CACHE = CACHE;
window.DATA = DATA;
window.TUTORIAL = TUTORIAL;
window.APP = APP;
window.WEEKLY = WEEKLY;
window.CHAPSTATS = CHAPSTATS;
window.PSYNC = PSYNC;
window.NETCHECK = NETCHECK;
window.GETFILE_GATE = GETFILE_GATE;
window.SRCH = SRCH;
window.toggleForcedOffline = toggleForcedOffline;
window.pluralize = pluralize;
window.today = today;
window.localDateOffset = localDateOffset;
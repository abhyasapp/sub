// js/features/progress-reset.js — scoped resets with undo, and the pre-reset
// snapshot.
// MUST load AFTER: core/state.js (S), core/storage.js (_save),
// core/text.js (esc), core/constants.js (LS), core/modal.js (openMod, closeMod),
// core/toast.js (toast, toastUndo), core/sync.js (mergeResets — only via
// PSYNC on the other end), data/chapters-data.js (ChapterData),
// core/psync.js (PSYNC), features/data.js (DATA.exportAll),
// features/home.js (HOME), features/progress.js (PROG), features/review.js (REV).
// SPRINT / WRONGBY / QHIST are referenced at call time only.

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
      try { if(typeof SPRINT_LOG !== 'undefined') SPRINT_LOG.clear(); } catch(e){}
      r.all = T; r.sprint = T;
    } else if(scope === 'wr'){
      S.wr = []; r.wr = T;
    } else if(scope === 'sprint'){
      try { localStorage.setItem('abhyas_sprint_start', this._day()); localStorage.removeItem('abhyas_sprint_off'); } catch(e){}
      try { if(typeof SPRINT_LOG !== 'undefined') SPRINT_LOG.clear(); } catch(e){}
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
      return `<label class="pr-opt"><input type="radio" name="pr-scope" value="${k}"${k==='all'?' checked':''} data-on-change="PROGRESS_RESET._pick('${k}')"><span><b>${esc(s.label)}</b><span class="t-foot" style="display:block">${esc(s.help)}</span></span></label>`;
    }).join('');
    const chs = this.chapters().map(c => `<option value="${esc(c.label)}">${esc(c.label)}</option>`).join('');
    openMod('Reset progress', `
      <p class="t-callout mb3">Bookmarks, flags, notes, downloaded PDFs and your reports are <b>never</b> removed.</p>
      <div class="pr-list" role="radiogroup" aria-label="What to reset">${opts}</div>
      <div id="pr-chapter-row" style="display:none;margin:var(--sp-2) 0"><label class="t-foot" for="pr-chapter">Chapter</label>
        <select class="input" id="pr-chapter">${chs || '<option value="">No chapters yet</option>'}</select></div>
      <div class="t-foot" style="margin:var(--sp-3) 0 var(--sp-1)"><b>Back up first</b> (recommended)</div>
      <div class="bg" style="margin-bottom:var(--sp-1)">
        <button type="button" class="btn btn-quiet btn-sm" data-on-click="PROGRESS_RESET._backupFile()"><i class="ph ph-download-simple"></i> Download backup (JSON)</button>
        <button type="button" class="btn btn-quiet btn-sm" data-on-click="PROGRESS_RESET._backupCloud()"><i class="ph ph-cloud-arrow-up"></i> Back up to cloud</button>
      </div>
      <div id="pr-backup-msg" class="t-foot" aria-live="polite" style="min-height:1.2em">No backup made yet. A 24-hour undo copy is kept on this device either way.</div>
      <label class="t-foot" for="pr-typed" style="display:block;margin-top:var(--sp-3)" id="pr-typed-lbl">Type START FRESH to confirm</label>
      <input class="input" id="pr-typed" autocomplete="off" autocapitalize="characters" data-on-input="PROGRESS_RESET._check()" style="margin:var(--sp-1) 0 var(--sp-3)">
      <div class="bg"><button type="button" class="btn btn-r" id="pr-go" disabled data-on-click="PROGRESS_RESET._go()"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
      <button type="button" class="btn btn-quiet" data-on-click="closeMod()">Cancel</button></div>`);
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
  /* v1.37: the undo copy is kept until the NEXT reset replaces it. The app never expires it by itself. */
  TTL_MS: Infinity,

  save(reason, created){
    try {
      let sprint = ''; try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
      const snap = {
        at: Date.now(),
        reason: reason || 'reset',
        created: Array.isArray(created) ? created : [],
        sprint,
        sprintOff: (function(){ try { return localStorage.getItem('abhyas_sprint_off') || ''; } catch(e){ return ''; } })(),
        sprintLog: (function(){ try { return localStorage.getItem('abhyas_sprint_log') || ''; } catch(e){ return ''; } })(),
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
    if(snap.sprintLog) { try { localStorage.setItem('abhyas_sprint_log', snap.sprintLog); if(typeof SPRINT_LOG !== 'undefined') SPRINT_LOG._resetMemory(); } catch(e){} }
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
          '<button class="btn btn-solid" data-on-click="RESET_SNAPSHOT._doRestore()"><i class="ph ph-arrow-counter-clockwise"></i> Restore</button>' +
          '<button class="btn btn-quiet" data-on-click="RESET_SNAPSHOT._dismiss()">Discard</button>' +
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
window.RESET_SNAPSHOT = RESET_SNAPSHOT;
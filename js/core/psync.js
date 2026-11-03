/* js/core/psync.js — PSYNC (progress sync) + the cross-tab storage listener. */

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
      const json = JSON.stringify(this._syncPayloadForServer({ noLog: true }));      // keep the last-chance send small
      if(json.length > this._SYNC_PAYLOAD_CEILING) return;
      const body = JSON.stringify({ action:'saveProgress', username: S.user.username, token: S.user.token, data: json, baseUpdatedAt: this._rev() });
      const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.SUPABASE_URL)
        ? ABHYAS_CONFIG.SUPABASE_URL
        : APPS;
      if(navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], {type:'text/plain'}));
      }
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

  _fullLocal(){
    let qnotes;
    try { const raw = localStorage.getItem('abhyas_qnotes'); qnotes = raw ? JSON.parse(raw) : {}; } catch(e){ qnotes = {}; }
    if (!qnotes || typeof qnotes !== 'object' || Array.isArray(qnotes)) qnotes = {};
    let sprint = '';
    try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
    return {
      prog: S.prog || {total:0,correct:0,sessions:[]}, chapStats: S.chapStats || {}, cov: S.cov || {},
      bk: S.bk || [], fl: S.fl || [], wr: S.wr || [], stk: S.stk || {days:[],last:''}, qnotes, sprint,
      sprintLog: (typeof SPRINT_LOG !== 'undefined') ? SPRINT_LOG.exportForSync() : undefined,
      resets: (typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.load() : {}
    };
  },
  _counts(d){
    d = d || {};
    return { wr:(d.wr||[]).length, bk:(d.bk||[]).length, fl:(d.fl||[]).length, sessions:((d.prog&&d.prog.sessions)||[]).length, notes:Object.keys(d.qnotes||{}).length };
  },

  _mergeKeepsEverything(local, merged){
    const a = this._counts(local), b = this._counts(merged);
    return b.wr >= a.wr && b.bk >= a.bk && b.fl >= a.fl && b.notes >= a.notes && b.sessions >= Math.min(a.sessions, 50)
      && (Number(merged.prog.total)||0) >= (Number((local.prog||{}).total)||0)
      && (Number(merged.prog.correct)||0) >= (Number((local.prog||{}).correct)||0);
  },

  _snapshot(reason){
    try {
      const full = this._fullLocal();
      const c = this._counts(full);
      if(!c.wr && !c.bk && !c.fl && !c.sessions && !c.notes) return false;
      const user = (S.user && S.user.username) ? String(S.user.username).toLowerCase() : '';
      let list = []; try { list = JSON.parse(localStorage.getItem(this._SNAP_KEY) || '[]'); } catch(e){ list = []; }
      if(!Array.isArray(list)) list = [];
      const json = JSON.stringify(full);
      if(list[0] && list[0].user === user && JSON.stringify(list[0].data) === json) return true;
      list.unshift({ at: Date.now(), reason: String(reason||'sync'), user, counts: c, data: full });
      for(let keep = Math.min(list.length, 3); keep >= 1; keep--){
        try { localStorage.setItem(this._SNAP_KEY, JSON.stringify(list.slice(0, keep))); return true; } catch(e){ }
      }
    } catch(e){}
    return false;
  },
  listSnapshots(){
    const user = (S.user && S.user.username) ? String(S.user.username).toLowerCase() : '';
    try { return (JSON.parse(localStorage.getItem(this._SNAP_KEY) || '[]') || []).filter(x => x && x.user === user); } catch(e){ return []; }
  },

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
      if(m.sprintLog && typeof SPRINT_LOG !== 'undefined') SPRINT_LOG.mergeIn(m.sprintLog);
    } catch(e){}
    if(typeof PROGRESS_RESET !== 'undefined') PROGRESS_RESET.save(m.resets || {});
    try { if(typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; if(typeof QHIST !== 'undefined') QHIST._cache = null; } catch(e){}
    if(typeof HOME!=='undefined') HOME.render();
    if(typeof PROG!=='undefined') PROG.render();
    if(typeof HOME!=='undefined' && HOME.updateBadges) HOME.updateBadges();
  },

  async mergeIn(remote, reason){
    let r = remote;
    try { if(typeof r === 'string') r = await syncDecode(r); } catch(e){ return { ok:false, error:'That copy could not be read.' }; }
    if(!r || typeof r !== 'object') return { ok:false, error:'That copy is empty.' };
    
    const local = this._fullLocal();
    let merged;
    try {
      merged = mergeSyncData(local, r);
    } catch(e) {
      console.error('[PSYNC.mergeIn] merge failed:', e);
      return { ok:false, error:'The cloud data is corrupted and could not be merged.' };
    }
    
    const resetsChanged = JSON.stringify(merged.resets || {}) !== JSON.stringify(local.resets || {});
    if(!resetsChanged && !this._mergeKeepsEverything(local, merged)) {
      return { ok:false, error:'The merge was cancelled because it would have removed data. Nothing was changed.' };
    }
    
    this._snapshot(reason || 'before-merge');
    const before = this._counts(local);
    this._applyMergedObject(merged);
    const after = this._counts(merged);
    return { ok:true, added:{ wr:after.wr-before.wr, bk:after.bk-before.bk, fl:after.fl-before.fl, sessions:after.sessions-before.sessions, notes:after.notes-before.notes } };
  },

  _REV_KEY: 'abhyas_progress_rev',
  _rev(){ try { return localStorage.getItem(this._REV_KEY) || ''; } catch(e){ return ''; } },
  _setRev(v){ try { if(v) localStorage.setItem(this._REV_KEY, String(v)); } catch(e){} },

  /* opts.noLog: leave the sprint log out. It is nice-to-have; core progress must never be blocked by its size. */
  _syncPayloadForServer(opts){
    const p = S.prog || {};
    let sprint = '';
    try { sprint = localStorage.getItem('abhyas_sprint_start') || ''; } catch(e){}
    
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const recentSessions = (Array.isArray(p.sessions) ? p.sessions : [])
      .filter(s => s && Number(s.at) >= cutoff)
      .sort((a, b) => Number(b.at) - Number(a.at))
      .slice(0, 100);
    
    return {
      prog: { total: Number(p.total) || 0, correct: Number(p.correct) || 0, sessions: recentSessions },
      chapStats: S.chapStats || {},
      cov: S.cov || {},
      stk: S.stk || { days: [], last: '' },
      sprint,
      sprintLog: (opts && opts.noLog) || typeof SPRINT_LOG === 'undefined' ? undefined : SPRINT_LOG.exportForSync(),
      resets: (typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.load() : {},
      wr: [], bk: [], fl: [], qnotes: {}
    };
  },

  async pushNow(_isRetry){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._setState('syncing');
    
    let payload = null;
    try {
      payload = await syncEncode(JSON.stringify(this._syncPayloadForServer()), this._SYNC_PAYLOAD_CEILING);
      if(payload === null) {          // too big with the sprint log: send the core progress without it
        payload = await syncEncode(JSON.stringify(this._syncPayloadForServer({ noLog: true })), this._SYNC_PAYLOAD_CEILING);
      }
    } catch(e) {
      console.warn('[PSYNC.pushNow] encode failed', e);
    }
    
    if(payload === null){
      this._setStatus('Cloud copy failed. Your data is safe on this device. Download a backup file from Data.');
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
        const out = await this.mergeIn(res.data, 'before-sync');
        if(!out.ok){ this._setStatus('Sync paused: ' + out.error); this._setState('error'); return; }
        this._setRev(res.updatedAt);
        toast('\ud83d\udd04 Combined with your other device. Nothing was removed.');
        return this.pushNow(true);
      } else if(res && res.sessionInvalid){
        this._setStatus('Session expired — please log in again.');
        this._setState('error');
      } else { 
        this._setStatus('Backup failed \u2014 will retry automatically.'); 
        this._setState('error'); 
      }
    }catch(e){ 
      this._setStatus('Backup failed (offline?) \u2014 will retry automatically.'); 
      this._setState('error'); 
    }
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
  async _pull(force){
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'getProgress', username:S.user.username, token:S.user.token})
      }, 15000);
      const res = await r.json();
      if(!res || !res.success || !res.data){
        if(force) toast('No cloud backup found for this account yet.');
        return;
      }
      const out = await this.mergeIn(res.data, 'before-restore');
      if(!out.ok){ if(force) toast(out.error, 6000); return; }
      this._setRev(res.updatedAt);
      const a = out.added, n = a.wr + a.bk + a.fl + a.sessions + a.notes;
      toast(n > 0 ? '\u2705 Added your saved progress from the cloud. Nothing on this device was removed.' : '\u2705 Already up to date. Nothing was removed.', 5000);
      this._setStatus('Checked cloud backup: ' + new Date().toLocaleString());
      if(n >= 0) this.scheduleSync(); 
    }catch(e){
      if(force) toast('Could not reach your cloud backup. Check your connection and try again.');
    }
  },

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

window.PSYNC = PSYNC;
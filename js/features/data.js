// js/features/data.js — export, import, cloud backup, storage cleanup,
// reset, account delete.
// MUST load AFTER: core/state.js (S), core/storage.js (_load, _save, QDB),
// core/net.js (netFetch, APPS), core/text.js (esc), core/format.js (today),
// core/toast.js (toast), core/modal.js (ASK),
// core/constants.js (LS), core/psync.js (PSYNC).
// PROGRESS_RESET, RESET_SNAPSHOT (features/progress-reset.js) and WEEKLY
// (features/weekly.js) are referenced at call time only — data.js never
// calls them at parse. The reset() and deleteAccount() methods call
// RESET_SNAPSHOT.save(); that is a stub today and returns silently, so
// these buttons work but do not snapshot until progress-reset.js lands.

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

window.DATA = DATA;
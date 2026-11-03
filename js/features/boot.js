// js/features/boot.js — the boot sequence (after AUTH.restore) and the crash gate.

const APP = {
  _booted: false,
  async init(){
    if(APP._booted) return;
    APP._booted = true;

    try {
      if(_load('abhyas_theme','light')==='dark') document.body.classList.add('dark');
      const verEl = document.getElementById('sb-version');
      if(verEl) verEl.textContent = `${APP_NAME} (v${typeof APP_VERSION!=='undefined'?APP_VERSION:'—'})`;

      await QDB.migrateFromLocalStorage();

      /* v1.36: flags merged into bookmarks. One-time migration. */
      if(Array.isArray(S.fl) && S.fl.length){
        const seen = new Set((S.bk || []).map(b => b.uid));
        S.fl.forEach(item => {
          if(!item || !item.uid || seen.has(item.uid)) return;
          S.bk.push(Object.assign({}, item, { tag: item.tag || 'Need Check' }));
          seen.add(item.uid);
        });
        _save(LS.BK, S.bk);
        S.fl = [];
        _save(LS.FL, S.fl);
      }

      if(typeof migrateSessionScopes === 'function') migrateSessionScopes();
      if(typeof CHAPSTATS !== 'undefined' && !Object.keys(S.chapStats).length && S.prog.sessions?.length) CHAPSTATS.rebuildFromSessions();
      if(typeof COV !== 'undefined' && (!S.cov || !Object.keys(S.cov).length)) COV.rebuildFromSessions();
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
        S.profile.id = 'ha-' + (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11));
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

    } catch (err) {
      console.error('[APP.init] Boot sequence failed:', err);
      BOOT_ERROR.show(err);
    }
  }
};

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
            '<button class="btn btn-solid" type="button" data-on-click="location.reload()">' +
              '<i class="ph ph-arrow-clockwise"></i> Reload' +
            '</button>' +
            '<button class="btn btn-quiet" type="button" data-on-click="BOOT_ERROR.clearCache()">' +
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

window.APP = APP;
window.BOOT_ERROR = BOOT_ERROR;
// js/features/cache.js — offline downloads, per-level picker, autosync.

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
      
      requestAnimationFrame(() => {
        grid.innerHTML = levels.map(lv=>{
          const lvRefs = refs.filter(r=>r.lv===lv);
          const lvCached = lvRefs.filter(r=>_isCached(r.key)).length;
          return `<label class="ci" style="cursor:pointer;display:block">
            <div class="flex center between" style="gap:var(--sp-2)">
              <div class="ci-n" style="margin:0">${esc(ChapterData.levelLabel(lv))}</div>
              <input type="checkbox" class="dl-group" value="${esc(lv)}" ${picked.has(lv)?'checked':''} aria-label="Select ${esc(ChapterData.levelLabel(lv))} for download" data-on-change="CACHE.pick()">
            </div>
            <div class="ci-s"><div class="cd ${lvCached===lvRefs.length&&lvRefs.length?'y':'n'}"></div>${lvCached}/${lvRefs.length} cached</div></label>`;
        }).join('');
        CACHE._syncPickBtn(refs, cachedKeys);
      });
    }

    const el = document.getElementById('cache-list');
    if(el){
      const keys = await QDB.keys();
      if(!keys.length){
        el.innerHTML = `<div class="empty"><div class="empty-i"><i class="ph ph-cloud-slash"></i></div><p>Nothing cached yet</p><p style="font-size:.72rem;color:var(--t3);margin-top:.15rem">Open any chapter while online to cache it automatically, or use "Cache All" below.</p></div>`;
      } else {
        requestAnimationFrame(() => {
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

  CONCURRENCY: 4,
  BATCH_SIZE: 6,
  BATCH_WORKERS: 3,
  _noBatch: false,
  _poolSize(){
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(c && (c.saveData || /^(slow-2g|2g)$/i.test(c.effectiveType||''))) return 2;
    return CACHE._noBatch ? CACHE.CONCURRENCY : CACHE.BATCH_WORKERS;
  },

  async dl(groups){
    if (CACHE._running) { toast('A download is already running'); return; }
    
    const only = Array.isArray(groups) && groups.length ? new Set(groups) : null;
    const refs = ChapterData.allFileRefs().filter(r => !only || only.has(r.lv));
    if(!refs.length){ toast('No content configured to cache'); return; }
    if(!S.online){ toast('❌ You need to be online to download the cache'); return; }
    
    if (navigator.vibrate) navigator.vibrate(10);

    const pb = document.getElementById('cpb');
    const pf = document.getElementById('cpf');
    const txt = document.getElementById('cptxt');
    if(pb) pb.style.display = '';
    let done = 0, failed = 0, fetched = 0, fatal = '', rlStreak = 0;
    const startedAt = Date.now();
    
    const etaText = () => {
      if(fetched < 3) return '';
      const perFile = (Date.now() - startedAt) / fetched;
      const leftSec = Math.round((refs.length - done) * perFile / 1000);
      if(leftSec < 45) return ' · under a minute left';
      return ` · about ${Math.ceil(leftSec/60)} min left`;
    };
    
    CACHE._running = true; CACHE._paused = false; CACHE._stop = false;
    CACHE._ctl(true);
    
    let _lastPaint = 0;
    const paint = (force) => {
      const now = Date.now();
      if (!force && now - _lastPaint < 100) return;
      _lastPaint = now;
      
      if(txt) txt.textContent = `Downloading ${Math.min(done+1, refs.length)} of ${refs.length}${etaText()}`;
      if(pf) pf.style.width = `${(done/refs.length)*100}%`;
    };
    
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const isFatal = m => /session expired|access has ended/i.test(m || '');
    const isValid = v => !!v && !(typeof v === 'object' && !Array.isArray(v) && v.success === false);
    const queue = refs.slice();

    const single = async ref => {
      try{
        await QUIZ._fetch(ref.fid, ref.key);
        fetched++;
      }catch(err){
        if(isFatal(err && err.message)){ fatal = err.message; failed++; CACHE._stop = true; done++; paint(true); return; }
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
            failed += batch.length; done += batch.length; paint(true);
            return;
          }
          await singles(batch);
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
        if(res.noBatch) CACHE._noBatch = true;
        const savedNow = res.saved || [], deferredNow = res.deferred || [], failedNow = res.failed || [];
        done += savedNow.length; fetched += savedNow.length;
        if(deferredNow.length) queue.unshift(...deferredNow);
        paint();
        for(const f of failedNow){
          if(CACHE._stop) break;
          if(f.storageFull){ failed++; done++; paint(); continue; }
          await single(f.ref);
        }
      }
    };
    
    paint(true);
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

  /* ═══ Download refresh after a chapters-data change ═════════════════
     js/data/chapters-loader.js refetches chapters-data.js every few
     minutes while the app is open and fires `abhyas:chapters-updated`
     when its source actually changed. This reconciles the downloaded
     sets (QDB) with that change IMMEDIATELY instead of waiting for
     autosync (off by default) or the 24 h revalidate-on-open stamp:
       • files deleted from the chapter data are purged from the cache,
       • files added to picked groups (or everywhere when autosync is
         on) are downloaded, and
       • every already-downloaded set is rechecked against the CDN —
         with refresh=1 bypassing the serviceworker's CDN mirror — so
         changed question content reaches the offline copies right away.
     The listener is wired at the bottom of this file. */
  PENDING_KEY: 'abhyas_chapters_refresh_pending',
  _refreshLastAt: 0, _refreshing: false, _onlineHookBound: false,

  _weakConnection() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return !!(c && (c.saveData || c.type === 'cellular' || /^(slow-2g|2g|3g)$/i.test(c.effectiveType || '')));
  },

  _postponeRefresh(weak) {
    try { _save(this.PENDING_KEY, Date.now()); } catch (e) {}
    try {
      toast(weak
        ? '📖 Chapters changed — your downloaded sets will refresh on Wi-Fi or a better connection'
        : '📖 Chapters changed — reconnect to refresh your downloaded sets', 8000);
    } catch (e) {}
    if (!this._onlineHookBound) {
      this._onlineHookBound = true;
      window.addEventListener('online', () => {
        setTimeout(() => { try { CACHE.refreshFromUpdate('online-retry'); } catch (e) {} }, 3000);
      });
    }
  },

  async refreshFromUpdate(reason) {
    if (typeof ChapterData === 'undefined' || !ChapterData.allFileRefs) return;
    if (typeof QUIZ === 'undefined' || !QUIZ._fetchFromCDN) return;
    if (typeof S === 'undefined') return;
    if (this._refreshing || this._running) return;
    if (Date.now() - this._refreshLastAt < 10 * 60 * 1000) return;
    if (!S.online || S.forcedOffline) { this._postponeRefresh(false); return; }
    if (this._weakConnection()) { this._postponeRefresh(true); return; }

    this._refreshLastAt = Date.now();
    this._refreshing = true;
    try {
      const refs = ChapterData.allFileRefs();
      if (!refs.length) return;
      const byKey = new Map(refs.map(r => [r.key, r]));
      const have = new Set(await QDB.keys());
      const picked = new Set(this._picked());
      const autosyncOn = !!_load('abhyas_autosync', false);

      /* 1. Files deleted from the chapter data — drop their downloads. */
      let orphans = 0;
      for (const k of have) {
        if (!byKey.has(k)) { await QDB.del(k); orphans++; }
      }

      /* 2. Reset the 24 h per-file revalidation stamps so the next time
            a changed chapter is OPENED online it rechecks immediately */
      try { localStorage.removeItem('abhyas_qts'); } catch (e) {}

      /* 3. New files since the change + 4. recheck downloaded ones. */
      const toAdd = refs.filter(r => !have.has(r.key) && (autosyncOn || picked.has(r.lv)));
      const toUpdate = refs.filter(r => have.has(r.key));
      const targets = toAdd.concat(toUpdate);
      let added = 0, updated = 0, failed = 0, done = 0;
      if (targets.length) {
        const total = targets.length;
        this._badge('Refreshing downloads · 0/' + total);
        const sameData = (a, b) => {
          try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
        };
        let _i = 0;
        const worker = async () => {
          for (;;) {
            const i = _i++;
            if (i >= total) return;
            const ref = targets[i];
            done++;
            if (done % 10 === 0 || done === total) this._badge('Refreshing downloads · ' + done + '/' + total);
            try {
              const data = await QUIZ._fetchFromCDN(ref.fid, 12000, { fresh: true });
              if (!data || (typeof data === 'object' && !Array.isArray(data) && data.success === false)) {
                throw new Error('CDN miss');
              }
              const prev = await QDB.get(ref.key);
              if (prev != null) {
                if (!sameData(prev, data)) {
                  if (await QDB.set(ref.key, data)) updated++; else failed++;
                }
              } else if (await QDB.set(ref.key, data)) added++; else failed++;
            } catch (cdnErr) {
              /* Offline downloads keep their copy unless nothing was saved yet. */
              if (!(await QDB.get(ref.key))) {
                try { await QUIZ._fetch(ref.fid, ref.key, 1, 'bg'); added++; } catch (e) { failed++; }
              } else failed++;
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker));
        this._badge(null);
      }
      if (typeof UI !== 'undefined' && UI.cur === 'offline') this.render();

      const bits = [];
      if (added) bits.push(added + ' new question ' + (added === 1 ? 'set' : 'sets') + ' added to your downloads');
      if (updated) bits.push(updated + (updated === 1 ? ' set was' : ' sets were') + ' updated for offline use');
      if (orphans) bits.push(orphans + ' removed ' + (orphans === 1 ? 'download' : 'downloads') + ' cleaned up');
      try { if (bits.length) toast('🔄 ' + bits.join(' · '), 7000); } catch (e) {}
      try {
        if (!bits.length && reason === 'pending') {
          toast('✅ Your downloaded sets already match the latest chapter data', 6000);
        }
      } catch (e) {}
    } finally {
      this._refreshing = false;
      try { localStorage.removeItem(this.PENDING_KEY); } catch (e) {}
    }
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

window.CACHE = CACHE;

/* Wire the chapters-loader change event → immediate download refresh.
   (The loader fires `abhyas:chapters-updated` only when chapters-data.js
   actually changed, so this runs at most once per real content change.) */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('abhyas:chapters-updated', function (e) {
    try {
      const p = CACHE.refreshFromUpdate((e && e.detail && e.detail.reason) || 'background');
      if (p && typeof p.catch === 'function') {
        p.catch(function (err) { console.warn('[CACHE] download refresh failed:', err); });
      }
      return p;
    } catch (err) { console.warn('[CACHE] download refresh failed:', err); }
  });
  /* If a refresh was postponed (offline / bad connection), retry shortly
     after the next boot even though the loader won't fire the event again
     for an unchanged source. */
  try {
    if (_load(CACHE.PENDING_KEY, 0)) {
      setTimeout(function () { try { CACHE.refreshFromUpdate('pending'); } catch (e) {} }, 12000);
    }
  } catch (e) {}
}
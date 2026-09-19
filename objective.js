/* ═══════════════════════════════════════════════════════════════════════
   OBJECTIVE.JS — MCQ quiz engine and everything that trains on it.

   Loaded via <script src="objective.js"> AFTER app.js and BEFORE
   subjective.js in user.html. Classic-script global scope, no modules.

   Depends on globals from app.js:
     S, LS, APP_CONFIG, APPS, _save, _load, toast, toastUndo,
     openMod, closeMod, _anyModalOpen, qs, netFetch, shuf, fmt, fmtHMS,
     isOk, qImgHtml, qSearchHtml, normQ, renderMath, pluralize,
     today, localDateOffset, QDB, PSYNC, WEEKLY, HOME, PROG, CHAPSTATS,
     STREAK, TT, UI, DATA, TUTORIAL, SRCH

   Exposes on window:
     QUIZ, ON, LOC, PSY, REV, CNT, ONPROG,
     fidFromUid, scopeLeaves, scopedStats, fileStatsMap,
     migrateSessionScopes
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════ SCOPE UTILITIES ═══════════════
   These are used by both the MCQ progress view (ONPROG) and the online
   study file picker (ON). Kept here because they're conceptually about
   scoping a quiz to a level/chapter/book/subtopic — MCQ-specific.

   migrateSessionScopes() backfills `chapterKey` on old session records
   so admin analytics that filter by canonical chapter name match them
   properly. Called (defensively, via typeof) from PROG.render and
   PSYNC._pull. */

function migrateSessionScopes(){
  if(!Array.isArray(S.prog.sessions)) return;
  let changed = false;
  S.prog.sessions.forEach(s=>{
    if(!s.chapterKey && s.chapter){
      // Reverse-map from a display label like "Structural Engineering — Abhyas"
      // to the canonical key "Structural Engineering". If nothing looks
      // like a scope delimiter, keep the whole string — it's still better
      // than leaving chapterKey undefined.
      const cleaned = String(s.chapter).split(' — ')[0].trim();
      if(cleaned){ s.chapterKey = cleaned; changed = true; }
    }
  });
  if(changed) _save(LS.PROG, S.prog);
}

function scopeLeaves(lv,ch,book,sub){
  let refs;
  if(!lv){ refs = ChapterData.allFileRefs(); }
  else if(!ch){
    refs = [];
    Object.keys(ChapterData.chapters(lv)).forEach(c=>refs.push(...ChapterData.chapterFileRefs(lv,c)));
  } else {
    refs = ChapterData.chapterFileRefs(lv,ch);
  }
  if(book) refs = refs.filter(r=>r.book===book);
  if(sub)  refs = refs.filter(r=>r.subtopic===sub);
  return refs;
}

function fidFromUid(uid){
  const i = uid.lastIndexOf('_');
  return i > -1 ? uid.slice(0,i) : uid;
}

function fileStatsMap(leaves){
  const map = new Map();
  leaves.forEach(ref=>{ if(!map.has(ref.fid)) map.set(ref.fid, {practised:new Set(), attempted:0, correct:0, wrong:0}); });
  S.prog.sessions.forEach(s=>{
    (s.qres||[]).forEach(q=>{
      if(!q || !q.uid) return;
      const rec = map.get(fidFromUid(q.uid));
      if(!rec) return;
      rec.practised.add(q.uid);
      rec.attempted++;
      if(q.ok) rec.correct++; else rec.wrong++;
    });
  });
  return map;
}

function scopedStats(leaves){
  const fileMap = fileStatsMap(leaves);
  const uids = new Set();
  let attempted=0, correct=0, wrong=0;
  fileMap.forEach(rec=>{
    rec.practised.forEach(u=>uids.add(u));
    attempted += rec.attempted; correct += rec.correct; wrong += rec.wrong;
  });
  return {practised:uids.size, attempted, correct, wrong, fileMap};
}

/* ═══════════════ CNT — question-counting helpers ═══════════════ */
const CNT_AUTO_LIMIT = 20;

const CNT = {
  _lastError: null,
  async forFile(ref){
    if(!ref.fid) return null;
    if(S.fcount[ref.fid] != null) return S.fcount[ref.fid];
    try{
      const raw = await QUIZ._fetch(ref.fid, ref.key);
      const n = normQ(raw, ref.fid).length;
      S.fcount[ref.fid] = n;
      _save(LS.FCOUNT, S.fcount);
      return n;
    }catch(e){ CNT._lastError = e && e.message; return null; }
  },
  knownTotal(leaves){
    let sum = 0, unknown = 0;
    leaves.forEach(ref=>{
      const n = S.fcount[ref.fid];
      if(n==null) unknown++; else sum += n;
    });
    return {total:sum, files:leaves.length, unknown};
  },
  async totalFor(lv,ch,book,sub,{force=false, onTick}={}){
    const leaves = scopeLeaves(lv,ch,book,sub);
    const known = CNT.knownTotal(leaves);
    if(known.unknown===0) return known;
    if(!force && leaves.length>CNT_AUTO_LIMIT) return {...known, needsConfirm:true};
    let sum = 0, unknown = 0, done = 0;
    const CONC = 4; let i = 0;
    async function worker(){
      while(i<leaves.length){
        const ref = leaves[i++];
        const n = await CNT.forFile(ref);
        if(n==null) unknown++; else sum += n;
        done++; onTick && onTick(done, leaves.length);
      }
    }
    await Promise.all(Array.from({length:Math.max(1,Math.min(CONC,leaves.length))}, worker));
    return {total:sum, files:leaves.length, unknown};
  }
};

/* ═══════════════ ONPROG — per-scope progress panel ═══════════════ */
const ONPROG = {
  metric: 'practised',
  filewiseOpen: false,
  _seq: 0,
  _lastLeaves: [],

  setMetric(m){
    ONPROG.metric = m;
    document.querySelectorAll('#on-prog-tabs .mtab').forEach(b=>b.classList.toggle('active', b.dataset.m===m));
    ONPROG.render();
  },

  toggleFilewise(){
    ONPROG.filewiseOpen = !ONPROG.filewiseOpen;
    ONPROG.render();
  },

  resetFile(fid){
    if(!fid) return;
    const ref = ONPROG._lastLeaves.find(l=>l.fid===fid);
    const label = ref ? `${ref.book} — ${ref.subtopic}` : 'this file';
    if(!confirm(`Reset practice progress for "${label}"?\n\nThis clears only the Practised/Attempted/Correct/Wrong counts for this one file. Bookmarks, flags, and your wrong-answer bank are not touched — and the question file itself is never modified.`)) return;
    let removedTotal=0, removedCorrectTotal=0;
    S.prog.sessions.forEach(s=>{
      if(!s.qres || !s.qres.length) return;
      const kept = [];
      let removedHere=0, removedCorrectHere=0;
      s.qres.forEach(q=>{
        if(q && q.uid && fidFromUid(q.uid)===fid){
          removedHere++;
          if(q.ok) removedCorrectHere++;
        } else kept.push(q);
      });
      if(removedHere){
        s.qres = kept;
        s.correct = Math.max(0,(s.correct||0) - removedCorrectHere);
        s.wrong   = Math.max(0,(s.wrong||0)   - (removedHere - removedCorrectHere));
        s.total   = Math.max(0,(s.total||0)   - removedHere);
        removedTotal += removedHere;
        removedCorrectTotal += removedCorrectHere;
      }
    });
    S.prog.sessions = S.prog.sessions.filter(s => (s.qres && s.qres.length) || (s.total||0) > 0);
    S.prog.total   = Math.max(0,(S.prog.total||0)   - removedTotal);
    S.prog.correct = Math.max(0,(S.prog.correct||0) - removedCorrectTotal);
    _save(LS.PROG, S.prog);
    toast(removedTotal ? `✅ Reset "${label}" — ${removedTotal} record(s) cleared` : `Nothing to reset for "${label}"`);
    ONPROG.render();
    if(typeof HOME!=='undefined' && HOME.render) HOME.render();
  },

  _scope(){
    const lv   = document.getElementById('on-lv')?.value   || '';
    const ch   = document.getElementById('on-ch')?.value   || '';
    const book = document.getElementById('on-bk')?.value   || '';
    const ts   = document.getElementById('on-to');
    const opt  = ts && ts.selectedIndex>=0 ? ts.options[ts.selectedIndex] : null;
    const valid = opt && opt.dataset && opt.dataset.sub && !opt.disabled;
    return {lv, ch, book, sub: valid?opt.dataset.sub:'', fid: valid?opt.value:''};
  },

  async render(force=false){
    ONPROG._renderOldPreview();

    const el      = document.getElementById('on-progress-card');
    const titleEl = document.getElementById('on-prog-title');
    const bodyEl  = document.getElementById('on-prog-body');
    if(!el || !titleEl || !bodyEl) return;

    const {lv,ch,book,sub,fid} = ONPROG._scope();
    const mySeq = ++ONPROG._seq;

    if(!lv){
      titleEl.textContent = '📊 Overall Progress';
      const total = S.prog.total, correct = S.prog.correct, wrong = total - correct;
      const pct = total ? Math.round((correct/total)*100) : 0;
      bodyEl.innerHTML = `
        <div class="prog-grid">
          <div class="sc"><div class="sv tcy">${total}</div><div class="stat-lbl">Attempted</div></div>
          <div class="sc"><div class="sv tc2">${correct}</div><div class="stat-lbl">Correct</div></div>
          <div class="sc"><div class="sv tb2">${wrong}</div><div class="stat-lbl">Wrong</div></div>
        </div>
        <div class="pb-w" style="margin-top:.6rem"><div class="pb-l"><span>Accuracy</span><span>${pct}%</span></div><div class="pb"><div class="pb-f" style="width:${pct}%"></div></div></div>
        <div style="font-size:.68rem;color:var(--t3);margin-top:.5rem">Pick a Level, Chapter, Book or Subtopic above to see coverage for that scope.</div>`;
      return;
    }

    const lvLabel = document.getElementById('on-lv').selectedOptions[0]?.textContent.replace(/^📖\s*/,'') || lv;
    const label = fid  ? `${ChapterData.chapterName(lv,ch)} — ${book} — ${sub}`
                : book ? `${ChapterData.chapterName(lv,ch)} — ${book}`
                : ch   ? ChapterData.chapterName(lv,ch)
                : lvLabel;
    titleEl.textContent = `📊 ${label}`;

    const leaves = scopeLeaves(lv,ch,book,sub);
    ONPROG._lastLeaves = leaves;
    const scoped = scopedStats(leaves);
    const known = CNT.knownTotal(leaves);

    const paint = (info)=>{
      if(mySeq !== ONPROG._seq) return;
      const total = info.total;
      const vals = {practised:scoped.practised, attempted:scoped.attempted, correct:scoped.correct, wrong:scoped.wrong};
      const metricVal = vals[ONPROG.metric];
      const metricLabel = {practised:'Practised', attempted:'Attempted', correct:'Correct', wrong:'Wrong'}[ONPROG.metric];
      const barColor = ONPROG.metric==='wrong' ? 'var(--ros)'
                     : ONPROG.metric==='correct' ? 'var(--grn)'
                     : 'var(--amb)';
      const pct = total ? Math.min(100, Math.round((metricVal/total)*100)) : 0;
      const unknownNote = info.unknown
        ? `<div style="font-size:.66rem;color:var(--t3);margin-top:.45rem"><i class="ph ph-warning"></i> ${info.unknown} of ${info.files} file${info.files>1?'s':''} not counted yet${CNT._lastError ? ' — ' + esc(CNT._lastError) : ' (offline, or not downloaded)'}</div>`
        : '';
      const confirmBtn = info.needsConfirm
        ? `<button class="btn btn-sm btn-a" style="margin-top:.5rem" onclick="ONPROG.render(true)"><i class="ph ph-list-numbers"></i> Count questions (${info.files} files)</button>`
        : '';

      let filewiseHtml = '';
      if(leaves.length>1 && leaves.length<=100){
        const showBook = !book;
        const rows = leaves.map(ref=>{
          const rec = scoped.fileMap.get(ref.fid) || {practised:new Set(), attempted:0, correct:0, wrong:0};
          const fVals = {practised:rec.practised.size, attempted:rec.attempted, correct:rec.correct, wrong:rec.wrong};
          const fVal = fVals[ONPROG.metric];
          const fTotal = S.fcount[ref.fid];
          const fPct = fTotal ? Math.min(100, Math.round((fVal/fTotal)*100)) : 0;
          const rowLabel = showBook ? `${ref.book} — ${ref.subtopic}` : ref.subtopic;
          return `<div class="pb-w fw-row">
            <div class="pb-l">
              <span>${esc(rowLabel)}</span>
              <span class="fw-row-right">${fVal} / ${fTotal!=null?fTotal:'?'}${fTotal!=null?` (${fPct}%)`:''}
                <button class="fw-reset" title="Reset progress for this file" aria-label="Reset progress for this file" data-fid="${esc(ref.fid)}" onclick="event.stopPropagation();ONPROG.resetFile(this.dataset.fid)"><i class="ph ph-trash"></i></button>
              </span>
            </div>
            <div class="pb"><div class="pb-f" style="width:${fTotal!=null?fPct:0}%;background:${barColor}"></div></div>
          </div>`;
        }).join('');
        filewiseHtml = `
          <div class="fw-toggle" onclick="ONPROG.toggleFilewise()">
            <span>${ONPROG.filewiseOpen?'▾':'▸'}</span> <i class="ph ph-folder"></i> Filewise breakdown (${leaves.length} files)
          </div>
          <div id="on-fw-list" style="display:${ONPROG.filewiseOpen?'block':'none'}">${rows}</div>`;
      }

      const scopeResetBtn = fid
        ? ` <button class="fw-reset" title="Reset progress for this file" aria-label="Reset progress for this file" data-fid="${esc(fid)}" onclick="ONPROG.resetFile(this.dataset.fid)"><i class="ph ph-trash"></i></button>`
        : '';

      bodyEl.innerHTML = `
        <div class="prog-grid">
          <div class="sc"><div class="sv tcy">${scoped.practised}</div><div class="stat-lbl">Practised</div></div>
          <div class="sc"><div class="sv ta2">${scoped.attempted}</div><div class="stat-lbl">Attempted</div></div>
          <div class="sc"><div class="sv tc2">${scoped.correct}</div><div class="stat-lbl">Correct</div></div>
          <div class="sc"><div class="sv tb2">${scoped.wrong}</div><div class="stat-lbl">Wrong</div></div>
        </div>
        ${info.needsConfirm ? confirmBtn : `
          <div class="pb-w" style="margin-top:.65rem">
            <div class="pb-l">
              <span>${metricLabel} coverage (compiled)</span>
              <span>${metricVal} / ${total||'?'} (${pct}%)${scopeResetBtn}</span>
            </div>
            <div class="pb"><div class="pb-f" style="width:${pct}%;background:${barColor}"></div></div>
          </div>`}
        ${unknownNote}
        ${info.needsConfirm ? '' : filewiseHtml}
      `;
    };

    if(known.unknown===0){ paint(known); return; }
    bodyEl.innerHTML = `<div class="empty" style="padding:.8rem 0"><div class="empty-i">⏳</div><p>Counting questions…</p></div>`;
    const info = await CNT.totalFor(lv,ch,book,sub,{
      force,
      onTick:(done,files)=>{
        if(mySeq !== ONPROG._seq) return;
        const p = bodyEl.querySelector('p');
        if(p && files>1) p.textContent = `Counting questions… ${done}/${files} files`;
      }
    });
    paint(info);
  },

  _renderOldPreview(){
    const el = document.getElementById('on-progress-preview');
    if(!el) return;
    const lv   = document.getElementById('on-lv')?.value || '';
    const ch   = document.getElementById('on-ch')?.value || '';
    const book = document.getElementById('on-bk')?.value || '';
    if(!lv || !ch){ el.innerHTML=''; return; }
    const chapterLabel = ChapterData.chapterName(lv,ch) + (book? ' — '+book : '');
    const match = CHAPSTATS.entries().find(c=>c.chapter===chapterLabel);
    if(!match){
      el.innerHTML = `<p style="font-size:.7rem;color:var(--t3);margin-top:.3rem">No attempts yet for this chapter.</p>`;
      return;
    }
    el.innerHTML = `<p style="font-size:.7rem;color:var(--t3);margin-top:.3rem">📊 Your accuracy here so far: <strong style="color:${match.accuracy>=75?'var(--ok)':match.accuracy>=50?'var(--amb)':'var(--bad)'}">${match.accuracy}%</strong> (${match.correct}/${match.attempted})</p>`;
  }
};

/* ═══════════════ ON — Online Study picker ═══════════════ */
const ON = {
  onLv(){
    const lv=document.getElementById('on-lv').value;
    const cs=document.getElementById('on-ch');
    cs.innerHTML='<option value="">📘 Select Chapter…</option>';cs.disabled=!lv;
    const bs=document.getElementById('on-bk');bs.innerHTML='<option value="">📚 Select Book…</option>';bs.disabled=true;
    const ts=document.getElementById('on-to');ts.innerHTML='<option value="">📑 Select Subtopic…</option>';ts.disabled=true;
    if(lv){
      Object.entries(ChapterData.chapters(lv)).forEach(([k,n])=>{
        const fc=ChapterData.fileCount(lv,k);
        const o=document.createElement('option');o.value=k;o.textContent=`Ch${k}: ${n}${fc?'':' (coming soon)'}`;cs.appendChild(o);
      });
    }
    ONPROG.render();
  },
  onCh(){
    const lv=document.getElementById('on-lv').value,ch=document.getElementById('on-ch').value;
    const bs=document.getElementById('on-bk');
    bs.innerHTML='<option value="">📚 Select Book…</option>';bs.disabled=true;
    const ts=document.getElementById('on-to');ts.innerHTML='<option value="">📑 Select Subtopic…</option>';ts.disabled=true;
    if(lv&&ch){
      const books=ChapterData.books(lv,ch);
      if(!Object.keys(books).length){
        bs.innerHTML='<option value="">No books yet for this chapter</option>';
        toast('ℹ️ This chapter has no question files yet');
      } else {
        Object.keys(books).forEach(book=>{
          const fc=ChapterData.fileCount(lv,ch,book);
          const o=document.createElement('option');o.value=book;o.textContent=`${book}${fc?'':' (coming soon)'}`;bs.appendChild(o);
        });
        bs.disabled=false;
      }
    }
    ONPROG.render();
  },
  async onBook(){
    const lv=document.getElementById('on-lv').value,ch=document.getElementById('on-ch').value,book=document.getElementById('on-bk').value;
    const ts=document.getElementById('on-to');
    ts.innerHTML='<option value="">📑 Select Subtopic…</option>';ts.disabled=true;
    if(lv&&ch&&book){
      const files=ChapterData.files(lv,ch,book);
      if(!Object.keys(files).length){
        ts.innerHTML='<option value="">No files yet for this book</option>';
        toast('ℹ️ This book has no question files yet');
      } else {
        const isOfflineMode = !S.online || S.forcedOffline;
        const cachedKeys = new Set(await QDB.keys());
        let anyEnabled = false;
        Object.entries(files).forEach(([n,id])=>{
          if(!id)return;
          const cacheKey = `${lv}_${ch}_${book}_${n}`;
          const isCached = cachedKeys.has(cacheKey);
          const o=document.createElement('option');
          o.value=id;
          o.dataset.key=cacheKey;
          o.dataset.sub=n;
          if(isOfflineMode && !isCached){
            o.textContent = `🔒 ${n} (not cached)`;
            o.disabled = true;
            o.style.color = 'var(--t3)';
          } else {
            o.textContent = isCached ? `📦 ${n}` : n;
            anyEnabled = true;
          }
          ts.appendChild(o);
        });
        ts.disabled=false;
        if(isOfflineMode && !anyEnabled){
          ts.innerHTML='<option value="">No cached files for this book</option>';
          toast('📡 You\'re offline — no cached files in this book. Cache them first while online.');
        }
      }
    }
    ONPROG.render();
  },
  start(mode){
    const ts=document.getElementById('on-to');
    const fid=ts.value,opt=ts.options[ts.selectedIndex],key=opt?.dataset?.key;
    const ch=document.getElementById('on-ch').value,lv=document.getElementById('on-lv').value,book=document.getElementById('on-bk').value;
    if(!fid||!key){toast('Select a subtopic');return}
    const sub=opt?.dataset?.sub||'';
    const name=`${ChapterData.chapterName(lv,ch)} — ${book}`;
    QUIZ.load(fid,key,mode,name,{lv,ch,book,sub,fid});
  }
};

/* ═══════════════ LOC — Local File ═══════════════ */
const LOC = {
  onFile(){
    const f=document.getElementById('loc-file').files[0];if(!f)return;
    const nameEl=document.getElementById('loc-file-name');
    if(nameEl) nameEl.textContent=f.name;
    const r=new FileReader();
    r.onload=e=>{
      try{
        const qs2=normQ(JSON.parse(e.target.result),'local');
        if(!qs2.length){toast('❌ No valid questions found in file');return}
        S.localQs=qs2;
        const info=document.getElementById('loc-info');
        info.style.display='';info.textContent=`✅ ${pluralize(qs2.length,'question')} loaded from "${f.name}"`;
        document.getElementById('loc-pr').disabled=false;
        document.getElementById('loc-ex').disabled=false;
        toast(`✅ ${pluralize(qs2.length,'question')} ready`);
      }catch{toast('❌ Invalid JSON file')}
    };
    r.onerror=()=>toast('❌ Could not read file');
    r.readAsText(f);
  },
  start(mode){
    if(!S.localQs){toast('Load a JSON file first');return}
    QUIZ.startWith([...S.localQs],mode,'Local File');
  }
};

/* ═══════════════ PSY — Psycho Mode ═══════════════ */
const PSY = {
  LEVELS:[['level5','Level 5 — Diploma'],['level7','Level 7 — Civil Engineering'],['gk','General Knowledge']],
  init(){
    const box=document.getElementById('psy-levels');
    box.innerHTML = PSY.LEVELS.map(([lv,label])=>{
      const names=ChapterData.chapters(lv);
      const items=Object.entries(names).map(([k,n])=>{
        const fc=ChapterData.fileCount(lv,k);
        return `<div class="ch-item" tabindex="0" role="button" onclick="this.querySelector('input').click()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.querySelector('input').click()}">
          <input type="checkbox" value="${k}" data-lv="${lv}" ${fc?'':'disabled'} onclick="event.stopPropagation();PSY._info()">
          <div class="ch-num">${k}</div>
          <div class="ch-name">${n}${fc?'':' <span style=\"color:var(--t3)\">(no files)</span>'}</div>
          <div class="ch-cnt">${fc}f</div>
        </div>`;
      }).join('');
      return `<div class="sb-lbl" style="margin-top:.7rem;display:flex;align-items:center;justify-content:space-between;padding-right:.2rem">
          <span>${label}</span>
          <span style="display:flex;gap:.3rem">
            <button class="btn btn-sm btn-c" style="font-size:.56rem;padding:.15rem .4rem" onclick="PSY.allLv('${lv}')"><i class="ph ph-check"></i> All</button>
            <button class="btn btn-sm btn-r" style="font-size:.56rem;padding:.15rem .4rem" onclick="PSY.noneLv('${lv}')">✕</button>
          </span>
        </div>
        <div class="ch-list" id="psy-lv-${lv}">${items || '<div class="empty"><div class="empty-i"><i class="ph ph-book-open"></i></div><p>No chapters yet</p></div>'}</div>`;
    }).join('');
    PSY._info();
  },
  all(){document.querySelectorAll('#psy-levels input:not(:disabled)').forEach(c=>c.checked=true);PSY._info()},
  none(){document.querySelectorAll('#psy-levels input').forEach(c=>c.checked=false);PSY._info()},
  allLv(lv){document.querySelectorAll(`#psy-lv-${lv} input:not(:disabled)`).forEach(c=>c.checked=true);PSY._info()},
  noneLv(lv){document.querySelectorAll(`#psy-lv-${lv} input`).forEach(c=>c.checked=false);PSY._info()},
  _info(){
    const n=document.querySelectorAll('#psy-levels input:checked').length;
    document.getElementById('psy-info').textContent=n?`${n} chapter${n>1?'s':''} selected — ready to load`:'Select at least 1 chapter to continue';
  },
  async start(type){
    const cbs=[...document.querySelectorAll('#psy-levels input:checked')];
    if(!cbs.length){toast('Select at least one chapter');return}
    // Parallel fetch with concurrency 4 — 60+ files fetched serially
    // turned into minutes of wall time on a slow connection.
    const refs = [];
    for(const cb of cbs){
      const lv = cb.dataset.lv;
      const ch = cb.value;
      refs.push(...ChapterData.chapterFileRefs(lv, ch));
    }
    QUIZ._showLoader(`Loading ${pluralize(refs.length,'file')}…`);
    const all=[];
    let done=0, failed=0, i=0;
    const loaderMsg = () => {
      const el = document.getElementById('quiz-loader-msg');
      if(el) el.textContent = `Loading files (${done}/${refs.length})…`;
    };
    async function worker(){
      while(i < refs.length){
        const ref = refs[i++];
        try{
          const raw = await QUIZ._fetch(ref.fid, ref.key);
          all.push(...normQ(raw, ref.fid));
        }catch(e){
          failed++;
        }
        done++;
        loaderMsg();
      }
    }
    await Promise.all(Array.from({length: Math.min(4, refs.length)}, worker));
    QUIZ._hideLoader();
    if(!all.length){toast('❌ No questions loaded. Cache data first if offline.',5000);return}
    if(failed>0) toast(`⚠️ ${failed} file${failed>1?'s':''} failed to load — starting with ${all.length} questions`);
    let qsArr=shuf(all);
    if(type==='exam')qsArr=qsArr.slice(0,100);
    if(type==='weak'){
      const wu=new Set(S.wr.map(w=>w.uid));
      const weak=qsArr.filter(q=>wu.has(q.uid));
      qsArr=weak.length?weak:qsArr.slice(0,50);
      if(!weak.length)toast('ℹ️ No wrong answers yet — showing 50 random instead');
    }
    QUIZ.startWith(qsArr,type==='exam'?'exam':'flashcard','⚡ Psycho Mode');
  }
};

/* ═══════════════ REV — Review lists ═══════════════ */
const REV = {
  _store(kind){ return kind==='bk'?S.bk : kind==='fl'?S.fl : S.wr; },
  _lsKey(kind){ return kind==='bk'?LS.BK : kind==='fl'?LS.FL : LS.WR; },
  _listEl(kind){ return kind==='bk'?'bk-list' : kind==='fl'?'fl-list' : 'wr-list'; },

  _stripHeavy(q){
    if(!q || !q.img) return q;
    const {img, imgCaption, ...rest} = q;
    return rest;
  },

  toggle(kind, question){
    const arr = REV._store(kind);
    const i = arr.findIndex(x=>x.uid===question.uid);
    if(i>-1){ arr.splice(i,1); toast(kind==='bk'?'⭐ Removed bookmark':'🚩 Removed flag'); }
    else { arr.push(kind==='bk' ? {...REV._stripHeavy(question), tag:''} : REV._stripHeavy(question)); toast(kind==='bk'?'⭐ Bookmarked':'🚩 Flagged'); }
    _save(REV._lsKey(kind), arr);
    HOME.updateBadges();
    return i===-1;
  },
  has(kind, uid){ return REV._store(kind).some(x=>x.uid===uid); },
  getTag(uid){ return S.bk.find(x=>x.uid===uid)?.tag || ''; },
  setTag(uid, tag, questionObj){
    let item = S.bk.find(x=>x.uid===uid);
    if(!item && questionObj){ item = {...REV._stripHeavy(questionObj), tag: ''}; S.bk.push(item); }
    if(!item) return;
    item.tag = tag;
    _save(LS.BK, S.bk);
    REV.renderList('bk');
    HOME.updateBadges?.();
  },

  addWrong(question){
    const existing = S.wr.find(x=>x.uid===question.uid);
    if(existing){ existing._streak = 0; existing._nextDue = Date.now(); _save(LS.WR, S.wr); HOME.updateBadges(); return; }
    S.wr.push({...REV._stripHeavy(question), _streak:0, _nextDue: Date.now()});
    _save(LS.WR, S.wr);
    HOME.updateBadges();
  },
  removeWrong(uid){
    const i=S.wr.findIndex(x=>x.uid===uid);
    if(i>-1){ S.wr.splice(i,1); _save(LS.WR, S.wr); HOME.updateBadges(); }
  },
  trackAnswer(question, isCorrect){
    if(isCorrect){
      const item = S.wr.find(x=>x.uid===question.uid);
      if(!item) return;
      item._streak = (item._streak||0) + 1;
      if(item._streak >= SR_INTERVALS.length){ REV.removeWrong(question.uid); }
      else {
        const days = SR_INTERVALS[item._streak - 1];
        item._nextDue = Date.now() + days*24*60*60*1000;
        _save(LS.WR, S.wr);
      }
    } else {
      REV.addWrong(question);
    }
  },
  dueWrong(){ return S.wr.filter(x => (x._nextDue==null) || x._nextDue <= Date.now()); },
  dueCount(){ return REV.dueWrong().length; },

  renderList(kind){
    let arr = REV._store(kind);
    const el = document.getElementById(REV._listEl(kind));
    if(!el)return;
    if(!arr.length){
      const copy = kind==='bk'
        ? { i:'<i class="ph ph-star"></i>', t:'No bookmarks yet', s:'Tap the star on any question while studying to save it here.' }
        : kind==='fl'
        ? { i:'<i class="ph ph-flag"></i>', t:'No flagged questions yet', s:'Tap the flag on a question you want to come back to.' }
        : { i:'<i class="ph ph-x-circle"></i>', t:'No wrong answers yet', s:'Questions you miss land here automatically, ready for spaced review.' };
      el.innerHTML = `<div class="empty"><div class="empty-i">${copy.i}</div><p>${copy.t}</p><p style="font-size:.72rem;color:var(--t3);margin-top:.15rem">${copy.s}</p></div>`;
      return;
    }
    if(kind==='wr'){
      arr = [...arr].sort((a,b)=>(a._nextDue??0)-(b._nextDue??0));
    }
    el.innerHTML = arr.map((q,i)=>{
      const opts=(q.options||[]).map((o,j)=>{
        const c=String(j)===String(q.correct)||j===Number(q.correct);
        return `<div class="eo${c?' shc':''}">${String.fromCharCode(65+j)}) ${esc(o)}</div>`;
      }).join('');
      const uidJson = JSON.stringify(String(q.uid||''));
      const kindJson = JSON.stringify(kind);
      const tagPicker = kind==='bk' ? `
        <select class="sel-c" style="margin-top:.4rem;font-size:.7rem;padding:.25rem .4rem;width:auto" onchange='REV.setTag(${uidJson}, this.value)'>
          <option value="">🏷 No tag</option>
          ${BK_TAGS.map(t=>`<option value="${t}" ${q.tag===t?'selected':''}>${t}</option>`).join('')}
        </select>` : '';
      let srBadge = '';
      if(kind==='wr'){
        const isDue = (q._nextDue==null) || q._nextDue<=Date.now();
        const streak = q._streak||0;
        if(isDue){ srBadge = `<span class="ctag tr" style="margin-left:.3rem"><i class="ph ph-repeat"></i> Due now</span>`; }
        else {
          const daysLeft = Math.ceil((q._nextDue-Date.now())/(24*60*60*1000));
          srBadge = `<span class="ctag ta" style="margin-left:.3rem">⏳ Due in ${daysLeft}d</span>`;
        }
        if(streak>0) srBadge += `<span class="ctag tg" style="margin-left:.3rem"><i class="ph ph-check"></i>×${streak}</span>`;
      }
      return `<div class="qcard" style="margin-bottom:.5rem">
        <div class="qm"><span class="qn mono">#${i+1}</span>
          ${q.tag ? `<span class="ctag ta" style="margin-left:.3rem"><i class="ph ph-tag"></i> ${esc(q.tag)}</span>` : ''}
          ${srBadge}
          ${qSearchHtml(q)}
          <button class="ib" onclick='REV._removeOne(${kindJson},${uidJson})' title="Remove from review" aria-label="Remove from review"><i class="ph ph-trash"></i></button>
        </div>
        <div class="qt" style="font-size:.82rem">${esc(q.q)}</div>
        ${qImgHtml(q)}
        <div style="margin-top:.3rem">${opts}</div>
        ${q.explanation?`<div class="expl show" style="margin-top:.45rem">${esc(q.explanation)}</div>`:''}
        ${tagPicker}
      </div>`;
    }).join('');
    renderMath(el);
  },
  _removeOne(kind, uid){
    const arr=REV._store(kind);
    const i=arr.findIndex(x=>x.uid===uid);
    if(i>-1){arr.splice(i,1);_save(REV._lsKey(kind),arr);REV.renderList(kind);HOME.updateBadges();}
  },
  clearAll(kind){
    const prev = JSON.parse(JSON.stringify(REV._store(kind)));
    if(kind==='bk'){S.bk=[];_save(LS.BK,[]);}
    else if(kind==='fl'){S.fl=[];_save(LS.FL,[]);}
    else {S.wr=[];_save(LS.WR,[]);}
    REV.renderList(kind); HOME.updateBadges();
    toastUndo('🗑 List cleared', ()=>{
      if(kind==='bk'){S.bk=prev;_save(LS.BK,prev);}
      else if(kind==='fl'){S.fl=prev;_save(LS.FL,prev);}
      else {S.wr=prev;_save(LS.WR,prev);}
      REV.renderList(kind); HOME.updateBadges();
      toast('↩️ Restored');
    });
  },
  start(kind, mode, dueOnly){
    let arr = [...REV._store(kind)];
    if(kind==='wr' && dueOnly) arr = REV.dueWrong();
    if(!arr.length){toast(dueOnly?'Nothing due for review right now 🎉':'Nothing to study here yet');return}
    QUIZ.startWith(shuf(arr), mode, kind==='bk'?'⭐ Bookmarks':kind==='fl'?'🚩 Flagged':(dueOnly?'🔁 Wrong Bank (Due Today)':'❌ Wrong Bank'));
  }
};

/* ═══════════════ QUIZ — MCQ engine ═══════════════ */
const QUIZ = {
  async _fetch(fileId, cacheKey, attempt=1, kind='fg'){
    function _validCache(v){
      if(!v) return false;
      if(v && typeof v === 'object' && !Array.isArray(v) && v.success === false) return false;
      return true;
    }
    if(!S.online){
      const cached = await QDB.get(cacheKey);
      if(_validCache(cached)) return cached;
      if(cached && !_validCache(cached)) throw new Error('Cached data is invalid (a previous network error was stored). Go online to refresh it.');
      throw new Error('You are offline and this set is not cached yet. Go to the Offline Cache tab to download it while online.');
    }
    try{
      const timeoutMs = attempt === 1 ? 25000 : 15000;
      /* Backend v1.11 turned on GETFILE_REQUIRES_AUTH: getFile now needs a
         username + session token, and also checks the account still has
         trial or paid access. Without them every single question file came
         back "Session expired", which looked like an empty question bank.
         GETFILE_GATE paces the calls under the per-account rate limit. */
      if(typeof GETFILE_GATE !== 'undefined') await GETFILE_GATE.take(kind);
      const auth = { username: (S.user && S.user.username) || '', token: (S.user && S.user.token) || '' };
      const r = await netFetch(`${APPS}?${qs({action:'getFile', fileId, ...auth})}`, {redirect:'follow'}, timeoutMs);
      const text = await r.text();
      if(text.trim().startsWith('<')){
        throw new Error('Server returned an HTML page instead of JSON — the Apps Script may be down or requires re-authorisation.');
      }
      let data;
      try{ data = JSON.parse(text); }
      catch(pe){ throw new Error('Could not parse server response. The file may be corrupted or the server returned an unexpected format.'); }
      /* The server asked us to slow down — wait it out rather than caching
         the error object as if it were a question file. */
      if(data && data.rateLimited && attempt < 4){
        if(typeof GETFILE_GATE !== 'undefined') GETFILE_GATE.backoff(12000);
        await new Promise(res => setTimeout(res, 6000));
        return QUIZ._fetch(fileId, cacheKey, attempt + 1, kind);
      }
      if(data && data.sessionInvalid){
        throw new Error('Your session expired. Sign out and sign in again to keep studying.');
      }
      if(data && data.needsPayment){
        throw new Error('Your access has ended. Complete the payment to open new chapters — anything already downloaded still works offline.');
      }
      if(data && typeof data === 'object' && !Array.isArray(data) && data.success === true){
        if(data.result !== undefined) data = data.result;
        else if(data.data !== undefined) data = data.data;
        else if(data.questions !== undefined) data = data.questions;
      }
      if(data && typeof data === 'object' && !Array.isArray(data) && data.success === false){
        throw new Error(data.error || 'Server returned an error for this file.');
      }
      if(_validCache(data)){
        // IndexedDB write is best-effort — a full store should not break
        // a successful online fetch.
        const ok = await QDB.set(cacheKey, data);
        if(!ok && !QUIZ._cacheWarned){
          QUIZ._cacheWarned = true;
          toast('⚠️ Device storage is full — quizzes still work, but new sets won\'t be saved for offline use. Clear some cached sets from the Offline Cache tab to free space.', 6000);
        }
      }
      return data;
    } catch(err){
      const cached = await QDB.get(cacheKey);
      if(_validCache(cached)){ toast('📦 Loaded from cache (network error)'); return cached; }
      if(attempt < 2 && (err.message.includes('timed out') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))){
        toast('⚠️ Slow connection — retrying…');
        await new Promise(res => setTimeout(res, 1500));
        return QUIZ._fetch(fileId, cacheKey, attempt + 1, kind);
      }
      throw err;
    }
  },
  _cacheWarned: false,

  async load(fileId, cacheKey, mode, chapterName, scope=null){
    if(!S.online || S.forcedOffline){
      const cached = await QDB.get(cacheKey);
      const isValid = cached && !(typeof cached === 'object' && !Array.isArray(cached) && cached.success === false);
      if(!isValid){
        QUIZ._showError('You are offline and this set is not cached yet. Go to the Offline Cache tab while online to download it.', null);
        return;
      }
    }
    QUIZ._showLoader('Connecting to server…');
    const msgTimer = setTimeout(()=>{ QUIZ._showLoader('Still loading… (Apps Script may be warming up)'); }, 5000);
    const msgTimer2 = setTimeout(()=>{ QUIZ._showLoader('Taking longer than usual… please wait or check your connection.'); }, 12000);
    try{
      const raw = await QUIZ._fetch(fileId, cacheKey);
      clearTimeout(msgTimer); clearTimeout(msgTimer2);
      const qsArr = normQ(raw, fileId);
      QUIZ._hideLoader();
      if(!qsArr.length){ toast('❌ No valid questions found in this file. Check the file format.'); return; }
      QUIZ.startWith(qsArr, mode, chapterName, scope);
    } catch(err){
      clearTimeout(msgTimer); clearTimeout(msgTimer2);
      QUIZ._hideLoader();
      const msg = err.message==='OFFLINE'
        ? 'You are offline and this set has not been downloaded yet. Open Downloads while you have a connection to save it.'
        : err.message;
      QUIZ._showError(msg, ()=>QUIZ.load(fileId, cacheKey, mode, chapterName, scope));
    }
  },

  _showError(msg, retryFn){
    let el = document.getElementById('quiz-error-card');
    if(!el){
      el = document.createElement('div');
      el.id = 'quiz-error-card';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1.5rem';
      document.body.appendChild(el);
    }
    el._retry = retryFn || null;
    el.innerHTML = `<div style="background:var(--c2);border:1px solid var(--bad-bd);border-radius:var(--r3);padding:1.4rem 1.5rem;max-width:380px;width:100%;box-shadow:var(--sh3)" role="dialog" aria-modal="true">
      <div style="font-size:1.4rem;margin-bottom:.5rem"><i class="ph ph-x-circle"></i></div>
      <div style="font-family:var(--fd);font-size:.92rem;font-weight:700;color:var(--ros);margin-bottom:.6rem">Failed to Load</div>
      <div style="font-size:.78rem;color:var(--t2);line-height:1.6;margin-bottom:1rem">${esc(msg)}</div>
      <div style="display:flex;gap:.5rem">
        <button id="quiz-err-retry" style="flex:1;padding:.58rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r1);color:var(--on-accent);font-weight:700;font-size:.82rem;cursor:pointer;font-family:var(--ff)"><i class="ph ph-arrow-clockwise"></i> Retry</button>
        <button id="quiz-err-close" style="padding:.58rem .9rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r1);color:var(--t2);font-size:.82rem;cursor:pointer;font-family:var(--ff)"><i class="ph ph-x"></i> Close</button>
      </div>
    </div>`;
    el.style.display = 'flex';
    document.getElementById('quiz-err-retry').onclick = ()=>{ el.remove(); if(el._retry) el._retry(); };
    document.getElementById('quiz-err-close').onclick = ()=> el.remove();
  },

  _showLoader(msg){
    let el = document.getElementById('quiz-loader');
    if(!el){
      el = document.createElement('div');
      el.id = 'quiz-loader';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:1rem;backdrop-filter:blur(4px)';
      el.innerHTML = '<div style="width:44px;height:44px;border:4px solid rgba(255,255,255,.2);border-top-color:var(--neon);border-radius:50%;animation:spin 0.8s linear infinite"></div><div id="quiz-loader-msg" style="color:#fff;font-size:.9rem;font-weight:600;text-align:center;padding:0 1.5rem"></div>';
      document.body.appendChild(el);
      if(!document.getElementById('quiz-loader-style')){
        const st = document.createElement('style');
        st.id = 'quiz-loader-style';
        st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
      }
    }
    document.getElementById('quiz-loader-msg').textContent = msg || 'Loading…';
    el.style.display = 'flex';
  },
  // Removes the loader element rather than just hiding it — the old
  // "hide but keep in DOM" approach made _anyModalOpen()'s presence check
  // stick true forever after the first quiz, permanently disabling
  // every keyboard shortcut.
  _hideLoader(){
    const el = document.getElementById('quiz-loader');
    if(el) el.remove();
  },

  startWith(qsArr, mode, chapterName, scope=null){
    if(!qsArr || !qsArr.length){ toast('No questions to study'); return; }
    QUIZ._stopTimer();
    if(qsArr.length > 20){
      QUIZ._showLimitPicker(qsArr, mode, chapterName, scope);
      return;
    }
    QUIZ._doStart(qsArr, mode, chapterName, true, scope);
  },

  _showLimitPicker(qsArr, mode, chapterName, scope=null){
    if(document.getElementById('quiz-limit-modal')) return;
    const total = qsArr.length;
    const presets = [10,20,30,50].filter(n=>n<total);
    const modal = document.createElement('div');
    modal.id = 'quiz-limit-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:10000;padding:1.5rem;backdrop-filter:blur(4px)';
    // Shuffle default UNCHECKED, and refused entirely for weekly sets —
    // see _doStart's shuffle-lock comment.
    const isWeekly = !!(scope && scope.weeklyId);
    modal.innerHTML = `
      <div style="background:var(--c2);border:1px solid var(--bd);border-radius:var(--r3);padding:1.5rem;max-width:340px;width:100%;box-shadow:var(--sh3)" role="dialog" aria-modal="true" aria-labelledby="qlm-title">
        <div style="font-size:1.2rem;margin-bottom:.35rem">${mode==='exam'?'<i class="ph ph-note-pencil"></i>':'<i class="ph ph-lightning"></i>'}</div>
        <div id="qlm-title" style="font-family:var(--fd);font-size:.92rem;font-weight:700;color:var(--t1);margin-bottom:.2rem">${esc(chapterName||'Quiz')}</div>
        <div style="font-size:.74rem;color:var(--t3);margin-bottom:1rem">${pluralize(total,'question')} available — how many do you want to do?</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem">
          ${presets.map(n=>`<button data-qn="${n}" class="qlm-preset" style="padding:.35rem .7rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r1);color:var(--t2);font-size:.76rem;cursor:pointer;font-family:var(--ff)">${n}</button>`).join('')}
          <button data-qn="${total}" class="qlm-preset" style="padding:.35rem .7rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r1);color:var(--t2);font-size:.76rem;cursor:pointer;font-family:var(--ff)">All ${total}</button>
        </div>
        <input id="qlm-inp" type="number" min="1" max="${total}" value="${isWeekly ? total : Math.min(20,total)}"
          style="width:100%;background:var(--c1);border:1.5px solid var(--b1);border-radius:var(--r2);padding:.5rem .75rem;color:var(--t1);font-size:.9rem;font-family:var(--ff);outline:none;box-sizing:border-box;margin-bottom:.6rem" ${isWeekly ? 'readonly' : ''}>
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;cursor:pointer;font-size:.8rem;color:var(--t2);${isWeekly?'opacity:.55':''}">
          <input id="qlm-shuffle" type="checkbox" ${isWeekly?'disabled':''} style="width:16px;height:16px;accent-color:var(--amb);cursor:pointer">
          <i class="ph ph-shuffle"></i> Shuffle question order
        </label>
        <div style="display:flex;gap:.4rem">
          <button id="qlm-start" style="flex:1;padding:.62rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r2);color:var(--on-accent);font-weight:700;font-size:.85rem;cursor:pointer;font-family:var(--ff)">Start →</button>
          <button id="qlm-cancel" style="padding:.62rem .9rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r2);color:var(--t2);font-size:.83rem;cursor:pointer;font-family:var(--ff)"><i class="ph ph-x"></i></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
    document.querySelectorAll('#quiz-limit-modal .qlm-preset').forEach(btn=>{
      btn.onclick = ()=>{ document.getElementById('qlm-inp').value = btn.dataset.qn; };
    });
    document.getElementById('qlm-cancel').onclick = ()=> modal.remove();
    document.getElementById('qlm-start').onclick = ()=>{
      const n = Math.min(total, Math.max(1, parseInt(document.getElementById('qlm-inp').value)||total));
      const doShuffle = document.getElementById('qlm-shuffle').checked;
      modal.remove();
      const picked = doShuffle ? shuf(qsArr).slice(0,n) : qsArr.slice(0,n);
      QUIZ._doStart(picked, mode, chapterName, false, scope);
    };
  },

  _doStart(qsArr, mode, chapterName, doShuffle=true, scope=null){
    // Review mode + shuffle-lock:
    //   Review mode: pre-fill S.quiz.ans from the recorded attempt so the
    //     existing answered-option rendering lights up the right options.
    //     reviewOnly makes fcAnswer/fcNav/fcFinish refuse to mutate state.
    //   Shuffle-lock: any quiz with a weeklyId has shuffle FORCED OFF,
    //     regardless of the picker. Otherwise the stored answers[] array
    //     (indices into the shuffled order that was taken) can't stay
    //     aligned with the freshly-fetched question array on review.
    const isWeekly = !!(scope && scope.weeklyId);
    const reviewMode = !!(scope && scope.weeklyReviewMode);
    const effectiveShuffle = isWeekly ? false : doShuffle;

    const presetAnswers = reviewMode && scope.weeklyAttempt
      ? (scope.weeklyAttempt.answers || []).slice()
      : null;

    const modeLabel = reviewMode
      ? '👁️ Review'
      : (mode==='exam' ? '📝 Exam' : '⚡ Flashcard');
    toast(`${modeLabel} — ${qsArr.length} question${qsArr.length!==1?'s':''} · ${chapterName||'Study'}`, 2500);

    const examSeconds = (mode==='exam' && !reviewMode) ? qsArr.length*90 : 0;
    S.quiz = {
      qs: effectiveShuffle ? shuf(qsArr) : [...qsArr],
      ans: (presetAnswers && presetAnswers.length === qsArr.length)
        ? presetAnswers.slice()
        : new Array(qsArr.length).fill(null),
      mode: reviewMode ? 'flashcard' : mode,
      idx:0, timer:null, elapsed:0,
      left: examSeconds,
      examEndAt: mode==='exam' ? Date.now() + examSeconds*1000 : 0,
      active:true, ch: chapterName||'Study', scope, skipped:new Set(), shown:new Set(),
      startedAt: Date.now(),
      reviewOnly: reviewMode
    };
    document.getElementById('quiz-wrap').style.display='';
    document.querySelectorAll('.view').forEach(e=>e.classList.remove('on'));
    window.scrollTo(0,0);
    try{
      if(mode==='exam' && !reviewMode){
        document.getElementById('fc-wrap').style.display='none';
        document.getElementById('ex-wrap').style.display='';
        document.getElementById('res-wrap').style.display='none';
        QUIZ._renderExam();
      } else {
        document.getElementById('ex-wrap').style.display='none';
        document.getElementById('fc-wrap').style.display='';
        document.getElementById('res-wrap').style.display='none';
        QUIZ._renderFlashcard();
      }
    } catch(err){
      console.error('[QUIZ._doStart] render failed:', err);
      S.quiz.active = false;
      document.getElementById('quiz-wrap').style.display = 'none';
      toast('❌ Could not display this quiz — one of the questions may be malformed. Try a different set.', 5000);
      return;
    }
    if(!reviewMode) QUIZ._startTimer();
    if(mode==='exam' && !reviewMode) QUIZ._snapshotExam(true);
  },

  daily(){
    const refs = ChapterData.allFileRefs();
    if(!refs.length){ toast('No content configured yet'); return; }
    toast('⏳ Building today\'s challenge…');
    (async()=>{
      const picks = shuf(refs).slice(0, Math.min(10, refs.length));
      const all = [];
      let failed = 0;
      for(const ref of picks){
        try{
          const raw = await QUIZ._fetch(ref.fid, ref.key);
          const qs2 = normQ(raw, ref.fid);
          all.push(...qs2);
        }catch(e){
          failed++;
          console.warn('[daily] Failed to load', ref.key, e.message);
        }
      }
      if(!all.length){ toast('❌ Could not load daily challenge — try caching data first'); return; }
      if(failed>0) toast(`⚠️ ${failed} file(s) failed — challenge uses ${all.length} questions`);
      const qsArr = shuf(all).slice(0,30);
      QUIZ.startWith(qsArr, 'flashcard', '🌟 Daily Challenge');
      STREAK.markToday();
    })();
  },

  async adaptive(){
    const TARGET = 25;
    const seen = new Set();
    const pool = [];
    const addAll = list => { for(const q of list){ if(q && q.uid && !seen.has(q.uid)){ seen.add(q.uid); pool.push(q); } } };

    addAll(REV.dueWrong());
    addAll(S.bk.filter(q => q.tag==='Confusing' || q.tag==='Need Check'));

    if(pool.length >= TARGET){
      QUIZ.startWith(shuf(pool).slice(0,TARGET), 'flashcard', '🎯 Adaptive Practice');
      return;
    }

    const refs = ChapterData.allFileRefs();
    if(!refs.length){
      if(pool.length){ QUIZ.startWith(shuf(pool), 'flashcard', '🎯 Adaptive Practice'); return; }
      toast('No content configured yet'); return;
    }
    toast('⏳ Building your adaptive practice set…');
    const need = TARGET - pool.length;
    const picks = shuf(refs).slice(0, Math.min(8, refs.length));
    let failed = 0;
    const stopAt = pool.length + need*2;
    for(const ref of picks){
      if(pool.length >= stopAt) break;
      try{
        const raw = await QUIZ._fetch(ref.fid, ref.key);
        addAll(normQ(raw, ref.fid));
      }catch(e){
        failed++;
        console.warn('[adaptive] Failed to load', ref.key, e.message);
      }
    }
    if(!pool.length){ toast('❌ Could not build a practice set — try caching data first'); return; }
    if(failed>0) toast(`⚠️ ${failed} file(s) failed — practice set uses what loaded`);
    QUIZ.startWith(shuf(pool).slice(0,TARGET), 'flashcard', '🎯 Adaptive Practice');
  },

  _startTimer(){
    QUIZ._stopTimer();
    S.quiz.timer = setInterval(()=>{
      if(!S.quiz.active)return;
      if(S.quiz.mode==='exam'){
        S.quiz.left = Math.max(0, Math.round((S.quiz.examEndAt - Date.now())/1000));
        const tEl=document.getElementById('ex-tmr'); if(tEl) tEl.textContent=fmt(S.quiz.left);
        if(S.quiz.left<=0){ toast('⏰ Time\'s up!'); QUIZ.submitExam(); return; }
        if(S.quiz.left % 15 === 0) QUIZ._snapshotExam();
      } else {
        S.quiz.elapsed++;
        const tEl=document.getElementById('fc-tmr'); if(tEl) tEl.textContent=fmt(S.quiz.elapsed);
      }
    },1000);
  },
  _stopTimer(){ if(S.quiz.timer){ clearInterval(S.quiz.timer); S.quiz.timer=null; } },

  _lastSnapAt: 0,
  _SNAPSHOT_SIZE_CEILING: 2 * 1024 * 1024,
  _snapshotExam(force){
    if(!S.quiz || !S.quiz.active || S.quiz.mode!=='exam' || !S.user) return;
    const now = Date.now();
    if(!force && (now - QUIZ._lastSnapAt) < 3000) return;
    QUIZ._lastSnapAt = now;
    const header = {
      username: S.user.username,
      ch: S.quiz.ch,
      ans: S.quiz.ans,
      left: S.quiz.left,
      scope: S.quiz.scope || null,
      startedAt: S.quiz.startedAt || now,
      savedAt: now
    };
    const fullSnap = { ...header, qs: S.quiz.qs };
    let fullJson = null;
    try{ fullJson = JSON.stringify(fullSnap); }catch(e){}
    if(fullJson && fullJson.length < QUIZ._SNAPSHOT_SIZE_CEILING){
      _save(LS.EXAM_SNAP, fullSnap);
      return;
    }
    const liteQs = S.quiz.qs.map(q => { const { img, imgCaption, ...rest } = q; return rest; });
    _save(LS.EXAM_SNAP, { ...header, qs: liteQs });
  },
  _clearExamSnapshot(){ localStorage.removeItem(LS.EXAM_SNAP); },

  checkResumableExam(){
    const snap = _load(LS.EXAM_SNAP, null);
    if(!snap || !S.user || snap.username !== S.user.username || !snap.qs || !snap.qs.length){
      if(snap) QUIZ._clearExamSnapshot();
      return;
    }
    // Weekly sets are one-attempt-only — discard the snapshot silently,
    // since resuming would bypass the one-shot rule.
    if(snap.scope && snap.scope.weeklyId){
      QUIZ._clearExamSnapshot();
      return;
    }
    const elapsedSinceSave = Math.floor((Date.now() - snap.savedAt) / 1000);
    const adjustedLeft = snap.left - elapsedSinceSave;

    if(adjustedLeft <= 0){
      QUIZ._resumeSnapshot(snap, 0);
      toast('⏰ Your exam timer ran out while you were away — showing your results.');
      QUIZ.submitExam();
      return;
    }

    const answered = snap.ans.filter(a=>a!==null).length;
    const modal = document.createElement('div');
    modal.id = 'exam-resume-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:10000;padding:1.5rem;backdrop-filter:blur(4px)';
    modal.innerHTML = `
      <div style="background:var(--c2);border:1px solid var(--bd);border-radius:var(--r3);padding:1.5rem;max-width:340px;width:100%;box-shadow:var(--sh3)" role="dialog" aria-modal="true">
        <div style="font-size:1.2rem;margin-bottom:.35rem"><i class="ph ph-note-pencil"></i></div>
        <div style="font-family:var(--fd);font-size:.92rem;font-weight:700;color:var(--t1);margin-bottom:.2rem">Unfinished exam found</div>
        <div style="font-size:.78rem;color:var(--t3);margin-bottom:1rem">${esc(snap.ch)} — ${answered}/${snap.qs.length} answered, ${fmt(adjustedLeft)} left on the clock. This was probably interrupted by a reload or a closed tab.</div>
        <div style="display:flex;gap:.4rem">
          <button id="exam-resume-btn" style="flex:1;padding:.62rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r2);color:var(--on-accent);font-weight:700;font-size:.85rem;cursor:pointer;font-family:var(--ff)">▶️ Resume</button>
          <button id="exam-discard-btn" style="padding:.62rem .9rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r2);color:var(--t2);font-size:.83rem;cursor:pointer;font-family:var(--ff)">Discard</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('exam-resume-btn').onclick = ()=>{
      modal.remove();
      QUIZ._resumeSnapshot(snap, adjustedLeft);
    };
    document.getElementById('exam-discard-btn').onclick = ()=>{
      if(!confirm(`Discard this exam? You'll lose ${answered}/${snap.qs.length} answered question${answered!==1?'s':''} — this can't be undone.`)) return;
      modal.remove();
      QUIZ._clearExamSnapshot();
    };
  },
  _resumeSnapshot(snap, adjustedLeft){
    const originalTotal = (snap.qs.length * 90);
    const spentBeforeSnap = Math.max(0, originalTotal - (snap.left||0));
    const startedAt = snap.startedAt || (snap.savedAt - spentBeforeSnap*1000) || Date.now();
    S.quiz = {
      qs: snap.qs, ans: snap.ans, mode:'exam', idx:0, timer:null, elapsed:0,
      left: adjustedLeft,
      examEndAt: Date.now() + adjustedLeft*1000,
      active:true, ch: snap.ch, skipped:new Set(), shown:new Set(),
      scope: snap.scope || null, startedAt,
      reviewOnly: false
    };
    document.getElementById('quiz-wrap').style.display='';
    document.querySelectorAll('.view').forEach(e=>e.classList.remove('on'));
    document.getElementById('fc-wrap').style.display='none';
    document.getElementById('ex-wrap').style.display='';
    document.getElementById('res-wrap').style.display='none';
    QUIZ._renderExam();
    QUIZ._startTimer();
    toast('▶️ Exam resumed');
  },

  quit(){
    QUIZ._exitGuard(()=>{ UI._goRaw('home'); });
  },

  _exitGuard(afterQuit){
    if(document.getElementById('quiz-exit-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quiz-exit-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:10000;padding:1.5rem;backdrop-filter:blur(4px)';
    const isExam = S.quiz.mode === 'exam';
    const isReview = !!S.quiz.reviewOnly;
    const answered = S.quiz.ans.filter(a=>a!==null).length;
    const total = S.quiz.qs.length;
    const isWeekly = !!(S.quiz.scope && S.quiz.scope.weeklyId);
    const heading = isReview
      ? 'Exit review?'
      : (isWeekly && isExam ? 'Leave this weekly exam?' : 'Leave this quiz?');
    const body = isReview
      ? `You're viewing your recorded results for ${esc(S.quiz.ch)}.`
      : isWeekly && isExam
        ? `You only get ONE attempt at this weekly set. Leaving now abandons your one shot — the exam window keeps running and you won't be able to start over. ${answered} of ${total} answered so far.`
        : (isExam ? answered+' of '+total+' answered' : 'Question '+(S.quiz.idx+1)+' of '+total);
    modal.innerHTML = `
      <div style="background:var(--c2);border:1px solid var(--bd);border-radius:var(--r3);padding:1.5rem;max-width:340px;width:100%;box-shadow:var(--sh3)" role="dialog" aria-modal="true">
        <div style="font-size:1.3rem;margin-bottom:.4rem"><i class="ph ph-warning"></i></div>
        <div style="font-family:var(--fd);font-size:.95rem;font-weight:700;color:var(--t1);margin-bottom:.3rem">${heading}</div>
        <div style="font-size:.76rem;color:var(--t3);margin-bottom:1.1rem">${body}</div>
        <div style="display:flex;flex-direction:column;gap:.45rem">
          ${isExam && !isReview ? '<button id="qem-finish" style="padding:.62rem;background:var(--ok-bg);border:1px solid var(--ok-bd);border-radius:var(--r2);color:var(--grn);font-weight:700;font-size:.83rem;cursor:pointer;font-family:var(--ff);text-align:left"><i class="ph ph-check-circle"></i> Submit & See Results — grade what I have answered so far</button>' : ''}
          <button id="qem-quit" style="padding:.62rem;background:var(--bad-bg);border:1px solid var(--bad-bd);border-radius:var(--r2);color:var(--ros);font-weight:700;font-size:.83rem;cursor:pointer;font-family:var(--ff);text-align:left"><i class="ph ph-door"></i> ${isReview ? 'Exit review' : 'Quit — discard this session'}</button>
          <button id="qem-cancel" style="padding:.62rem;background:var(--b0);border:1px solid var(--b1);border-radius:var(--r2);color:var(--t2);font-weight:600;font-size:.83rem;cursor:pointer;font-family:var(--ff);text-align:left">↩ Cancel — keep studying</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = ()=> modal.remove();
    if(isExam && !isReview){
      document.getElementById('qem-finish').onclick = ()=>{ close(); QUIZ.submitExam(); };
    }
    document.getElementById('qem-quit').onclick = ()=>{
      close();
      QUIZ._stopTimer();
      if(isExam && !isReview) QUIZ._clearExamSnapshot();
      S.quiz.active = false;
      document.getElementById('quiz-wrap').style.display = 'none';
      if(afterQuit) afterQuit();
    };
    document.getElementById('qem-cancel').onclick = close;
    modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
  },

  /* ── FLASHCARD MODE ── */
  _renderFlashcard(){
    const q = S.quiz.qs[S.quiz.idx];
    if(!q)return;
    try{
      document.getElementById('fc-chip').textContent = '⚡ ' + S.quiz.ch;
      document.getElementById('fc-ctr').textContent = `${S.quiz.idx+1}/${S.quiz.qs.length}`;
      document.getElementById('fc-pf').style.width = `${((S.quiz.idx)/S.quiz.qs.length)*100}%`;
      document.getElementById('fc-qn').textContent = 'Q'+(S.quiz.idx+1);
      document.getElementById('fc-q').textContent = q.q;
      const fcImgWrap = document.getElementById('fc-img-wrap');
      const fcImg = document.getElementById('fc-img');
      if(q.img && fcImgWrap && fcImg){ fcImg.src = q.img; fcImg.alt = q.imgCaption || 'Question figure'; fcImgWrap.style.display = ''; }
      else if(fcImgWrap){ fcImgWrap.style.display = 'none'; }

      const isStarred = REV.has('bk', q.uid), isFlagged = REV.has('fl', q.uid);
      // In review mode, bookmark/flag/tag controls are hidden entirely —
      // the student is viewing a locked attempt, not studying it.
      const reviewControls = S.quiz.reviewOnly ? '' : `
        <button class="ib ${isStarred?'bk-on':''}" onclick="QUIZ._star()" title="Bookmark" aria-label="Bookmark this question" aria-pressed="${isStarred?'true':'false'}"><i class="ph ph-star"></i></button>
        <button class="ib ${isFlagged?'fl-on':''}" onclick="QUIZ._flag()" title="Flag" aria-label="Flag this question" aria-pressed="${isFlagged?'true':'false'}"><i class="ph ph-flag"></i></button>
      `;
      document.getElementById('fc-acts').innerHTML = `
        ${reviewControls}
        <button class="ib" onclick="QUIZ._reportCurrent()" title="Report an issue with this question" aria-label="Report an issue with this question"><i class="ph ph-warning-circle"></i></button>
        ${qSearchHtml(q)}
        ${S.quiz.reviewOnly ? '' : `<select class="sel-c" style="font-size:.68rem;padding:.2rem .35rem;width:auto" onchange="QUIZ._tagCurrent(this.value)">
          <option value="">🏷 Tag…</option>
          ${BK_TAGS.map(t=>`<option value="${t}" ${REV.getTag(q.uid)===t?'selected':''}>${t}</option>`).join('')}
        </select>`}
      `;

      const ansIdx = S.quiz.ans[S.quiz.idx];
      const answered = ansIdx !== null;
      const optsEl = document.getElementById('fc-opts');
      optsEl.innerHTML = q.options.map((opt,i)=>{
        let cls='eo';
        let isSelected = false;
        if(answered){
          const isCorrect = isOk(i, q.correct);
          isSelected = i===ansIdx;
          if(isCorrect) cls += ' shc';
          else if(isSelected) cls += ' bad2';
        }
        const blocked = answered || S.quiz.reviewOnly;
        return `<div class="${cls}" role="button" tabindex="${blocked?-1:0}" aria-pressed="${isSelected}" aria-label="Option ${String.fromCharCode(65+i)}: ${esc(opt)}${isSelected?', selected':''}" onclick="${blocked?'':'QUIZ.fcAnswer('+i+')'}" onkeydown="if((event.key==='Enter'||event.key===' ')&&!${blocked}){event.preventDefault();QUIZ.fcAnswer(${i})}" style="${blocked?'cursor:default;pointer-events:none':''}">
          <div class="ok">${String.fromCharCode(65+i)}</div><div>${esc(opt)}</div>
        </div>`;
      }).join('');

      const expl = document.getElementById('fc-expl');
      if(answered && q.explanation){ expl.textContent = q.explanation; expl.classList.add('show'); }
      else { expl.classList.remove('show'); expl.textContent=''; }

      document.getElementById('fc-hint').textContent = S.quiz.reviewOnly
        ? 'Review mode — answers locked'
        : (answered ? 'Use Next →' : 'Tap an option to answer');
      document.getElementById('fc-prev').disabled = S.quiz.idx===0;
      document.getElementById('fc-next').textContent = S.quiz.reviewOnly
        ? (S.quiz.idx===S.quiz.qs.length-1 ? 'Exit Review' : 'Next →')
        : (S.quiz.idx===S.quiz.qs.length-1 ? 'Finish ✔' : 'Next →');

      QUIZ._updateFcCounts();
      renderMath(document.getElementById('fc-wrap'));
    } catch(err){
      console.error('[QUIZ._renderFlashcard] question at idx', S.quiz.idx, 'failed to render:', err, q);
      toast('⚠️ Skipped a malformed question', 2000);
      if(S.quiz.idx < S.quiz.qs.length-1){ S.quiz.idx++; QUIZ._renderFlashcard(); }
      else QUIZ.fcFinish();
    }
  },
  _updateFcCounts(){
    let ok=0,bad=0,skip=0;
    S.quiz.ans.forEach((a,i)=>{
      if(a===null){ if(S.quiz.shown?.has(i)) skip++; return; }
      if(isOk(a, S.quiz.qs[i].correct)) ok++; else bad++;
    });
    document.getElementById('fc-ok').textContent=ok;
    document.getElementById('fc-bad').textContent=bad;
    document.getElementById('fc-skip').textContent=skip;
  },
  fcAnswer(i){
    // Review mode is read-only — never overwrite a recorded answer.
    // Primary guard; the click handler above is defence in depth.
    if(S.quiz.reviewOnly) return;
    if(S.quiz.ans[S.quiz.idx]!==null)return;
    S.quiz.ans[S.quiz.idx]=i;
    const q=S.quiz.qs[S.quiz.idx];
    const correct=isOk(i,q.correct);
    if(correct){ PROG.track(true); REV.trackAnswer(q, true); }
    else { PROG.track(false); REV.trackAnswer(q, false); }
    QUIZ._renderFlashcard();
  },
  fcNav(dir){
    // Review mode: don't track shown state — there's no "skipped" concept
    // when every answer is pre-filled from the recorded attempt.
    if(!S.quiz.reviewOnly){
      if(!S.quiz.shown) S.quiz.shown=new Set();
      S.quiz.shown.add(S.quiz.idx);
    }
    const next = S.quiz.idx+dir;
    if(next<0)return;
    if(next>=S.quiz.qs.length){ QUIZ.fcFinish(); return; }
    S.quiz.idx=next;
    QUIZ._renderFlashcard();
  },
  _star(){
    if(S.quiz.reviewOnly) return;
    const q=S.quiz.qs[S.quiz.idx];
    REV.toggle('bk', q);
    QUIZ._renderFlashcard();
  },
  _flag(){
    if(S.quiz.reviewOnly) return;
    const q=S.quiz.qs[S.quiz.idx];
    REV.toggle('fl', q);
    QUIZ._renderFlashcard();
  },
  _reportCurrent(){
    const q = S.quiz.qs?.[S.quiz.idx];
    if(!q){ toast('No question to report.'); return; }
    openMod('Report an issue', `
      <div class="sf"><label for="qr-reason">What's wrong?</label>
        <select id="qr-reason">
          <option value="wrong_answer">The marked answer looks wrong</option>
          <option value="unclear">The question or options are unclear</option>
          <option value="typo">Typo or formatting issue</option>
          <option value="other">Something else</option>
        </select>
      </div>
      <div class="sf"><label for="qr-note">Details (optional)</label><textarea id="qr-note" rows="3" placeholder="Anything that would help — e.g. which option you think is actually correct"></textarea></div>
      <button class="btn" id="qr-send-btn">Send Report</button>
    `);
    const sendBtn = document.getElementById('qr-send-btn');
    if(sendBtn) sendBtn.onclick = ()=> QUIZ._submitReport(q.uid);
  },
  async _submitReport(uid){
    const q = (S.quiz.qs||[]).find(x=>x.uid===uid) || S.quiz.qs?.[S.quiz.idx];
    const reason = document.getElementById('qr-reason')?.value || 'other';
    const note = (document.getElementById('qr-note')?.value || '').trim();
    if(!S.user?.username || !S.user?.token){ toast('❌ Please log in again to report a question.'); return; }
    closeMod();
    toast('Sending report…');
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({
          action:'reportQuestion', username:S.user.username, token:S.user.token,
          uid, reason, note, questionSnapshot: (q?.q||'').slice(0,1000)
        })
      }, 15000);
      const res = await r.json();
      if(res.success) toast('✅ ' + (res.message || 'Thanks — report sent.'));
      else toast('❌ ' + (res.error || 'Could not send report.'));
    }catch(e){
      toast('⚠️ Could not send report — check your connection and try again.');
    }
  },
  _tagCurrent(tag){
    if(S.quiz.reviewOnly) return;
    const q=S.quiz.qs[S.quiz.idx];
    if(!q) return;
    REV.setTag(q.uid, tag, q);
    QUIZ._renderFlashcard();
  },
  fcFinish(){
    QUIZ._stopTimer();
    S.quiz.active=false;
    // Review mode exits silently — no session recorded, no streak
    // advanced, no results card.
    if(S.quiz.reviewOnly){
      document.getElementById('quiz-wrap').style.display = 'none';
      UI._goRaw('home');
      return;
    }
    STREAK.markToday();
    QUIZ._showResults();
  },

  /* ── EXAM MODE ── */
  _renderExam(){
    document.getElementById('ex-chip').textContent = '📝 ' + S.quiz.ch;
    document.getElementById('ex-tmr').textContent = fmt(S.quiz.left);
    const el = document.getElementById('ex-qs');
    el.innerHTML = S.quiz.qs.map((q,qi)=>{
      const savedAns = S.quiz.ans[qi];
      return `
      <div class="eqc${savedAns!==null?' answered':''}" id="eqc-${qi}">
        <div class="qm"><span class="qn mono">Q${qi+1}</span>${qSearchHtml(q)}</div>
        <div class="qt" style="font-size:.85rem">${esc(q.q)}</div>
        ${qImgHtml(q)}
        ${q.options.map((opt,oi)=>{
          const sel = savedAns===oi;
          return `<div class="eo${sel?' sel':''}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="Option ${String.fromCharCode(65+oi)}: ${esc(opt)}" onclick="QUIZ.exAnswer(${qi},${oi})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();QUIZ.exAnswer(${qi},${oi})}" id="eo-${qi}-${oi}">
            <div class="ok">${String.fromCharCode(65+oi)}</div><div>${esc(opt)}</div>
          </div>`;
        }).join('')}
      </div>
    `}).join('');
    renderMath(el);
    const answeredCount = S.quiz.ans.filter(a=>a!==null).length;
    document.getElementById('ex-ctr').textContent = `${answeredCount}/${S.quiz.qs.length}`;
    document.getElementById('ex-ans').textContent = answeredCount;
    document.getElementById('ex-pf').style.width = `${(answeredCount/S.quiz.qs.length)*100}%`;
    QUIZ._updateSkippedNav();
  },
  exAnswer(qi, oi){
    if(!S.quiz.active)return;
    S.quiz.ans[qi]=oi;
    document.querySelectorAll(`#eqc-${qi} .eo`).forEach((e,i)=>{
      const sel = i===oi;
      e.classList.toggle('sel', sel);
      e.setAttribute('aria-pressed', String(sel));
    });
    document.getElementById(`eqc-${qi}`).classList.add('answered');
    const answered = S.quiz.ans.filter(a=>a!==null).length;
    document.getElementById('ex-ctr').textContent = `${answered}/${S.quiz.qs.length}`;
    document.getElementById('ex-ans').textContent = answered;
    document.getElementById('ex-pf').style.width = `${(answered/S.quiz.qs.length)*100}%`;
    QUIZ._snapshotExam();
    QUIZ._updateSkippedNav();
  },
  _updateSkippedNav(){
    const btn = document.getElementById('ex-skip-nav');
    if(!btn) return;
    const skippedCount = S.quiz.ans.filter(a=>a===null).length;
    btn.style.display = skippedCount ? '' : 'none';
    const countEl = document.getElementById('ex-skip-count');
    if(countEl) countEl.textContent = skippedCount;
  },
  jumpToUnanswered(){
    if(!S.quiz || !S.quiz.qs) return;
    const total = S.quiz.qs.length;
    const cards = S.quiz.qs.map((_,i)=>document.getElementById('eqc-'+i)).filter(Boolean);
    const viewTop = window.scrollY + 80;
    let startFrom = 0;
    for(let i=0;i<cards.length;i++){ if(cards[i].offsetTop > viewTop){ startFrom = i; break; } }
    for(let step=0; step<total; step++){
      const idx = (startFrom + step) % total;
      if(S.quiz.ans[idx]===null){
        document.getElementById('eqc-'+idx)?.scrollIntoView({behavior:'smooth', block:'center'});
        return;
      }
    }
    toast('🎉 Nothing left unanswered');
  },
  submitExam(){
    if(!S.quiz.active)return;
    const unanswered = S.quiz.ans.filter(a=>a===null).length;
    const isWeekly = !!(S.quiz.scope && S.quiz.scope.weeklyId);
    // Weekly exams get a much sterner confirmation — once submitted, the
    // attempt is final and the student can only review.
    if(isWeekly && !confirm(
      `Submit your WEEKLY SET attempt?\n\n` +
      `You only get one attempt — after this you can only review your answers.\n` +
      `${unanswered} question${unanswered===1?'':'s'} left unanswered.`
    )) return;
    if(!isWeekly && unanswered>0 && S.quiz.left>0 && !confirm(`${unanswered} question(s) unanswered. Submit anyway?`))return;
    QUIZ._stopTimer();
    QUIZ._clearExamSnapshot();
    S.quiz.active=false;
    STREAK.markToday();
    S.quiz.qs.forEach((q,qi)=>{
      document.querySelectorAll(`#eqc-${qi} .eo`).forEach((e,oi2)=>{
        e.style.pointerEvents='none';
        const correct = isOk(oi2,q.correct);
        if(correct) e.classList.add('shc');
        else if(oi2===S.quiz.ans[qi]) e.classList.add('bad2');
      });
      const correctPick = isOk(S.quiz.ans[qi], q.correct);
      PROG.track(correctPick);
      REV.trackAnswer(q, correctPick);
    });
    QUIZ._showResults();
  },

  /* ── RETRY ── */
  retryWrong(){
    if(S.quiz.scope && S.quiz.scope.weeklyId){ toast('🔒 Weekly sets are one attempt only'); return; }
    const wrongIdx = S.quiz.qs.map((q,i)=>({q,i})).filter(({i})=>!isOk(S.quiz.ans[i], S.quiz.qs[i].correct));
    if(!wrongIdx.length){ toast('🎉 Nothing to retry — all correct!'); UI.go('home'); return; }
    QUIZ.startWith(wrongIdx.map(x=>x.q), 'flashcard', S.quiz.ch + ' (Retry)');
  },

  /* ── RESULTS ── */
  _showResults(){
    document.getElementById('fc-wrap').style.display='none';
    document.getElementById('ex-wrap').style.display='none';
    document.getElementById('res-wrap').style.display='';
    const total = S.quiz.qs.length;
    let correct=0;
    S.quiz.qs.forEach((q,i)=>{ if(isOk(S.quiz.ans[i], q.correct)) correct++; });
    const wrong = S.quiz.ans.filter((a,i)=> a!==null && !isOk(a,S.quiz.qs[i].correct)).length;
    const skipped = S.quiz.ans.filter(a=>a===null).length;
    const pct = total ? Math.round((correct/total)*100) : 0;

    document.getElementById('res-ring').style.setProperty('--p', pct+'%');
    document.getElementById('res-pct').textContent = pct+'%';
    document.getElementById('res-chap').textContent = S.quiz.ch;
    const grade = pct>=90?'🏆 Outstanding!':pct>=75?'🎯 Great job!':pct>=50?'👍 Keep practicing':'📚 Needs more review';
    document.getElementById('res-grade').textContent = grade;

    document.getElementById('res-stats').innerHTML = `
      <div class="sc"><div class="sv tcy">${total}</div><div class="stat-lbl">Total</div></div>
      <div class="sc"><div class="sv tc2">${correct}</div><div class="stat-lbl">Correct</div></div>
      <div class="sc"><div class="sv tb2">${wrong}</div><div class="stat-lbl">Wrong</div></div>
      <div class="sc"><div class="sv ta2">${skipped}</div><div class="stat-lbl">Skipped</div></div>
    `;

    document.getElementById('res-review').innerHTML = S.quiz.qs.map((q,i)=>{
      const a = S.quiz.ans[i];
      const correctPick = isOk(a,q.correct);
      return `<div class="qcard" style="border-left-color:${correctPick?'var(--ok)':'var(--bad)'}">
        <div class="qm"><span class="qn mono">Q${i+1}</span><span class="ctag ${correctPick?'tg':'tr'}">${correctPick?'Correct':a===null?'Skipped':'Wrong'}</span>${qSearchHtml(q)}</div>
        <div class="qt" style="font-size:.82rem">${esc(q.q)}</div>
        ${qImgHtml(q)}
        ${q.options.map((opt,oi)=>{
          let cls='eo';
          if(isOk(oi,q.correct)) cls+=' shc';
          else if(oi===a) cls+=' bad2';
          return `<div class="${cls}" style="cursor:default;pointer-events:none"><div class="ok">${String.fromCharCode(65+oi)}</div><div>${esc(opt)}</div></div>`;
        }).join('')}
        ${q.explanation?`<div class="expl show">${esc(q.explanation)}</div>`:''}
      </div>`;
    }).join('');
    renderMath(document.getElementById('res-review'));

    if(pct>=70 && window.confetti){ confetti({particleCount:90,spread:75,origin:{y:0.6}}); }
    const qres = S.quiz.qs
      .map((q,i)=> S.quiz.ans[i]===null ? null : {uid:q.uid, ok:isOk(S.quiz.ans[i], q.correct)})
      .filter(Boolean);
    const scope = S.quiz.scope || {};
    const durationSec = S.quiz.startedAt
      ? Math.min(3*60*60, Math.round((Date.now()-S.quiz.startedAt)/1000))
      : 0;
    const sessionObj = {
      chapter:S.quiz.ch,
      chapterKey: scope.ch ? (ChapterData.chapterName(scope.lv, scope.ch) || '') : '',
      mode:S.quiz.mode,
      total, correct, wrong, skipped, pct, at:Date.now(),
      durationSec,
      lv:scope.lv||'', ch:scope.ch||'', book:scope.book||'', sub:scope.sub||'', fid:scope.fid||'',
      weeklyId: scope.weeklyId || '',
      weeklyTitle: scope.weeklyTitle || '',
      qres
    };
    PROG.recordSession(sessionObj);
    CHAPSTATS.record(sessionObj);

    // Weekly set: capture the attempt now that the score is computed,
    // then lock the retry button so the UI matches the server-enforced
    // one-attempt rule.
    const isWeekly = !!(scope.weeklyId);
    if(isWeekly){
      WEEKLY._recordAttempt(S.quiz, { total, correct, wrong, skipped, pct });
      const retryBtn = document.querySelector('#res-wrap .btn-p');
      if(retryBtn){
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<i class="ph ph-lock-simple"></i> One attempt only — see Review from the home card';
        retryBtn.style.opacity = '.55';
        retryBtn.style.pointerEvents = 'none';
      }
    }
  }
};

/* ═══════════════ KEYBOARD — quiz controls ═══════════════
   Handles A/B/C/D, 1-5, ←/→, and Escape while a quiz is active.
   Escape opens the exit-guard modal (via QUIZ.quit()) — the patch
   layer in user.html also handles Escape for the sidebar and any open
   shared modal, and both listeners running is harmless. */
document.addEventListener('keydown', e=>{
  if(!S.quiz.active) return;
  if(document.getElementById('quiz-wrap').style.display==='none') return;
  if(_anyModalOpen()) return;
  const tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if(e.key==='Escape'){ if(S.quiz.active) QUIZ.quit(); return; }
  if(S.quiz.reviewOnly) return;   // review mode has no keyboard answering
  if(S.quiz.mode!=='exam'){
    if(e.key==='ArrowRight') QUIZ.fcNav(1);
    if(e.key==='ArrowLeft') QUIZ.fcNav(-1);
    if(['1','2','3','4','5'].includes(e.key)){
      const i=Number(e.key)-1;
      if(S.quiz.qs[S.quiz.idx]?.options[i]!==undefined) QUIZ.fcAnswer(i);
    }
    const letterIdx = 'abcdABCD'.indexOf(e.key);
    if(letterIdx > -1){
      const i = letterIdx % 4;
      if(S.quiz.qs[S.quiz.idx]?.options[i]!==undefined) QUIZ.fcAnswer(i);
    }
  }
});

/* ═══════════════ GLOBAL EXPOSURE ═══════════════
   These are the entry points referenced from HTML onclick handlers
   and from other modules loaded after this one. */
window.QUIZ = QUIZ;
window.ON = ON;
window.LOC = LOC;
window.PSY = PSY;
window.REV = REV;
window.CNT = CNT;
window.ONPROG = ONPROG;
window.fidFromUid = fidFromUid;
window.scopeLeaves = scopeLeaves;
window.scopedStats = scopedStats;
window.fileStatsMap = fileStatsMap;
window.migrateSessionScopes = migrateSessionScopes;
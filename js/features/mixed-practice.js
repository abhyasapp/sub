// js/features/mixed-practice.js — the multi-chapter drill.
// MUST load AFTER: core/state.js, core/format.js (shuf), core/question.js
// (normQ), data/chapters-data.js (ChapterData), features/quiz-engine.js (QUIZ).

const PSY = {
  LEVELS:[['level5','Level 5 — Diploma'],['level7','Level 7 — Civil Engineering'],['gk','General Knowledge']],
  init(){
    const box = document.getElementById('psy-levels');
    box.innerHTML = PSY.LEVELS.map(([lv,label])=>{
      const names = ChapterData.chapters(lv);
      const items = Object.entries(names).map(([k,n])=>{
        const fc = ChapterData.fileCount(lv,k);
        return `<label class="ch-item">
          <input type="checkbox" value="${esc(k)}" data-lv="${esc(lv)}" ${fc?'':'disabled'} data-on-click="PSY._info()">
          <div class="ch-num">${esc(k)}</div>
          <div class="ch-name">${esc(n)}${fc?'':' <span style="color:var(--t3)">(no files)</span>'}</div>
          <div class="ch-cnt">${fc}f</div>
        </label>`;
      }).join('');
      return `<div class="sb-lbl" style="margin-top:.7rem;display:flex;align-items:center;justify-content:space-between;padding-right:.2rem">
          <span>${label}</span>
          <span style="display:flex;gap:.3rem">
            <button class="btn btn-sm btn-c" style="font-size:.56rem;padding:.15rem .4rem" data-on-click="PSY.allLv('${lv}')"><i class="ph ph-check"></i> All</button>
            <button class="btn btn-sm btn-r" style="font-size:.56rem;padding:.15rem .4rem" data-on-click="PSY.noneLv('${lv}')">✕</button>
          </span>
        </div>
        <div class="ch-list" id="psy-lv-${lv}">${items || '<div class="empty"><div class="empty-i"><i class="ph ph-book-open"></i></div><p>No chapters yet</p></div>'}</div>`;
    }).join('');
    PSY._info();
  },
  all(){ document.querySelectorAll('#psy-levels input:not(:disabled)').forEach(c=>c.checked=true); PSY._info(); },
  none(){ document.querySelectorAll('#psy-levels input').forEach(c=>c.checked=false); PSY._info(); },
  allLv(lv){ document.querySelectorAll(`#psy-lv-${lv} input:not(:disabled)`).forEach(c=>c.checked=true); PSY._info(); },
  noneLv(lv){ document.querySelectorAll(`#psy-lv-${lv} input`).forEach(c=>c.checked=false); PSY._info(); },
  _info(){
    const n = document.querySelectorAll('#psy-levels input:checked').length;
    document.getElementById('psy-info').textContent = n ? `${n} chapter${n>1?'s':''} selected — ready to load` : 'Select at least 1 chapter to continue';
  },
  async start(type){
    const cbs = [...document.querySelectorAll('#psy-levels input:checked')];
    if (!cbs.length){ toast('Select at least one chapter'); return; }
    const refs = [];
    for (const cb of cbs){
      const lv = cb.dataset.lv;
      const ch = cb.value;
      refs.push(...ChapterData.chapterFileRefs(lv, ch));
    }
    QUIZ._showLoader(`Loading ${pluralize(refs.length,'file')}…`);
    const all = [];
    let done = 0, failed = 0, i = 0;
    const loaderMsg = () => {
      const el = document.getElementById('quiz-loader-msg');
      if (el) el.textContent = `Loading files (${done}/${refs.length})…`;
    };
    async function worker(){
      while (i < refs.length){
        const ref = refs[i++];
        try {
          const raw = await QUIZ._fetch(ref.fid, ref.key);
          all.push(...normQ(raw, ref.fid));
        } catch(e){
          failed++;
        }
        done++;
        loaderMsg();
      }
    }
    await Promise.all(Array.from({length: Math.min(4, refs.length)}, worker));
    QUIZ._hideLoader();
    if (!all.length){ toast('❌ No questions loaded. Cache data first if offline.', 5000); return; }
    if (failed > 0) toast(`⚠️ ${failed} file${failed>1?'s':''} failed to load — starting with ${all.length} questions`);
    let qsArr = shuf(all);
    if (type === 'exam') qsArr = qsArr.slice(0, 100);
    if (type === 'weak'){
      const wu = new Set(S.wr.map(w=>w.uid));
      const weak = qsArr.filter(q=>wu.has(q.uid));
      qsArr = weak.length ? weak : qsArr.slice(0, 50);
      if (!weak.length) toast('ℹ️ No wrong answers yet — showing 50 random instead');
    }
    QUIZ.startWith(qsArr, type === 'exam' ? 'exam' : 'flashcard', '⚡ Psycho Mode', { sessionKind: 'drill' });
  }
};

window.PSY = PSY;
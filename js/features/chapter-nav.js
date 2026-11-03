// js/features/chapter-nav.js — chapter grid, mastery, verdicts, heatmap.

// i18n.js loads before this file (both defer), so I18N exists by the time
// anything here renders. Guard anyway: a missing dictionary must degrade to
// English, never blank the chapter grid.
const T = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v) : s);

window.MASTERY = {
  _fids(lv, ch){ 
    try { return ChapterData.chapterFileRefs(lv, ch).map(r => r.fid); } catch(e){ return []; }
  },
  chapter(lv, ch){
    return chapterMastery({ fids: this._fids(lv, ch), fcount: S.fcount, cov: S.cov, wr: S.wr });
  },
  filteredChapters(){
    const out = [];
    if (typeof SPRINT_LEVELS === 'undefined') return out;
    SPRINT_LEVELS.forEach(lv => {
      try { 
        Object.keys(ChapterData.chapters(lv)).forEach(ch => { 
          if (ChapterData.chapterFileRefs(lv, ch).length) out.push({ lv, ch }); 
        }); 
      } catch(e){}
    });
    return out;
  },
  summary(){
    const list = this.filteredChapters();
    let done = 0;
    list.forEach(c => { if (this.chapter(c.lv, c.ch).state === 'complete') done++; });
    return { done, total: list.length };
  }
};

window.CH_GRID = {
  lv: '',
  mf: 'all',            // mastery filter: all | not-started | practising | strong
  LEVELS: [['level7', 'Level 7'], ['level5', 'Level 5'], ['gk', 'General Knowledge']],
  MFILTERS: ['all', 'not-started', 'practising', 'strong'],
  STATE_TAG: { 'not-started': '', practising: 'tw', strong: 'tg' },
  /* What a student does next differs by state, so the copy teaches rather than
     scores: nothing here says "weak", "behind" or "failed". */
  EMPTY_COPY: {
    'not-started': 'Every chapter here is untouched. Pick one and start — your first answer moves it to Practising.',
    'practising': 'Nothing here yet. Work through a chapter and it joins this list.',
    'strong': 'No strong chapters yet. Answer 85% or more of a chapter with nothing left in your wrong bank and it lands here.'
  },

  // One of the three student-facing states. `chapterMastery` can also report
  // 'unknown' when question counts have not downloaded yet; an answer attempt
  // is proof enough on its own, so that stays "Practising" rather than
  // vanishing into an unknown bucket.
  _state(mst){
    if (!mst) return null;
    if (mst.state === 'complete') return 'strong';
    return (mst.attempted || 0) > 0 ? 'practising' : 'not-started';
  },

  _stateLabel(state){
    if (state === 'strong') return T('Strong');
    if (state === 'practising') return T('Practising');
    return T('Not started');
  },

  _stats(refs){
    if (!Array.isArray(refs)) return { seen: 0, total: 0, complete: false };
    let seen = 0, total = 0, known = 0;
    refs.forEach(r => {
      const c = S.cov && S.cov[r.fid];
      if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
      const n = S.fcount && S.fcount[r.fid];
      if (n != null) { total += n; known++; }
    });
    // A removed question can leave an old coverage bit behind. Never report
    // more seen than the set now contains.
    if (total > 0) seen = Math.min(seen, total);
    return { seen: seen, total: total, complete: refs.length > 0 && known === refs.length };
  },

  _last(){
    return ((S.prog && S.prog.sessions) || []).find(x => x && x.fid && x.lv && x.ch) || null;
  },

  _ref(fid){
    try { return ChapterData.allFileRefs().find(r => r.fid === fid) || null; } catch(e){ return null; }
  },

  render(){
    const box = $('chgrid');
    if (!box || typeof ChapterData === 'undefined') return;
    
    try {
      const last = this._last();
      if (!this.lv) this.lv = (last && last.lv) || 'level7';

      let html = '';
      const lastRef = last ? this._ref(last.fid) : null;
      if (lastRef) {
        const st = this._stats([lastRef]);
        html += '<div class="card" style="border-color:var(--accent-line);background:var(--accent-soft)">' +
          '<div class="t-cap" style="color:var(--accent);font-weight:700">Continue</div>' +
          '<div class="t-t3" style="margin:2px 0 var(--sp-2)">' + esc(ChapterData.chapterName(lastRef.lv, lastRef.ch)) + ': ' + esc(prettySub(lastRef.subtopic)) + '</div>' +
          '<div class="t-foot mb3">' + (st.total ? st.seen + ' of ' + st.total + ' seen' : st.seen + ' seen') + '</div>' +
          '<div class="bg"><button class="btn btn-solid" type="button" data-on-click="CH_GRID.startFid(\'' + lastRef.fid + '\',\'flashcard\')">Practise</button>' +
          '<button class="btn btn-quiet" type="button" data-on-click="CH_GRID.startFid(\'' + lastRef.fid + '\',\'exam\')">Timed test</button></div></div>';
      }

      const tabs = this.LEVELS.map(l =>
        '<button type="button" class="' + (l[0] === this.lv ? 'active' : '') + '" aria-pressed="' + (l[0] === this.lv ? 'true' : 'false') + '" data-on-click="CH_GRID.setLevel(\'' + l[0] + '\')">' + esc(l[1]) + '</button>').join('');
      
      let chs = {};
      try { chs = ChapterData.chapters(this.lv) || {}; } catch(e){}
      
      requestAnimationFrame(() => {
        const items = Object.keys(chs).map(ch => {
          const refs = (() => { try { return ChapterData.chapterFileRefs(this.lv, ch); } catch(e){ return []; } })();
          const has = refs.length > 0;
          const st = this._stats(refs);
          const pct = (st.complete && st.total) ? Math.min(100, Math.round(st.seen / st.total * 100)) : null;
          const missed = (typeof WRONGBY !== 'undefined') ? WRONGBY.countForChapter(this.lv, ch) : 0;
          const mst = has ? MASTERY.chapter(this.lv, ch) : null;
          const done = !!mst && mst.state === 'complete';
          const gate = (mst && mst.state === 'in-progress' && mst.needs && mst.needs.length) ? mst.needs[0] : '';
          return { ch: ch, refs: refs, has: has, st: st, pct: pct, missed: missed,
                   mst: mst, done: done, gate: gate, state: this._state(mst) };
        });

        // Counts cover only chapters you can act on: one with no downloaded
        // sets has no state to show, so it appears under All and nowhere else.
        const counts = { 'not-started': 0, practising: 0, strong: 0 };
        items.forEach(it => { if (it.has && counts[it.state] != null) counts[it.state]++; });
        const shown = items.filter(it => this.mf === 'all' ? true : (it.has && it.state === this.mf));

        const filterRow = '<div class="chg-mfilter" role="group" aria-label="' + esc(T('Filter chapters by mastery')) + '">' +
          this.MFILTERS.map(id => {
            const n = id === 'all' ? items.length : counts[id];
            return '<button type="button" class="chg-mf' + (id === this.mf ? ' active' : '') + '"' +
              (id === this.mf ? ' aria-current="true"' : '') +
              ' data-on-click="CH_GRID.setFilter(\'' + id + '\')">' +
              esc(id === 'all' ? T('All') : this._stateLabel(id)) +
              '<span class="n">' + n + '</span></button>';
          }).join('') + '</div>';

        const cards = shown.map(it => {
          if (!it.has) {
            return '<button type="button" class="chg-card" disabled>' +
              '<span class="chg-name">' + esc(chs[it.ch]) + '</span>' +
              '<span class="chg-meta">' + esc(T('Coming soon')) + '</span></button>';
          }
          const meta = (it.done ? Math.round(it.mst.accuracy * 100) + '% accuracy \u00b7 '
                        : (it.pct !== null ? it.pct + '% seen \u00b7 ' : (it.st.seen ? it.st.seen + ' seen \u00b7 ' : ''))) +
              it.refs.length + (it.refs.length === 1 ? ' set' : ' sets') +
              (it.missed ? ' \u00b7 ' + it.missed + ' missed' : '') + (it.gate ? ' \u00b7 ' + it.gate : '');
          // The missed chip used to float over the card and could collide with
          // the title; both chips now share a row with the title below them.
          const chips = '<span class="chg-top">' +
            '<span class="ctag chg-state ' + this.STATE_TAG[it.state] + '">' + esc(this._stateLabel(it.state)) + '</span>' +
            (it.missed ? '<span class="ctag tr">' + it.missed + ' missed</span>' : '') + '</span>';
          return '<button type="button" class="chg-card" data-on-click="CH_GRID.open(\'' + this.lv + '\',\'' + it.ch + '\')">' +
            chips +
            '<span class="chg-name">' + esc(chs[it.ch]) + '</span>' +
            '<span class="pb" style="display:block"><span class="pb-f" style="display:block;width:' + (it.pct === null ? 0 : it.pct) + '%"></span></span>' +
            '<span class="chg-meta">' + esc(meta) + '</span></button>';
        }).join('');

        const empty = cards ? '' :
          '<div class="chg-empty"><p>' + esc(this.EMPTY_COPY[this.mf] || T('No chapters in this list yet.')) + '</p>' +
          '<button type="button" class="btn btn-quiet" data-on-click="CH_GRID.setFilter(\'all\')">' + esc(T('Show all chapters')) + '</button></div>';

        box.innerHTML = html + '<div class="chg-tabs">' + tabs + '</div>' + filterRow +
          '<div class="chg-grid">' + cards + '</div>' + empty;
      });
    } catch (err) {
      console.error('[CH_GRID.render] failed:', err);
      box.innerHTML = '<div class="card"><div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>Could not load chapters. Try refreshing the page.</span></div></div>';
    }
  },

  setLevel(id){ 
    if (navigator.vibrate) navigator.vibrate(5);
    this.lv = id; 
    this.render(); 
  },

  // Tap a state to see only those chapters; tap it again or "Show all" to
  // clear. Kept on the object (not in a store) so it survives the re-render.
  setFilter(id){
    if (navigator.vibrate) navigator.vibrate(5);
    this.mf = this.MFILTERS.includes(id) ? id : 'all';
    this.render();
  },

  async open(lv, ch){
    try {
      const refs = ChapterData.chapterFileRefs(lv, ch);
      if (!refs.length) return;
      const name = ChapterData.chapterName(lv, ch);
      // The stored count can be older than the file after a content update.
      // Reconcile the cached copies now so the sheet counts what Practice uses.
      if (typeof CNT !== 'undefined' && CNT.reconcileCached) {
        try { await CNT.reconcileCached(refs); } catch(e){}
      }
      let keys = new Set();
      try { keys = new Set(await QDB.keys()); } catch(e){}
      const offline = !(S.online && !S.forcedOffline);
      const missedFor = fid => (typeof WRONGBY !== 'undefined') ? WRONGBY.countFor(fid) : 0;
      
      requestAnimationFrame(() => {
        const rows = refs.map(r => {
          const st = this._stats([r]);
          const cached = keys.has(r.key);
          const blocked = offline && !cached;
          const m = missedFor(r.fid);
          return '<div class="row">' +
            '<div class="row-main">' +
              '<div class="t-callout ch-part-name">' + esc(prettySub(r.subtopic)) +
                (r.book ? '<span class="ch-part-book">' + esc(r.book) + '</span>' : '') + '</div>' +
              '<div class="t-cap"><span class="ch-part-seen" data-fid="' + esc(r.fid) + '">' +
              (st.total ? st.seen + ' of ' + st.total + ' seen' : (st.seen ? st.seen + ' seen' : 'Not started')) + '</span>' +
              (cached ? ' · saved on this device' : (blocked ? ' · needs a connection' : '')) +
              (m ? ' · ' + m + ' missed' : '') + '</div>' +
            '</div>' +
            '<div class="ch-part-actions">' +
              '<button class="btn btn-sm btn-a" type="button"' + (blocked ? ' disabled' : '') + ' data-on-click="CH_GRID.go(\'' + r.fid + '\',\'flashcard\')">Practise</button>' +
              (m ? '<button class="btn btn-sm btn-r" type="button" data-on-click="closeMod();WRONGBY.startFile(\'' + escAttrJs(r.fid) + '\',false)">Missed (' + m + ')</button>' : '') +
              '<button class="btn btn-sm btn-quiet" type="button"' + (blocked ? ' disabled' : '') + ' data-on-click="CH_GRID.go(\'' + r.fid + '\',\'exam\')">Test</button>' +
              '<button class="btn btn-sm ch-row-print" type="button" title="Print a revision sheet"' + (blocked ? ' disabled' : '') + ' data-on-click="PRINT_Q.sheet(\'' + escAttrJs(r.fid) + '\')"><i class="ph ph-printer"></i></button>' +
            '</div></div>';
        }).join('');
        
        const head = refs.length > 1
          ? '<div class="bg mb3"><button class="btn btn-solid" type="button"' + (offline ? ' disabled' : '') + ' data-on-click="CH_GRID.startChapter(\'' + lv + '\',\'' + ch + '\',\'flashcard\')">Practise the whole chapter</button>' +
            '<button class="btn btn-quiet" type="button"' + (offline ? ' disabled' : '') + ' data-on-click="CH_GRID.startChapter(\'' + lv + '\',\'' + ch + '\',\'exam\')">Timed test</button></div>'
          : '';
          
        openMod(name, head + '<div class="rows ch-parts">' + rows + '</div>', { wide: true });
        // Cached files answer instantly, but a content update can leave their
        // counts behind the published files. Refresh only rows we actually hold
        // and patch the visible count when the network answers.
        if (typeof CNT !== 'undefined' && CNT.refreshRemote) {
          const cachedRefs = refs.filter(r => keys.has(r.key));
          CNT.refreshRemote(cachedRefs, (ref, n) => {
            const el = [...document.querySelectorAll('#mbody .ch-part-seen')]
              .find(x => x.dataset.fid === ref.fid);
            if (!el) return;
            let seen = 0;
            const c = S.cov && S.cov[ref.fid];
            if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
            seen = Math.min(seen, n);
            el.textContent = seen + ' of ' + n + ' seen';
          }).catch(() => {});
        }
      });
    } catch(e) {
      console.error('[CH_GRID.open] failed:', e);
      toast('Could not open chapter. Please try again.');
    }
  },

  go(fid, mode){ closeMod(); this.startFid(fid, mode); },

  startFid(fid, mode){
    if (navigator.vibrate) navigator.vibrate(10);
    const r = this._ref(fid);
    if (!r) { toast('That set is not available.'); return; }
    const name = ChapterData.chapterName(r.lv, r.ch) + ' \u2014 ' + r.book;
    QUIZ.load(r.fid, r.key, mode, name, { lv: r.lv, ch: r.ch, book: r.book, sub: r.subtopic, fid: r.fid });
  },

  async startChapter(lv, ch, mode){
    closeMod();
    const refs = ChapterData.chapterFileRefs(lv, ch);
    if (!refs.length) return;
    QUIZ._showLoader('Loading ' + refs.length + ' sets…');
    const all = [];
    let i = 0, done = 0, failed = 0;
    
    const worker = async () => {
      while (i < refs.length) {
        const ref = refs[i++];
        try { all.push(...normQ(await QUIZ._fetch(ref.fid, ref.key), ref.fid)); }
        catch(e){ failed++; }
        done++;
        const m = $('quiz-loader-msg');
        if (m) m.textContent = 'Loading sets (' + done + '/' + refs.length + ')…';
      }
    };
    
    await Promise.all(Array.from({ length: Math.min(4, refs.length) }, worker));
    QUIZ._hideLoader();
    if (!all.length) { toast('Could not load this chapter. Download it while online first.', 5000); return; }
    if (failed) toast(failed + ' set(s) could not load. Starting with ' + all.length + ' questions.', 4000);
    QUIZ.startWith(all, mode, ChapterData.chapterName(lv, ch) + ' \u2014 ' + refs[0].book, { lv: lv, ch: ch });
  }
};

window.CHAP_VERDICTS = {
  render(){
    const box = $('chap-verdicts');
    if (!box) return;
    let entries = [];
    try { entries = (typeof CHAPSTATS !== 'undefined') ? CHAPSTATS.entries() : []; } catch(e){}
    entries = entries.filter(e => e.attempted >= 3);
    if (!entries.length) {
      box.innerHTML = '<p class="t-foot" style="padding:var(--sp-2) 0">Complete a few sessions to see which chapters are strongest.</p>';
      return;
    }
    
    entries.sort((a, b) => a.accuracy - b.accuracy);
    
    requestAnimationFrame(() => {
      box.innerHTML = entries.slice(0, 5).map(e => {
        const pct = e.accuracy;
        const kind = pct >= 80 ? 'ready' : pct >= 60 ? 'needs' : 'weak';
        const icon = pct >= 80 ? 'ph-check-circle' : pct >= 60 ? 'ph-warning-circle' : 'ph-x-circle';
        return '<button class="chap-verdict ' + kind + '" data-on-click="CHAP_VERDICTS.go(\'' + escAttrJs(e.chapter) + '\')">' +
          '<i class="ph ' + icon + ' mark"></i>' +
          '<span class="lbl">' + esc(e.chapter) + '</span>' +
          '<span class="t-cap mono">' + e.correct + '/' + e.attempted + '</span>' +
          '<span class="t-cap" style="color:var(--ink-3);font-weight:650">' + pct + '%</span>' +
        '</button>';
      }).join('');
    });
  },
  go(chapter){
    try {
      UI.go('online');
      setTimeout(() => {
        const refs = ChapterData.allFileRefs();
        const ref = refs.find(r => ChapterData.chapterName(r.lv, r.ch) === chapter);
        if (!ref) return;
        const lvSel = $('on-lv');
        if (lvSel && ref.lv) {
          lvSel.value = ref.lv;
          if (typeof ON !== 'undefined' && ON.onLv) ON.onLv();
          const chSel = $('on-ch');
          if (chSel) { chSel.value = ref.ch; if (ON.onCh) ON.onCh(); }
        }
      }, 200);
    } catch(e){ UI.go('progress'); }
  }
};

window.HEATMAP = {
  render(){
    const box = document.getElementById('heatmap-body');
    if (!box || typeof ChapterData === 'undefined') return;
    const levels = [['level7','Level 7 — Civil'], ['level5','Level 5 — Diploma'], ['gk','General Knowledge']];
    const stats = {};
    (typeof CHAPSTATS !== 'undefined' ? CHAPSTATS.entries() : []).forEach(e => { stats[e.chapter] = e; });
    
    requestAnimationFrame(() => {
      box.innerHTML = levels.map(([lv, name]) => {
        let chs = {};
        try { chs = ChapterData.chapters(lv) || {}; } catch(e){}
        const cards = Object.keys(chs).map(ch => {
          const refs = (() => { try { return ChapterData.chapterFileRefs(lv, ch); } catch(e){ return []; } })();
          if (!refs.length) return '';
          const label = ChapterData.chapterName(lv, ch);
          const s = stats[label];
          const acc = s ? s.accuracy : null;
          let seen = 0;
          refs.forEach(r => { const c = S.cov && S.cov[r.fid]; if (c && c.a) seen += c.a; });
          const cls = acc === null ? 'untouched' : acc >= 80 ? 'strong' : acc >= 60 ? 'workable' : 'weak';
          const missed = (typeof WRONGBY !== 'undefined') ? WRONGBY.countForChapter(lv, ch) : 0;
          const barColor = cls === 'strong' ? 'var(--success)'
                         : cls === 'workable' ? 'var(--accent)'
                         : cls === 'weak' ? 'var(--danger)'
                         : 'var(--sep-strong)';
          return '<button type="button" class="chg-card" style="border-left:4px solid ' + barColor + '" data-on-click="HEATMAP.go(\'' + lv + '\',\'' + ch + '\')">' +
            '<span class="chg-name">' + esc(chs[ch]) + '</span>' +
            '<span class="chg-meta">' +
              (acc === null ? 'Not started' : acc + '% · ' + seen + ' answered') +
              (missed ? ' · ' + missed + ' missed' : '') +
            '</span></button>';
        }).join('');
        if (!cards) return '';
        return '<div class="section-head"><h2>' + esc(name) + '</h2></div><div class="chg-grid">' + cards + '</div>';
      }).join('');
    });
  },
  go(lv, ch){
    if (typeof CH_GRID !== 'undefined') { CH_GRID.lv = lv; CH_GRID.open(lv, ch); }
  }
};
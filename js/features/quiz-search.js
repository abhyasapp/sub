// js/features/quiz-search.js — cross-device question search, keyboard sheet,
// sidebar search.
// MUST load AFTER: core/state.js (S), core/dom.js ($, set), core/text.js (esc),
// core/storage.js (QDB), core/question.js (normQ), core/scope.js (fidFromUid),
// data/chapters-data.js (ChapterData). QSEARCH, KEYSHEET, SIDEBAR_SEARCH
// reference QUIZ, UI, ChapterData at call time only.

window.QSEARCH = {
  _index: null, _loading: false, _last: [],
  async _build(){
    if (this._index) return this._index;
    if (this._loading){ while (this._loading) await new Promise(r => setTimeout(r, 100)); return this._index; }
    this._loading = true;
    const out = [];
    try {
      const keys = await QDB.keys();
      for (const key of keys){
        try {
          const raw = await QDB.get(key);
          const valid = raw && !(typeof raw === 'object' && !Array.isArray(raw) && raw.success === false);
          if (!valid) continue;
          const qs = normQ(raw, key);
          for (const q of qs) out.push(q);
        } catch(e){}
        if (out.length >= 8000) break;
      }
    } catch(e){}
    this._index = out;
    this._loading = false;
    return out;
  },
  async search(term){
    const idx = await this._build();
    const t = String(term || '').toLowerCase().trim();
    if (!t || t.length < 2) return [];
    const hits = [];
    for (let i = 0; i < idx.length; i++){
      const q = idx[i];
      const stem = String(q.q || '').toLowerCase();
      const opts = (q.options || []).join(' ').toLowerCase();
      const pos = stem.indexOf(t);
      if (pos >= 0){ hits.push({ q: q, where: 'stem', pos: pos }); continue; }
      const opos = opts.indexOf(t);
      if (opos >= 0) hits.push({ q: q, where: 'option', pos: opos });
    }
    hits.sort((a, b) => {
      if (a.where !== b.where) return a.where === 'stem' ? -1 : 1;
      return a.pos - b.pos;
    });
    return hits.slice(0, 60).map(h => h.q);
  },
  open(){
    let modal = document.getElementById('qsearch-modal');
    if (!modal){
      modal = document.createElement('div');
      modal.id = 'qsearch-modal';
      modal.className = 'mbg';
      modal.style.zIndex = '10050';
      modal.innerHTML =
        '<div class="mbox wide" data-on-click="event.stopPropagation()">' +
          '<div class="mhd"><h3><i class="ph ph-magnifying-glass"></i> Search questions</h3>' +
            '<button class="mcl" type="button" aria-label="Close" data-on-click="QSEARCH.close()"><i class="ph ph-x"></i></button></div>' +
          '<div class="mbody" style="padding-top:0">' +
            '<input class="input qs-input" id="qs-input" type="search" placeholder="Type any word from the question or options\u2026" autocomplete="off">' +
            '<div id="qs-status" class="t-foot" style="margin:var(--sp-2) 0"></div>' +
            '<div id="qs-results" class="stack2"></div>' +
          '</div>' +
        '</div>';
      modal.addEventListener('click', e => { if (e.target === modal) QSEARCH.close(); });
      document.body.appendChild(modal);
      const inp = modal.querySelector('#qs-input');
      let timer = null;
      inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => QSEARCH._run(inp.value), 220); });
      inp.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); QSEARCH.close(); } });
    }
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { const inp = document.getElementById('qs-input'); if (inp){ inp.value=''; inp.focus(); } }, 40);
    /* Tab-trap the panel; Escape already closes it via the input keydown below. */
    DIALOG.open(modal);
    this._run('');
  },
  close(){
    const m = document.getElementById('qsearch-modal');
    if (!m || !m.classList.contains('show')) return;
    m.classList.remove('show');
    if (!document.querySelector('.mbg.show')) document.body.style.overflow = '';
    DIALOG.release(m);
  },
  _emptyHint(status){
    status.innerHTML =
      '<i class="ph ph-info"></i> No questions downloaded yet. ' +
      'Open <b>Chapters</b> once while online — then everything is searchable here, ' +
      'even with no connection.';
  },
  async _run(term){
    const status = document.getElementById('qs-status');
    const box = document.getElementById('qs-results');
    if (!box) return;
    if (!term || term.length < 2){
      box.innerHTML = '';
      if (this._index && this._index.length === 0) { this._emptyHint(status); return; }
      status.textContent = this._index
        ? this._index.length + ' questions indexed \u00b7 type at least 2 characters.'
        : 'Indexing questions\u2026';
      return;
    }
    status.textContent = 'Searching\u2026';
    const hits = await this.search(term);
    /* Nothing downloaded at all: "No matches" would mislead — the question may
       exist, it just is not on this device yet. Point the user at Chapters. */
    if (!hits.length && this._index && this._index.length === 0){
      box.innerHTML = ''; this._emptyHint(status); return;
    }
    if (!hits.length){ box.innerHTML = ''; status.textContent = 'No matches.'; return; }
    status.textContent = hits.length + ' result' + (hits.length === 1 ? '' : 's');
    const termLc = term.toLowerCase();
    box.innerHTML = hits.map((q, i) => {
      const stemRaw = String(q.q || '');
      const pos = stemRaw.toLowerCase().indexOf(termLc);
      const snip = pos < 0
        ? esc(stemRaw.slice(0, 200))
        : esc(stemRaw.slice(Math.max(0, pos - 40), pos + 160));
      const hl = pos >= 0
        ? snip.replace(new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<mark>$1</mark>')
        : snip;
      const correct = q.correct != null ? String.fromCharCode(65 + Number(q.correct)) : '?';
      return '<button type="button" class="qs-item" data-on-click="QSEARCH.pick(' + i + ')">' +
        '<span class="qs-badge">' + esc(correct) + '</span>' +
        '<span class="qs-body"><span class="qs-stem">' + hl + '</span>' +
        '<span class="qs-meta">' + esc((q.options || []).slice(0, 2).join('  \u00b7  ')) + '</span></span>' +
      '</button>';
    }).join('');
    this._last = hits;
  },
  pick(i){
    const q = (this._last || [])[i];
    if (!q) return;
    this.close();
    if (typeof QUIZ === 'undefined' || typeof QUIZ.startWith !== 'function') return;
    const fid = fidFromUid(String(q.uid || ''));
    const ref = (typeof ChapterData !== 'undefined')
      ? ChapterData.allFileRefs().find(r => r.fid === fid) : null;
    if (!ref){ QUIZ.startWith([q], 'flashcard', 'Search result', null); return; }
    (async () => {
      let pool;
      try { const raw = await QUIZ._fetch(ref.fid, ref.key); pool = normQ(raw, ref.fid); }
      catch(e){ pool = [q]; }
      const i = pool.findIndex(x => x.uid === q.uid);
      const reordered = i >= 0 ? [pool[i]].concat(pool.filter((_, j) => j !== i)) : [q].concat(pool);
      const chapName = ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book;
      QUIZ.startWith(reordered, 'flashcard', 'Search: ' + chapName,
        { lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid });
    })();
  }
};

window.KEYSHEET = {
  ROWS: [
    ['Any view',  ['/', 'Open question search'],
                  ['?', 'Show this sheet'],
                  ['Esc', 'Close any open sheet / leave quiz']],
    ['In a practice quiz', ['A B C D', 'Answer the current question'],
                            ['1 to 5', 'Or use number keys'],
                            ['\u2190 \u2192', 'Previous / next question'],
                            ['Ctrl + F', 'Search the question on Google (AI)']],
    ['In a timed test', ['A\u2013D', 'Answer the current question'],
                        ['Esc', 'Quit the test']],
    ['In the PDF viewer', ['+ \u2212', 'Zoom in / out'],
                            ['0', 'Fit page'],
                            ['F', 'Fullscreen'],
                            ['Ctrl + F', 'Find in document'],
                            ['Ctrl + S', 'Save marks']]
  ],
  open(){
    if (document.getElementById('keysheet-modal')) { this._show(); return; }
    const m = document.createElement('div');
    m.id = 'keysheet-modal';
    m.className = 'mbg';
    m.style.zIndex = '10055';
    m.innerHTML =
      '<div class="mbox" data-on-click="event.stopPropagation()" style="max-width:520px">' +
        '<div class="mhd"><h3><i class="ph ph-keyboard"></i> Keyboard shortcuts</h3>' +
          '<button class="mcl" type="button" aria-label="Close" data-on-click="KEYSHEET.close()"><i class="ph ph-x"></i></button></div>' +
        '<div class="mbody">' +
          this.ROWS.map(([section, ...rows]) =>
            '<div class="ks-section">' + esc(section) + '</div>' +
            rows.map(([k, d]) =>
              '<div class="ks-row"><span class="ks-keys">' +
                k.split(' ').map(x => '<kbd>' + esc(x) + '</kbd>').join(' ') +
              '</span><span class="ks-desc">' + esc(d) + '</span></div>'
            ).join('')
          ).join('') +
        '</div>' +
      '</div>';
    m.addEventListener('click', e => { if (e.target === m) KEYSHEET.close(); });
    document.body.appendChild(m);
    this._show();
  },
  _show(){ document.getElementById('keysheet-modal').classList.add('show'); document.body.style.overflow = 'hidden'; },
  close(){ const m = document.getElementById('keysheet-modal'); if (m) m.classList.remove('show'); if (!document.querySelector('.mbg.show')) document.body.style.overflow = ''; }
};

window.SIDEBAR_SEARCH = {
  _debounceTimer: null,
  _qResults: [],
  _input: null,
  _results: null,

  init(){
    const sb = document.getElementById('sb');
    if (!sb) return;
    if (document.getElementById('sb-filter')) return;

    const wrap = document.createElement('div');
    wrap.id = 'sb-filter-wrap';
    wrap.className = 'sb-filter-wrap';
    wrap.innerHTML =
      '<div class="sb-filter-input">' +
        '<i class="ph ph-magnifying-glass"></i>' +
        '<input id="sb-filter" type="search" aria-label="Find a screen or question" placeholder="Find a screen or question\u2026" autocomplete="off" spellcheck="false" enterkeyhint="search">' +
      '</div>' +
      '<div id="sb-filter-results" class="sb-filter-results" style="display:none"></div>';

    const anchor = sb.querySelector('#sb-admin-promo') || sb.querySelector('.sb-you');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    else sb.insertBefore(wrap, sb.firstChild);

    const input = wrap.querySelector('#sb-filter');
    const results = wrap.querySelector('#sb-filter-results');

    input.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      const term = input.value;
      this.filter(term);
      this._debounceTimer = setTimeout(() => this._searchQuestions(term), 200);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        input.value = '';
        this.filter('');
        this._hideResults();
        input.blur();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this._openAll();
      }
    });

    input.addEventListener('focus', () => {
      if (input.value && input.value.trim().length >= 2) this._searchQuestions(input.value);
    });

    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) this._hideResults();
    });

    this._input = input;
    this._results = results;
  },

  filter(q){
    const term = String(q || '').toLowerCase().trim();
    document.querySelectorAll('#sb .sb-item').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = (!term || text.indexOf(term) !== -1) ? '' : 'none';
    });
    document.querySelectorAll('#sb .sb-sec').forEach(sec => {
      const items = sec.querySelectorAll('.sb-item');
      const any = Array.from(items).some(i => i.style.display !== 'none');
      sec.style.display = any ? '' : 'none';
    });
  },

  _hideResults(){
    if (this._results) this._results.style.display = 'none';
  },

  async _searchQuestions(term){
    term = String(term || '').trim();
    if (term.length < 2){ this._hideResults(); this._qResults = []; return; }
    if (typeof QSEARCH === 'undefined') return;

    let hits = [];
    try { hits = await QSEARCH.search(term); } catch(e){}
    if (!this._input || !this._results) return;
    if (this._input.value.trim().length < 2) return;

    this._qResults = hits.slice(0, 5);
    const termLc = term.toLowerCase();

    if (!this._qResults.length) {
      this._results.innerHTML =
        '<div class="sb-filter-empty">' +
          '<i class="ph ph-magnifying-glass"></i> No questions match' +
        '</div>';
      this._results.style.display = '';
      return;
    }

    const rows = this._qResults.map((q, i) => {
      const stem = String(q.q || '');
      const pos = stem.toLowerCase().indexOf(termLc);
      const snip = pos < 0
        ? stem.slice(0, 100)
        : stem.slice(Math.max(0, pos - 25), pos + 75);
      const correct = q.correct != null ? String.fromCharCode(65 + Number(q.correct)) : '?';
      return '<button type="button" class="sb-filter-item" ' +
        'data-on-mousedown="SIDEBAR_SEARCH._pick(' + i + ');return false" ' +
        'data-on-click="return false">' +
          '<span class="sb-filter-badge">' + esc(correct) + '</span>' +
          '<span class="sb-filter-stem">' + esc(snip) + '</span>' +
        '</button>';
    }).join('');

    this._results.innerHTML =
      '<div class="sb-filter-head">Questions \u00b7 ' + hits.length + '</div>' +
      rows +
      '<button type="button" class="sb-filter-all" data-on-mousedown="SIDEBAR_SEARCH._openAll();return false" data-on-click="return false">' +
        'See all ' + hits.length + ' in full view' +
      '</button>';
    this._results.style.display = '';
  },

  _pick(i){
    const q = (this._qResults || [])[i];
    if (!q) return;
    this._close();
    if (typeof QSEARCH === 'undefined') return;
    QSEARCH._last = [q];
    QSEARCH.pick(0);
  },

  _openAll(){
    const term = this._input ? this._input.value.trim() : '';
    this._close();
    if (typeof QSEARCH === 'undefined') return;
    QSEARCH.open();
    if (term) {
      setTimeout(() => {
        const inp = document.getElementById('qs-input');
        if (inp) {
          inp.value = term;
          inp.dispatchEvent(new Event('input'));
        }
      }, 90);
    }
  },

  _close(){
    if (this._input) this._input.value = '';
    this.filter('');
    this._hideResults();
    if (typeof UI !== 'undefined' && UI.sidebarClose) UI.sidebarClose();
  }
};
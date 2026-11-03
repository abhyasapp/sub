// js/features/wrong-bank-ui.js — the four Weak-spots views (due / all / misconceptions / hardest).
// MUST load AFTER: core/state.js (S), core/format.js (shuf, today), core/text.js (esc, escAttrJs),
// core/storage.js (_save), core/toast.js (toast), core/scope.js (fidFromUid),
// core/question.js (normQ), report/report-matching.js (sameQuestionAfterCorrection),
// features/review.js (REV) — this file monkey-patches REV.renderList, so review.js must load first,
// features/quiz-engine.js (QUIZ), features/quiz-extras.js (QNOTE),
// features/online-study.js (prettySub), data/chapters-data.js (ChapterData).
// All symbols the object references are resolved at call time via the shared global scope.

window.WRONGBY = {
  _open: {},
  _last: [],

  _ref(fid){ return ChapterData.allFileRefs().find(r => r.fid === fid) || null; },
  _due(q){ return q._nextDue == null || q._nextDue <= Date.now(); },
  _fidOf(q){ return fidFromUid(String((q && q.uid) || '')); },
  _reason(q){
    if (!q) return '';
    if (q._reason) return String(q._reason);
    if (q._misconception) return 'careless';
    return '';
  },

  groups(){
    const byFid = {};
    (S.wr || []).forEach(q => {
      if (q._withdrawn) return;
      const fid = this._fidOf(q);
      const ref = this._ref(fid);
      if (!ref) return;
      const g = byFid[fid] || (byFid[fid] = { fid: fid, ref: ref, items: [], due: 0, careless: 0, concept: 0 });
      g.items.push(q);
      if (this._due(q)) g.due++;
      const r = this._reason(q);
      if (r === 'careless') g.careless++;
      else if (r === 'concept') g.concept++;
    });
    const byCh = {};
    Object.values(byFid).forEach(g => {
      const k = g.ref.lv + '|' + g.ref.ch;
      const c = byCh[k] || (byCh[k] = {
        key: k, lv: g.ref.lv, ch: g.ref.ch,
        name: ChapterData.chapterName(g.ref.lv, g.ref.ch),
        files: [], n: 0, due: 0, careless: 0, concept: 0
      });
      c.files.push(g);
      c.n += g.items.length;
      c.due += g.due;
      c.careless += g.careless;
      c.concept += g.concept;
    });
    return Object.values(byCh).sort((a, b) => b.due - a.due || b.n - a.n);
  },

  countFor(fid){
    return (S.wr || []).filter(q => this._fidOf(q) === fid).length;
  },
  countForChapter(lv, ch){
    return (S.wr || []).filter(q => {
      const ref = this._ref(this._fidOf(q));
      return ref && ref.lv === lv && ref.ch === ch;
    }).length;
  },

  async start(fids, dueOnly, mode){
    let items = (S.wr || []).filter(q => !q._withdrawn && fids.indexOf(this._fidOf(q)) !== -1);
    if (dueOnly) items = items.filter(q => this._due(q));
    if (!items.length) { toast(dueOnly ? 'Nothing due here right now.' : 'No missed questions here.'); return; }
    QUIZ._showLoader('Getting your missed questions…');
    const fresh = {};
    for (const fid of fids) {
      const ref = this._ref(fid);
      if (!ref) continue;
      try {
        const raw = await QUIZ._fetch(ref.fid, ref.key);
        normQ(raw, ref.fid).forEach(q => { fresh[q.uid] = q; });
      } catch(e){}
    }
    QUIZ._hideLoader();
    const merged = items.map(q => {
      const f = fresh[q.uid];
      if (!f || !sameQuestionAfterCorrection(q, f, 0.6)) return q;
      return Object.assign({}, f, {
        _streak: q._streak, _nextDue: q._nextDue,
        _reason: q._reason, _misconception: q._misconception, _note: q._note
      });
    });
    const ref0 = this._ref(fids[0]);
    const label = (ref0 ? ChapterData.chapterName(ref0.lv, ref0.ch) : 'Missed') + ' — Missed';
    QUIZ.startWith(shuf(merged), mode || 'flashcard', label);
  },

  startChapter(i, dueOnly, mode){
    const c = this._last[i];
    if (c) this.start(c.files.map(f => f.fid), dueOnly, mode);
  },
  startFile(fid, dueOnly, mode){ this.start([fid], dueOnly, mode); },
  toggle(i){ const c = this._last[i]; if (!c) return; this._open[c.key] = !this._open[c.key]; this.render(); },

  missCount(uid){
    if (!uid) return 0;
    if (!this._missCache) this._missCache = {};
    if (this._missCache[uid] != null) return this._missCache[uid];
    let n = 0;
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    for (let i = 0; i < sessions.length; i++){
      const qres = sessions[i] && sessions[i].qres;
      if (!Array.isArray(qres)) continue;
      for (let j = 0; j < qres.length; j++){
        const r = qres[j];
        if (r && r.uid === uid && r.ok === false) n++;
      }
    }
    this._missCache[uid] = n;
    return n;
  },

  async practiceSimilar(uid){
    if (!uid) return;
    const fid = fidFromUid(String(uid));
    const ref = this._ref(fid);
    if (!ref){ toast('That chapter is not available.'); return; }
    QUIZ._showLoader('Finding similar questions…');
    let pool;
    try {
      const raw = await QUIZ._fetch(ref.fid, ref.key);
      pool = normQ(raw, ref.fid);
    } catch(e){ QUIZ._hideLoader(); toast('Could not load the chapter.'); return; }
    QUIZ._hideLoader();
    if (pool.length < 2){ toast('Not enough questions in this file.'); return; }
    const current = pool.find(q => q.uid === uid);
    if (!current){ toast('Could not find this question.'); return; }
    const STOP = new Set(['which','whose','what','where','when','there',
      'their','these','those','about','following','correct','choose',
      'select','given','below','above','value','values','calculate',
      'determine','find','state','explain','describe','consider','shall',
      'will','would','could','should','might','must','been','being',
      'while','other','another','first','second','third']);
    const tok = s => String(s||'').toLowerCase().split(/[^a-z0-9]+/)
      .filter(w => w.length >= 5 && !STOP.has(w));
    const curTok = new Set(tok(current.q));
    const scored = pool.filter(q => q.uid !== uid).map(q => {
      const t = tok(q.q);
      let hits = 0;
      for (const w of t) if (curTok.has(w)) hits++;
      return { q: q, score: hits };
    });
    scored.sort((a,b) => b.score - a.score);
    const picked = scored.filter(x => x.score > 0).slice(0, 5).map(x => x.q);
    if (!picked.length){ toast('No similar questions found in this file.'); return; }
    const chapName = ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book;
    QUIZ.startWith(picked, 'flashcard', 'Similar \u2014 ' + chapName,
      { lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid });
  },

  setNote(uid, note){
    if (typeof QNOTE !== 'undefined') { QNOTE.set(uid, note); return; }
    const q = (S.wr || []).find(x => x.uid === uid);
    if (!q) return;
    q._note = String(note || '').slice(0, 160).trim();
    _save(LS.WR, S.wr);
  },

  setReason(uid, reason){
    const q = (S.wr || []).find(x => x.uid === uid);
    if (!q) return;
    q._reason = reason || '';
    if (reason === 'careless') q._misconception = true;
    else if (reason === 'concept') q._misconception = false;
    _save(LS.WR, S.wr);
    this.render();
  },

  dueAll(){
    const allFids = this._last.flatMap(c => c.files.map(f => f.fid));
    if (!allFids.length) { toast('Nothing to review yet.'); return; }
    this.start(allFids, true);
  },

  _tab: 'due',
  TABS: ['due', 'all', 'misconceptions', 'hardest'],
  _items(){ return (S.wr || []).filter(q => !q._withdrawn); },
  _wNote(){
    const n = (S.wr || []).filter(x => x._withdrawn).length;
    return n ? '<div class="t-foot" style="color:var(--ink-2);margin:0 0 var(--sp-3)"><i class="ph ph-prohibit"></i> ' + n + ' withdrawn question' + (n === 1 ? '' : 's') + ' (removed from the bank, never practised)</div>' : '';
  },
  _text(q){ return String((q && (q.q || q.question || q.text)) || '').replace(/\s+/g, ' ').trim(); },
  _syncTabs(){
    document.querySelectorAll('#view-wrong .tabbar button').forEach(b => {
      const on = b.getAttribute('data-tab') === WRONGBY._tab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    const el = document.getElementById('wr-list'); if (el) el.setAttribute('role', 'tabpanel');
  },
  tab(name){
    WRONGBY._tab = WRONGBY.TABS.indexOf(name) === -1 ? 'due' : name;
    WRONGBY.render();
  },
  startList(items, label){
    if (!items.length) { toast('Nothing to practise here yet.'); return; }
    QUIZ.startWith(shuf(items.slice()), 'flashcard', label);
  },
  startReason(r){
    const want = r === 'concept' ? 'concept' : r === 'careless' ? 'careless' : '';
    const items = WRONGBY._items().filter(q => (WRONGBY._reason(q) || '') === want);
    WRONGBY.startList(items, (want === 'concept' ? 'Concept gaps' : want === 'careless' ? 'Careless mistakes' : 'Not sorted yet') + ' \u00b7 Missed');
  },
  _hardest(){
    return WRONGBY._items().map(q => ({ q: q, n: WRONGBY.missCount(q.uid) })).filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n || (a.q._streak || 0) - (b.q._streak || 0)).slice(0, 20);
  },
  startHardest(){ WRONGBY.startList(WRONGBY._hardest().map(x => x.q), 'Hardest 20 \u00b7 Missed'); },

  _renderDue(el){
    const due = this._last.map((c, i) => ({ c: c, i: i })).filter(x => x.c.due > 0);
    const total = this._last.reduce((n, c) => n + c.n, 0);
    const dueTotal = due.reduce((n, x) => n + x.c.due, 0);
    if (!dueTotal) {
      el.innerHTML = this._wNote() + '<div class="card"><div class="t-callout" style="color:var(--ink)"><b>Nothing is due right now.</b></div>' +
        '<div class="t-foot mt2" style="color:var(--ink-2)">' + total + ' missed question' + (total === 1 ? ' is' : 's are') + ' waiting. Each comes back for review on a spaced schedule.</div>' +
        '<button class="btn btn-quiet btn-blk mt3" data-on-click="WRONGBY.tab(\'all\')">See all missed questions</button></div>';
      return;
    }
    el.innerHTML = this._wNote() + '<div class="card" style="margin-bottom:var(--sp-3);background:var(--accent-soft);border-color:var(--accent-line)">' +
        '<div class="t-callout" style="color:var(--ink)"><b>' + dueTotal + '</b> ready for review now, in ' + due.length + ' chapter' + (due.length === 1 ? '' : 's') + '.</div>' +
        '<button class="btn btn-solid btn-blk mt3" data-on-click="WRONGBY.dueAll()"><i class="ph ph-repeat"></i> Review all ' + dueTotal + ' due now</button></div>' +
      due.map(x => '<div class="card" style="margin-bottom:var(--sp-2)"><div class="card-hd"><h3>' + esc(x.c.name) + '</h3><span class="ctag tr">' + x.c.due + ' due</span></div>' +
        '<div class="bg"><button class="btn btn-sm btn-solid" data-on-click="WRONGBY.startChapter(' + x.i + ',true)">Do what\'s due</button></div></div>').join('');
  },

  _renderReasons(el){
    const by = { concept: [], careless: [], other: [] };
    this._items().forEach(q => { const r = this._reason(q); by[r === 'concept' ? 'concept' : r === 'careless' ? 'careless' : 'other'].push(q); });
    const cards = [
      ['concept',  'Concept gaps',      'ph-book',      'You did not know it or had the idea wrong. Revise the idea, then practise.'],
      ['careless', 'Careless mistakes', 'ph-lightning', 'You knew it but slipped. Slow down and re-read the question.'],
      ['other',    'Not sorted yet',    'ph-question',  'Open All missed, choose Show every question, and say why you missed one. It moves into a group above.']
    ].filter(c => by[c[0]].length);
    if (!cards.length) { el.innerHTML = this._wNote() + '<div class="card"><div class="t-callout" style="color:var(--ink)">Nothing here yet. Missed questions are grouped by why you missed them.</div></div>'; return; }
    el.innerHTML = this._wNote() + cards.map(c => '<div class="card" style="margin-bottom:var(--sp-2)"><div class="card-hd"><h3><i class="ph ' + c[2] + '"></i> ' + c[1] + '</h3>' +
      '<span class="ctag ' + (c[0] === 'other' ? 'ta' : 'tr') + '">' + by[c[0]].length + '</span></div>' +
      '<p class="t-callout mb4">' + c[3] + '</p>' +
      '<div class="bg"><button class="btn btn-sm btn-solid" data-on-click="WRONGBY.startReason(\'' + c[0] + '\')">Practise these ' + by[c[0]].length + '</button></div></div>').join('');
  },

  _renderHardest(el){
    const top = this._hardest();
    if (!top.length) { el.innerHTML = this._wNote() + '<div class="card"><div class="t-callout" style="color:var(--ink)">No question has beaten you more than once yet.</div><div class="t-foot mt2" style="color:var(--ink-2)">Questions you miss again and again appear here, hardest first.</div></div>'; return; }
    el.innerHTML = this._wNote() + '<div class="card" style="margin-bottom:var(--sp-3);background:var(--accent-soft);border-color:var(--accent-line)">' +
        '<div class="t-callout" style="color:var(--ink)">Your <b>' + top.length + '</b> hardest question' + (top.length === 1 ? '' : 's') + ', most missed first.</div>' +
        '<button class="btn btn-solid btn-blk mt3" data-on-click="WRONGBY.startHardest()"><i class="ph ph-target"></i> Practise these ' + top.length + '</button></div>' +
      '<div class="card">' + top.map(x => '<div class="row" style="padding:var(--sp-2) 0"><div class="row-main"><div class="t-callout" style="color:var(--ink)">' + esc(this._text(x.q).slice(0, 120) || 'Question') +
        '</div><div class="t-cap">missed ' + x.n + ' time' + (x.n === 1 ? '' : 's') + '</div></div></div>').join('') + '</div>';
  },

  render(){
    const el = document.getElementById('wr-list');
    if (!el) return;
    this._syncTabs();
    this._last = this.groups();
    if (!this._last.length) { WRONGBY._plain('wr'); return; }
    const t = this._tab || 'due';
    if (t === 'due') return this._renderDue(el);
    if (t === 'misconceptions') return this._renderReasons(el);
    if (t === 'hardest') return this._renderHardest(el);
    return this._renderAll();
  },

  _renderAll(){
    const el = document.getElementById('wr-list');
    if (!el) return;
    this._last = this.groups();
    if (!this._last.length) { WRONGBY._plain('wr'); return; }

    const total = this._last.reduce((n, c) => n + c.n, 0);
    const dueTotal = this._last.reduce((n, c) => n + c.due, 0);
    const careless = this._last.reduce((n, c) => n + c.careless, 0);
    const concept = this._last.reduce((n, c) => n + c.concept, 0);
    const withdrawn = (S.wr || []).filter(x => x._withdrawn).length;

    const head =
      '<div class="card" style="margin-bottom:var(--sp-3);background:var(--accent-soft);border-color:var(--accent-line)">' +
        '<div class="t-callout" style="color:var(--ink)">' + total + ' missed question' + (total === 1 ? '' : 's') +
        ' across ' + this._last.length + ' chapter' + (this._last.length === 1 ? '' : 's') + '.' +
        (dueTotal ? ' <b>' + dueTotal + '</b> ready for review now.' : '') + '</div>' +
        (careless || concept
          ? '<div class="t-foot mt2" style="color:var(--ink-2)">' +
              (careless ? '<i class="ph ph-lightning"></i> ' + careless + ' careless' : '') +
              (careless && concept ? ' · ' : '') +
              (concept ? '<i class="ph ph-book"></i> ' + concept + ' concept gap' : '') +
            '</div>'
          : '') +
        (withdrawn ? '<div class="t-foot mt2" style="color:var(--ink-2)"><i class="ph ph-prohibit"></i> ' + withdrawn + ' withdrawn question' + (withdrawn === 1 ? '' : 's') + ' (removed from the question bank) ' + (withdrawn === 1 ? 'is' : 'are') + ' kept in the full list and left out of practice.</div>' : '') +
        (dueTotal ? '<button class="btn btn-solid btn-blk mt3" data-on-click="WRONGBY.dueAll()"><i class="ph ph-repeat"></i> Review all ' + dueTotal + ' due now</button>' : '') +
      '</div>';

    el.innerHTML = head + this._last.map((c, i) => {
      const open = this._open[c.key];
      const files = open ? c.files.map(f =>
        '<div class="row" style="padding:var(--sp-2) 0">' +
          '<div class="row-main">' +
            '<div class="t-callout" style="color:var(--ink);font-weight:600">' + esc(prettySub(f.ref.subtopic)) + '</div>' +
            '<div class="t-cap">' + f.items.length + ' missed · ' + f.due + ' due' + '</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-a" data-on-click="WRONGBY.startFile(\'' + escAttrJs(f.fid) + '\',false)">Practise</button>' +
          '<button class="btn btn-sm btn-quiet" data-on-click="WRONGBY.startFile(\'' + escAttrJs(f.fid) + '\',false,\'exam\')">Test</button>' +
        '</div>'
      ).join('') : '';
      return '<div class="card" style="margin-bottom:var(--sp-2)">' +
        '<div class="card-hd"><h3>' + esc(c.name) + '</h3>' +
          '<span class="ctag ' + (c.due ? 'tr' : 'ta') + '">' + c.n + ' missed' + (c.due ? ' · ' + c.due + ' due' : '') + '</span>' +
        '</div>' +
        '<div class="bg">' +
          (c.due ? '<button class="btn btn-sm btn-solid" data-on-click="WRONGBY.startChapter(' + i + ',true)">Do what\'s due</button>' : '') +
          '<button class="btn btn-sm btn-a" data-on-click="WRONGBY.startChapter(' + i + ',false)">All ' + c.n + '</button>' +
          '<button class="btn btn-sm btn-quiet" data-on-click="WRONGBY.toggle(' + i + ')">' + (open ? 'Hide files' : 'By file (' + c.files.length + ')') + '</button>' +
        '</div>' +
        files +
      '</div>';
    }).join('') + '<button class="btn btn-quiet btn-blk" data-on-click="WRONGBY._plain(\'wr\')">Show every question (to report or remove one)</button>';
  }
};

WRONGBY._plain = REV.renderList.bind(REV);
REV.renderList = function(kind){
  return kind === 'wr' ? WRONGBY.render() : WRONGBY._plain(kind);
};
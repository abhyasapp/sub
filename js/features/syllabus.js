// js/features/syllabus.js — syllabus progress, mock paper, Loksewa scheme composer.
// MUST load AFTER: core/state.js (S), core/text.js (esc), core/storage.js,
// core/toast.js (toast), core/loksewa.js (normalizeLoksewaScheme,
// composeLoksewaPaper, loksewaGroupFor), core/question.js (normQ),
// data/chapters-data.js (ChapterData), features/quiz-engine.js (QUIZ).
// QUIZ._fetch / startWith / _showLoader / _hideLoader are call-time only.

window.SYLLABUS_PROGRESS = {
  render(){
    const box = document.getElementById('syllabus-slot');
    if (!box) return;
    const allRefs = (typeof ChapterData !== 'undefined') ? ChapterData.allFileRefs() : [];
    if (!allRefs.length){ box.innerHTML = ''; return; }
    const cov = S.cov || {}, fcount = S.fcount || {};
    const levels = [['level7','Level 7'], ['level5','Level 5'], ['gk','GK']];
    const rows = [];
    for (const entry of levels){
      const lv = entry[0], label = entry[1];
      const refs = allRefs.filter(r => r.lv === lv);
      if (!refs.length) continue;
      let total = 0, seen = 0;
      refs.forEach(r => {
        const n = fcount[r.fid];
        if (n != null) total += n;
        const c = cov[r.fid];
        if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
      });
      rows.push({ label: label, seen: seen, total: total, pct: total ? Math.min(100, Math.round((seen / total) * 100)) : 0 });
    }
    if (!rows.length){ box.innerHTML = ''; return; }
    box.innerHTML =
      '<div class="card">' +
        '<div class="card-hd"><h3><i class="ph ph-books"></i> Syllabus progress</h3></div>' +
        rows.map(function(r){
          return '<div class="sp-item"><div class="sp-l"><span>' + esc(r.label) + '</span>' +
            '<span class="t-cap mono">' + r.seen + ' / ' + (r.total || '?') + ' \u00b7 ' + r.pct + '%</span></div>' +
            '<div class="pb"><div class="pb-f" style="width:' + r.pct + '%"></div></div></div>';
        }).join('') +
      '</div>';
  }
};

window.LKS = {
  /* The admin's mark scheme (kept from the last time the app was online), or the built-in default (25 GK + the 50 Level 7 marks by topic). */
  scheme(){ let raw = ''; try { raw = localStorage.getItem('abhyas_lscheme') || ''; } catch(e){} return normalizeLoksewaScheme(raw); },
  minutes(){ return Math.max(10, Math.round(this.scheme().total * 0.8)); }     /* 75 marks = 60 minutes */
};

window.SYLLABUS_MOCK = {
  _dateKey(){
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  },
  _seed(){ return parseInt(this._dateKey().replace(/-/g, ''), 10) || 20250101; },
  _rng(seed){
    let a = seed >>> 0;
    return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  _allRefs(){ return (typeof ChapterData !== 'undefined') ? ChapterData.allFileRefs() : []; },
  /* Every question from every chapter the scheme draws on, remembered with its level and chapter. */
  async _pool(scheme){
    const pool = [];
    for (const ref of this._allRefs()){
      if (!loksewaGroupFor(scheme, ref.lv, ref.ch)) continue;
      try {
        const raw = await QUIZ._fetch(ref.fid, ref.key);
        normQ(raw, ref.fid).forEach(q => pool.push({ q, lv: ref.lv, ch: ref.ch }));
      } catch(e){}
    }
    return pool;
  },
  /* The paper follows the scheme exactly: each group contributes its marks, chapters take turns inside a group,
     and the same paper is built for everyone all day (seeded by the date). */
  async build(){
    const scheme = LKS.scheme();
    const pool = await this._pool(scheme);
    const r = composeLoksewaPaper(scheme, pool, this._rng(this._seed()));
    return { papers: r.questions, shortfalls: r.shortfalls, scheme, total: r.total };
  },
  async start(){
    QUIZ._showLoader('Building today\u2019s ' + LKS.scheme().total + '-mark paper\u2026');
    let built = { papers: [], shortfalls: [], total: 75 };
    try { built = await this.build(); } catch(e){}
    QUIZ._hideLoader();
    if (built.papers.length < 10){ toast('Not enough chapters cached yet. Open a few chapters in Chapters first.', 6000); return; }
    if (built.shortfalls.length){
      toast('Short of questions for ' + built.shortfalls.map(s => s.name + ' (' + s.got + ' of ' + s.wanted + ')').join(', ') + '. Running a ' + built.papers.length + '-question paper.', 7000);
    }
    QUIZ.startWith(
      built.papers, 'exam',
      '\ud83d\udcdd Daily ' + built.total + '-mark Loksewa paper \u2014 ' + this._dateKey(),
      { loksewaMock: true, timeLimitSec: LKS.minutes() * 60 }
    );
  },
  render(){
    const box = document.getElementById('syllabus-mock-slot');
    if (!box) return;
    const scheme = LKS.scheme();
    const refs = this._allRefs();
    if (!refs.some(r => loksewaGroupFor(scheme, r.lv, r.ch))){ box.innerHTML = ''; return; }
    box.innerHTML =
      '<section class="card" style="border-color:var(--accent-line)">' +
        '<div class="card-hd"><h3><i class="ph ph-note-pencil"></i> Today\u2019s ' + scheme.total + '-mark Loksewa paper</h3>' +
          '<span class="ctag ta">' + scheme.total + ' marks \u00b7 ' + LKS.minutes() + ' min</span></div>' +
        '<p class="t-foot" style="margin-bottom:var(--sp-3);line-height:1.55">' +
          'Built to the syllabus mark scheme. Same paper all day; new one tomorrow. ' +
          'Loksewa scoring: <b>+1</b> correct, <b>\u22120.2</b> wrong, <b>0</b> skipped.</p>' +
        scheme.groups.map(g => '<div class="syl-row"><span class="syl-label">' + esc(g.name) + '</span><span class="syl-marks">' + g.marks + '</span></div>').join('') +
        '<button class="btn btn-solid btn-blk" style="margin-top:var(--sp-3)" data-on-click="SYLLABUS_MOCK.start()">' +
          '<i class="ph ph-play-circle"></i> Start today\u2019s paper</button>' +
      '</section>';
  }
};
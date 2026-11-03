// js/features/qna.js — "Questions & answers": one PDF per question, filed
// under the syllabus so students can find it by chapter, topic or a word
// from the question itself.
//
// There is no second storage: a question is a study_docs row with a
// "qna.<chapter>.<topic>" chapterId (js/core/qna.js explains the encoding).
// The list therefore comes from the same cached call the notes screen makes,
// and opening a question reuses STUDYDOCS.open, which already keeps opened
// PDFs on the device for offline reading.
//
// MUST load AFTER: core/study-docs.js (STUDYDOCS, formatBytes), core/qna.js
// (qnaDocs, qnaTree, qnaGroups), core/text.js (esc), core/dom.js ($), and
// js/data/subjective_chapters.js. PDFVIEW is used at call time only.

window.QNA = {
  STALE_MS: 10 * 60 * 1000,
  docs: [], loaded: false, loading: false,
  q: '', group: '',
  _expanded: new Set(),
  _at: 0,

  _store(){ return (typeof STUDYDOCS !== 'undefined') ? STUDYDOCS : null; },

  async load(force){
    const box = $('qna-body');
    if (!box) return;
    if (this.loading) return;

    const store = this._store();
    if (!store) {
      box.innerHTML = '<div class="card"><div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' +
        'The notes module did not load. Reload the page and try again.</span></div></div>';
      return;
    }

    const fresh = this.loaded && (Date.now() - this._at) < this.STALE_MS;
    if (fresh && !force) { this.render(); return; }

    this.loading = true;
    if (!this.loaded) {
      box.innerHTML = '<div class="card"><div class="skel w80"></div><div class="skel w60"></div><div class="skel w100"></div></div>';
      this._skeletonChips();
    }
    try {
      await store.ensureLoaded();
      this.docs = store.docs || [];
      this.loaded = true; this._at = Date.now();
    } catch (e) {
      /* ensureLoaded already falls back to the saved list; reaching here
         means there is nothing at all to show. */
      box.innerHTML = '<div class="card"><div class="banner banner-warning"><i class="ph ph-wifi-slash"></i><span>' +
        esc(e && e.message ? e.message : 'Could not load the questions.') +
        ' <button class="btn btn-sm btn-quiet" data-on-click="QNA.load(true)">Try again</button></span></div></div>';
      this.loading = false;
      return;
    }
    this.loading = false;
    this.render();
  },

  _skeletonChips(){
    const chips = $('qna-chips');
    if (chips) chips.innerHTML = '';
  },

  setQuery(v){
    this.q = String(v || '');
    clearTimeout(this._qt);
    this._qt = setTimeout(() => this.render(), 120);
  },

  setGroup(g){
    this.group = g || '';
    this.render();
  },

  clearFilters(){
    this.q = ''; this.group = '';
    const inp = $('qna-q'); if (inp) inp.value = '';
    this.render();
  },

  toggleChapter(id){
    id = String(id || '');
    if (!id) return;
    if (this._expanded.has(id)) this._expanded.delete(id); else this._expanded.add(id);
    this.render();
  },

  _open(){ return !!this.q || !!this.group; },

  render(){
    const box = $('qna-body');
    if (!box) return;
    const chips = $('qna-chips');
    const entries = qnaDocs(this.docs);

    if (chips) {
      const groups = qnaGroups(this.docs);
      chips.innerHTML = groups.length < 2 ? '' :
        '<button type="button" class="sd-chip' + (this.group === '' ? ' on' : '') + '" data-on-click="QNA.setGroup(\'\')">All<small>' + entries.length + '</small></button>' +
        groups.map(g => '<button type="button" class="sd-chip' + (this.group === g.group ? ' on' : '') + '" data-on-click="QNA.setGroup(\'' + esc(g.group) + '\')">' +
          'Group ' + esc(g.group) + '<small>' + g.count + '</small></button>').join('');
    }

    if (!entries.length) {
      box.innerHTML = '<div class="card"><div class="empty">' +
        '<div class="empty-i"><i class="ph ph-text-columns"></i></div>' +
        '<p>No question PDFs yet</p>' +
        '<p>Your teacher can split a question paper into one PDF per question, each with its worked solution. ' +
        'Until then, whole-chapter model answers are under <b>Model answers &amp; notes</b>.</p>' +
        '<div class="a"><button class="btn btn-solid" data-on-click="UI.go(\'studydocs\')"><i class="ph ph-file-pdf"></i> Open notes &amp; model answers</button></div>' +
        '</div></div>';
      return;
    }

    const tree = qnaTree(this.docs, { q: this.q, group: this.group });
    if (!tree.length) {
      box.innerHTML = '<div class="card"><div class="empty">' +
        '<div class="empty-i"><i class="ph ph-magnifying-glass"></i></div>' +
        '<p>Nothing matches' + (this.q ? ' “' + esc(this.q) + '”' : '') + '</p>' +
        '<p>Try a word from the question, or pick another group.</p>' +
        '<div class="a"><button class="btn btn-solid" data-on-click="QNA.clearFilters()">Show everything</button></div>' +
        '</div></div>';
      return;
    }

    const total = tree.reduce((n, c) => n + c.count, 0);
    const head = '<p class="t-foot qna-count">' + total + ' question' + (total === 1 ? '' : 's') +
      ' across ' + tree.length + ' chapter' + (tree.length === 1 ? '' : 's') +
      (this.q ? ' matching “' + esc(this.q) + '”' : '') + '</p>';

    const html = tree.map(ch => {
      const open = this._open() || this._expanded.has(ch.chapterId);
      const topics = ch.topics.map(t => {
        return '<div class="qna-topic"><span class="qna-topic-h">' + esc(t.name) +
          '<small>' + t.items.length + '</small></span>' +
          t.items.map(e => this._row(e)).join('') + '</div>';
      }).join('');

      return '<div class="subj-group qna-group' + (open ? ' open' : '') + '">' +
        '<div class="subj-group-hd" data-on-click="QNA.toggleChapter(\'' + escAttrJs(ch.chapterId) + '\')">' +
          '<div><div>' + (ch.icon ? esc(ch.icon) + ' ' : '') + esc(ch.name) +
            (ch.group ? ' <span style="color:var(--t3);font-weight:400">· Group ' + esc(ch.group) + '</span>' : '') + '</div>' +
            '<div class="meta">' + ch.count + ' question' + (ch.count === 1 ? '' : 's') + ' · ' +
            ch.topics.length + ' topic' + (ch.topics.length === 1 ? '' : 's') + '</div></div>' +
          '<i class="ph ph-caret-right chev"></i>' +
        '</div>' +
        '<div class="subj-group-body">' + topics + '</div>' +
      '</div>';
    }).join('');

    box.innerHTML = head + '<div class="qna-tree">' + html + '</div>';
  },

  _row(e){
    const marks = e.marks ? '<span class="qm ' + (e.marks >= 10 ? 'm10' : 'm5') + '">' + e.marks + 'M</span>' : '';
    return '<div class="subj-q-row qna-row">' +
      '<span class="qn">' + e.index + '.</span>' +
      '<div class="qna-main">' +
        '<span class="qt">' + esc(e.title) + '</span>' +
        (e.note ? '<span class="qna-note">' + esc(e.note) + '</span>' : '') +
        '<button type="button" class="qna-open" data-on-click="QNA.open(\'' + escAttrJs(e.id) + '\')">' +
          '<i class="ph ph-file-pdf"></i> Question &amp; solution' +
        '</button>' +
      '</div>' + marks +
    '</div>';
  },

  open(id){
    const store = this._store();
    if (!store) { toast('The PDF reader is not available. Reload the page.'); return; }
    if (!store.docs || !store.docs.some(d => d && d.id === id)) {
      toast('That question PDF is no longer available.');
      return;
    }
    store.open(id);
  }
};

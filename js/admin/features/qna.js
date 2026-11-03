// js/admin/features/qna.js — "Questions & answers": split one question paper
// into one PDF per question, file each under the syllabus, and manage what
// students already have.
//
// The split happens in the browser with the vendored pdf-lib, then each slice
// is uploaded through the study-PDF endpoint the console already uses, so the
// deployed backend needs no new table, action or deploy:
//
//   pdf-lib  → copy the pages of one question into a new PDF
//   adminAddStudyDoc (pdfData) → validate + store it
//   chapterId 'qna.<chapter>.<topic>' → makes it a question (js/core/qna.js)
//
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, badge, fullTime,
// MODAL, CONFIRM, TOAST, BUSY), core/study-docs.js (formatBytes),
// core/qna.js (qnaSegments, qnaChapterId, qnaDescription, qnaDocs…),
// data/subjective_chapters.js, and js/admin/features/studydocs.js
// (STUDYDOCS.preview / del / setStatus are reused). PDFLib and pdfjsLib are
// vendored globals used at call time only.

const QNA_ADMIN = {
  list: [], loaded: false,
  MAX_SRC_BYTES: 40 * 1024 * 1024,

  /* canvas scratch for the splitter, cleared when the sheet closes */
  _src: null, _pdf: null, _pages: 0,
  _starts: new Set([1]),
  _thumbs: {}, _text: {}, _rows: [],
  _chapter: '', _topic: '',
  _thumbToken: 0,

  /* ── list ─────────────────────────────────────────────────────────── */
  async load(force){
    const box = $('qna-list');
    if (!box) return;
    if (this.loaded && !force) { this.render(); return; }
    box.innerHTML = '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>';
    try {
      const r = await ADMIN.post('adminListStudyDocs');
      if (!r.success) throw new Error(r.error || 'Could not load the question PDFs.');
      this.list = r.docs || [];
      this.loaded = true;
      this.render();
    } catch (e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-quiet btn-sm" data-on-click="QNA_ADMIN.load(true)">Try again</button></span></div>';
    }
  },

  _questions(){
    return (this.list || []).filter(d => isQnaDoc(d)).map(qnaEntry)
      .sort((a, b) => (a.chapterName.localeCompare(b.chapterName)) || (a.topicName.localeCompare(b.topicName)) || (a.order - b.order));
  },

  render(){
    const box = $('qna-list');
    if (!box) return;
    const list = this._questions();
    if (!list.length){
      box.innerHTML = '<div class="empty"><i class="ph ph-text-columns"></i>' +
        '<div class="t">No question PDFs yet</div>' +
        '<div class="d">Upload a question paper and split it — each question becomes its own PDF with its worked solution.</div>' +
        '<div class="a"><button class="btn btn-primary" data-perm="studydocs_manage" data-on-click="QNA_ADMIN.openSplit()">' +
        '<i class="ph ph-scissors"></i> Split a question paper</button></div></div>';
      ADMIN._applyPermissions();
      return;
    }
    const canManage = ADMIN.can('studydocs_manage');
    const byChapter = {};
    list.forEach(e => { (byChapter[e.chapterName] = byChapter[e.chapterName] || []).push(e); });

    box.innerHTML = Object.keys(byChapter).map(chapterName => {
      const items = byChapter[chapterName];
      return '<div class="qna-admin-group"><div class="qna-admin-h">' + esc(chapterName) +
        '<span>' + items.length + ' question' + (items.length === 1 ? '' : 's') + '</span></div>' +
        '<div class="rows">' + items.map(e => {
          const hidden = e.doc.status === 'hidden';
          const id = escAttrJs(e.id);
          return '<div class="row">' +
            '<div class="row-main"><div class="row-title">' + esc(e.title) + ' ' +
              (e.marks ? '<span class="badge badge-info flat">' + e.marks + 'M</span> ' : '') + badge(hidden ? 'archived' : 'live', hidden ? 'Hidden' : 'Live') + '</div>' +
              '<div class="row-sub">' + esc(e.topicName) + ' · ' + esc(formatBytes(e.sizeBytes)) +
              (e.note ? '<br>' + esc(e.note) : '') + '</div></div>' +
            '<div class="row-actions">' +
              '<button class="icon-btn sm" aria-label="Open ' + esc(e.title) + '" title="Open" data-on-click="QNA_ADMIN.open(\'' + id + '\',\'' + escAttrJs(e.title) + '\')"><i class="ph ph-eye"></i></button>' +
              (canManage ? '<button class="icon-btn sm" aria-label="Edit ' + esc(e.title) + '" title="Edit" data-on-click="QNA_ADMIN.openEdit(\'' + id + '\')"><i class="ph ph-pencil-simple"></i></button>' +
                '<button class="icon-btn sm" aria-label="' + (hidden ? 'Show to students' : 'Hide from students') + '" title="' + (hidden ? 'Show to students' : 'Hide from students') + '" data-on-click="QNA_ADMIN.setStatus(\'' + id + '\',\'' + (hidden ? 'published' : 'hidden') + '\')"><i class="ph ph-' + (hidden ? 'eye-slash' : 'eye-closed') + '"></i></button>' +
                '<button class="icon-btn sm danger" aria-label="Delete ' + esc(e.title) + '" title="Delete" data-on-click="QNA_ADMIN.del(\'' + id + '\',\'' + escAttrJs(e.title) + '\')"><i class="ph ph-trash"></i></button>' : '') +
            '</div></div>';
        }).join('') + '</div></div>';
    }).join('');
  },

  /* ── one existing question ────────────────────────────────────────── */
  open(id, title){
    if (typeof STUDYDOCS === 'undefined' || !STUDYDOCS.preview) return TOAST.show('The PDF reader is not available.', 'error');
    STUDYDOCS.preview(id, title);
  },

  _fields(e){
    const chapters = window.SUBJECTIVE_CHAPTERS || [];
    const chapter = e ? e.chapterId : this._chapter;
    const topics = (chapters.find(c => c.id === chapter) || {}).topics || [];
    return '<div class="field"><label for="qna-e-title">Question</label>' +
        '<textarea class="input" id="qna-e-title" rows="2" maxlength="120" placeholder="Define bearing capacity and state the Terzaghi equation.">' + esc(e ? e.title : '') + '</textarea></div>' +
      '<div class="field"><label for="qna-e-chapter">Chapter</label><select class="select" id="qna-e-chapter" data-on-change="QNA_ADMIN._repaintTopics(\'qna-e-chapter\',\'qna-e-topic\')">' +
        '<option value="">Choose a chapter</option>' +
        chapters.map(c => '<option value="' + esc(c.id) + '"' + (chapter === c.id ? ' selected' : '') + '>' + esc(c.name) + ' · Group ' + esc(c.group || '') + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label for="qna-e-topic">Topic <span class="dim">(how students find it in the syllabus)</span></label><select class="select" id="qna-e-topic">' +
        this._topicOptions(topics, e ? e.topic : '') + '</select></div>' +
      '<div class="fld-row">' +
        '<div class="sf" style="margin-bottom:0"><label for="qna-e-marks">Marks</label><select class="select" id="qna-e-marks">' +
          [0, 5, 10, 15, 20].map(m => '<option value="' + m + '"' + ((e ? e.marks : 0) === m ? ' selected' : '') + '>' + (m ? m + ' marks' : 'No marks') + '</option>').join('') +
        '</select></div>' +
        '<div class="sf" style="margin-bottom:0"><label for="qna-e-status">Visibility</label><select class="select" id="qna-e-status">' +
          '<option value="published"' + (!e || e.doc.status !== 'hidden' ? ' selected' : '') + '>Visible</option>' +
          '<option value="hidden"' + (e && e.doc.status === 'hidden' ? ' selected' : '') + '>Hidden</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="field"><label for="qna-e-note">Answer note <span class="dim">(optional — the idea, the misconception, the trap)</span></label>' +
        '<input class="input" type="text" id="qna-e-note" maxlength="380" value="' + esc(e ? e.note : '') + '"></div>';
  },

  _topicOptions(topics, selected){
    const slug = selected || '';
    return '<option value="">Whole chapter</option>' + (topics || []).map(t => {
      const s = qnaSlug(t);
      return '<option value="' + esc(s) + '"' + (s === slug ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  },

  _repaintTopics(chapterId, topicId){
    const ch = (window.SUBJECTIVE_CHAPTERS || []).find(c => c.id === ($(chapterId) || {}).value);
    const sel = $(topicId);
    if (sel) sel.innerHTML = this._topicOptions((ch && ch.topics) || [], '');
  },

  openEdit(id){
    const e = this._questions().find(x => x.id === id);
    if (!e) return TOAST.show('That question is no longer in the list — reload.', 'warning');
    MODAL.sheet('Edit question',
      this._fields(e) +
      '<div class="t-foot mt2">The PDF itself cannot be replaced here. Delete this question and split the paper again if the pages are wrong.</div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
      '<button class="btn btn-primary" style="flex:2" id="qna-e-save" data-on-click="QNA_ADMIN.saveEdit(\'' + escAttrJs(id) + '\')">Save</button></div>');
  },

  async saveEdit(id){
    const title = qnaTitle(($('qna-e-title') || {}).value || '');
    const chapter = ($('qna-e-chapter') || {}).value || '';
    const topic = ($('qna-e-topic') || {}).value || '';
    if (!title) return TOAST.show('Write the question first.', 'warning');
    if (!chapter) return TOAST.show('Choose the chapter this question belongs to.', 'warning');
    const btn = $('qna-e-save'); if (btn) btn.disabled = true;
    try {
      const r = await ADMIN.post('adminUpdateStudyDoc', {
        id,
        title,
        category: 'model-answer',
        chapterId: qnaChapterId(chapter, topic),
        description: qnaDescription(($('qna-e-marks') || {}).value, ($('qna-e-note') || {}).value),
        status: ($('qna-e-status') || {}).value || 'published'
      });
      if (!r.success) throw new Error(r.error || 'Could not save.');
      MODAL.close('sheet');
      TOAST.show('Saved', 'success');
      this.load(true);
    } catch (e){
      if (btn) btn.disabled = false;
      TOAST.show(e.message, 'error');
    }
  },

  async setStatus(id, status){
    const e = this._questions().find(x => x.id === id);
    if (!e) return;
    try {
      const r = await ADMIN.post('adminUpdateStudyDoc', {
        id, title: e.title, category: 'model-answer', chapterId: e.doc.chapterId,
        description: e.doc.description, sortOrder: e.order, status
      });
      if (!r.success) throw new Error(r.error || 'Could not update.');
      TOAST.show(status === 'hidden' ? 'Hidden from students' : 'Visible to students', 'success');
      this.load(true);
    } catch (err){ TOAST.show(err.message, 'error'); }
  },

  async del(id, title){
    const ok = await CONFIRM.ask({
      title: 'Delete this question?',
      body: '<b>' + esc(title) + '</b> disappears from the syllabus for every student. The PDF is removed with it. This cannot be undone.',
      confirmText: 'Delete', tone: 'danger'
    });
    if (!ok) return;
    try {
      const r = await ADMIN.post('adminDeleteStudyDoc', { id });
      if (!r.success) throw new Error(r.error || 'Could not delete.');
      TOAST.show('Deleted', 'success');
      this.load(true);
    } catch (e){ TOAST.show(e.message, 'error'); }
  },

  /* ══ the splitter ══════════════════════════════════════════════════ */
  openSplit(){
    this._src = null; this._pdf = null; this._pages = 0;
    this._starts = new Set([1]); this._thumbs = {}; this._text = {}; this._rows = [];
    this._thumbToken++;
    const chapters = window.SUBJECTIVE_CHAPTERS || [];
    this._chapter = ''; this._topic = '';

    MODAL.sheet('Split a question paper',
      '<p class="t-callout">Upload the paper once. Mark the page where each question starts, name the questions, ' +
        'and the console cuts one PDF per question — question pages plus its solution — and files each under the syllabus.</p>' +
      '<div class="field mt3"><span class="field-label">Step 1 — the paper</span>' +
        '<label class="file-drop" for="qna-src">' +
          '<input type="file" id="qna-src" accept="application/pdf,.pdf" data-on-change="QNA_ADMIN.onFile(this)">' +
          '<i class="ph ph-file-pdf fd-icon"></i>' +
          '<span class="fd-main" id="qna-src-name">Choose the question paper (PDF)</span>' +
          '<span class="fd-sub">A 30-page scan is fine. Under 40 MB.</span>' +
        '</label><div class="t-foot mt2" id="qna-src-status" aria-live="polite"></div></div>' +
      '<div id="qna-split-work" hidden>' +
        '<div class="field mt4"><span class="field-label">Step 2 — where does each question start?</span>' +
          '<div class="t-foot">Tap a page to mark it. A question runs from its page up to the page before the next mark.</div>' +
          '<div class="flex g2 wrap mt2">' +
            '<button class="btn btn-sm btn-quiet" data-on-click="QNA_ADMIN.preset(\'each\')">One question per page</button>' +
            '<button class="btn btn-sm btn-quiet" data-on-click="QNA_ADMIN.preset(\'pairs\')">Every two pages</button>' +
            '<button class="btn btn-sm btn-quiet" data-on-click="QNA_ADMIN.preset(\'reset\')">Start over</button>' +
            '<span class="t-foot" id="qna-split-count"></span>' +
          '</div>' +
          '<div class="qna-pages" id="qna-pages"></div>' +
        '</div>' +
        '<div class="field mt4"><span class="field-label">Step 3 — name each question</span>' +
          '<div class="t-foot">Students search these words, so write the question as it appears on the paper.</div>' +
          '<div id="qna-rows" class="qna-rows"></div>' +
          /* A scan has no text layer, so every box would have to be typed.
             A typed paper (or the question list read off the scan) can be
             pasted once and laid over the rows in page order. */
          '<label for="qna-bulk" class="mt3" style="display:block">Paste the questions instead</label>' +
          '<div class="t-foot">One per line, in page order. Each line fills the next question above.</div>' +
          '<textarea class="input mt2" id="qna-bulk" rows="3" placeholder="Define bearing capacity of soil.&#10;Compute the transmissivity of an 8 m confined aquifer.&#10;Design a singly reinforced beam for Mu = 120 kNm."></textarea>' +
          '<div class="flex g2" style="align-items:center">' +
            '<button class="btn btn-sm btn-quiet" data-on-click="QNA_ADMIN.applyBulk()">Fill the questions</button>' +
            '<span class="t-foot" id="qna-bulk-msg" aria-live="polite"></span>' +
          '</div>' +
        '</div>' +
        '<label class="flex g2 mt3" style="align-items:center;cursor:pointer"><input type="checkbox" id="qna-publish" checked> ' +
          '<span class="t-callout">Visible to students as soon as it is created</span></label>' +
        '<div class="flex g2 mt3"><button class="btn btn-quiet" style="flex:1" data-on-click="QNA_ADMIN.closeSplit()">Cancel</button>' +
          '<button class="btn btn-primary" style="flex:2" id="qna-split-go" data-on-click="QNA_ADMIN.commit()"><i class="ph ph-scissors"></i> Create the question PDFs</button></div>' +
        '<div class="t-foot mt2" id="qna-split-log" aria-live="polite"></div>' +
      '</div>');
  },

  closeSplit(){
    this._thumbToken++;
    try { if (this._pdf) this._pdf.destroy(); } catch (e){}
    this._pdf = null; this._src = null; this._thumbs = {};
    MODAL.close('sheet');
  },

  onFile(input){
    const f = input && input.files && input.files[0];
    const status = $('qna-src-status'), nameEl = $('qna-src-name');
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      if (status) status.innerHTML = '<span style="color:var(--danger)">That is not a PDF.</span>';
      input.value = ''; return;
    }
    if (f.size > this.MAX_SRC_BYTES) {
      if (status) status.innerHTML = '<span style="color:var(--danger)">That file is ' + formatBytes(f.size) + '. Keep it under 40 MB.</span>';
      input.value = ''; return;
    }
    if (nameEl) nameEl.textContent = f.name + ' · ' + formatBytes(f.size);
    if (status) status.innerHTML = '<span class="inline-loader">Opening the paper</span>';
    const rd = new FileReader();
    rd.onerror = () => { if (status) status.innerHTML = '<span style="color:var(--danger)">Could not read that file.</span>'; };
    rd.onload = () => this._openBytes(new Uint8Array(rd.result));
    rd.readAsArrayBuffer(f);
  },

  async _openBytes(bytes){
    const status = $('qna-src-status');
    if (typeof pdfjsLib === 'undefined' || typeof PDFLib === 'undefined') {
      if (status) status.innerHTML = '<span style="color:var(--danger)">The PDF tools did not load. Reload the page and try again.</span>';
      return;
    }
    try {
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = './tools/vendor/pdfjs/pdf.worker.min.js'; } catch (e){}
      this._src = { bytes };
      this._pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      this._pages = this._pdf.numPages;
      this._starts = new Set([1]);
      this._thumbs = {}; this._text = {};
      if (status) status.textContent = this._pages + ' page' + (this._pages === 1 ? '' : 's') + ' loaded.';
      const work = $('qna-split-work'); if (work) work.hidden = false;
      await this._extractText();
      this._rebuild();
      this._paintPages();
      this._renderThumbs();
    } catch (e){
      if (status) status.innerHTML = '<span style="color:var(--danger)">' + esc(e && e.message ? e.message : 'Could not open that PDF.') + '</span>';
    }
  },

  /* A digital paper carries its text layer; a scan does not. When it is
     there, the question is already written for the teacher. */
  async _extractText(){
    for (let n = 1; n <= this._pages; n++) {
      try {
        const page = await this._pdf.getPage(n);
        const tc = await page.getTextContent();
        this._text[n] = tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch (e){ this._text[n] = ''; }
    }
  },

  _segments(){ return qnaSegments(this._starts, this._pages); },

  preset(kind){
    if (kind === 'each') {
      this._starts = new Set(); for (let n = 1; n <= this._pages; n++) this._starts.add(n);
    } else if (kind === 'pairs') {
      this._starts = new Set(); for (let n = 1; n <= this._pages; n += 2) this._starts.add(n);
    } else {
      this._starts = new Set([1]);
    }
    this._rebuild(); this._paintPages();
  },

  toggleStart(n){
    n = Number(n) || 0;
    if (n <= 1 || n > this._pages) return;
    if (this._starts.has(n)) this._starts.delete(n); else this._starts.add(n);
    this._rebuild(); this._paintPages();
  },

  _paintPages(){
    const box = $('qna-pages');
    if (!box) return;
    let html = '';
    for (let n = 1; n <= this._pages; n++) {
      const on = this._starts.has(n);
      html += '<button type="button" class="qna-page' + (on ? ' on' : '') + '" data-on-click="QNA_ADMIN.toggleStart(' + n + ')" aria-pressed="' + on + '" title="Page ' + n + (on ? ' — starts a question' : '') + '">' +
        '<img data-page-img="' + n + '" alt=""' + (this._thumbs[n] ? ' src="' + this._thumbs[n] + '"' : '') + '>' +
        '<span class="qna-page-n">' + n + '</span>' +
        (on ? '<span class="qna-page-flag">Q</span>' : '') +
      '</button>';
    }
    box.innerHTML = html;
    const count = $('qna-split-count');
    if (count) count.textContent = this._segments().length + ' question' + (this._segments().length === 1 ? '' : 's');
  },

  async _renderThumbs(){
    const box = $('qna-pages');
    if (!box || !this._pdf) return;
    const token = ++this._thumbToken;
    for (let n = 1; n <= this._pages; n++) {
      if (token !== this._thumbToken) return;
      if (this._thumbs[n]) continue;
      try {
        const page = await this._pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 132 / base.width });
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(vp.width));
        c.height = Math.max(1, Math.round(vp.height));
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        this._thumbs[n] = c.toDataURL('image/jpeg', 0.7);
        const img = box.querySelector('[data-page-img="' + n + '"]');
        if (img) img.src = this._thumbs[n];
      } catch (e){ /* a page that will not render still keeps its number */ }
      if (n % 2 === 0) await new Promise(r => setTimeout(r, 0));
    }
  },

  /* Segments → editable rows. Text already typed for a page range survives
     adding or removing a later mark. */
  _rebuild(){
    const segs = this._segments();
    const prev = {};
    (this._rows || []).forEach(r => { prev[r.start] = r; });
    const chapters = window.SUBJECTIVE_CHAPTERS || [];

    this._rows = segs.map((s, i) => {
      const old = prev[s.start];
      if (old) {
        old.end = s.end; old.pages = s.pages; old.number = i + 1;
        /* A placeholder follows the question's new position; text the teacher
           typed (or that came from the paper) never changes. */
        if (old.auto) old.title = 'Question ' + (i + 1);
        return old;
      }
      const sample = String(this._text[s.start] || '').trim().slice(0, 118);
      return {
        number: i + 1, start: s.start, end: s.end, pages: s.pages,
        title: sample || ('Question ' + (i + 1)),
        auto: !sample,
        note: '', marks: 0,
        chapter: this._chapter || (chapters[0] || {}).id || '',
        topic: ''
      };
    });
    this._paintRows();
  },

  _paintRows(){
    const box = $('qna-rows');
    if (!box) return;
    const chapters = window.SUBJECTIVE_CHAPTERS || [];
    box.innerHTML = this._rows.map((r, i) => {
      const meta = chapters.find(c => c.id === r.chapter) || null;
      return '<div class="qna-row-edit">' +
        '<div class="qna-row-h"><b>Question ' + r.number + '</b>' +
          '<span>page' + (r.pages === 1 ? ' ' : 's ') + r.start + (r.pages > 1 ? '–' + r.end : '') + '</span>' +
          '<button type="button" class="icon-btn sm" title="Open these pages" aria-label="Preview pages ' + r.start + '–' + r.end + '" data-on-click="QNA_ADMIN.previewRow(' + i + ')"><i class="ph ph-eye"></i></button>' +
        '</div>' +
        '<textarea class="input" rows="2" maxlength="120" placeholder="The question, as written on the paper" data-on-input="QNA_ADMIN.setRow(' + i + ',\'title\',this.value)">' + esc(r.title) + '</textarea>' +
        '<div class="fld-row mt2">' +
          '<div class="sf" style="margin-bottom:0"><label>Chapter</label><select class="select" data-on-change="QNA_ADMIN.setRow(' + i + ',\'chapter\',this.value)">' +
            '<option value="">Choose</option>' +
            chapters.map(c => '<option value="' + esc(c.id) + '"' + (r.chapter === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
          '</select></div>' +
          '<div class="sf" style="margin-bottom:0"><label>Topic</label><select class="select" data-on-change="QNA_ADMIN.setRow(' + i + ',\'topic\',this.value)">' +
            this._topicOptions((meta && meta.topics) || [], r.topic) + '</select></div>' +
          '<div class="sf" style="margin-bottom:0"><label>Marks</label><select class="select" data-on-change="QNA_ADMIN.setRow(' + i + ',\'marks\',this.value)">' +
            [0, 5, 10, 15, 20].map(m => '<option value="' + m + '"' + (Number(r.marks) === m ? ' selected' : '') + '>' + (m ? m + 'M' : '—') + '</option>').join('') +
          '</select></div>' +
        '</div>' +
        '<input class="input mt2" type="text" maxlength="380" placeholder="Answer note: the idea, the common misconception, what earns the marks" value="' + esc(r.note) + '" data-on-input="QNA_ADMIN.setRow(' + i + ',\'note\',this.value)">' +
      '</div>';
    }).join('') || '<div class="t-foot">Mark at least one page above.</div>';

    /* Remember the defaults the teacher picked so the next split starts from
       the same chapter. */
    const first = this._rows[0];
    if (first) { this._chapter = first.chapter; }
  },

  setRow(i, field, value){
    const row = this._rows[i];
    if (!row) return;
    row[field] = value;
    if (field === 'title') row.auto = false;
    if (field === 'chapter') { row.topic = ''; this._chapter = value; this._paintRows(); }
  },

  /* One question per line, laid over the marked page ranges in order. Extra
     lines are reported rather than silently dropped, because a mismatch
     means the page marks and the list disagree and the cut would file the
     wrong question under a page range. */
  applyBulk(){
    const box = $('qna-bulk'), msg = $('qna-bulk-msg');
    if (!box || !this._rows.length) {
      if (msg) msg.textContent = 'Mark the question pages first.';
      return;
    }
    const lines = String(box.value || '')
      .split(/\r?\n/)
      .map(s => s.replace(/^\s*(?:Q(?:uestion)?\s*)?\d{1,2}\s*[.):-]\s*/i, '').trim())
      .filter(Boolean);

    if (!lines.length) {
      if (msg) msg.textContent = 'Paste at least one question.';
      return;
    }

    const n = Math.min(lines.length, this._rows.length);
    for (let i = 0; i < n; i++) {
      this._rows[i].title = qnaTitle(lines[i]);
      this._rows[i].auto = false;
    }
    this._paintRows();

    if (msg) {
      msg.textContent = lines.length === this._rows.length
        ? n + ' question' + (n === 1 ? '' : 's') + ' filled.'
        : n + ' of ' + lines.length + ' lines used — ' + this._rows.length + ' page range' + (this._rows.length === 1 ? '' : 's') + ' marked.' +
          (lines.length > this._rows.length ? ' Mark another page for each extra question.' : ' Add a line for each remaining range.');
    }
  },

  async previewRow(i){
    const row = this._rows[i];
    if (!row || !this._src) return;
    if (typeof PDFVIEW === 'undefined') return TOAST.show('The PDF reader is not available.', 'error');
    const bytes = this._src.bytes;
    const start = row.start, end = row.end;
    PDFVIEW.open({
      title: 'Question ' + row.number + ' · pages ' + start + (end > start ? '–' + end : ''),
      filename: 'question-' + row.number + '.pdf',
      load: async () => ({ bytes: await this._slice(bytes, start, end), filename: 'question-' + row.number + '.pdf' })
    });
  },

  async _slice(bytes, start, end){
    const src = await PDFLib.PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
    const out = await PDFLib.PDFDocument.create();
    const idx = [];
    for (let p = start; p <= end; p++) idx.push(p - 1);
    const copied = await out.copyPages(src, idx);
    copied.forEach(p => out.addPage(p));
    return await out.save();
  },

  _base64(bytes){
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  },

  async commit(){
    if (!this._src || !this._rows.length) return TOAST.show('Open a PDF and mark the question pages first.', 'warning');
    const rows = this._rows;
    const missing = rows.filter(r => !String(r.title || '').trim());
    if (missing.length) return TOAST.show('Question ' + missing[0].number + ' has no text yet.', 'warning');
    const noChapter = rows.filter(r => !r.chapter);
    if (noChapter.length) return TOAST.show('Choose a chapter for question ' + noChapter[0].number + '.', 'warning');

    const ok = await CONFIRM.ask({
      title: 'Create ' + rows.length + ' question PDF' + (rows.length === 1 ? '' : 's') + '?',
      body: 'The paper is cut into ' + rows.length + ' PDF' + (rows.length === 1 ? '' : 's') +
        ', one for each marked range, and each one is filed under the chapter and topic you chose. ' +
        'Students see them in <b>Questions &amp; answers</b>.',
      confirmText: 'Create them'
    });
    if (!ok) return;

    const btn = $('qna-split-go'), log = $('qna-split-log');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    BUSY.start();
    const publish = !!($('qna-publish') && $('qna-publish').checked);
    let done = 0, failed = 0;
    const say = (html) => { if (log) log.innerHTML = html; };

    try {
      for (const row of rows) {
        say('<span class="inline-loader">Question ' + row.number + ' of ' + rows.length + '</span>');
        try {
          const pdf = await this._slice(this._src.bytes, row.start, row.end);
          const res = await ADMIN.post('adminAddStudyDoc', {
            title: qnaTitle(row.title),
            category: 'model-answer',
            chapterId: qnaChapterId(row.chapter, row.topic),
            description: qnaDescription(row.marks, row.note),
            sortOrder: row.number,
            publish,
            pdfData: 'data:application/pdf;base64,' + this._base64(pdf)
          }, { fallback: false });
          if (!res || !res.success) throw new Error((res && res.error) || 'The server refused it.');
          done++;
        } catch (e){
          failed++;
          console.warn('[qna] question', row.number, 'failed:', e && e.message);
        }
      }

      say('Created ' + done + ' of ' + rows.length + (failed ? ' · ' + failed + ' failed — the rest are saved, re-run only the missing ones' : ''));
      if (done) {
        TOAST.show(done + ' question PDF' + (done === 1 ? '' : 's') + ' created', 'success', 5000);
        this.loaded = false;
        await this.load(true);
        if (!failed) this.closeSplit();
      }
      if (failed) TOAST.show(failed + ' could not be uploaded. See the log.', 'error', 7000);
    } finally {
      BUSY.stop();
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }
};

window.QNA_ADMIN = QNA_ADMIN;

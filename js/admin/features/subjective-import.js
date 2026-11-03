// js/admin/features/subjective-import.js — Smart Paste import + bulk JSON
// upload.
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, copyText, plural,
// BUSY, TOAST). Uses SUBJ_SMART (from js/admin/subj-smart.js) and
// SUBJECTIVE_FILE_REFS at call time only.

const SUBJADMIN = {
  _preview: [],
  parse(){
    const raw = ($('sp-raw') || {}).value ? $('sp-raw').value.trim() : '';
    if (!raw) return TOAST.show('Paste some question text first', 'warning');
    if (typeof SUBJ_SMART === 'undefined') return TOAST.show('subj-smart.js has not loaded', 'error');
    const items = SUBJ_SMART.preview(raw);
    if (!items.length) return TOAST.show('Nothing recognised — each question needs to start with a number, Qn. or a bullet', 'warning', 6000);
    this._preview = items.map(it => ({ ...it, keep:true, chapterId: it.suggestedChapter || 'structure', groupKey: it.suggestedGroup || 'A' }));
    this._render();
    const commitBtn = $('sp-commit'); if (commitBtn) commitBtn.disabled = false;
    const status = $('sp-status'); if (status) status.textContent = 'Found ' + plural(items.length, 'question') + ' — check them, then add';
  },
  _render(){
    const wrap = $('sp-preview');
    if (!wrap) return;
    const CH = (typeof SUBJECTIVE_CHAPTERS !== 'undefined') ? SUBJECTIVE_CHAPTERS : [];
    const kept = this._preview.filter(x => x.keep).length;
    const skipped = this._preview.length - kept;
    wrap.innerHTML = '<div class="t-cap mb2">' + kept + ' of ' + this._preview.length + ' will be added. Low-confidence guesses have a red edge — check the chapter before adding.</div>' +
      (skipped ? '<div class="mb2"><button class="btn btn-quiet btn-sm" data-on-click="SUBJADMIN._restoreAll()"><i class="ph ph-arrow-counter-clockwise"></i> Restore ' + skipped + ' skipped</button></div>' : '') +
      this._preview.map((it, i) => {
        const conf = it.confidence >= 3 ? 'high' : it.confidence >= 1 ? 'mid' : 'low';
        const opts = CH.map(c => '<option value="' + escAttrJs(c.id) + '"' + (c.id === it.chapterId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
        return '<div class="sp-row ' + conf + (it.keep ? '' : ' dropped') + '">' +
          '<div class="n">' + (i + 1) + '</div>' +
          '<div class="q">' + esc(it.question) + '</div>' +
          '<select class="select" aria-label="Chapter for question ' + (i + 1) + '" data-on-change="SUBJADMIN._setChapter(' + i + ', this.value)">' + opts + '</select>' +
          '<input class="input" type="number" min="1" max="40" value="' + it.marks + '" aria-label="Marks for question ' + (i + 1) + '" data-on-change="SUBJADMIN._setMarks(' + i + ', this.value)">' +
          '<button class="icon-btn sm ' + (it.keep ? 'danger' : '') + '" data-on-click="SUBJADMIN._drop(' + i + ')" aria-label="' + (it.keep ? 'Skip' : 'Include') + ' question ' + (i + 1) + '"><i class="ph ' + (it.keep ? 'ph-x' : 'ph-arrow-counter-clockwise') + '"></i></button>' +
        '</div>';
      }).join('');
  },
  _setChapter(i, v){
    this._preview[i].chapterId = v;
    const g = { structure:'A', geotech:'A', irrigationAndCo:'B', transportAndCo:'C', publicHealth:'D', miscellaneous:'D' };
    this._preview[i].groupKey = g[v] || 'A';
  },
  _setMarks(i, v){ this._preview[i].marks = Math.max(1, Math.min(40, parseInt(v, 10) || 10)); },
  _drop(i){ this._preview[i].keep = !this._preview[i].keep; this._render(); },
  _restoreAll(){ this._preview.forEach(p => { p.keep = true; }); this._render(); },

  /* getFile normalization — ADMIN.post already unwraps Supabase's
     { success:true, content:"<json>" } into res.result. Read whichever
     shape actually came back. */
  _unwrap(res) {
    if (!res || !res.success) return null;
    if (res.result !== undefined && res.result !== null) return res.result;
    if (typeof res.content === 'string') {
      try { return JSON.parse(res.content); } catch (e) { return null; }
    }
    return null;
  },

  async _onChapterChange(fileId){
    const sel = $('sp-section'), newInput = $('sp-section-new');
    const base = '<option value="">Default bucket</option><option value="__NEW__">Create a new section</option>';
    if (newInput) newInput.classList.add('hidden');
    if (!fileId) { if (sel) sel.innerHTML = base; return; }
    if (sel) sel.innerHTML = '<option value="">Loading sections…</option>';
    try {
      const r = await ADMIN.post('getFile', { fileId });
      if (!r.success) throw new Error(r.error || 'Could not open that file.');
      const payload = this._unwrap(r);
      const sections = (payload && Array.isArray(payload.sections))
        ? payload.sections.map(s => String(s.section || '')).filter(Boolean) : [];
      if (sel) sel.innerHTML = '<option value="">Default bucket</option>' +
        sections.map(n => '<option value="' + escAttrJs(n) + '">' + esc(n) + '</option>').join('') +
        '<option value="__NEW__">Create a new section</option>';
    } catch(e){
      if (sel) sel.innerHTML = base;
      TOAST.show('Could not read the sections in that file: ' + e.message, 'warning', 5000);
    }
  },
  _onSectionChange(v){
    const el = $('sp-section-new');
    if (!el) return;
    el.classList.toggle('hidden', v !== '__NEW__');
    if (v === '__NEW__') el.focus();
  },

  async commit(){
    const fileId = ($('sp-target') || {}).value || '';
    if (!fileId) return TOAST.show('Choose a chapter file first', 'error');
    let section = ($('sp-section') || {}).value || '';
    if (section === '__NEW__') {
      section = (($('sp-section-new') || {}).value || '').trim();
      if (!section) return TOAST.show('Name the new section', 'error');
    }
    const items = this._preview.filter(x => x.keep).map(x => ({ chapterId:x.chapterId, groupKey:x.groupKey, question:x.question, marks:x.marks }));
    if (!items.length) return TOAST.show('Every question is skipped — include at least one', 'warning');
    BUSY.start();
    try {
      const r = await ADMIN.post('adminCommitSubjectiveImport', { fileId, section, items: JSON.stringify(items) });
      if (!r.success) throw new Error(r.error || 'Could not add those questions.');
      TOAST.show(r.inserted + ' added' + (r.skipped ? ', ' + r.skipped + ' skipped as duplicates' : ''), 'success', 5000);
      const commitBtn = $('sp-commit'); if (commitBtn) commitBtn.disabled = true;
      const status = $('sp-status'); if (status) status.textContent = 'Added ' + r.inserted + ' to "' + (r.section || 'the default bucket') + '"';
      /* Refresh the section dropdown so the newly created section is
         immediately available for the next batch. */
      try { await this._onChapterChange(fileId); } catch (e) {}
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  },
  clear(){
    const raw = $('sp-raw'); if (raw) raw.value = '';
    const prev = $('sp-preview'); if (prev) prev.innerHTML = '';
    const status = $('sp-status'); if (status) status.textContent = '';
    const commitBtn = $('sp-commit'); if (commitBtn) commitBtn.disabled = true;
    this._preview = [];
  },
  _populateFilters(){
    const target = $('sp-target');
    if (!target || target.dataset.populated) return;
    const refs = (window.SUBJECTIVE_FILE_REFS || []).filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));
    target.innerHTML = refs.length
      ? '<option value="">Choose a chapter</option>' + refs.map(r => '<option value="' + escAttrJs(r.fileId) + '">' + esc(r.name) + ' — group ' + esc(r.group) + '</option>').join('')
      : '<option value="">No chapters configured — edit subjective-data.js</option>';
    target.dataset.populated = '1';
  }
};

const SUBJ_UPLOAD = {
  _pending: null,
  onFile(input){
    const f = input && input.files && input.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { TOAST.show('That file is over 5 MB', 'error'); input.value = ''; return; }
    const nameEl = $('subj-upload-name'); if (nameEl) nameEl.textContent = f.name;
    const r = new FileReader();
    r.onload = e => { this._pending = { dataUrl: e.target.result, filename: f.name }; };
    r.onerror = () => TOAST.show('Could not read that file', 'error');
    r.readAsDataURL(f);
  },
  clear(){
    this._pending = null;
    const f = $('subj-upload-file'); if (f) f.value = '';
    const nameEl = $('subj-upload-name'); if (nameEl) nameEl.textContent = 'Choose a JSON file';
    const result = $('subj-upload-result'); if (result) result.innerHTML = '';
  },
  async upload(){
    if (!this._pending) return TOAST.show('Choose a JSON file first', 'warning');
    BUSY.start();
    try {
      const r = await ADMIN.post('adminUploadSubjectiveFile', { fileData: this._pending.dataUrl, filename: this._pending.filename });
      if (!r.success) throw new Error(r.error || 'Upload failed.');
      const result = $('subj-upload-result');
      if (result) {
        result.innerHTML =
          '<div class="banner banner-accent" style="align-items:center"><i class="ph ph-check-circle"></i>' +
          '<span>Uploaded ' + plural(r.questionCount, 'question') + '. File ID <code class="mono">' + esc(r.fileId) + '</code>' +
          '<button class="copy-btn" data-on-click="copyText(\'' + escAttrJs(r.fileId) + '\',\'File ID copied\')" aria-label="Copy file ID"><i class="ph ph-copy"></i></button></span></div>';
      }
      TOAST.show('Uploaded — paste the file ID into subjective-data.js', 'success', 6000);
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  }
};

window.SUBJADMIN   = SUBJADMIN;
window.SUBJ_UPLOAD = SUBJ_UPLOAD;
// js/admin/features/studydocs.js — upload / edit / delete study PDFs.
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, badge, fullTime,
// MODAL, CONFIRM, TOAST), core/study-docs.js (STUDYDOC_LABELS,
// subjChapterName, formatBytes). PDFVIEW is used at call time only.

const STUDYDOCS = {
  list: [], loaded: false, MAX_BYTES: 9 * 1024 * 1024,

  async load(force){
    const box = $('studydocs-list');
    if (!box) return;
    if (this.loaded && !force) { this.render(); return; }
    box.innerHTML = '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>';
    try {
      const r = await ADMIN.post('adminListStudyDocs');
      if (!r.success) throw new Error(r.error || 'Could not load the PDFs.');
      this.list = r.docs || []; this.loaded = true;
      this.render();
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-quiet btn-sm" data-on-click="STUDYDOCS.load(true)">Try again</button></span></div>';
    }
  },

  /* Per-question PDFs share this table but are managed by the Q&A splitter:
     their chapter id carries the syllabus topic, and this editor would wipe
     it on save. List them there, not here. */
  _docs(){
    return (this.list || []).filter(d => !(typeof isQnaDoc === 'function' && isQnaDoc(d)));
  },

  render(){
    const box = $('studydocs-list');
    if (!box) return;
    const docs = this._docs();
    if (!docs.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-file-pdf"></i><div class="t">No study PDFs yet</div>' +
        '<div class="d">Upload a model-answer PDF and students will find it under Written answers.</div>' +
        '<div class="a"><button class="btn btn-primary" data-perm="studydocs_manage" data-on-click="STUDYDOCS.openUpload()">Upload a PDF</button></div></div>';
      ADMIN._applyPermissions();
      return;
    }
    const canManage = ADMIN.can('studydocs_manage');
    box.innerHTML = '<div class="rows">' + docs.map(d => {
      const hidden = d.status === 'hidden';
      const id = escAttrJs(d.id);
      return '<div class="row">' +
        '<div class="row-main"><div class="row-title">' + esc(d.title) + ' ' + badge(hidden ? 'archived' : 'live', hidden ? 'Hidden' : 'Visible') + '</div>' +
        '<div class="row-sub">' + esc(STUDYDOC_LABELS[d.category] || 'Other') + (d.chapterId && subjChapterName(d.chapterId) ? ' · ' + esc(subjChapterName(d.chapterId)) : '') + ' · ' + esc(formatBytes(d.sizeBytes)) +
          ' · added ' + esc(fullTime(d.uploadedAt)) + (d.uploadedBy ? ' by ' + esc(d.uploadedBy) : '') +
          (d.description ? '<br>' + esc(d.description) : '') + '</div></div>' +
        '<div class="row-actions">' +
          '<button class="icon-btn sm" data-on-click="STUDYDOCS.preview(\'' + id + '\',\'' + escAttrJs(d.title) + '\')" aria-label="Open ' + esc(d.title) + '" title="Open"><i class="ph ph-eye"></i></button>' +
          (canManage ? '<button class="icon-btn sm" data-on-click="STUDYDOCS.openEdit(\'' + id + '\')" aria-label="Edit ' + esc(d.title) + '" title="Edit"><i class="ph ph-pencil-simple"></i></button>' +
            '<button class="icon-btn sm" data-on-click="STUDYDOCS.setStatus(\'' + id + '\',\'' + (hidden ? 'published' : 'hidden') + '\')" aria-label="' + (hidden ? 'Show to students' : 'Hide from students') + '" title="' + (hidden ? 'Show to students' : 'Hide from students') + '"><i class="ph ph-' + (hidden ? 'eye-slash' : 'eye-closed') + '"></i></button>' +
            '<button class="icon-btn sm danger" data-on-click="STUDYDOCS.del(\'' + id + '\',\'' + escAttrJs(d.title) + '\')" aria-label="Delete ' + esc(d.title) + '" title="Delete"><i class="ph ph-trash"></i></button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  },

  _fields(d){
    const cats = Object.keys(STUDYDOC_LABELS);
    return '<div class="field"><label for="sd-title">Title</label>' +
        '<input class="input" type="text" id="sd-title" maxlength="120" placeholder="Soil Mechanics: 10-mark model answers" value="' + esc(d ? d.title : '') + '"></div>' +
      '<div class="field"><label for="sd-cat">Type</label><select class="select" id="sd-cat">' +
        cats.map(c => '<option value="' + c + '"' + ((d ? d.category : 'model-answer') === c ? ' selected' : '') + '>' + esc(STUDYDOC_LABELS[c]) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sd-chap">Written-answer chapter <span class="dim">(optional: students see a "model answer" button after their answer in this chapter is marked)</span></label>' +
        '<select class="select" id="sd-chap"><option value="">Not tied to a chapter</option>' +
        (window.SUBJECTIVE_CHAPTERS || []).map(c => '<option value="' + esc(c.id) + '"' + (d && d.chapterId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="sd-desc">Short note <span class="dim">(optional, shown under the title)</span></label>' +
        '<input class="input" type="text" id="sd-desc" maxlength="400" placeholder="Worked answers for the last five years" value="' + esc(d ? d.description : '') + '"></div>' +
      '<label class="flex g2 mt2" style="align-items:center;cursor:pointer"><input type="checkbox" id="sd-pin"' + (d && d.sortOrder <= 1 ? ' checked' : '') + '> <span class="t-callout">Show at the top of the list</span></label>';
  },

  openUpload(){
    MODAL.sheet('Upload a study PDF',
      this._fields(null) +
      '<div class="field mt2"><span class="field-label">PDF file</span>' +
        '<label class="file-drop" for="sd-file">' +
          '<input type="file" id="sd-file" accept="application/pdf,.pdf" data-on-change="STUDYDOCS.onFilePicked()">' +
          '<i class="ph ph-file-arrow-up fd-icon"></i>' +
          '<span class="fd-main" id="sd-file-name">Choose a PDF</span>' +
          '<span class="fd-sub">Under 9 MB. Scanned pages are fine, but smaller files open faster on phones.</span>' +
        '</label><div class="t-foot mt2" id="sd-status" aria-live="polite"></div></div>' +
      '<label class="flex g2 mt2" style="align-items:center;cursor:pointer"><input type="checkbox" id="sd-publish" checked> <span class="t-callout">Visible to students now</span></label>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:2" id="sd-save" data-on-click="STUDYDOCS.upload()">Upload</button></div>');
  },

  onFilePicked(){
    const input = $('sd-file'), status = $('sd-status'), nameEl = $('sd-file-name');
    const f = input && input.files && input.files[0];
    if (!f) return;
    if (nameEl) nameEl.textContent = f.name;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      if (status) status.innerHTML = '<span style="color:var(--danger)">That is not a PDF.</span>';
      input.value = ''; if (nameEl) nameEl.textContent = 'Choose a PDF'; return;
    }
    if (f.size > this.MAX_BYTES) {
      if (status) status.innerHTML = '<span style="color:var(--danger)">That file is ' + formatBytes(f.size) + '. Keep it under 9 MB (a scanner or PDF compressor can shrink it).</span>';
      input.value = ''; if (nameEl) nameEl.textContent = 'Choose a PDF'; return;
    }
    if (status) status.textContent = formatBytes(f.size) + ' ready';
    const t = $('sd-title');
    if (t && !t.value.trim()) t.value = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  },

  async upload(){
    const fileInput = $('sd-file');
    const f = fileInput && fileInput.files && fileInput.files[0];
    const titleEl = $('sd-title');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) { if (titleEl) titleEl.classList.add('invalid'); return TOAST.show('Give the PDF a title', 'warning'); }
    if (!f) return TOAST.show('Choose a PDF file first', 'warning');
    const btn = $('sd-save'), status = $('sd-status');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    if (status) status.innerHTML = '<span class="inline-loader">Requesting upload slot</span>';
    try {
      const up = await ADMIN.post('getStudyDocUploadUrl', {});
      if (!up.success || !up.signedUrl || !up.path) {
        throw new Error(up.error || 'The server did not return an upload slot.');
      }
      if (status) status.innerHTML = '<span class="inline-loader">Uploading to storage</span>';
      const put = await fetch(up.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: f
      });
      if (!put.ok) throw new Error('Storage refused the upload (HTTP ' + put.status + ').');
      if (status) status.innerHTML = '<span class="inline-loader">Saving</span>';
      /* The file is already in Supabase Storage at `up.path`. If
         adminAddStudyDoc is retried on GAS, GAS cannot read that path —
         the record would be silently orphaned. Disable fallback for this
         one call so a Supabase failure surfaces as a clear error instead
         of a "successful" record GAS cannot open. */
      const r = await ADMIN.post('adminAddStudyDoc', {
        title,
        category: ($('sd-cat') || {}).value || 'model-answer',
        chapterId: ($('sd-chap') || {}).value || '',
        description: (($('sd-desc') || {}).value || '').trim(),
        sortOrder: ($('sd-pin') && $('sd-pin').checked) ? 1 : 100,
        publish: !!($('sd-publish') && $('sd-publish').checked),
        pdfPath: up.path
      }, { fallback: false });
      if (!r.success) throw new Error(r.error || 'Upload failed.');
      MODAL.close('sheet');
      TOAST.show('Uploaded' + ($('sd-publish') && !$('sd-publish').checked ? ' (hidden)' : ''), 'success');
      this.load(true);
    } catch(e){
      if (status) status.innerHTML = '<span style="color:var(--danger)">' + esc(e.message) + '</span>';
      if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
    }
  },

  preview(id, title){
    if (typeof PDFVIEW === 'undefined') return TOAST.show('The PDF reader did not load. Reload the page.', 'error');
    PDFVIEW.open({
      title: title || 'Study PDF',
      filename: (title || 'study').replace(/[^A-Za-z0-9_-]+/g, '_') + '.pdf',
      load: async () => {
        const r = await ADMIN.post('adminDownloadStudyDoc', { id });
        if (!r.success || !r.url) throw new Error(r.error || 'Could not open that PDF.');
        const blob = await fetch(r.url).then(res => {
          if (!res.ok) throw new Error('The signed URL replied with HTTP ' + res.status + '.');
          return res.blob();
        });
        const base64 = await new Promise((res2, rej) => {
          const fr = new FileReader();
          fr.onload = () => res2(String(fr.result).split(',')[1]);
          fr.onerror = () => rej(new Error('Could not read the PDF.'));
          fr.readAsDataURL(blob);
        });
        return { base64, filename: r.title ? r.title + '.pdf' : 'study.pdf' };
      }
    });
  },

  openEdit(id){
    const d = this.list.find(x => x.id === id);
    if (!d) return;
    MODAL.sheet('Edit study PDF',
      this._fields(d) +
      '<div class="field mt2"><label for="sd-state">Visibility</label><select class="select" id="sd-state">' +
        '<option value="published"' + (d.status !== 'hidden' ? ' selected' : '') + '>Visible to students</option>' +
        '<option value="hidden"' + (d.status === 'hidden' ? ' selected' : '') + '>Hidden</option></select></div>' +
      '<div class="t-foot mt2">To replace the file itself, upload the new PDF and delete this one.</div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:2" id="sd-save" data-on-click="STUDYDOCS.saveEdit(\'' + escAttrJs(id) + '\')">Save</button></div>');
  },

  async saveEdit(id){
    const titleEl = $('sd-title');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) { if (titleEl) titleEl.classList.add('invalid'); return TOAST.show('Give the PDF a title', 'warning'); }
    const btn = $('sd-save'); if (btn) btn.disabled = true;
    try {
      const r = await ADMIN.post('adminUpdateStudyDoc', {
        id, title,
        category: ($('sd-cat') || {}).value || 'model-answer',
        chapterId: ($('sd-chap') || {}).value || '',
        description: (($('sd-desc') || {}).value || '').trim(),
        sortOrder: ($('sd-pin') && $('sd-pin').checked) ? 1 : 100,
        status: ($('sd-state') || {}).value || 'published'
      });
      if (!r.success) throw new Error(r.error || 'Could not save.');
      MODAL.close('sheet'); TOAST.show('Saved', 'success'); this.load(true);
    } catch(e){ if (btn) btn.disabled = false; TOAST.show(e.message, 'error'); }
  },

  async setStatus(id, status){
    const d = this.list.find(x => x.id === id);
    if (!d) return;
    try {
      const r = await ADMIN.post('adminUpdateStudyDoc', {
        id, title: d.title, category: d.category, chapterId: d.chapterId,
        description: d.description, sortOrder: d.sortOrder, status
      });
      if (!r.success) throw new Error(r.error || 'Could not update.');
      TOAST.show(status === 'hidden' ? 'Hidden from students' : 'Visible to students', 'success'); this.load(true);
    } catch(e){ TOAST.show(e.message, 'error'); }
  },

  async del(id, title){
    const ok = await CONFIRM.ask({ title: 'Delete this PDF?', body: '<b>' + esc(title) + '</b> will be removed for every student, including copies saved for offline reading once they next go online. This cannot be undone.', confirmText: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      const r = await ADMIN.post('adminDeleteStudyDoc', { id });
      if (!r.success) throw new Error(r.error || 'Could not delete.');
      TOAST.show('Deleted', 'success'); this.load(true);
    } catch(e){ TOAST.show(e.message, 'error'); }
  }
};

window.STUDYDOCS = STUDYDOCS;
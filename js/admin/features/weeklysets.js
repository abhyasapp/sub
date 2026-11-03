// js/admin/features/weeklysets.js — schedule a weekly test, view results.
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, badge, fullTime, relTime,
// plural, MODAL, CONFIRM, BUSY, TOAST).

const WEEKLYSETS = {
  list: [], uploadedFileId: '', _lastResults: null,

  openCreate(){
    /* Clear any stale uploaded file ID from a previous attempt. */
    this.uploadedFileId = '';
    MODAL.sheet('Schedule a weekly set',
      '<div class="field"><label for="ws-title">Title</label>' +
        '<input class="input" type="text" id="ws-title" placeholder="Week 12 — Structural analysis"></div>' +
      '<div class="field"><span class="field-label">Question file</span>' +
        '<label class="file-drop" for="ws-file">' +
          '<input type="file" id="ws-file" accept="application/json,.json" data-on-change="WEEKLYSETS.onFilePicked()">' +
          '<i class="ph ph-file-arrow-up fd-icon"></i>' +
          '<span class="fd-main" id="ws-file-name">Choose a .json question bank</span>' +
          '<span class="fd-sub">Uploads to Drive straight away · under 4 MB</span>' +
        '</label>' +
        '<div class="t-foot mt2" id="ws-upload-status" aria-live="polite"></div>' +
      '</div>' +
      '<details class="mb4"><summary class="t-foot" style="cursor:pointer">Already on Drive? Paste the file ID instead</summary>' +
        '<input class="input mt2" type="text" id="ws-fileid" placeholder="Drive file ID"></details>' +
      '<div class="field"><label for="ws-chapter">Chapter label <span class="dim">(optional)</span></label>' +
        '<input class="input" type="text" id="ws-chapter" placeholder="Structural engineering"></div>' +
      '<div class="field"><label for="ws-release">Unlocks at</label>' +
        '<input class="input" type="datetime-local" id="ws-release">' +
        '<button type="button" class="btn btn-quiet btn-sm mt2" style="align-self:flex-start" data-on-click="WEEKLYSETS.fillNextWednesday()"><i class="ph ph-calendar-plus"></i> Next Wednesday, 8 am</button></div>' +
      '<div class="flex g2 mt4 wrap">' +
        '<button class="btn btn-secondary" data-on-click="WEEKLYSETS.preview(document.getElementById(\'ws-fileid\').value.trim(), document.getElementById(\'ws-title\').value.trim())"><i class="ph ph-eye"></i> Preview questions</button>' +
        '<button class="btn btn-primary grow" id="ws-create" data-on-click="WEEKLYSETS.create()">Schedule set</button>' +
      '</div>'
    );
  },

  fillNextWednesday(){
    const now = new Date();
    let days = (3 - now.getDay() + 7) % 7;
    if (days === 0) days = 7;
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 8, 0, 0);
    const p = n => String(n).padStart(2, '0');
    const el = $('ws-release');
    if (el) el.value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + 'T' + p(t.getHours()) + ':' + p(t.getMinutes());
  },

  async onFilePicked(){
    const input = $('ws-file'), status = $('ws-upload-status'), nameEl = $('ws-file-name');
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (nameEl) nameEl.textContent = file.name;
    if (file.size > 4 * 1024 * 1024) {
      if (status) status.innerHTML = '<span style="color:var(--danger)">That file is ' + (file.size / 1048576).toFixed(1) + ' MB — keep it under 4 MB.</span>';
      if (input) input.value = '';
      if (nameEl) nameEl.textContent = 'Choose a .json question bank';
      return;
    }
    if (status) status.innerHTML = '<span class="inline-loader">Uploading to Drive</span>';
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });
      const r = await ADMIN.post('adminUploadWeeklySetFile', { fileData: dataUrl, filename: file.name });
      if (!r.success) throw new Error(r.error || 'Upload failed.');
      this.uploadedFileId = r.fileId;
      const fileIdEl = $('ws-fileid'); if (fileIdEl) fileIdEl.value = r.fileId;
      if (status) status.innerHTML = '<span style="color:var(--success)">Uploaded · file ID ' + esc(r.fileId) + '</span>';
    } catch(e){
      if (status) status.innerHTML = '<span style="color:var(--danger)">' + esc(e.message) + '</span>';
      if (input) input.value = '';
    }
  },

  render(sets){
    this.list = sets || [];
    const box = $('weeklysets-list');
    if (!box) return;
    const trunc = $('ws-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.weeklysetsTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + this.list.length + ' of ' + ADMIN.data.weeklysetsTotalCount + ' sets.</span></div>' : '';

    if (!this.list.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-calendar-blank"></i><div class="t">No weekly sets yet</div>' +
        '<div class="d">Schedule one and it unlocks for every student at the time you choose.</div>' +
        '<div class="a"><button class="btn btn-primary" data-perm="weeklysets_manage" data-on-click="WEEKLYSETS.openCreate()">Schedule a set</button></div></div>';
      if (typeof ADMIN._applyPermissions === 'function') ADMIN._applyPermissions();
      return;
    }
    const now = Date.now();
    const canManage = ADMIN.can('weeklysets_manage');
    box.innerHTML = '<div class="rows">' + this.list.map(s => {
      const rel = new Date(s.releaseAt).getTime();
      const released = !isNaN(rel) && now >= rel;
      const archived = s.status === 'archived';
      const st = archived ? 'archived' : (released ? 'live' : 'scheduled');
      return '<div class="row">' +
        '<div class="row-main"><div class="row-title">' + esc(s.title || '(untitled)') + badge(st) + '</div>' +
        '<div class="row-sub">' + (s.chapterLabel ? esc(s.chapterLabel) + ' · ' : '') +
          (released ? 'Released ' : 'Unlocks ') + esc(fullTime(s.releaseAt)) + '</div></div>' +
        '<div class="row-actions">' +
          '<button class="icon-btn sm" data-on-click="WEEKLYSETS.showResults(\'' + escAttrJs(s.id) + '\',\'' + escAttrJs(s.title || '') + '\')" aria-label="Results for ' + esc(s.title || '') + '" title="Results"><i class="ph ph-chart-bar"></i></button>' +
          '<button class="icon-btn sm" data-on-click="WEEKLYSETS.preview(\'' + escAttrJs(s.fileId || '') + '\',\'' + escAttrJs(s.title || '') + '\')" aria-label="Preview ' + esc(s.title || '') + '" title="Preview"><i class="ph ph-eye"></i></button>' +
          (canManage ? (archived
            ? '<button class="icon-btn sm" data-on-click="WEEKLYSETS.setStatus(\'' + escAttrJs(s.id) + '\',\'active\')" aria-label="Restore" title="Restore"><i class="ph ph-arrow-counter-clockwise"></i></button>'
            : '<button class="icon-btn sm" data-on-click="WEEKLYSETS.setStatus(\'' + escAttrJs(s.id) + '\',\'archived\')" aria-label="Archive" title="Archive"><i class="ph ph-archive"></i></button>') : '') +
          (canManage ? '<button class="icon-btn sm danger" data-on-click="WEEKLYSETS.del(\'' + escAttrJs(s.id) + '\',\'' + escAttrJs(s.title || '') + '\')" aria-label="Delete ' + esc(s.title || '') + '" title="Delete"><i class="ph ph-trash"></i></button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  },

  /* getFile normalization: ADMIN.post already unwraps Supabase's
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

  async preview(fileId, title){
    if (!fileId) return TOAST.show('Upload a file or paste a file ID first', 'warning');
    MODAL.sheet('Preview: ' + (title || fileId), '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>');
    try {
      const res = await ADMIN.post('getFile', { fileId });
      if (!res.success) throw new Error(res.error || 'Could not open that file.');
      const raw = this._unwrap(res);
      const qs = Array.isArray(raw) ? raw : (raw && (raw.questions || raw.data || raw.quiz || raw.items)) || [];
      if (!Array.isArray(qs) || !qs.length) {
        const bd = $('bd-sheet');
        if (bd) bd.innerHTML = '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>No questions found in that file.</span></div>';
        return;
      }
      const bd = $('bd-sheet');
      if (!bd) return;
      bd.innerHTML =
        '<p class="t-callout mb4"><b>' + qs.length + '</b> questions found. Showing the first ' + Math.min(5, qs.length) + '.</p>' +
        '<div class="stack2">' + qs.slice(0, 5).map((q, i) => {
          const text = q.q || q.question || q.stem || '(no text)';
          const opts = q.options || q.opts || q.choices || [];
          return '<div class="sub-card"><div class="t-callout" style="font-weight:600">' + (i + 1) + '. ' + esc(String(text).slice(0, 220)) + '</div>' +
            (Array.isArray(opts) && opts.length ? '<div class="t-foot mt2">' + opts.map((o, oi) =>
              String.fromCharCode(65 + oi) + ') ' + esc(String(o)) +
              (q.correct != null && Number(q.correct) === oi ? ' \u2713' : '')
            ).join('  ·  ') + '</div>' : '') +
          '</div>';
        }).join('') + '</div>';
    } catch(e){
      const bd = $('bd-sheet');
      if (bd) bd.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },

  async showResults(id, title){
    MODAL.sheet('Results: ' + (title || id), '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>');
    try {
      const res = await ADMIN.post('adminWeeklySetResults', { weeklyId: id });
      if (!res.success) throw new Error(res.error || 'Could not load results.');
      this._lastResults = res;
      if (!res.attempts) {
        const bd = $('bd-sheet');
        if (bd) bd.innerHTML = '<div class="empty"><i class="ph ph-chart-bar"></i><div class="t">No attempts yet</div>' +
          '<div class="d">Results appear here once students sit this set.</div></div>';
        return;
      }
      const dist = Array.isArray(res.distribution) ? res.distribution : [];
      const recent = Array.isArray(res.recent) ? res.recent : [];
      const max = Math.max.apply(null, dist.map(b => b.count || 0).concat([1]));
      const bd = $('bd-sheet');
      if (!bd) return;
      bd.innerHTML =
        (res.rescored ? '' : '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>The source file could not be read, so these scores are as reported by each device.</span></div>') +
        '<dl class="dl mb4">' +
          '<div><dt>Attempts</dt><dd class="mono">' + (res.attempts || 0) + '</dd></div>' +
          '<div><dt>Average</dt><dd class="mono" style="color:var(--accent);font-weight:700">' + (res.avgPct != null ? res.avgPct : '—') + '%</dd></div>' +
          '<div><dt>Range</dt><dd class="mono">' + (res.minPct != null ? res.minPct : '—') + '–' + (res.maxPct != null ? res.maxPct : '—') + '% (σ ' + (res.stdDev != null ? res.stdDev : '—') + ')</dd></div>' +
          '<div><dt>Students</dt><dd class="mono">' + (res.uniqueStudents || 0) + '</dd></div>' +
        '</dl>' +
        '<h4 class="t-cap mb2">Score spread</h4><div class="mb4">' +
        dist.map(b =>
          '<div class="dist"><span class="rg">' + esc(b.range || '—') + '%</span>' +
          '<span class="track"><span class="fill" style="width:' + ((b.count || 0) / max * 100) + '%"></span></span>' +
          '<span class="ct">' + (b.count || 0) + '</span></div>').join('') + '</div>' +
        '<h4 class="t-cap mb2">Recent attempts</h4>' +
        '<div class="rows">' + recent.map(r =>
          '<div class="row"><div class="row-main"><div class="row-title mono">' + esc(r.username || '—') + '</div>' +
          '<div class="row-sub">' + (r.durationSec ? Math.round(r.durationSec / 60) + ' min · ' : '') + relTime(r.submittedAt) + '</div></div>' +
          badge((r.pct >= 70 ? 'graded' : r.pct >= 40 ? 'pending' : 'rejected'), (r.pct || 0) + '%') +
          '<span class="t-cap mono">' + (r.correct || 0) + '/' + (r.total || 0) + '</span></div>').join('') + '</div>' +
        '<div class="flex mt4" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-on-click="WEEKLYSETS.exportResults()"><i class="ph ph-download-simple"></i> Export CSV</button></div>';
    } catch(e){
      const bd = $('bd-sheet');
      if (bd) bd.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },

  exportResults(){
    const r = this._lastResults;
    if (!r || !Array.isArray(r.recent) || !r.recent.length) return TOAST.show('Nothing to export', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['Username','Score %','Correct','Total','Skipped','Wrong','Duration (s)','Submitted'],
      r.recent.map(a => [
        a.username || '', a.pct || 0, a.correct || 0, a.total || 0,
        a.skipped || 0, a.wrong || 0, a.durationSec || '',
        a.submittedAt ? new Date(a.submittedAt).toISOString() : ''
      ])
    ), 'weekly_' + (r.weeklyId || 'set') + '_results.csv');
  },

  async create(){
    const title = ($('ws-title') || {}).value ? $('ws-title').value.trim() : '';
    const fileIdEl = $('ws-fileid');
    const fileId = (fileIdEl && fileIdEl.value.trim()) || this.uploadedFileId;
    const chapterLabel = ($('ws-chapter') || {}).value ? $('ws-chapter').value.trim() : '';
    const releaseLocal = ($('ws-release') || {}).value || '';
    if (!title) return TOAST.show('Give the set a title', 'error');
    if (!fileId) return TOAST.show('Upload a question file first', 'error');
    if (!releaseLocal) return TOAST.show('Choose when it unlocks', 'error');
    const releaseAt = new Date(releaseLocal);
    if (isNaN(releaseAt)) return TOAST.show('That unlock time is not valid', 'error');
    const btn = $('ws-create');
    if (btn) btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminCreateWeeklySet', { title, fileId, chapterLabel, releaseAt: releaseAt.toISOString() });
      if (!res.success) throw new Error(res.error);
      TOAST.show('"' + title + '" unlocks ' + releaseAt.toLocaleString(), 'success', 5000);
      if (res.duplicateWarning) setTimeout(() => TOAST.show(res.duplicateWarning, 'warning', 6000), 1400);
      this.uploadedFileId = '';
      MODAL.close('sheet');
      ADMIN.refresh(['weeklysets']);
    } catch(e){ TOAST.show(e.message || 'Could not schedule that set', 'error'); }
    if (btn) btn.classList.remove('loading');
  },

  async setStatus(id, status){
    BUSY.start();
    try {
      const res = await ADMIN.post('adminUpdateWeeklySet', { id, status });
      if (!res.success) throw new Error(res.error);
      TOAST.show(status === 'archived' ? 'Set archived' : 'Set restored', 'success');
      ADMIN.refresh(['weeklysets']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  async del(id, title){
    const ok = await CONFIRM.ask({
      title:'Delete weekly set',
      body:'Delete <b>' + esc(title) + '</b>? Archiving keeps the results and hides it from students instead.',
      confirmText:'Delete', tone:'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteWeeklySet', { id });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Weekly set deleted', 'success');
      ADMIN.refresh(['weeklysets']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

window.WEEKLYSETS = WEEKLYSETS;
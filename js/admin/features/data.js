// js/admin/features/data.js — import progress from a JSON export.
// MUST load AFTER: core.js (ADMIN, $, esc, TOAST, BUSY, CONFIRM).

const IMPORT = {
  onFilePicked(){
    const file = $('imp-file').files?.[0];
    if (!file) return;
    $('imp-file-name').textContent = file.name;
    const r = new FileReader();
    r.onload = e => { $('imp-json').value = e.target.result; };
    r.onerror = () => TOAST.show('Could not read that file', 'error');
    r.readAsText(file);
  },
  clear(){
    $('imp-file').value = '';
    $('imp-file-name').textContent = 'Drop a .json export here, or choose a file';
    $('imp-json').value = '';
    $('imp-mode').value = 'preview';
    $('imp-result').innerHTML = '';
  },
  async run(){
    const raw = $('imp-json').value.trim();
    const mode = $('imp-mode').value;
    const out = $('imp-result');
    if (!raw) return TOAST.show('Choose a file or paste the JSON first', 'error');
    let payload;
    try { payload = JSON.parse(raw); } catch(e){ return TOAST.show('That is not valid JSON', 'error'); }

    if (mode !== 'preview') {
      const ok = await CONFIRM.ask({
        title: mode === 'replace' ? 'Replace progress' : 'Merge progress',
        body: mode === 'replace'
          ? 'This overwrites each student\u2019s existing progress. A backup is taken first.'
          : 'This combines the imported data into each student\u2019s existing progress.',
        confirmText: mode === 'replace' ? 'Replace' : 'Merge', tone:'danger'
      });
      if (!ok) return;
    }
    BUSY.start();
    try {
      const res = await ADMIN.post('adminImportProgress', { mode, payload: JSON.stringify(payload) });
      if (!res.success) throw new Error(res.error || 'Import failed.');
      const errs = res.errors || [];
      out.innerHTML = '<div class="panel" style="margin:0;background:var(--bg-grouped)">' +
        '<div class="t-callout mb3"><b>' + (res.preview ? 'Preview' : (mode === 'replace' ? 'Replaced' : 'Merged')) + '</b> · import <span class="mono">' + esc(res.importId) + '</span></div>' +
        '<dl class="dl">' +
          '<div><dt>Records read</dt><dd class="mono">' + (res.recordsReceived ?? '—') + '</dd></div>' +
          '<div><dt>Accepted</dt><dd class="mono" style="color:var(--success)">' + (res.recordsAccepted ?? '—') + '</dd></div>' +
          '<div><dt>Skipped</dt><dd class="mono" style="color:var(--danger)">' + (res.recordsSkipped ?? 0) + '</dd></div>' +
        '</dl>' +
        (errs.length ? '<div class="sub-q mono" style="max-height:180px">' + errs.slice(0, 50).map(e => esc((e.username || 'row ' + e.index) + ': ' + e.error)).join('\n') +
          (errs.length > 50 ? '\n…and ' + (errs.length - 50) + ' more' : '') + '</div>' : '') +
      '</div>';
      if (res.preview) TOAST.show('Preview only — nothing was changed', 'info', 4000);
      else { TOAST.show(plural(res.recordsAccepted, 'record') + ' ' + (mode === 'replace' ? 'replaced' : 'merged'), 'success'); ADMIN.refresh(['logs']); }
    } catch(e){
      out.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
    BUSY.stop();
  }
};

window.IMPORT = IMPORT;
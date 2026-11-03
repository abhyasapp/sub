// js/admin/features/dashboard.js — Overview tab: trends, most-missed, upkeep.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, escAttrJs, plural, BUSY, TOAST, CONFIRM).
// Uses ChapterData at call time only.

const MAINTENANCE = {
  async _run(label, action, params, toastFn){
    BUSY.start();
    try {
      const res = await ADMIN.post(action, params || {});
      if (!res.success) throw new Error(res.error || (label + ' failed.'));
      TOAST.show(toastFn(res), 'success', 5000);
      ADMIN.refresh(['logs']);
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  },
  async pruneOldBackups(){
    const days = parseInt(($('maint-backup-days') || {}).value, 10);
    if (!days || days < 1) return TOAST.show('Enter a number of days to keep', 'error');
    const ok = await CONFIRM.ask({
      title:'Prune old backups',
      body:'Delete progress backups older than <b>' + days + '</b> day(s)? Anything newer stays.',
      confirmText:'Prune', tone:'danger'
    });
    if (ok) this._run('Prune', 'adminPruneOldBackups', { daysToKeep: days },
      r => 'Pruned ' + plural(r.deleted, 'backup row') + ', kept the last ' + r.daysToKeep + ' days');
  },
  async clearAllBackups(){
    const ok = await CONFIRM.ask({
      title:'Delete all progress backups',
      body:'This permanently deletes <b>every</b> progress backup. There is no undo.',
      confirmText:'Delete all', tone:'danger', requireType:'DELETE'
    });
    if (ok) this._run('Delete', 'adminClearProgressBackups', {}, r => 'Deleted ' + plural(r.deleted, 'backup row'));
  },
  async trimLogs(){
    const keep = parseInt(($('maint-logs-keep') || {}).value, 10);
    if (!keep || keep < 100) return TOAST.show('Keep at least 100 rows', 'error');
    const ok = await CONFIRM.ask({
      title:'Trim the activity log',
      body:'Keep only the most recent <b>' + keep + '</b> rows and delete everything older?',
      confirmText:'Trim', tone:'danger'
    });
    if (ok) this._run('Trim', 'adminTrimLogs', { keepLast: keep },
      r => 'Trimmed ' + plural(r.deleted, 'row') + ', kept ' + r.kept);
  },
  async revokeScreenshotSharing(){
    const ok = await CONFIRM.ask({
      title:'Make screenshots private',
      body:'Remove the public Drive link from every payment screenshot. This console can still open them.',
      confirmText:'Make private', tone:'danger'
    });
    if (ok) this._run('Revoke', 'adminRevokeScreenshotSharing', {}, r => {
      const parts = [r.revoked + ' made private', r.alreadyPrivate + ' already private'];
      if (r.failed) parts.push(r.failed + ' failed');
      return parts.join(', ');
    });
  }
};

const CHAPTERS = {
  _map: null, _levels: null,
  _build(){
    if (this._map) return;
    this._map = new Map(); this._levels = new Set();
    if (typeof ChapterData !== 'undefined') {
      try {
        ChapterData.allFileRefs().forEach(ref => {
          const level = ChapterData.levelLabel(ref.lv);
          const chapter = ChapterData.chapterName(ref.lv, ref.ch);
          this._map.set(ref.fid, { level, chapter, label: level + ' — ' + chapter });
          this._levels.add(level);
        });
      } catch(e){}
    }
  },
  labelFor(fileId){
    this._build();
    return (this._map.get(fileId) && this._map.get(fileId).label)
      || (fileId === 'local' ? 'Local file' : 'Weekly set or unknown');
  },
  allLevels(){ this._build(); return [...this._levels].sort(); },
  allChapters(){ this._build(); return [...new Set([...this._map.values()].map(v => v.chapter))].sort(); }
};

/* At most 4 file requests at once: 100 parallel getFile calls exceeded the
   Apps Script concurrency limit and the global rate limit. */
const TRENDS = {
  async load(){
    const box = $('trend-panel');
    if (!box) return;
    try {
      const r = await ADMIN.post('adminTrends', { days: 30 });
      if (!r.success) throw new Error(r.error || 'Could not load.');
      const t = r.totals || {};
      const series = Array.isArray(r.series) ? r.series : [];
      const max = Math.max(1, ...series.map(d => Math.max(d.signups || 0, d.paid || 0)));
      const bars = key => series.map(d =>
        '<span title="' + esc(d.date || '') + ': ' + (d[key] || 0) + '" ' +
        'style="flex:1;min-width:3px;height:' + Math.max(2, Math.round((d[key] || 0) / max * 56)) +
        'px;background:' + (key === 'paid' ? 'var(--accent)' : 'var(--info)') + ';border-radius:2px 2px 0 0"></span>').join('');
      const chart = (label, key, sum) =>
        '<div class="mb3"><div class="flex between center mb2"><span class="t-callout" style="color:var(--ink);font-weight:600">' + label + '</span>' +
        '<span class="t-cap mono">' + sum + ' in 30 days</span></div>' +
        '<div style="display:flex;align-items:flex-end;gap:2px;height:60px">' + bars(key) + '</div></div>';
      box.innerHTML =
        '<div class="metrics mb4">' +
          '<div class="metric"><div class="v">' + (t.paidRate || 0) + '%</div><div class="l">Of all students have paid</div></div>' +
          '<div class="metric"><div class="v">' + (t.awaiting || 0) + '</div><div class="l">Payments waiting for you</div></div>' +
          '<div class="metric"><div class="v">' + (t.notPaid || 0) + '</div><div class="l">Expired, not paid</div></div>' +
          '<div class="metric"><div class="v">Rs ' + Number(t.revenueEstimate || 0).toLocaleString() + '</div><div class="l">Estimated at Rs ' + (t.amount || 0) + ' each</div></div>' +
        '</div>' +
        chart('New students per day', 'signups', t.periodSignups || 0) +
        chart('Payments approved per day', 'paid', t.periodPaid || 0) +
        (t.notPaid ? '<div class="flex g2 wrap center"><span class="t-foot">' + plural(t.notPaid, 'student') + ' finished the trial without paying. A short message can win some back.</span>' +
          '<button class="btn btn-secondary btn-sm" data-on-click="USERS.filterBy(\'expired\')">See them</button></div>' : '');
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-sm btn-quiet" style="margin-left:.5rem" data-on-click="TRENDS.load()">Try again</button></span></div>';
    }
  }
};

const _gate = (() => {
  let active = 0;
  const q = [];
  const MAX = 4;
  const next = () => {
    if (active >= MAX || !q.length) return;
    active++;
    const job = q.shift();
    Promise.resolve().then(job.fn).then(job.res, job.rej).finally(() => { active--; next(); });
  };
  return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
})();

/* getFile normalization: ADMIN.post already unwraps Supabase's
   { success:true, content:"<json>" } into res.result. This helper reads
   whichever shape actually came back so this file keeps working even if
   the caller sends getFile through a path that bypasses normalization. */
function _unwrapGetFileResponse(res) {
  if (!res || !res.success) return null;
  if (res.result !== undefined && res.result !== null) return res.result;
  if (typeof res.content === 'string') {
    try { return JSON.parse(res.content); } catch (e) { return null; }
  }
  return null;
}

const MISSED = {
  lastResults: [], _built: false,
  _buildFilters(){
    if (this._built) return;
    const lv = $('miss-level'), ch = $('miss-chapter');
    if (!lv || !ch) return;
    this._built = true;
    CHAPTERS.allLevels().forEach(l => lv.insertAdjacentHTML('beforeend', '<option value="' + escAttrJs(l) + '">' + esc(l) + '</option>'));
    CHAPTERS.allChapters().forEach(c => ch.insertAdjacentHTML('beforeend', '<option value="' + escAttrJs(c) + '">' + esc(c) + '</option>'));
  },
  clearFilters(){
    ['miss-level','miss-chapter','miss-from','miss-to'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    if ($('miss-min')) $('miss-min').value = '3';
    if ($('miss-limit')) $('miss-limit').value = '20';
    this.load();
  },
  async load(){
    this._buildFilters();
    const box = $('missed-list');
    if (!box) return;
    box.innerHTML = '<div class="sk-block"><div class="skeleton sk-80"></div><div class="skeleton sk-40"></div></div>' +
                    '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-40"></div></div>';
    const params = {
      level: ($('miss-level') || {}).value || '',
      chapter: ($('miss-chapter') || {}).value || '',
      dateFrom: ($('miss-from') || {}).value || '',
      dateTo: ($('miss-to') || {}).value || '',
      minAttempts: ($('miss-min') || {}).value || 3,
      limit: ($('miss-limit') || {}).value || 20
    };
    try {
      const res = await ADMIN.post('adminMostMissedQuestions', params);
      if (!res.success) throw new Error(res.error || 'Could not load.');
      this.lastResults = res.results || [];
      const trunc = res.truncated
        ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Partial results — scanned ' + res.totalRowsScanned + ' of ' + res.totalRowsAvailable + ' progress rows.</span></div>'
        : '';
      if (!this.lastResults.length) {
        box.innerHTML = trunc + '<div class="empty"><i class="ph ph-target"></i><div class="t">Nothing matches yet</div>' +
          '<div class="d">Widen the date range or lower the minimum attempts.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="MISSED.clearFilters()">Reset filters</button></div></div>';
        return;
      }
      const cache = {};
      const fids = [...new Set(this.lastResults.map(r => r.fileId).filter(Boolean))];
      /* getFiles returns up to 8 ids per request as { files: { id: { success, content: "<json>" } } },
         so ask in chunks of 8 and unwrap `content`. Anything the batch could not resolve (unsupported
         action, error, deferred, bad JSON) falls through to the gated per-file getFile path, so the
         panel can never silently lose question text. */
      const asList = raw => Array.isArray(raw)
        ? raw
        : (raw && (raw.questions || raw.data || raw.quiz || raw.items)) || null;
      const readEntry = v => {
        if (v == null) return null;
        if (typeof v === 'string') { try { return asList(JSON.parse(v)); } catch (e) { return null; } }
        if (Array.isArray(v)) return v;
        if (v && v.success === false) return null;
        if (v && typeof v.content === 'string') { try { return asList(JSON.parse(v.content)); } catch (e) { return null; } }
        return asList(v);
      };
      const BATCH = 8;
      if (fids.length > 1) {
        for (let i = 0; i < fids.length; i += BATCH) {
          const part = fids.slice(i, i + BATCH);
          try {
            const b = await ADMIN.post('getFiles', { fileIds: part.join(',') });
            const map = (b && b.success) ? (b.files || b.data || b.results) : null;
            if (map && typeof map === 'object') {
              part.forEach(fid => { const list = readEntry(map[fid]); if (list) cache[fid] = list; });
            }
          } catch (e) { /* the remaining ids use the per-file path below */ }
        }
      }

      const rest = fids.filter(fid => !cache[fid]);
      if (rest.length) {
        await Promise.all(rest.map(async fid => {
          try {
            const f = await _gate(() => ADMIN.post('getFile', { fileId: fid }));
            const raw = _unwrapGetFileResponse(f);
            if (raw == null) { cache[fid] = []; return; }
            cache[fid] = Array.isArray(raw) ? raw : (raw.questions || raw.data || raw.quiz || raw.items || []);
          } catch(e){ cache[fid] = []; }
        }));
      }
      box.innerHTML = trunc + this.lastResults.map(r => {
        const qs = cache[r.fileId];
        const q = (qs && r.index != null) ? qs[r.index] : null;
        const text = q ? (q.q || q.question || q.Question || q.stem || q.ques || q.text) : null;
        const chapter = r.chapter || CHAPTERS.labelFor(r.fileId);
        const wrongRate = r.wrongRate != null ? r.wrongRate : '—';
        const accuracy = r.accuracy != null ? r.accuracy : (r.wrongRate != null ? 100 - r.wrongRate : '—');
        return '<div class="miss">' +
          '<div class="miss-top">' +
            '<div class="miss-q">' + (text ? esc(String(text).slice(0, 240)) : '<span class="mono dim">' + esc(r.uid || '') + '</span>') + '</div>' +
            '<div class="miss-rate"><div class="v">' + wrongRate + '%</div><div class="l">' + (r.wrong || 0) + ' of ' + (r.total || 0) + ' wrong</div></div>' +
          '</div>' +
          '<div class="miss-tags">' +
            (r.level ? '<span class="badge flat">' + esc(r.level) + '</span>' : '') +
            (chapter ? '<span class="badge flat">' + esc(chapter) + '</span>' : '') +
          '</div>' +
          '<div class="miss-meta"><span>' + plural(r.uniqueStudents || 0, 'student') + '</span>' +
          '<span>' + accuracy + '% accuracy</span></div>' +
        '</div>';
      }).join('');
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },
  exportCSV(){
    if (!this.lastResults || !this.lastResults.length) return TOAST.show('Load the list first', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['UID','Level','Chapter','Wrong','Total','Wrong %','Accuracy %','Students'],
      this.lastResults.map(r => [
        r.uid || '', r.level || '', r.chapter || '',
        r.wrong || 0, r.total || 0,
        r.wrongRate != null ? r.wrongRate : '',
        r.accuracy != null ? r.accuracy : '',
        r.uniqueStudents || 0
      ])
    ), 'most_missed_questions.csv');
  }
};

window.MAINTENANCE = MAINTENANCE;
window.CHAPTERS    = CHAPTERS;
window.TRENDS      = TRENDS;
window.MISSED      = MISSED;
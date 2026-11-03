/* ═══════════════════════════════════════════════════════════════════════
   report/adminreport.js — the admin side of the reporting system.

   Loaded by admin.html AFTER js/admin/02-reports-study-pdfs-grading.js
   and AFTER report/report-shared.js. Classic script, no modules.

   Exposes:
     ADMIN_CORRECTIONS — the one shared cache of "which files were
                         corrected, and what did the question say before?"
     ADMIN_REPORT      — the reports screen (was QREPORTS)
     window.QREPORTS   — alias for the reports screen, so existing
                         data-on-click="QREPORTS.xxx()" keeps working

   Uses from report-shared.js: REPORT_REASON_LABELS, REPORT_SECTION_LABELS.
   Uses from the console: ADMIN, BUSY, TOAST, MODAL, CONFIRM, esc,
     escAttrJs, plural, relTime, fullTime, badge, statusLabel, initials,
     CHAPTERS, PAGINATION, ADMIN.can, ADMIN.post.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN_CORRECTIONS — every file-preview screen asks this instead of
   the server. One fetch, one-minute TTL, invalidated after any edit.
   ═══════════════════════════════════════════════════════════════════════ */
const ADMIN_CORRECTIONS = {
  _cache: null,
  _at: 0,
  TTL: 60000,

  async load(force) {
    if (!force && this._cache && (Date.now() - this._at) < this.TTL) return this._cache;
    try {
      const r = await ADMIN.post('adminListCorrections');
      if (r.success) {
        this._cache = {
          all: r.all || [],
          byFile: r.byFile || {},
          totalCount: r.totalCount || 0
        };
        this._at = Date.now();
        return this._cache;
      }
    } catch (e) { /* offline or error: fall through to empty */ }
    this._cache = { all: [], byFile: {}, totalCount: 0 };
    return this._cache;
  },

  invalidate() { this._cache = null; this._at = 0; },

  lookup(fileId, index) {
    if (!this._cache || !this._cache.byFile) return null;
    const fm = this._cache.byFile[fileId];
    return fm ? fm[index] : null;
  },

  async exportJSON() {
    BUSY.start();
    try {
      const r = await ADMIN.post('adminExportCorrections', {});
      if (!r.success) throw new Error(r.error || 'Export failed.');
      if (!r.count) {
        TOAST.show('No corrections have been made yet', 'warning');
        BUSY.stop();
        return;
      }
      const url = URL.createObjectURL(new Blob([r.json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      TOAST.show('Exported ' + plural(r.count, 'correction'), 'success');
    } catch (e) { TOAST.show(e.message, 'error', 5000); }
    BUSY.stop();
  }
};
window.ADMIN_CORRECTIONS = ADMIN_CORRECTIONS;

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN_REPORT — the reports screen (was QREPORTS).
   ═══════════════════════════════════════════════════════════════════════ */
const ADMIN_REPORT = {
  all: [],
  filter: 'open',
  chapterFilter: 'all',
  reasonFilter: 'all',
  searchTerm: '',
  _t: null,
  _historyCache: null,

  setFilter(v) { this.filter = v; ADMIN.state.qrPage = 1; this.render(this.all); },
  setChapterFilter(v) { this.chapterFilter = v; ADMIN.state.qrPage = 1; this.render(this.all); },
  setReasonFilter(v) { this.reasonFilter = v; ADMIN.state.qrPage = 1; this.render(this.all); },

  debouncedFilter() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      this.searchTerm = $('qreports-search').value.toLowerCase();
      ADMIN.state.qrPage = 1;
      this.render(this.all);
    }, 250);
  },

  async load() {
    BUSY.start();
    try {
      const res = await ADMIN.post('adminListQuestionReports');
      if (res.success) this.render(res.reports);
      else TOAST.show(res.error || 'Could not load reports', 'error');
    } catch (e) { TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  chapterFor(fileId) { return CHAPTERS.labelFor(fileId); },

  _chapterOptions() {
    const sel = $('qreports-chapter-filter');
    if (!sel) return;
    const chapters = [...new Set(this.all.map(r => this.chapterFor(r.fileId)))].sort();
    const cur = this.chapterFilter;
    sel.innerHTML = '<option value="all">All chapters</option>' +
      chapters.map(c =>
        '<option value="' + escAttrJs(c) + '"' + (c === cur ? ' selected' : '') + '>' +
        esc(c) + '</option>'
      ).join('');
    if (cur !== 'all' && !chapters.includes(cur)) {
      this.chapterFilter = 'all'; sel.value = 'all';
    }
  },

  _visibleRows() {
    let rows;
    if (this.filter === 'all') rows = this.all;
    else if (this.filter === 'corrected') {
      rows = this.all.filter(r => r.status === 'resolved' && r.corrected);
    } else {
      rows = this.all.filter(r => r.status === this.filter);
    }
    if (this.chapterFilter !== 'all') {
      rows = rows.filter(r => this.chapterFor(r.fileId) === this.chapterFilter);
    }
    if (this.reasonFilter !== 'all') {
      rows = rows.filter(r => r.reason === this.reasonFilter);
    }
    if (this.searchTerm) {
      const q = this.searchTerm;
      rows = rows.filter(r =>
        (r.questionSnapshot || '').toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q) ||
        (r.reportedBy || '').toLowerCase().includes(q));
    }
    return rows;
  },

  /* The student's options, with the answer the app marks correct and the
     one the student picked. */
  _optionsHtml(r) {
    if (!r.options || !r.options.length) return '';
    return '<div class="qr-opts">' + r.options.map((o, i) => {
      const isC = r.correctIndex === i, isP = r.chosenIndex === i;
      return '<div class="qr-opt' +
        (isC ? ' is-correct' : '') + (isP && !isC ? ' is-picked' : '') + '">' +
        '<b>' + 'ABCDEF'.charAt(i) + '.</b> ' + esc(o) +
        (isC ? ' <span class="qr-tag">\u2713 marked correct</span>' : '') +
        (isP ? ' <span class="qr-tag">\u2190 student chose</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  },

  _correctedBannerHtml(r) {
    if (!r.correctedSnapshot) return '';
    const cs = r.correctedSnapshot;
    const opts = Array.isArray(cs.options) ? cs.options : [];
    return '<div class="banner banner-accent" style="margin-top:var(--sp-3);align-items:flex-start">' +
      '<i class="ph ph-check-circle"></i>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:700;font-size:var(--fs-foot)">Corrected to</div>' +
        '<div class="t-callout" style="margin-top:3px;line-height:1.5;color:var(--ink)">' +
          esc(String(cs.q || '').slice(0, 260)) +
        '</div>' +
        (opts.length
          ? '<div class="t-cap" style="margin-top:4px;line-height:1.5">' +
              opts.map((o, i) =>
                String.fromCharCode(65 + i) + ') ' + esc(String(o).slice(0, 70)) +
                (i === cs.correct ? ' <b style="color:var(--accent)">\u2713</b>' : '')
              ).join('  \u00b7  ') +
            '</div>'
          : '') +
      '</div>' +
    '</div>';
  },

  render(reports) {
    this.all = reports || [];
    this._chapterOptions();
    BADGES.update();

    const trunc = $('qr-trunc');
    if (trunc) {
      trunc.innerHTML = ADMIN.data.qreportsTruncated
        ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' +
          this.all.length + ' of ' + ADMIN.data.qreportsTotalCount + ' reports.</span></div>'
        : '';
    }

    const box = $('qreports-list');
    if (!box) return;
    const rows = this._visibleRows();
    if (!rows.length) {
      box.innerHTML = this.all.length
        ? '<div class="empty"><i class="ph ph-magnifying-glass"></i>' +
          '<div class="t">No reports match</div>' +
          '<div class="d">Try a different status or chapter.</div>' +
          '<div class="a"><button class="btn btn-quiet" ' +
            'data-on-click="ADMIN_REPORT.setFilter(\'all\')">Show all reports</button></div></div>'
        : '<div class="empty"><i class="ph ph-flag"></i>' +
          '<div class="t">Nothing flagged</div>' +
          '<div class="d">When a student reports a broken question, it lands here.</div></div>';
      $('qr-pg').innerHTML = '';
      return;
    }

    const per = ADMIN.state.qrPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.qrPage > total) ADMIN.state.qrPage = total;
    const page = rows.slice((ADMIN.state.qrPage - 1) * per, ADMIN.state.qrPage * per);
    const canManage = ADMIN.can('qreports_manage');

    box.innerHTML = page.map(r =>
      '<div class="sub-card">' +
        '<div class="sub-top">' +
          '<div class="flex g2 wrap center">' +
            '<span class="badge st-' + esc(r.status || 'open') + '">' +
              esc(statusLabel(r.status || 'open')) + '</span>' +
            '<span class="badge flat">' +
              esc(REPORT_REASON_LABELS[r.reason] || r.reason) + '</span>' +
            '<span class="badge flat">' + esc(this.chapterFor(r.fileId)) + '</span>' +
          '</div>' +
          '<div class="t-cap">' + esc(r.reportedBy) + ' \u00b7 ' +
            relTime(r.reportedAt) + '</div>' +
        '</div>' +
        (r.openReporters > 1
          ? '<div class="banner banner-warning mt3"><i class="ph ph-users-three"></i>' +
            '<span><b>' + r.openReporters + ' students</b> have reported this question. ' +
            'It is very likely wrong.</span></div>'
          : '') +
        '<div class="t-callout mt3" style="color:var(--ink);line-height:1.6">' +
          esc(r.questionSnapshot || 'The question text was not captured.') +
        '</div>' +
        this._optionsHtml(r) +
        this._correctedBannerHtml(r) +
        '<div class="t-cap mt2">' +
          esc(REPORT_SECTION_LABELS[r.section] || 'Section not recorded') +
          (r.questionNumber ? ' \u00b7 question ' + r.questionNumber + ' in its file' : '') +
          (r.fileId && r.fileId !== 'local'
            ? ' \u00b7 <a href="https://drive.google.com/file/d/' +
              encodeURIComponent(r.fileId) + '/view" target="_blank" rel="noopener">' +
              'open the file in Drive</a>'
            : '') +
          (r.status !== 'open' && r.resolvedBy
            ? ' \u00b7 closed by ' + esc(r.resolvedBy) +
              (r.corrected ? " (students' apps told to refresh)" : '')
            : '') +
        '</div>' +
        (r.note ? '<div class="sub-feedback">' + esc(r.note) + '</div>' : '') +
        (canManage
          ? '<div class="sub-acts">' +
            '<button class="btn btn-secondary btn-sm" ' +
              'data-on-click="ADMIN_REPORT.editQ(\'' + escAttrJs(r.id) + '\')">' +
              '<i class="ph ph-pencil-simple"></i> Fix the question</button>' +
            '<button class="icon-btn sm" ' +
              'data-on-click="ADMIN_REPORT.history(\'' + escAttrJs(r.fileId) + '\')" ' +
              'title="Correction history for this file" ' +
              'aria-label="Correction history for this file">' +
              '<i class="ph ph-clock-counter-clockwise"></i></button>' +
            (r.status !== 'resolved'
              ? '<button class="btn btn-primary btn-sm" ' +
                'title="You corrected the question file. Every student\'s app replaces its copy." ' +
                'data-on-click="ADMIN_REPORT.setStatus(\'' + escAttrJs(r.id) + '\',\'resolved\')">' +
                'Mark fixed</button>' +
                '<button class="btn btn-secondary btn-sm" ' +
                'title="The question was already right. Nothing changes for students." ' +
                'data-on-click="ADMIN_REPORT.setStatus(\'' + escAttrJs(r.id) + '\',\'resolved\',false)">' +
                'No change needed</button>'
              : '') +
            (r.status !== 'dismissed'
              ? '<button class="btn btn-secondary btn-sm" ' +
                'data-on-click="ADMIN_REPORT.setStatus(\'' + escAttrJs(r.id) + '\',\'dismissed\')">' +
                'Dismiss</button>'
              : '') +
            (r.status !== 'open'
              ? '<button class="btn btn-quiet btn-sm" ' +
                'data-on-click="ADMIN_REPORT.setStatus(\'' + escAttrJs(r.id) + '\',\'open\')">' +
                'Reopen</button>'
              : '') +
            '<button class="icon-btn sm danger" style="margin-left:auto" ' +
              'data-on-click="ADMIN_REPORT.del(\'' + escAttrJs(r.id) + '\')" ' +
              'aria-label="Delete report"><i class="ph ph-trash"></i></button>' +
            '</div>'
          : '') +
      '</div>').join('');

    PAGINATION.render('qr-pg', ADMIN.state.qrPage, total, 'ADMIN_REPORT.goPage', rows.length);
  },

  goPage(p) { ADMIN.state.qrPage = p; this.render(this.all); UI.scrollTop(); },

  /* Open the reported question in an editor. Captures the report context
     (reason, note, reporter) so the backend can attach it to the correction
     event it writes. */
  async editQ(id) {
    const r = this.all.find(x => x.id === id);
    if (!r) return;
    const m = String(r.uid || '').match(/^(.+)_(\d+)$/);
    if (!m) return TOAST.show('This report has no question reference', 'error');
    MODAL.sheet('Fix the question',
      '<div class="banner banner-info"><i class="ph ph-spinner"></i>' +
        '<span>Loading the current file version...</span></div>' +
      '<div class="field"><label>Reported question</label>' +
        '<div class="t-callout" style="line-height:1.6">' +
          esc(r.questionSnapshot || 'The question text was not captured.') +
        '</div></div>' +
      this._optionsHtml(r) +
      '<div class="t-cap mt3">The editable fields appear as soon as Drive responds.</div>');
    try {
      const res = await ADMIN.post('adminGetQuestion', {
        fileId: m[1], index: Number(m[2])
      });
      if (!res.success) throw new Error(res.error || 'Could not load that question.');
      const q = res.question;
      this._eq = {
        reportId: id,
        fileId: m[1],
        index: Number(m[2]),
        q: q,
        reportReason: r.reason || null,
        reportNote: r.note || null,
        reportedBy: r.reportedBy || null
      };
      const letters = 'ABCDEF';
      const opts = q.options || [];
      $('bd-sheet').innerHTML =
        '<p class="t-foot mb3">Drive keeps the previous version in its version history. ' +
        'Every student\'s app replaces its copy within minutes of opening online, and updates ' +
        'the questions they saved for review. Correct questions in place: do not delete or ' +
        'reorder questions in the file, because students\' progress is tied to each ' +
        'question\'s position.</p>' +
        (r.note
          ? '<div class="banner banner-info"><i class="ph ph-chat-text"></i>' +
            '<span>Student note: ' + esc(r.note) + '</span></div>'
          : '') +
        (r.openReporters > 1
          ? '<div class="banner banner-warning"><i class="ph ph-users-three"></i>' +
            '<span><b>' + r.openReporters + ' students</b> reported this question — the fix will ' +
            'close all of their reports.</span></div>'
          : '') +
        '<div class="field"><label for="eq-q">Question</label>' +
          '<textarea class="textarea" id="eq-q" style="min-height:96px">' +
          esc(q.q) + '</textarea></div>' +
        opts.map((o, i) =>
          '<div class="field"><label for="eq-o' + i + '">Option ' + letters[i] + '</label>' +
          '<input class="input" type="text" id="eq-o' + i + '" value="' + esc(o) + '"></div>'
        ).join('') +
        '<div class="field"><label for="eq-c">Correct answer</label>' +
          '<select class="select" id="eq-c">' +
            (q.correct === null ? '<option value="">Choose\u2026</option>' : '') +
            opts.map((o, i) =>
              '<option value="' + i + '"' + (q.correct === i ? ' selected' : '') + '>' +
              letters[i] + '</option>'
            ).join('') +
          '</select></div>' +
        '<div class="field"><label for="eq-e">Explanation</label>' +
          '<textarea class="textarea" id="eq-e">' + esc(q.explanation) + '</textarea></div>' +
        '<div class="field"><label for="eq-admin-note">Your note <span class="dim">(optional, for the audit trail)</span></label>' +
          '<input class="input" type="text" id="eq-admin-note" maxlength="200" ' +
          'placeholder="e.g. Corrected per IS 456:2000 clause 6.1.3"></div>' +
        '<label class="perm-row mb4"><input type="checkbox" id="eq-done" checked>' +
          '<span>Mark this report as fixed</span></label>' +
        '<div class="flex g2">' +
          '<button class="btn btn-quiet" style="flex:1" ' +
            'data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
          '<button class="btn btn-primary" style="flex:1" id="eq-save" ' +
            'data-on-click="ADMIN_REPORT.saveQ()">Save the fix</button>' +
        '</div>';
    } catch (e) {
      $('bd-sheet').innerHTML =
        '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i>' +
        '<span>' + esc(e.message) + '</span></div>';
    }
  },

  async saveQ() {
    const c = this._eq;
    if (!c) return;
    const opts = [];
    for (let i = 0; i < c.q.options.length; i++) opts.push($('eq-o' + i).value.trim());
    if (opts.some(o => !o)) return TOAST.show('Every option needs text', 'error');
    const qt = $('eq-q').value.trim();
    if (!qt) return TOAST.show('The question text cannot be empty', 'error');
    const cv = $('eq-c').value;
    if (cv === '') return TOAST.show('Choose the correct answer', 'error');
    const adminNote = (($('eq-admin-note') && $('eq-admin-note').value) || '').trim().slice(0, 200);
    const btn = $('eq-save');
    btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateQuestion', {
        fileId: c.fileId,
        index: c.index,
        expectedQ: c.q.q,
        fields: JSON.stringify({
          q: qt,
          options: opts,
          correct: Number(cv),
          explanation: $('eq-e').value.trim()
        }),
        /* The backend attaches these to the correction event it writes. */
        reportId: c.reportId,
        reportReason: c.reportReason,
        adminNote: adminNote || c.reportNote || null
      });
      if (!res.success) throw new Error(res.error || 'Could not save.');
      TOAST.show('Saved. Students get the fix the next time they open the app online.',
        'success', 5000);
      ADMIN_CORRECTIONS.invalidate();
      const done = $('eq-done') && $('eq-done').checked;
      MODAL.close('sheet');
      if (done) this.setStatus(c.reportId, 'resolved');
    } catch (e) { TOAST.show(e.message, 'error', 6000); }
    btn.classList.remove('loading');
  },

  /* ── Correction history for a file ───────────────────────────────────
     Every edit made through this console is logged to admin_logs with
     action='question_corrected', target=fileId, and a JSON details payload
     carrying the before/after diff. This reads those entries and offers
     a "Restore" button per edit.
     ─────────────────────────────────────────────────────────────────── */
  async history(fileId) {
    if (!fileId) return TOAST.show('No file id on this report', 'warning');
    MODAL.sheet('Correction history — ' + fileId,
      '<div class="skeleton sk-100"></div><div class="skeleton sk-80"></div>');
    try {
      const res = await ADMIN.post('adminListLogs', { limit: 1000 });
      if (!res.success) throw new Error(res.error || 'Could not load history.');
      const rows = (res.logs || [])
        .filter(l => l.action === 'question_corrected' && l.target === fileId)
        .map(l => {
          let diff = null;
          if (l.details) {
            try {
              const parsed = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
              if (parsed && parsed.before && parsed.after) diff = parsed;
            } catch (e) { /* not a JSON log entry — skip */ }
          }
          return Object.assign({}, l, { diff });
        })
        .filter(r => r.diff);

      if (!rows.length) {
        $('bd-sheet').innerHTML =
          '<div class="empty"><i class="ph ph-clock-counter-clockwise"></i>' +
          '<div class="t">No corrections yet</div>' +
          '<div class="d">Edits made through this console will show up here.</div>' +
          (res.truncated
            ? '<div class="t-foot mt3">Only the ' + (res.logs || []).length + ' most recent log entries ' +
              'are loaded, so older corrections may be further back than that.</div>'
            : '') +
          '</div>';
        this._historyCache = [];
        return;
      }

      this._historyCache = rows;
      const letters = 'ABCDEF';
      $('bd-sheet').innerHTML = rows.map((r, i) => {
        const b = r.diff.before, a = r.diff.after;
        const optsB = Array.isArray(b.options) ? b.options : [];
        const optsA = Array.isArray(a.options) ? a.options : [];
        return '<div class="sub-card" style="margin-bottom:var(--sp-3)">' +
          '<div class="sub-top">' +
            '<div>' +
              '<div class="sub-user"><span class="avatar">' +
                esc(initials(r.admin || '?')) + '</span>' + esc(r.admin || 'unknown') +
              '</div>' +
              '<div class="sub-meta">' +
                '<span title="' + esc(fullTime(r.timestamp)) + '">' + relTime(r.timestamp) + '</span>' +
                '<span>index ' + (r.diff.index != null ? r.diff.index : '?') + '</span>' +
                (r.diff.adminNote ? '<span>note: ' + esc(r.diff.adminNote) + '</span>' : '') +
                (r.diff.reportId ? '<span>from report</span>' : '') +
              '</div>' +
            '</div>' +
            '<button class="btn btn-quiet btn-sm" ' +
              'data-on-click="ADMIN_REPORT.restore(\'' + escAttrJs(fileId) + '\',' + i + ')" ' +
              'title="Revert this edit (a backup is taken, and the revert is logged)">' +
              '<i class="ph ph-arrow-counter-clockwise"></i> Restore before' +
            '</button>' +
          '</div>' +
          '<div class="t-callout mt2" style="line-height:1.55;color:var(--ink-2)">' +
            '<b style="color:var(--ink)">Before:</b> ' +
            esc(String(b.q || '').slice(0, 200)) +
            (optsB.length
              ? '<div class="t-cap" style="margin-top:2px">' +
                  optsB.map((o, j) =>
                    letters[j] + ') ' + esc(String(o).slice(0, 60)) +
                    (j === b.correct ? ' \u2713' : '')
                  ).join(' \u00b7 ') +
                '</div>'
              : '') +
          '</div>' +
          '<div class="t-callout mt1" style="line-height:1.55;color:var(--ink)">' +
            '<b>After:</b> ' + esc(String(a.q || '').slice(0, 200)) +
            (optsA.length
              ? '<div class="t-cap" style="margin-top:2px">' +
                  optsA.map((o, j) =>
                    letters[j] + ') ' + esc(String(o).slice(0, 60)) +
                    (j === a.correct ? ' \u2713' : '')
                  ).join(' \u00b7 ') +
                '</div>'
              : '') +
          '</div>' +
        '</div>';
      }).join('');
    } catch (e) {
      $('bd-sheet').innerHTML =
        '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i>' +
        '<span>' + esc(e.message) + '</span></div>';
    }
  },

  async restore(fileId, idx) {
    const h = (this._historyCache || [])[idx];
    if (!h || !h.diff || !h.diff.before) {
      return TOAST.show('No diff data on that entry.', 'error');
    }
    const b = h.diff.before;
    const a = h.diff.after;
    const ok = await CONFIRM.ask({
      title: 'Restore previous version?',
      body: 'This puts the question back to what it was before ' +
            '<b>' + esc(h.admin || 'this edit') + '</b> (' + esc(relTime(h.timestamp)) + '). ' +
            'A backup is taken first, and the change is logged again.',
      confirmText: 'Restore', tone: 'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminUpdateQuestion', {
        fileId,
        index: h.diff.index,
        expectedQ: a.q,                 /* concurrency guard: current state must match this */
        fields: JSON.stringify({
          q: b.q,
          options: b.options,
          correct: b.correct,
          explanation: b.explanation || ''
        }),
        reportId: null,
        reportReason: null,
        adminNote: 'Restored to pre-' + (h.admin || 'admin') + ' state'
      });
      if (!res.success) throw new Error(res.error || 'Restore failed.');
      TOAST.show('Question restored.', 'success');
      ADMIN_CORRECTIONS.invalidate();
      MODAL.close('sheet');
      this.load();
    } catch (e) { TOAST.show(e.message, 'error', 6000); }
    BUSY.stop();
  },

  exportCSV() {
    const rows = this._visibleRows();
    if (!rows.length) return TOAST.show('Nothing to export', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['ID', 'Status', 'Reason', 'Chapter', 'Section', 'Question no.', 'Question',
       'Marked correct', 'Student chose', 'Students reporting', 'Note',
       'Reported by', 'Reported at', 'Closed by'],
      rows.map(r => [
        r.id, r.status,
        REPORT_REASON_LABELS[r.reason] || r.reason,
        this.chapterFor(r.fileId),
        REPORT_SECTION_LABELS[r.section] || '',
        r.questionNumber || '',
        r.questionSnapshot || '',
        r.correctIndex == null ? '' : 'ABCDEF'.charAt(r.correctIndex),
        r.chosenIndex == null ? '' : 'ABCDEF'.charAt(r.chosenIndex),
        r.openReporters || '',
        r.note || '',
        r.reportedBy, r.reportedAt, r.resolvedBy || ''
      ])
    ), 'question_reports.csv');
  },

  exportCorrectionsJSON() { return ADMIN_CORRECTIONS.exportJSON(); },

  async setStatus(id, status, corrected) {
    const item = this.all.find(r => r.id === id);
    const prev = item && item.status;
    if (item) { item.status = status; this.render(this.all); }
    try {
      const body = { id: id, status: status };
      if (corrected === false) body.corrected = false;
      const res = await ADMIN.post('adminUpdateQuestionReportStatus', body);
      if (!res.success) throw new Error(res.error || 'Update failed.');
      TOAST.show('Report marked ' + statusLabel(status).toLowerCase() +
        (res.alsoClosed
          ? ' (' + res.alsoClosed + ' more report' +
            (res.alsoClosed === 1 ? '' : 's') + ' on this question closed too)'
          : ''),
        'success', 3200);
      if (status === 'resolved' && corrected !== false) {
        ADMIN_CORRECTIONS.invalidate();
      }
      if (res.alsoClosed) this.load();
    } catch (e) {
      if (item) { item.status = prev; this.render(this.all); }
      TOAST.show(e.message, 'error');
    }
  },

  refreshFile() {
    MODAL.sheet('Refresh a question file',
      '<p class="t-foot mb3">Edited a question file directly in Drive? ' +
      'Paste its file id here and every student\'s app replaces its copy, and ' +
      'updates the questions it saved for review, within minutes. ' +
      '(Fixing a question from a report does this for you.)</p>' +
      '<div class="field"><label for="rf-id">File id</label>' +
        '<input class="input" type="text" id="rf-id" ' +
        'placeholder="the long code in the file\'s Drive link" autocomplete="off">' +
      '</div>' +
      '<div class="flex g2 mt4">' +
        '<button class="btn btn-quiet" style="flex:1" ' +
          'data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:2" id="rf-go" ' +
          'data-on-click="ADMIN_REPORT.doRefreshFile()">' +
          'Refresh on students\' phones</button>' +
      '</div>');
  },

  async doRefreshFile() {
    const id = ($('rf-id').value || '').trim();
    if (!/^[A-Za-z0-9_\-/.]{5,200}$/.test(id)) {
      $('rf-id').classList.add('invalid');
      return TOAST.show('That does not look like a file id or path', 'warning');
    }
    const btn = $('rf-go');
    btn.disabled = true;
    try {
      const res = await ADMIN.post('adminMarkFileCorrected', { fileId: id });
      if (!res.success) throw new Error(res.error || 'Could not refresh.');
      ADMIN_CORRECTIONS.invalidate();
      MODAL.close('sheet');
      TOAST.show('Done. Students\' apps will replace that file.', 'success', 4000);
    } catch (e) {
      btn.disabled = false;
      TOAST.show(e.message, 'error');
    }
  },

  async del(id) {
    const ok = await CONFIRM.ask({
      title: 'Delete report',
      body: 'Delete this report permanently?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      const res = await ADMIN.post('adminDeleteQuestionReport', { id: id });
      if (!res.success) throw new Error(res.error || 'Delete failed.');
      this.all = this.all.filter(r => r.id !== id);
      this.render(this.all);
      TOAST.show('Report deleted', 'success');
    } catch (e) { TOAST.show(e.message, 'error'); }
  }
};

window.ADMIN_REPORT = ADMIN_REPORT;

/* Backward compat: admin.html calls QREPORTS.xxx everywhere. */
window.QREPORTS = ADMIN_REPORT;

})();
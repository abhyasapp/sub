/* ═══════════════════════════════════════════════════════════════════════
   report/report-shared.js (v1.46) — constants and pure helpers used by
   BOTH the student reporting code (userreport.js) and the admin one
   (adminreport.js).

   Also exports qReportHtml, the small "Report an issue" button that goes
   on every question card in quiz-engine.js, review.js and wrong-bank-ui.js.

   No DOM, no network, no storage. Classic script. Load it BEFORE
   report-matching.js, userreport.js and adminreport.js.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

/* The words shown for each reason and each section. The student form and
   the admin screen both read these. The codes are what the server stores;
   do not rename them. */
const REPORT_REASON_LABELS = {
  wrong_answer:  'Wrong answer marked',
  unclear:       'Unclear wording or options',
  typo:          'Typo or formatting',
  incomplete:    'Incomplete question',
  image_problem: 'Image, table or diagram problem',
  other:         'Something else'
};
const REPORT_SECTION_LABELS = {
  practice: 'Chapter practice', exam: 'Timed exam',
  'daily-paper': 'Daily 75-mark paper', weekly: 'Weekly test',
  hourly: 'Hourly 50', results: 'Results review',
  'review-missed': 'Missed list', 'review-saved': 'Saved list',
  'review-flagged': 'Flagged list', other: 'Other'
};

/* Where the offline report queue lives on the device (survives a restart). */
const REPORT_QUEUE_KEY = 'abhyas_report_queue';

/* ═══════════════════════════════════════════════════════════════════════
   OFFLINE REPORT QUEUE (v1.33, pure, unit-tested)
   A report written offline (or one that failed to send) waits here and is
   sent when the device is back online. Same question + same reason is kept
   once. The queue is capped so it can never grow without limit.
   ═══════════════════════════════════════════════════════════════════════ */
const REPORT_REASONS = ['wrong_answer', 'unclear', 'typo', 'incomplete', 'image_problem', 'other'];
const REPORT_QUEUE_MAX = 20;

function reportQueueAdd(queue, report, now) {
  const q = Array.isArray(queue) ? queue.filter(x => x && x.uid) : [];
  if (!report || !report.uid || REPORT_REASONS.indexOf(report.reason) === -1) return q;
  const note = String(report.note || '').slice(0, 500);
  const dup = q.findIndex(x => x.uid === report.uid && x.reason === report.reason);
  const entry = Object.assign({}, report, { note, queuedAt: Number(now) || Date.now() });
  if (dup !== -1) q[dup] = entry; else q.push(entry);
  return q.slice(-REPORT_QUEUE_MAX);
}

function reportQueueRemove(queue, report) {
  return (Array.isArray(queue) ? queue : []).filter(
    x => !(x && report && x.uid === report.uid && x.reason === report.reason)
  );
}

/* Which section a reported question came from. `where` is 'results' or
   'review-missed' / 'review-saved' / 'review-flagged'. */
function reportSection(scope, mode, where) {
  if (where) return where;
  const sc = scope || {};
  if (sc.weeklyId) return 'weekly';
  if (sc.loksewaMock) return 'daily-paper';
  if (sc.hourlySprint) return 'hourly';
  return mode === 'exam' ? 'exam' : 'practice';
}

/* ═══════════════════════════════════════════════════════════════════════
   qReportHtml — the "Report an issue" button. Returns '' for questions
   that cannot be reported (local files, withdrawn questions), so callers
   can interpolate it unconditionally:

     qReportHtml(q, `USER_REPORT.exam(${qi})`)
     qReportHtml(q, `USER_REPORT.reportList(${kindJson},${uidJson})`)
     qReportHtml(q, `USER_REPORT.result(${i})`, `Report an issue with Q${i+1}`)

   Uses `esc` (from js/core/text.js) to HTML-escape the code that ends up
   inside the data-on-click attribute — an onClickCode containing a
   double-quote (e.g. `USER_REPORT.reportList("bk","fid_3")`) would break
   the attribute otherwise.
   ═══════════════════════════════════════════════════════════════════════ */
function qReportHtml(q, onClickCode, ariaLabel) {
  if (!q || !q.uid) return '';
  if (q.fileId === 'local' || String(q.uid).indexOf('local_') === 0) return '';
  if (q._withdrawn) return '';
  const label = String(ariaLabel || 'Report an issue with this question');
  const code  = String(onClickCode || '');
  return '<button type="button" class="ib" ' +
           'data-on-click="' + esc(code) + '" ' +
           'title="Report an issue with this question" ' +
           'aria-label="' + esc(label) + '">' +
           '<i class="ph ph-warning-circle"></i>' +
         '</button>';
}
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Abhyas v1.15 patch  -  PHASE 2  (run this AFTER patch.py / v1.14).

HOW TO RUN
    1. Put this file in the ROOT of your repo (next to index.html).
    2. Commit or stash your work first.
    3. Run:   python patch2.py            (Windows:  py patch2.py)
       Preview only, changes nothing:    python patch2.py --dry-run
       Keep this file after running:     python patch2.py --keep
       Skip the asset download step:     python patch2.py --no-vendor

WHAT IT ADDS
    Study flow   unseen-first practice, real "weak topics", single-book picker,
                 question grid + mark-for-review in timed tests, exam countdown card
    Weekly test  start recorded on the server (no restart-to-peek), safe resume,
                 server-side window check, rank/percentile once the window closes
    Backend      Drive upload no longer holds the global lock, cached settings,
                 nightly spreadsheet backup, client error log
    Reliability  crash reports (short, no personal data), friendly "signed in
                 elsewhere" message, self-hosted fonts / KaTeX / pdf.js / pdf-lib
                 (via vendor-assets.py, which stays in your repo)

SAFETY
    Same as patch.py: every anchor is checked first, JavaScript is syntax-checked
    with Node (if installed), originals go to .patch-backup-1.15/, nothing is
    written if anything fails, CRLF/LF endings are preserved, and this file
    deletes itself when done.
"""
import os
import re
import sys
import shutil
import subprocess
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(HERE, ".patch-backup-1.15")
DRY = "--dry-run" in sys.argv
KEEP = "--keep" in sys.argv or DRY
NO_VENDOR = "--no-vendor" in sys.argv


DATA = r'''
@@@ FILE version.js

@@@ EDIT v2-bump
@@@ OLD
const APP_VERSION = '1.14';
@@@ NEW
/* 1.15 - phase 2: unseen-first practice, real weak-topic mode, question grid
          and mark-for-review, exam countdown, weekly test start/resume/rank
          recorded on the server, safer uploads, cached settings, nightly
          spreadsheet backup, client error log, self-hosted assets. */
const APP_VERSION = '1.15';
@@@ END


@@@ FILE code.gs

@@@ EDIT gs2-version
@@@ OLD
const APP_VERSION = "1.14";
@@@ NEW
const APP_VERSION = "1.15";
@@@ END

@@@ EDIT gs2-sheetname
@@@ OLD
"AdminPermissions";
@@@ NEW
"AdminPermissions";
const WEEKLYSTARTS_SHEET     = "WeeklyStarts";
@@@ END

@@@ EDIT gs2-headers
@@@ OLD
const ADMIN_PERM_HEADERS = ["username","featureKey","enabled","updatedAt","updatedBy"];
@@@ NEW
const ADMIN_PERM_HEADERS = ["username","featureKey","enabled","updatedAt","updatedBy"];
const WEEKLYSTART_HEADERS = ["username","weeklyId","startedAt"];
/* Keep equal to WEEKLY_EXAM_WINDOW_HOURS (12) in app.js. */
const WEEKLY_EXAM_WINDOW_MS = 12 * 60 * 60 * 1000;
@@@ END

@@@ EDIT gs2-getter
@@@ OLD
function getSubjSubmissionsSheet_() {
@@@ NEW
function getWeeklyStartsSheet_() { return _getOrCreateSheet_(WEEKLYSTARTS_SHEET, WEEKLYSTART_HEADERS, [1,2], "#00897b", SpreadsheetApp.BandingTheme.TEAL, 300); }

function getSubjSubmissionsSheet_() {
@@@ END

@@@ EDIT gs2-route-client
@@@ OLD
case "checksession":
@@@ NEW
case "logclienterror":       result = logClientError(e.parameter); break;
      case "checksession":
@@@ END

@@@ EDIT gs2-route-weekly
@@@ OLD
case "submitweeklyattempt":
@@@ NEW
case "startweeklyattempt":   result = startWeeklyAttempt(e.parameter); break;
      case "getweeklystanding":    result = getWeeklyStanding(e.parameter); break;
      case "submitweeklyattempt":
@@@ END

@@@ EDIT gs2-weekly-functions
@@@ OLD
function getWeeklyAttempt(p) {
@@@ NEW
/* v1.15: the moment a student opens the graded weekly test, the start is
   recorded here. Restarting later cannot be used to look at the questions and
   try again: a second start is a "resume", and the client only allows that on
   the device that still holds the saved test. */
function startWeeklyAttempt(p) {
  const weeklyId = String(p.weeklyId || "").trim();
  if (!weeklyId) return { success: false, error: "Missing parameters." };
  const auth = authUser_(p);
  if (!auth.ok) return auth.error;
  const gate = requireAccess_(auth);
  if (gate) return gate;
  const username = auth.username;

  const wsFound = findWeeklySetRow_(getWeeklySetsSheet_(), weeklyId);
  if (!wsFound) return { success: false, error: "Weekly set not found." };
  const ws = rowToWeeklySet_(wsFound.row);
  const release = new Date(ws.releaseAt).getTime();
  if (isNaN(release) || Date.now() < release) return { success: false, error: "This weekly set is not open yet." };

  return withLock_(() => {
    const done = findWeeklyAttemptRow_(getWeeklyAttemptsSheet_(), username, weeklyId);
    if (done) return { success: true, alreadyAttempted: true, attempt: rowToWeeklyAttempt_(done.row) };
    if (Date.now() > release + WEEKLY_EXAM_WINDOW_MS) return { success: true, windowClosed: true };

    const sheet = getWeeklyStartsSheet_();
    const data = sheet.getDataRange().getValues();
    const target = username.toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === target && String(data[i][1]) === weeklyId) {
        return { success: true, resumed: true, startedAt: Number(data[i][2]) || 0, serverNow: Date.now() };
      }
    }
    const now = Date.now();
    sheet.appendRow([username, weeklyId, now]);
    _invalidateSheet_(WEEKLYSTARTS_SHEET);
    return { success: true, resumed: false, startedAt: now, serverNow: now };
  });
}

/* Rank and percentile, shown only after the exam window closes. */
function getWeeklyStanding(p) {
  const weeklyId = String(p.weeklyId || "").trim();
  if (!weeklyId) return { success: false, error: "Missing parameters." };
  const auth = authUser_(p);
  if (!auth.ok) return auth.error;
  const gate = requireAccess_(auth);
  if (gate) return gate;

  const wsFound = findWeeklySetRow_(getWeeklySetsSheet_(), weeklyId);
  if (!wsFound) return { success: false, error: "Weekly set not found." };
  const ws = rowToWeeklySet_(wsFound.row);
  const release = new Date(ws.releaseAt).getTime();
  if (isNaN(release) || Date.now() <= release + WEEKLY_EXAM_WINDOW_MS) {
    return { success: true, ready: false, message: "Rankings appear when the exam window closes." };
  }

  const data = _cachedSheetData_(WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_).data;
  const me = auth.username.toLowerCase();
  const scores = [];
  let mine = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== weeklyId) continue;
    const total = Number(data[i][3] || 0);
    const correct = Number(data[i][4] || 0);
    const pct = total ? (correct / total) * 100 : 0;
    scores.push(pct);
    if (String(data[i][0]).toLowerCase().trim() === me) mine = pct;
  }
  if (mine === null) return { success: true, ready: true, attempted: false };
  const better = scores.filter(s => s > mine).length;
  const rank = better + 1;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    success: true, ready: true, attempted: true,
    rank, total: scores.length,
    percentile: scores.length > 1 ? Math.round(((scores.length - rank) / (scores.length - 1)) * 100) : 100,
    avgPct: Math.round(avg)
  };
}

function getWeeklyAttempt(p) {
@@@ END

@@@ EDIT gs2-submit-window
@@@ OLD
if (isNaN(releaseTime) || Date.now() < releaseTime) return { success: false, error: "This weekly set hasn't been released yet." };
@@@ NEW
if (isNaN(releaseTime) || Date.now() < releaseTime) return { success: false, error: "This weekly set hasn't been released yet." };
  if (Date.now() > releaseTime + WEEKLY_EXAM_WINDOW_MS + 3 * 60 * 60 * 1000) return { success: false, error: "The exam window for this set has closed." };
@@@ END

@@@ EDIT gs2-purge-starts
@@@ OLD
    [WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_, 0],
@@@ NEW
    [WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_, 0],
    [WEEKLYSTARTS_SHEET, getWeeklyStartsSheet_, 0],
@@@ END

@@@ EDIT gs2-upload-before-lock
@@@ OLD
const parsed = parsePdfDataUrl_(pdfData, 12 * 1024 * 1024);
  if (parsed.error) return { success: false, error: parsed.error };
@@@ NEW
const parsed = parsePdfDataUrl_(pdfData, 12 * 1024 * 1024);
  if (parsed.error) return { success: false, error: parsed.error };

  /* v1.15: the slow Drive upload happens BEFORE the script-wide lock is taken,
     so several students uploading at once no longer cause "server busy". */
  let pdfFileId = "", pdfUrl = "";
  try {
    const safeName = `${username}_${kind}_${Date.now()}.pdf`;
    const folder = getOrCreateFolder_("SubjectiveAnswers");
    const blob = Utilities.newBlob(parsed.bytes, "application/pdf", safeName);
    const file = folder.createFile(blob);
    pdfFileId = file.getId();
    pdfUrl = file.getUrl();
  } catch (e) { return { success: false, error: "Drive upload failed: " + (e.message || e) }; }
@@@ END

@@@ EDIT gs2-upload-remove-inlock
@@@ OLD
    let pdfFileId = "", pdfUrl = "";
    try {
      const safeName = `${username}_${kind}_${Date.now()}.pdf`;
      const folder = getOrCreateFolder_("SubjectiveAnswers");
      const blob = Utilities.newBlob(parsed.bytes, "application/pdf", safeName);
      const file = folder.createFile(blob);
      pdfFileId = file.getId();
      pdfUrl = file.getUrl();
    } catch (e) { return { success: false, error: "Drive upload failed: " + (e.message || e) }; }
@@@ NEW
    /* (file was uploaded before the lock was taken; see above) */
@@@ END

@@@ EDIT gs2-dupe-trash
@@@ OLD
return { success: false, alreadySubmitted: true, error: "You've already submitted this question." };
@@@ NEW
try { DriveApp.getFileById(pdfFileId).setTrashed(true); } catch (e2) {}
          return { success: false, alreadySubmitted: true, error: "You've already submitted this question." };
@@@ END

@@@ EDIT gs2-settings-cache
@@@ OLD
function getSettings() {
@@@ NEW
/* v1.15: the payment screen polls this every 20 s and it carries the QR image,
   so it is cached for two minutes (cleared whenever an admin saves settings). */
function getSettings() {
  const cache = CacheService.getScriptCache();
  try {
    const hit = cache.get("pub_settings");
    if (hit) return { success: true, settings: JSON.parse(hit) };
  } catch (e) {}
  const res = getSettingsUncached_();
  try { if (res && res.success) cache.put("pub_settings", JSON.stringify(res.settings), 120); } catch (e) {}
  return res;
}
function getSettingsUncached_() {
@@@ END

@@@ EDIT gs2-settings-invalidate count=3
@@@ OLD
_invalidateSheet_(SETTINGS_SHEET);
@@@ NEW
_invalidateSheet_(SETTINGS_SHEET); CacheService.getScriptCache().remove("pub_settings");
@@@ END

@@@ EDIT gs2-client-error-and-backup
@@@ OLD
function getOrCreateFolder_(name) {
@@@ NEW
/* Short crash reports from the app (page, message, browser). Public, rate
   limited, and never contains answers or personal details. Shows up in the
   admin Activity log as "Client Error". */
function logClientError(p) {
  if (!checkRateLimit_("clienterr", 20, 60000)) return { success: true };
  const clip = (v, n) => sanitizeSheetField_(String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, n));
  logAction_("client", "Client Error", clip(p.page, 60),
    clip(p.msg, 200) + " @ " + clip(p.src, 80) + ":" + clip(p.line, 8) + " v" + clip(p.v, 10) + " " + clip(p.ua, 80));
  return { success: true };
}

/* Nightly copy of the whole spreadsheet into the AbhyasBackups Drive folder
   (the last 14 are kept). Installed by setup(); also safe to run by hand. */
function backupSpreadsheet() {
  const folder = getOrCreateFolder_("AbhyasBackups");
  const name = "Abhyas backup " + Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
  if (!folder.getFilesByName(name).hasNext()) {
    DriveApp.getFileById(getSpreadsheet_().getId()).makeCopy(name, folder);
  }
  const list = [];
  const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); list.push({ f, t: f.getDateCreated().getTime() }); }
  list.sort((a, b) => b.t - a.t);
  list.slice(14).forEach(x => { try { x.f.setTrashed(true); } catch (e) {} });
  return "Backup done: " + name;
}

function getOrCreateFolder_(name) {
@@@ END


@@@ FILE setup.gs

@@@ EDIT set2-starts
@@@ OLD
getWeeklyAttemptsSheet_();
@@@ NEW
getWeeklyAttemptsSheet_();
    getWeeklyStartsSheet_();
@@@ END

@@@ EDIT set2-backup-trigger
@@@ OLD
  /* v1.11: daily housekeeping for Script Properties. */
@@@ NEW
  /* v1.15: nightly copy of the spreadsheet. */
  if (!triggers.some(t => t.getHandlerFunction() === "backupSpreadsheet")) {
    ScriptApp.newTrigger("backupSpreadsheet").timeBased().everyDays(1).atHour(2).create();
  }
  /* v1.11: daily housekeeping for Script Properties. */
@@@ END


@@@ FILE shared.js

@@@ EDIT sh2-errors
@@@ OLD
async function pingBackend(gasUrl, timeoutMs = 8000) {
@@@ NEW
/* ═══════════════════════════════════════════════════════════════════════
   CRASH REPORTS (v1.15)
   Sends a SHORT technical note (page, error message, script name, app version,
   browser) to the Activity log so you find out about bugs from real phones.
   At most 5 per page load, never any answers or personal details.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  let sent = 0;
  const seen = {};
  function report(msg, src, line) {
    try {
      if (sent >= 5) return;
      msg = String(msg || '').slice(0, 200);
      if (!msg || msg === 'Script error.' || seen[msg]) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || '';
      if (!url) return;
      seen[msg] = 1; sent++;
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: true,
        body: JSON.stringify({
          action: 'logClientError', msg: msg,
          src: String(src || '').split('/').pop().slice(0, 80), line: line || 0,
          page: (location.pathname || '').split('/').pop() || 'index',
          v: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
          ua: (navigator.userAgent || '').slice(0, 80)
        })
      }).catch(function () {});
    } catch (e) { /* never let the reporter itself throw */ }
  }
  window.addEventListener('error', function (e) { report(e.message, e.filename, e.lineno); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    report(r && r.message ? r.message : String(r), 'promise', 0);
  });
})();

async function pingBackend(gasUrl, timeoutMs = 8000) {
@@@ END


@@@ FILE privacy.html

@@@ EDIT prv2-errors
@@@ OLD
<li><b>Activity log:</b> administrative actions on your account (for example approvals), used to run the service.</li>
@@@ NEW
<li><b>Activity log:</b> administrative actions on your account (for example approvals), used to run the service.</li>
      <li><b>Error reports:</b> if the app crashes, a short technical note (which page, which error, app version and browser type) is sent so we can fix it. It contains no answers and no personal details.</li>
@@@ END


@@@ FILE index.html

@@@ EDIT idx2-notice-call
@@@ OLD
this.bindForms();
@@@ NEW
this.bindForms();
    this.showStoredNotice();
@@@ END

@@@ EDIT idx2-notice-method
@@@ OLD
  /* Real forms, so Enter submits and password managers behave. */
@@@ NEW
  /* If the app signed you out (for example the account was used on another
     device), say so instead of dropping you on a bare sign-in form. */
  showStoredNotice(){
    try {
      const n = localStorage.getItem('abhyas_notice');
      if (n) { localStorage.removeItem('abhyas_notice'); this.toast(n, 8000); }
    } catch(e){}
  },

  /* Real forms, so Enter submits and password managers behave. */
@@@ END


@@@ FILE app.js

@@@ EDIT app2-signedout
@@@ OLD
} else if(res.sessionInvalid){
@@@ NEW
} else if(res.sessionInvalid){
        try{ localStorage.setItem('abhyas_notice', 'You were signed out because this account was used on another device, or the session expired. Please sign in again.'); }catch(e){}
@@@ END

@@@ EDIT app2-keep-standing
@@@ OLD
this.attempts[a.weeklyId] = a;
@@@ NEW
if(local && local.standing) a.standing = local.standing;
          this.attempts[a.weeklyId] = a;
@@@ END

@@@ EDIT app2-init-standings
@@@ OLD
      this._startTick();
    }catch(e){ this._renderHomeCard(); }
@@@ NEW
      this._startTick();
      this._loadStandings();
    }catch(e){ this._renderHomeCard(); }
@@@ END

@@@ EDIT app2-rank-display
@@@ OLD
${attempted.pct}% · Review</span>
@@@ NEW
${attempted.pct}%${attempted.standing ? ' · Rank ' + attempted.standing.rank + '/' + attempted.standing.total : ''} · Review</span>
@@@ END

@@@ EDIT app2-weekly-methods
@@@ OLD
  _startTick(){
@@@ NEW
  /* Rank and percentile, fetched once a set's exam window has closed. */
  async _loadStandings(){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return;
    let changed = false;
    for(const s of this.sets){
      const a = this.attempts[s.id];
      if(!a || a.standing || !s.releaseAt || this.examOpen(s)) continue;
      try{
        const r = await netFetch(APPS, {
          method:'POST', headers:{'Content-Type':'text/plain'},
          body: JSON.stringify({action:'getWeeklyStanding', username:S.user.username, token:S.user.token, weeklyId:s.id})
        }, 15000);
        const res = await r.json();
        if(res && res.success && res.ready && res.attempted){
          a.standing = {rank:res.rank, total:res.total, percentile:res.percentile};
          changed = true;
        }
      }catch(e){}
    }
    if(changed){ this._saveAttempts(); this._renderHomeCard(); }
  },

  /* Records the start on the server so closing the app and restarting cannot
     be used to look at the questions and try again. Returns 'go' or 'stop'. */
  async _startOnServer(s){
    if(!S.online || S.forcedOffline || !S.user || !S.user.token) return 'go';
    let res = null;
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({action:'startWeeklyAttempt', username:S.user.username, token:S.user.token, weeklyId:s.id})
      }, 15000);
      res = await r.json();
    }catch(e){ return 'go'; }
    if(!res || !res.success) return 'go';
    if(res.alreadyAttempted && res.attempt){
      this.attempts[s.id] = res.attempt; this._saveAttempts(); this._renderHomeCard();
      toast('Already submitted. Showing your recorded result.', 4000);
      this._startReview(s, res.attempt);
      return 'stop';
    }
    if(res.windowClosed){
      toast('The exam window has closed. Viewing answers only.', 4000);
      this._startReview(s, null);
      return 'stop';
    }
    if(res.resumed){
      const snap = _load(LS.EXAM_SNAP, null);
      const mine = !!(snap && snap.scope && snap.scope.weeklyId === s.id && snap.username === S.user.username && snap.qs && snap.qs.length);
      if(mine){
        const adj = (snap.left || 0) - Math.floor((Date.now() - (snap.savedAt || Date.now())) / 1000);
        if(adj <= 0){
          QUIZ._resumeSnapshot(snap, 0);
          toast('Time ran out while you were away. Submitting what you had.', 5000);
          QUIZ.submitExam();
        } else {
          QUIZ._resumeSnapshot(snap, adj);
          toast('Continuing your test where you left off.', 3000);
        }
        return 'stop';
      }
      toast('You started this test earlier without submitting, so your one attempt is used. Showing the answers.', 7000);
      this._startReview(s, null);
      return 'stop';
    }
    return 'go';
  },

  _startTick(){
@@@ END

@@@ EDIT app2-weekly-open
@@@ OLD
QUIZ.load(s.fileId, `weekly_${s.id}`, 'exam', s.title, {
@@@ NEW
if(await WEEKLY._startOnServer(s) === 'stop') return;
    QUIZ.load(s.fileId, `weekly_${s.id}`, 'exam', s.title, {
@@@ END


@@@ FILE objective.js

@@@ EDIT obj2-weekly-resume
@@@ OLD
    if(snap.scope && snap.scope.weeklyId){
      QUIZ._clearExamSnapshot();
      return;
    }
@@@ NEW
    /* v1.15: the start of a weekly test is recorded on the server, so a saved
       test on this device may be resumed. Only drop it once already submitted. */
    if(snap.scope && snap.scope.weeklyId){
      const done = (typeof WEEKLY !== 'undefined' && WEEKLY.attempts && WEEKLY.attempts[snap.scope.weeklyId]);
      if(done){ QUIZ._clearExamSnapshot(); return; }
    }
@@@ END

@@@ EDIT obj2-unseen-first
@@@ OLD
    if(qsArr.length > 20){
@@@ NEW
    /* Practice moves you forward: questions you have not seen yet come first
       (stable order), so "20 questions" is the next 20, not the same 20. */
    if(mode !== 'exam' && !(scope && scope.weeklyId) && S.cov){
      const seenQ = q => {
        const uid = String((q && q.uid) || '');
        const i = uid.lastIndexOf('_');
        if(i < 1) return false;
        const c = S.cov[uid.slice(0, i)];
        if(!c || !c.p) return false;
        const ch = c.p[parseInt(uid.slice(i + 1), 10)];
        return !!ch && ch !== '0';
      };
      const fresh = qsArr.filter(q => !seenQ(q));
      const old = qsArr.filter(seenQ);
      if(fresh.length && old.length) qsArr = fresh.concat(old);
    }
    if(qsArr.length > 20){
@@@ END

@@@ EDIT obj2-picker-text
@@@ OLD
available — how many do you want to do?
@@@ NEW
available (unseen ones come first). How many do you want to do?
@@@ END

@@@ EDIT obj2-adaptive
@@@ OLD
const picks = shuf(refs).slice(0, Math.min(8, refs.length));
@@@ NEW
/* Weak-topic mode now actually targets weak chapters: files from chapters
       where your accuracy is under 60% (with at least 5 answers) come first. */
    const _acc = ref => {
      const rec = S.chapStats[`${ChapterData.chapterName(ref.lv, ref.ch)} — ${ref.book}`];
      return (rec && rec.attempted >= 5) ? (rec.correct / rec.attempted) * 100 : null;
    };
    const _weak = refs.filter(r => { const a = _acc(r); return a !== null && a < 60; });
    const _rest = refs.filter(r => !_weak.includes(r));
    if(_weak.length) toast('Focusing on the chapters you find hardest.', 3000);
    const picks = shuf(_weak).slice(0, 5).concat(shuf(_rest)).slice(0, Math.min(8, refs.length));
@@@ END

@@@ EDIT obj2-palette
@@@ OLD
  _lastSnapAt: 0,
@@@ NEW
  /* Question grid for timed tests: jump anywhere, and see answered / blank /
     marked-for-review at a glance. */
  toggleMark(qi){
    if(!S.quiz.marked) S.quiz.marked = new Set();
    if(S.quiz.marked.has(qi)) S.quiz.marked.delete(qi); else S.quiz.marked.add(qi);
    const b = document.querySelector(`#eqc-${qi} .ib.mark-btn`);
    if(b) b.classList.toggle('fl-on', S.quiz.marked.has(qi));
    if(document.getElementById('pal-grid')) QUIZ.showPalette(true);
  },
  showPalette(refresh){
    if(!S.quiz || !S.quiz.qs) return;
    const marked = S.quiz.marked || new Set();
    const tiles = S.quiz.qs.map((q, i) => {
      const done = S.quiz.ans[i] !== null && S.quiz.ans[i] !== undefined;
      const m = marked.has(i);
      const bg = m ? 'var(--warning-soft)' : done ? 'var(--accent-soft)' : 'var(--bg-sunken)';
      const bd = m ? 'var(--warning)' : done ? 'var(--accent)' : 'var(--sep-strong)';
      const col = m ? 'var(--warning)' : done ? 'var(--accent)' : 'var(--ink-2)';
      const state = m ? 'marked for review' : done ? 'answered' : 'not answered';
      return `<button type="button" onclick="QUIZ.goTo(${i})" aria-label="Question ${i+1}, ${state}" style="min-width:0;height:40px;border-radius:8px;border:1.5px solid ${bd};background:${bg};color:${col};font-weight:700;font-family:var(--mono);font-size:.8rem">${i+1}</button>`;
    }).join('');
    const nAns = S.quiz.ans.filter(a => a !== null && a !== undefined).length;
    const html = `<p class="t-foot mb3">${nAns} answered · ${S.quiz.qs.length - nAns} blank · ${marked.size} marked for review</p><div id="pal-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px">${tiles}</div>`;
    if(refresh){ const b = document.getElementById('mbody'); if(b) b.innerHTML = html; return; }
    openMod('Question grid', html);
  },
  goTo(i){
    closeMod();
    const el = document.getElementById('eqc-' + i);
    if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
  },

  _lastSnapAt: 0,
@@@ END

@@@ EDIT obj2-mark-button
@@@ OLD
<div class="qm"><span class="qn mono">Q${qi+1}</span>${qSearchHtml(q)}</div>
@@@ NEW
<div class="qm"><span class="qn mono">Q${qi+1}</span><span style="display:inline-flex;gap:.3rem;align-items:center"><button type="button" class="ib mark-btn${S.quiz.marked && S.quiz.marked.has(qi) ? ' fl-on' : ''}" onclick="QUIZ.toggleMark(${qi})" title="Mark for review" aria-label="Mark question ${qi+1} for review"><i class="ph ph-flag"></i></button>${qSearchHtml(q)}</span></div>
@@@ END

@@@ EDIT obj2-single-book
@@@ OLD
bs.disabled=false;
@@@ NEW
bs.disabled=false;
        /* Every chapter has one book, so skip that step: pick it and move on. */
        const _bk = Object.keys(books);
        bs.style.display = _bk.length === 1 ? 'none' : '';
        if(_bk.length === 1){ bs.value = _bk[0]; ON.onBook(); return; }
@@@ END


@@@ FILE user.html

@@@ EDIT usr2-grid-button
@@@ OLD
<button class="qb-btn skip" id="ex-skip-nav"
@@@ NEW
<button class="qb-btn" type="button" onclick="QUIZ.showPalette()"><i class="ph ph-squares-four"></i> Grid</button>
                  <button class="qb-btn skip" id="ex-skip-nav"
@@@ END

@@@ EDIT usr2-exam-card
@@@ OLD
<h2 class="t-t3 mb2">This week</h2>
@@@ NEW
<section class="streak-card" id="exam-card">
          <div class="streak-top">
            <h3><i class="ph ph-calendar-star"></i> Your exam</h3>
            <button class="btn btn-sm btn-quiet" id="exam-date-edit" type="button" onclick="EXAM_DATE.edit()">Set date</button>
          </div>
          <div id="exam-card-body" class="t-callout">Set your exam date to see a countdown and how much to do each day.</div>
        </section>

        <h2 class="t-t3 mb2">This week</h2>
@@@ END

@@@ EDIT usr2-exam-js
@@@ OLD
function _refreshHints(){ try { SB_HINTS.refresh(); } catch(e){} try { TRIAL_PILL.render(); } catch(e){} }
@@@ NEW
function _refreshHints(){ try { SB_HINTS.refresh(); } catch(e){} try { TRIAL_PILL.render(); } catch(e){} try { EXAM_DATE.render(); } catch(e){} }

/* Exam countdown and today's question goal. Stored on this device only. */
window.EXAM_DATE = {
  KEY: 'abhyas_exam_date',
  GOAL: 30,
  get(){ try { return localStorage.getItem(this.KEY) || ''; } catch(e){ return ''; } },
  edit(){
    openMod('Your exam date',
      '<div class="sf"><label for="ex-date">Exam date</label><input type="date" id="ex-date" value="' + esc(this.get()) + '"></div>' +
      '<button class="btn btn-solid btn-blk" type="button" onclick="EXAM_DATE.save()">Save</button>' +
      '<button class="btn btn-quiet btn-blk mt2" type="button" onclick="EXAM_DATE.clear()">Remove the date</button>');
  },
  save(){
    const el = $('ex-date');
    const v = el ? el.value : '';
    if (!v) { toast('Pick a date first.'); return; }
    try { localStorage.setItem(this.KEY, v); } catch(e){}
    closeMod(); this.render();
  },
  clear(){
    try { localStorage.removeItem(this.KEY); } catch(e){}
    closeMod(); this.render();
  },
  render(){
    const body = $('exam-card-body'), btn = $('exam-date-edit');
    if (!body) return;
    const v = this.get();
    if (!v) { body.textContent = 'Set your exam date to see a countdown and how much to do each day.'; if (btn) btn.textContent = 'Set date'; return; }
    const p = v.split('-').map(Number);
    const target = new Date(p[0], p[1] - 1, p[2]).getTime();
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const days = Math.round((target - t0.getTime()) / 86400000);
    let doneToday = 0;
    ((S.prog && S.prog.sessions) || []).forEach(s => { if ((s.at || 0) >= t0.getTime()) doneToday += (s.total || 0); });
    if (btn) btn.textContent = 'Change';
    if (days < 0) { body.textContent = 'That exam date has passed. Set a new one, or remove it.'; return; }
    body.innerHTML =
      '<div style="display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap">' +
        '<span class="mono" style="font-size:var(--fs-num-lg);font-weight:700;color:var(--ink)">' + (days === 0 ? 'Today' : days + (days === 1 ? ' day' : ' days')) + '</span>' +
        '<span>' + (days === 0 ? 'Good luck!' : 'to go') + '</span></div>' +
      '<div class="t-foot" style="margin-top:.3rem">Today: ' + doneToday + ' of ' + this.GOAL + ' questions' + (doneToday >= this.GOAL ? ' (goal reached)' : '') + '</div>';
  }
};
@@@ END


@@@ FILE README.md

@@@ EDIT rd2-notes
@@@ OLD
## Known limits
@@@ NEW
## What v1.15 added

- **Weekly test integrity:** the start of a graded weekly test is recorded on the server (`WeeklyStarts` sheet). Restarting cannot be used to peek at the questions; a saved test can be resumed on the same device, and the server refuses submissions long after the window closes. Rank and percentile appear when the window closes (`getWeeklyStanding`).
- **Backend:** Drive uploads happen before the script lock is taken; public settings are cached for two minutes; a nightly trigger copies the spreadsheet into the `AbhyasBackups` Drive folder (last 14 kept); `logClientError` stores short crash reports in the Activity log.
- **Study flow:** unseen questions come first, weak-topic mode targets chapters under 60%, timed tests have a question grid and mark-for-review, the picker skips the pointless book step, and Home has an exam-date countdown.
- **Self-hosted assets:** `vendor-assets.py` downloads pdf.js, pdf-lib, KaTeX, confetti and the Inter/JetBrains Mono fonts from the npm registry into `vendor/` and points the pages at them. Safe to re-run; run it again after any version bump.

## Known limits
@@@ END


@@@ NEWFILE vendor-assets.py
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vendor-assets.py - self-host third-party assets so the app works fully offline.

Downloads (from the npm registry, exact versions) into ./vendor/ :
    pdf.js 3.11.174, pdf-lib 1.17.1, KaTeX 0.16.9 (+ fonts), canvas-confetti 1.9.3,
    Inter and JetBrains Mono (latin) as woff2
then points index.html / user.html / admin.html / subjective.js at the local copies
and adds them to the service-worker precache list (sw.js).

Safe to re-run. Nothing is changed unless every download succeeds.
Usage:  python vendor-assets.py
"""
import io
import os
import re
import sys
import tarfile
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
REG = "https://registry.npmjs.org/"
PKGS = {
    "pdfjs": REG + "pdfjs-dist/-/pdfjs-dist-3.11.174.tgz",
    "pdflib": REG + "pdf-lib/-/pdf-lib-1.17.1.tgz",
    "katex": REG + "katex/-/katex-0.16.9.tgz",
    "confetti": REG + "canvas-confetti/-/canvas-confetti-1.9.3.tgz",
    "inter": REG + "@fontsource/inter/-/inter-5.0.20.tgz",
    "mono": REG + "@fontsource/jetbrains-mono/-/jetbrains-mono-5.0.20.tgz",
}
INTER_WEIGHTS = [400, 500, 600, 700, 800]
MONO_WEIGHTS = [400, 500, 700]


def load_tar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "abhyas-vendor/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    return tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")


def member(tar, name):
    f = tar.extractfile(name)
    if f is None:
        raise KeyError(name)
    return f.read()


def gather():
    out = {}
    print("Downloading (about 20 MB, once) ...")

    t = load_tar(PKGS["pdfjs"])
    out["vendor/pdfjs/pdf.min.js"] = member(t, "package/build/pdf.min.js")
    out["vendor/pdfjs/pdf.worker.min.js"] = member(t, "package/build/pdf.worker.min.js")
    print("  pdf.js ok")

    t = load_tar(PKGS["pdflib"])
    out["vendor/pdf-lib/pdf-lib.min.js"] = member(t, "package/dist/pdf-lib.min.js")
    print("  pdf-lib ok")

    t = load_tar(PKGS["katex"])
    out["vendor/katex/katex.min.js"] = member(t, "package/dist/katex.min.js")
    out["vendor/katex/katex.min.css"] = member(t, "package/dist/katex.min.css")
    out["vendor/katex/auto-render.min.js"] = member(t, "package/dist/contrib/auto-render.min.js")
    for name in t.getnames():
        if name.startswith("package/dist/fonts/") and name.endswith(".woff2"):
            out["vendor/katex/fonts/" + os.path.basename(name)] = member(t, name)
    print("  KaTeX ok")

    t = load_tar(PKGS["confetti"])
    out["vendor/confetti/confetti.browser.js"] = member(t, "package/dist/confetti.browser.js")
    print("  confetti ok")

    css = []
    t = load_tar(PKGS["inter"])
    for w in INTER_WEIGHTS:
        fn = "inter-latin-%d-normal.woff2" % w
        out["vendor/fonts/" + fn] = member(t, "package/files/" + fn)
        css.append("@font-face{font-family:'Inter';font-style:normal;font-weight:%d;font-display:swap;src:url(%s) format('woff2');}" % (w, fn))
    t = load_tar(PKGS["mono"])
    for w in MONO_WEIGHTS:
        fn = "jetbrains-mono-latin-%d-normal.woff2" % w
        out["vendor/fonts/" + fn] = member(t, "package/files/" + fn)
        css.append("@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:%d;font-display:swap;src:url(%s) format('woff2');}" % (w, fn))
    out["vendor/fonts/fonts.css"] = ("/* Inter + JetBrains Mono, latin, self-hosted */\n" + "\n".join(css) + "\n").encode("utf-8")
    print("  fonts ok")
    return out


def read_text(rel):
    p = os.path.join(HERE, rel)
    if not os.path.exists(p):
        return None, False
    with open(p, "rb") as fh:
        raw = fh.read().decode("utf-8")
    return raw.replace("\r\n", "\n"), ("\r\n" in raw)


def write_text(rel, text, crlf):
    with open(os.path.join(HERE, rel), "wb") as fh:
        fh.write((text.replace("\n", "\r\n") if crlf else text).encode("utf-8"))


def sub_file(rel, subs):
    text, crlf = read_text(rel)
    if text is None:
        return 0
    n = 0
    for pat, rep in subs:
        text, c = re.subn(pat, lambda m, r=rep: r, text)
        n += c
    if n:
        write_text(rel, text, crlf)
    return n


def main():
    try:
        files = gather()
    except Exception as ex:
        print("\nCould not download everything (%s)." % ex)
        print("Nothing was changed. Check your internet connection and run again.")
        return 1

    for rel, data in files.items():
        p = os.path.join(HERE, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as fh:
            fh.write(data)
    print("Wrote %d files into vendor/" % len(files))

    fonts_link = (r'<link href="https://fonts\.googleapis\.com/css2[^"]*"\s+rel="stylesheet">',
                  '<link rel="stylesheet" href="vendor/fonts/fonts.css">')
    changed = 0
    changed += sub_file("index.html", [fonts_link])
    changed += sub_file("admin.html", [
        fonts_link,
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/3\.11\.174/pdf\.min\.js"', 'src="vendor/pdfjs/pdf.min.js"'),
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/pdf-lib/1\.17\.1/pdf-lib\.min\.js"', 'src="vendor/pdf-lib/pdf-lib.min.js"'),
        (r'"https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/3\.11\.174/pdf\.worker\.min\.js"', '"vendor/pdfjs/pdf.worker.min.js"'),
    ])
    changed += sub_file("user.html", [
        fonts_link,
        (r'href="https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/0\.16\.9/katex\.min\.css"', 'href="vendor/katex/katex.min.css"'),
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/0\.16\.9/katex\.min\.js"', 'src="vendor/katex/katex.min.js"'),
        (r'src="https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/0\.16\.9/contrib/auto-render\.min\.js"', 'src="vendor/katex/auto-render.min.js"'),
        (r'src="https://cdn\.jsdelivr\.net/npm/canvas-confetti@1\.9\.3/dist/confetti\.browser\.min\.js"', 'src="vendor/confetti/confetti.browser.js"'),
    ])
    changed += sub_file("subjective.js", [
        (r"https://cdnjs\.cloudflare\.com/ajax/libs/pdf-lib/1\.17\.1/pdf-lib\.min\.js", "vendor/pdf-lib/pdf-lib.min.js"),
    ])

    # service worker precache list
    text, crlf = read_text("sw.js")
    if text is not None and "'./vendor/katex/katex.min.js'" not in text:
        extra = ["./vendor/pdf-lib/pdf-lib.min.js", "./vendor/katex/katex.min.js",
                 "./vendor/katex/katex.min.css", "./vendor/katex/auto-render.min.js",
                 "./vendor/confetti/confetti.browser.js", "./vendor/fonts/fonts.css"]
        extra += sorted("./" + k for k in files if k.startswith("vendor/katex/fonts/") or
                        (k.startswith("vendor/fonts/") and k.endswith(".woff2")))
        marker = "'./vendor/pdfjs/pdf.worker.min.js'"
        if marker in text:
            block = marker + ",\n" + ",\n".join("  '%s'" % e for e in extra)
            write_text("sw.js", text.replace(marker, block, 1), crlf)
            changed += 1
        else:
            print("Note: could not find the pdf.js line in sw.js SHELL; add the vendor files there by hand.")

    print("Updated references in %d place(s)." % changed)
    print("\nDone. Reload the site once so the service worker caches the new files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
@@@ END
'''


# ---------------------------------------------------------------------------
#  Engine (same as patch.py, plus .gs syntax check and the vendor step)
# ---------------------------------------------------------------------------
def say(msg=""):
    print(msg)


def die(msg):
    say("\n[STOPPED] " + msg)
    say("Nothing was changed.")
    sys.exit(1)


def parse_data(raw):
    ops = []
    cur = None
    section = None
    buf = []
    cur_file = None

    def flush():
        nonlocal buf
        if cur is not None and section is not None:
            cur[section] = "\n".join(buf)
        buf = []

    for line in raw.split("\n"):
        if line.startswith("@@@ "):
            fields = line[4:].split()
            tag = fields[0]
            if tag == "FILE":
                cur_file = fields[1]
            elif tag == "EDIT":
                flush()
                cur = {"kind": "edit", "file": cur_file, "id": fields[1],
                       "count": 1, "old": "", "new": ""}
                for f in fields[2:]:
                    if f.startswith("count="):
                        cur["count"] = int(f.split("=", 1)[1])
                section = None
            elif tag == "OLD":
                flush()
                section = "old"
            elif tag == "NEW":
                flush()
                section = "new"
            elif tag in ("NEWFILE", "WRITE"):
                flush()
                cur = {"kind": tag.lower(), "file": fields[1], "body": ""}
                section = "body"
            elif tag == "END":
                flush()
                if cur is not None:
                    ops.append(cur)
                cur = None
                section = None
        elif section is not None:
            buf.append(line)
    return ops


def read_text(rel):
    with open(os.path.join(HERE, rel), "rb") as fh:
        s = fh.read().decode("utf-8")
    return s.replace("\r\n", "\n"), ("\r\n" in s)


def have_node():
    return shutil.which("node") is not None


def node_bad(code):
    fd, name = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(code)
        r = subprocess.run(["node", "--check", name], capture_output=True, text=True, timeout=60)
        return r.returncode != 0
    finally:
        try:
            os.unlink(name)
        except OSError:
            pass


SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S | re.I)


def inline_scripts(html):
    out = []
    for m in SCRIPT_RE.finditer(html):
        attrs, body = m.group(1), m.group(2)
        if re.search(r"\bsrc\s*=", attrs) or re.search(r"application/ld\+json", attrs, re.I):
            continue
        if body.strip():
            out.append(body)
    return out


def count_bad(rel, text):
    if rel.endswith(".js") or rel.endswith(".gs"):
        return 1 if node_bad(text) else 0
    if rel.endswith(".html"):
        return sum(1 for b in inline_scripts(text) if node_bad(b))
    return 0


def main():
    for must in ("index.html", "user.html", "app.js", "objective.js", "code.gs", "version.js", "sw.js"):
        if not os.path.exists(os.path.join(HERE, must)):
            die("Cannot find %s next to patch2.py. Put patch2.py in the ROOT of your repo." % must)

    ver = read_text("version.js")[0]
    if "APP_VERSION = '1.14'" not in ver and "APP_VERSION = '1.15'" not in ver:
        die("This is phase 2. Run patch.py (v1.14) first, then run patch2.py.")

    ops = parse_data(DATA)
    state = {}
    log = []
    errors = []

    def get(rel):
        if rel not in state:
            if os.path.exists(os.path.join(HERE, rel)):
                t, crlf = read_text(rel)
                state[rel] = {"text": t, "crlf": crlf, "orig": t, "exists": True}
            else:
                state[rel] = {"text": "", "crlf": False, "orig": None, "exists": False}
        return state[rel]

    for op in ops:
        kind, rel = op["kind"], op["file"]
        if kind == "edit":
            if not os.path.exists(os.path.join(HERE, rel)):
                errors.append("%s: file not found (%s)" % (rel, op["id"]))
                continue
            st = get(rel)
            text, old, new = st["text"], op["old"], op["new"]
            contains = old in new
            applied = (new in text) if contains else ((old not in text) and (new in text))
            if applied:
                log.append("  [skip] %-30s %s (already applied)" % (op["id"], rel))
                continue
            found = text.count(old)
            if found != op["count"]:
                errors.append("%s [%s]: expected %d match(es) of the anchor, found %d"
                              % (rel, op["id"], op["count"], found))
                continue
            st["text"] = text.replace(old, new)
            log.append("  [ ok ] %-30s %s" % (op["id"], rel))
        elif kind in ("newfile", "write"):
            body = op["body"] + "\n"
            st = get(rel)
            if st["exists"] and st["text"] == body:
                log.append("  [skip] %-30s %s (already up to date)" % (kind, rel))
            else:
                st["text"] = body
                log.append("  [ ok ] %-30s %s" % (kind, rel))

    say("Abhyas v1.15 patch (phase 2)")
    say("=" * 60)
    for l in log:
        say(l)

    if errors:
        say("\nThese edits do not match your current files:")
        for e in errors:
            say("  - " + e)
        say("\nSend me the file(s) named above and I will regenerate the patch.")
        die("Aborted before writing anything.")

    changed = [rel for rel, s in state.items() if s["text"] != s["orig"]]

    if have_node():
        say("\nSyntax-checking patched files with Node ...")
        bad = []
        for rel in changed:
            if rel.endswith((".js", ".gs", ".html")):
                nb = count_bad(rel, state[rel]["text"])
                ob = count_bad(rel, state[rel]["orig"]) if state[rel]["orig"] is not None else 0
                if nb > ob:
                    bad.append(rel)
        if bad:
            die("The patched result has a JavaScript syntax error in: " + ", ".join(bad))
        say("  all good.")
    else:
        say("\n(Node.js not found, so the syntax check was skipped.)")

    if not changed:
        say("\nNothing to change: everything is already applied.")
    elif DRY:
        say("\n[dry run] Would change %d file(s): %s" % (len(changed), ", ".join(sorted(changed))))
        say("Nothing was written and patch2.py was kept.")
        return
    else:
        for rel in sorted(changed):
            s = state[rel]
            path = os.path.join(HERE, rel)
            if s["exists"]:
                bpath = os.path.join(BACKUP, rel)
                if not os.path.exists(bpath):
                    os.makedirs(os.path.dirname(bpath), exist_ok=True)
                    shutil.copy2(path, bpath)
            os.makedirs(os.path.dirname(path) or HERE, exist_ok=True)
            out = s["text"].replace("\n", "\r\n") if s["crlf"] else s["text"]
            with open(path, "wb") as fh:
                fh.write(out.encode("utf-8"))
        say("\nUpdated / created %d file(s). Originals are in .patch-backup-1.15/" % len(changed))

    vendor_ok = None
    if not DRY and not NO_VENDOR and os.path.exists(os.path.join(HERE, "vendor-assets.py")):
        say("\nSelf-hosting fonts, KaTeX, pdf.js and pdf-lib (needs internet) ...")
        try:
            r = subprocess.run([sys.executable, os.path.join(HERE, "vendor-assets.py")], timeout=900)
            vendor_ok = (r.returncode == 0)
        except Exception as ex:
            say("  could not run it: %s" % ex)
            vendor_ok = False
        if not vendor_ok:
            say("  Skipped for now. Run  python vendor-assets.py  later when you are online.")

    say("\nNEXT STEPS")
    say("  1. Backend: paste the new code.gs and setup.gs into Apps Script, then")
    say("     Deploy > Manage deployments > Edit > New version.")
    say("  2. In Apps Script, run setup() once (creates the WeeklyStarts sheet and the")
    say("     nightly backup trigger).")
    say("  3. Hard-reload the site once so the v1.15 service worker installs.")
    say("  4. Test as a student: weekly test start/resume, photo upload, exam grid.")
    say("  5. Delete the .patch-backup-1.15 folder when you are happy.")

    if not KEEP:
        try:
            os.remove(os.path.abspath(__file__))
            say("\npatch2.py has deleted itself. (vendor-assets.py stays: it is safe to re-run.)")
        except OSError as ex:
            say("\nCould not delete patch2.py automatically (%s). Delete it by hand." % ex)


if __name__ == "__main__":
    main()
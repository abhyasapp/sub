#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Abhyas v1.17 patch  -  PHASE 4  (run this AFTER patch.py, patch2.py and patch3.py).

HOW TO RUN
    1. Put this file in the ROOT of your repo (next to index.html).
    2. Commit or stash your work first.
    3. Run:   python patch4.py            (Windows:  py patch4.py)
       Preview only, changes nothing:    python patch4.py --dry-run
       Keep this file after running:     python patch4.py --keep

WHAT IT ADDS
    Students     new Chapters screen: chapter cards with progress, a "Continue"
                 card, tap a chapter to pick a set (or practise the whole chapter)
                 instead of four dropdowns; sign in with email or mobile number;
                 payment screenshot is shrunk on the phone before upload;
                 smoother answering (progress saved in batches)
    Admin        "typical approval time" setting shown to students after they pay
    Content ops  content-index.gs + content-index.js: question counts for every
                 file, so progress bars are right from the first launch
    Security     Content-Security-Policy on all three app pages (blocks scripts
                 and connections to any origin you did not list) + a test that
                 keeps the policy and the page in step
    Quality      more checks in tests/check.js

SAFETY
    Same as before: anchors are verified first, JavaScript is syntax-checked with
    Node (if installed), originals go to .patch-backup-1.17/, nothing is written if
    anything fails, CRLF/LF endings are preserved, and this file deletes itself.
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
BACKUP = os.path.join(HERE, ".patch-backup-1.17")
DRY = "--dry-run" in sys.argv
KEEP = "--keep" in sys.argv or DRY

CSP = ("default-src 'self'; "
       "script-src 'self' 'unsafe-inline' https://accounts.google.com https://www.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com https://cdnjs.cloudflare.com; "
       "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
       "img-src 'self' data: blob: https:; "
       "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com https://*.googleapis.com https://www.gstatic.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; "
       "frame-src https://accounts.google.com; "
       "worker-src 'self' blob: https://cdnjs.cloudflare.com; "
       "object-src 'none'; base-uri 'self'; form-action 'self'")

DATA = r'''
@@@ FILE version.js

@@@ EDIT v4-bump
@@@ OLD
const APP_VERSION = '1.16';
@@@ NEW
/* 1.17 - phase 4: chapter cards + Continue, sign in with email or mobile,
          payment screenshot shrunk on the phone, approval-time note,
          question-count index, Content-Security-Policy, batched progress saves. */
const APP_VERSION = '1.17';
@@@ END


@@@ FILE code.gs

@@@ EDIT gs4-version
@@@ OLD
const APP_VERSION = "1.16";
@@@ NEW
const APP_VERSION = "1.17";
@@@ END

@@@ EDIT gs4-resolve-fn
@@@ OLD
function handleLogin(p) {
@@@ NEW
/* v1.17: an email address or a Nepali mobile number can be used to sign in.
   Unknown values fall through and fail with the same "Invalid username or
   password" message as before, so nothing new is revealed. */
function resolveLoginIdentifier_(id) {
  const s = String(id || "").trim();
  if (!s || s.length > MAX_EMAIL_LEN) return s;
  try {
    const sheet = getUsersSheet_();
    if (s.indexOf("@") > 0) {
      const f = findUserByField_(sheet, 3, s);
      if (f) return String(f.row[0]);
    } else if (/^(98|97|96|99)\d{8}$/.test(s)) {
      const f = findUserByField_(sheet, 4, s);
      if (f) return String(f.row[0]);
    }
  } catch (e) { /* fall back to the value as typed */ }
  return s;
}

function handleLogin(p) {
@@@ END

@@@ EDIT gs4-login-use
@@@ OLD
  const username = String(p.username || "").trim();
  const password = String(p.password == null ? "" : p.password);
  if (!username || !password) return { success: false, error: "Enter username and password." };
@@@ NEW
  let username = String(p.username || "").trim();
  const password = String(p.password == null ? "" : p.password);
  if (!username || !password) return { success: false, error: "Enter username and password." };
  username = resolveLoginIdentifier_(username);
@@@ END


@@@ FILE index.html

@@@ EDIT idx4-csp
@@@ OLD
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
@@@ NEW
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
@@@ END

@@@ EDIT idx4-login-label
@@@ OLD
<label for="in-user">Username</label>
@@@ NEW
<label for="in-user">Username, email or mobile</label>
@@@ END

@@@ EDIT idx4-login-placeholder
@@@ OLD
placeholder="Your username"
@@@ NEW
placeholder="Username, email or mobile"
@@@ END

@@@ EDIT idx4-eta
@@@ OLD
. An admin will check it and your access opens as soon as it\u2019s approved.';
@@@ NEW
. An admin will check it and your access opens as soon as it\u2019s approved.' +
          ((this.session && this.session.settings && this.session.settings.paymentEta) ? ' Payments are usually checked ' + this.session.settings.paymentEta + '.' : '');
@@@ END

@@@ EDIT idx4-shrink
@@@ OLD
  onFile(){
@@@ NEW
  /* The payment screenshot is shrunk on the phone (max 1600 px, JPEG) so it
     uploads quickly on a weak connection and never hits the size limit. */
  async onFile(){
    const input = $('pay-file'), nameEl = $('pay-file-name');
    const f = input.files[0];
    if (!f) { this.fileData = null; nameEl.textContent = 'No file chosen'; return; }
    nameEl.textContent = f.name;
    if (!/^image\//i.test(f.type || '')) {
      this.showErr('Please choose an image: a screenshot or a photo of the payment.');
      input.value = ''; nameEl.textContent = 'No file chosen'; this.fileData = null;
      return;
    }
    try {
      this.fileData = await this.shrinkImage(f, 1600, 0.82);
      nameEl.textContent = f.name + ' (ready to send)';
    } catch (e) {
      this.showErr('Could not read that image. Try a screenshot instead.');
      input.value = ''; nameEl.textContent = 'No file chosen'; this.fileData = null;
    }
  },
  shrinkImage(file, maxSide, quality){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const sc = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const out = c.toDataURL('image/jpeg', quality);
        if (out.length > 6 * 1024 * 1024) reject(new Error('too large')); else resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  },
  _onFileLegacy(){
@@@ END


@@@ FILE admin.html

@@@ EDIT adm4-csp
@@@ OLD
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
@@@ NEW
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
@@@ END

@@@ EDIT adm4-eta-field
@@@ OLD
<label for="set-announce">Announcement banner <span class="dim">(optional)</span></label>
@@@ NEW
<label for="set-eta">Typical approval time <span class="dim">(optional)</span></label>
            <input class="input" type="text" id="set-eta" placeholder="within 12 hours">
            <span class="field-hint">Shown to students after they send a payment.</span>
          </div>
          <div class="field">
            <label for="set-announce">Announcement banner <span class="dim">(optional)</span></label>
@@@ END

@@@ EDIT adm4-eta-load
@@@ OLD
$('set-announce').value = s.announcement || '';
@@@ NEW
$('set-announce').value = s.announcement || '';
    $('set-eta').value = s.paymentEta || '';
@@@ END

@@@ EDIT adm4-eta-save
@@@ OLD
{ key:'announcement', value: $('set-announce').value.trim().slice(0, 300) }
@@@ NEW
{ key:'paymentEta', value: $('set-eta').value.trim().slice(0, 60) },
      { key:'announcement', value: $('set-announce').value.trim().slice(0, 300) }
@@@ END


@@@ FILE user.html

@@@ EDIT usr4-csp
@@@ OLD
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
@@@ NEW
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
@@@ END

@@@ EDIT usr4-content-index
@@@ OLD
<script src="app.js"></script>
@@@ NEW
<script src="content-index.js"></script>
<script src="app.js"></script>
@@@ END

@@@ EDIT usr4-help-link
@@@ OLD
rel="noopener">Terms</a>
@@@ NEW
rel="noopener">Terms</a> · <a href="mailto:abhyasbymku@gmail.com">Help</a>
@@@ END

@@@ EDIT usr4-chapters-text
@@@ OLD
Pick a level, chapter, book and subtopic. Anything you open
@@@ NEW
Pick a chapter, then a set of questions. Anything you open
@@@ END

@@@ EDIT usr4-chapters-container
@@@ OLD
<div class="on-card-banner"><span><i class="ph ph-cloud-arrow-down"></i></span> Questions stream from Drive and save themselves for offline use as you go.</div>
@@@ NEW
<div id="chgrid"></div>
        <div class="on-card-banner"><span><i class="ph ph-cloud-arrow-down"></i></span> Questions stream from Drive and save themselves for offline use as you go.</div>
@@@ END

@@@ EDIT usr4-chapters-cardtitle
@@@ OLD
<div class="card-hd"><h3>Choose what to study</h3></div>
@@@ NEW
<div class="card-hd"><h3>Or choose step by step</h3></div>
@@@ END

@@@ EDIT usr4-chapters-style
@@@ OLD
</head>
@@@ NEW
<style id="patch-117">
/* v1.17: chapter cards */
.chg-tabs{display:flex;gap:2px;padding:3px;margin-bottom:var(--sp-3);background:var(--bg-sunken);border-radius:var(--r-input)}
.chg-tabs button{flex:1;min-height:36px;border-radius:calc(var(--r-input) - 3px);font-size:var(--fs-callout);font-weight:600;color:var(--ink-2)}
.chg-tabs button.active{background:var(--surface);color:var(--ink);box-shadow:var(--sh-1)}
.chg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--sp-2);margin-bottom:var(--sp-4)}
.chg-card{text-align:left;padding:var(--sp-3);min-height:96px;display:flex;flex-direction:column;gap:var(--sp-2);
  background:var(--surface);border:1px solid var(--sep);border-radius:var(--r-card);
  transition:border-color var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease)}
.chg-card:hover:not([disabled]){border-color:var(--accent)}
.chg-card:active:not([disabled]){transform:scale(.985)}
.chg-card[disabled]{opacity:.5;cursor:default}
.chg-name{font-size:var(--fs-callout);font-weight:650;line-height:1.3;color:var(--ink)}
.chg-meta{font-size:var(--fs-cap);color:var(--ink-3);margin-top:auto}
</style>
</head>
@@@ END

@@@ EDIT usr4-chapters-js
@@@ OLD
/* Announcement banner from the admin console. Also watches the content
@@@ NEW
/* Chapters screen: chapter cards with progress, a Continue card, and a set
   picker, instead of four dropdowns. The dropdowns stay below as "step by
   step" for anyone who prefers them. */
window.CH_GRID = {
  lv: '',
  LEVELS: [['level7', 'Level 7'], ['level5', 'Level 5'], ['gk', 'General Knowledge']],

  _stats(refs){
    let seen = 0, total = 0, known = 0;
    refs.forEach(r => {
      const c = S.cov && S.cov[r.fid];
      if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
      const n = S.fcount && S.fcount[r.fid];
      if (n != null) { total += n; known++; }
    });
    return { seen: seen, total: total, complete: refs.length > 0 && known === refs.length };
  },

  _last(){
    return ((S.prog && S.prog.sessions) || []).find(x => x.fid && x.lv && x.ch) || null;
  },

  _ref(fid){
    return ChapterData.allFileRefs().find(r => r.fid === fid) || null;
  },

  render(){
    const box = $('chgrid');
    if (!box || typeof ChapterData === 'undefined') return;
    const last = this._last();
    if (!this.lv) this.lv = (last && last.lv) || 'level7';

    let html = '';
    const lastRef = last ? this._ref(last.fid) : null;
    if (lastRef) {
      const st = this._stats([lastRef]);
      html += '<div class="card" style="border-color:var(--accent-line);background:var(--accent-soft)">' +
        '<div class="t-cap" style="color:var(--accent);font-weight:700">Continue</div>' +
        '<div class="t-t3" style="margin:2px 0 var(--sp-2)">' + esc(ChapterData.chapterName(lastRef.lv, lastRef.ch)) + ': ' + esc(prettySub(lastRef.subtopic)) + '</div>' +
        '<div class="t-foot mb3">' + (st.total ? st.seen + ' of ' + st.total + ' seen' : st.seen + ' seen') + '</div>' +
        '<div class="bg"><button class="btn btn-solid" type="button" onclick="CH_GRID.startFid(\'' + lastRef.fid + '\',\'flashcard\')">Practise</button>' +
        '<button class="btn btn-quiet" type="button" onclick="CH_GRID.startFid(\'' + lastRef.fid + '\',\'exam\')">Timed test</button></div></div>';
    }

    const tabs = this.LEVELS.map(l =>
      '<button type="button" class="' + (l[0] === this.lv ? 'active' : '') + '" onclick="CH_GRID.setLevel(\'' + l[0] + '\')">' + esc(l[1]) + '</button>').join('');
    const chs = ChapterData.chapters(this.lv);
    const cards = Object.keys(chs).map(ch => {
      const refs = ChapterData.chapterFileRefs(this.lv, ch);
      const has = refs.length > 0;
      const st = this._stats(refs);
      const pct = (st.complete && st.total) ? Math.min(100, Math.round(st.seen / st.total * 100)) : null;
      const meta = !has ? 'Coming soon'
        : (pct !== null ? pct + '% seen · ' : (st.seen ? st.seen + ' seen · ' : '')) + refs.length + (refs.length === 1 ? ' set' : ' sets');
      return '<button type="button" class="chg-card"' + (has ? '' : ' disabled') + ' onclick="CH_GRID.open(\'' + this.lv + '\',\'' + ch + '\')">' +
        '<span class="chg-name">' + esc(chs[ch]) + '</span>' +
        (has ? '<span class="pb" style="display:block"><span class="pb-f" style="display:block;width:' + (pct === null ? 0 : pct) + '%"></span></span>' : '') +
        '<span class="chg-meta">' + esc(meta) + '</span></button>';
    }).join('');
    box.innerHTML = html + '<div class="chg-tabs">' + tabs + '</div><div class="chg-grid">' + cards + '</div>';
  },

  setLevel(id){ this.lv = id; this.render(); },

  async open(lv, ch){
    const refs = ChapterData.chapterFileRefs(lv, ch);
    if (!refs.length) return;
    const name = ChapterData.chapterName(lv, ch);
    let keys = new Set();
    try { keys = new Set(await QDB.keys()); } catch(e){}
    const offline = !(S.online && !S.forcedOffline);
    const rows = refs.map(r => {
      const st = this._stats([r]);
      const cached = keys.has(r.key);
      const blocked = offline && !cached;
      return '<div class="row" style="padding:var(--sp-2) 0">' +
        '<div class="row-main"><div class="t-callout" style="color:var(--ink);font-weight:600">' + esc(prettySub(r.subtopic)) + '</div>' +
        '<div class="t-cap">' + (st.total ? st.seen + ' of ' + st.total + ' seen' : (st.seen ? st.seen + ' seen' : 'Not started')) +
        (cached ? ' · saved on this device' : (blocked ? ' · needs a connection' : '')) + '</div></div>' +
        '<button class="btn btn-sm btn-a" type="button"' + (blocked ? ' disabled' : '') + ' onclick="CH_GRID.go(\'' + r.fid + '\',\'flashcard\')">Practise</button>' +
        '<button class="btn btn-sm btn-quiet" type="button"' + (blocked ? ' disabled' : '') + ' onclick="CH_GRID.go(\'' + r.fid + '\',\'exam\')">Test</button></div>';
    }).join('');
    const head = refs.length > 1
      ? '<div class="bg mb3"><button class="btn btn-solid" type="button"' + (offline ? ' disabled' : '') + ' onclick="CH_GRID.startChapter(\'' + lv + '\',\'' + ch + '\',\'flashcard\')">Practise the whole chapter</button>' +
        '<button class="btn btn-quiet" type="button"' + (offline ? ' disabled' : '') + ' onclick="CH_GRID.startChapter(\'' + lv + '\',\'' + ch + '\',\'exam\')">Timed test</button></div>'
      : '';
    openMod(name, head + '<div class="rows">' + rows + '</div>');
  },

  go(fid, mode){ closeMod(); this.startFid(fid, mode); },

  startFid(fid, mode){
    const r = this._ref(fid);
    if (!r) { toast('That set is not available.'); return; }
    const name = ChapterData.chapterName(r.lv, r.ch) + ' \u2014 ' + r.book;
    QUIZ.load(r.fid, r.key, mode, name, { lv: r.lv, ch: r.ch, book: r.book, sub: r.subtopic, fid: r.fid });
  },

  async startChapter(lv, ch, mode){
    closeMod();
    const refs = ChapterData.chapterFileRefs(lv, ch);
    if (!refs.length) return;
    QUIZ._showLoader('Loading ' + refs.length + ' sets…');
    const all = [];
    let i = 0, done = 0, failed = 0;
    const worker = async () => {
      while (i < refs.length) {
        const ref = refs[i++];
        try { all.push(...normQ(await QUIZ._fetch(ref.fid, ref.key), ref.fid)); }
        catch(e){ failed++; }
        done++;
        const m = $('quiz-loader-msg');
        if (m) m.textContent = 'Loading sets (' + done + '/' + refs.length + ')…';
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, refs.length) }, worker));
    QUIZ._hideLoader();
    if (!all.length) { toast('Could not load this chapter. Download it while online first.', 5000); return; }
    if (failed) toast(failed + ' set(s) could not load. Starting with ' + all.length + ' questions.', 4000);
    QUIZ.startWith(all, mode, ChapterData.chapterName(lv, ch) + ' \u2014 ' + refs[0].book, { lv: lv, ch: ch });
  }
};

/* Announcement banner from the admin console. Also watches the content
@@@ END

@@@ EDIT usr4-chapters-hook
@@@ OLD
if (real === 'weekly' && typeof WEEKLY !== 'undefined') {
@@@ NEW
if (real === 'online' && typeof CH_GRID !== 'undefined') CH_GRID.render();

  if (real === 'weekly' && typeof WEEKLY !== 'undefined') {
@@@ END


@@@ FILE app.js

@@@ EDIT app4-save-soon-call
@@@ OLD
if(correct) S.prog.correct = (S.prog.correct || 0) + 1;
    _save(LS.PROG, S.prog);
@@@ NEW
if(correct) S.prog.correct = (S.prog.correct || 0) + 1;
    PROG._saveSoon();
@@@ END

@@@ EDIT app4-save-soon-methods
@@@ OLD
  recordSession(sess){
@@@ NEW
  /* Progress is written in a batch shortly after the last answer instead of
     rewriting the whole history on every tap (kinder to low-end phones), and
     always flushed when the page is hidden or closed. */
  _st: null,
  _saveSoon(){
    if(PROG._st) clearTimeout(PROG._st);
    PROG._st = setTimeout(() => { PROG._st = null; _save(LS.PROG, S.prog); }, 400);
  },
  flushNow(){
    if(PROG._st){ clearTimeout(PROG._st); PROG._st = null; _save(LS.PROG, S.prog); }
  },

  recordSession(sess){
@@@ END

@@@ EDIT app4-save-soon-flush
@@@ OLD
window.PROG = PROG;
@@@ NEW
window.PROG = PROG;
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') PROG.flushNow(); });
window.addEventListener('pagehide', () => PROG.flushNow());
@@@ END

@@@ EDIT app4-content-index
@@@ OLD
    if(!S.cov || !Object.keys(S.cov).length) COV.rebuildFromSessions();
@@@ NEW
    if(!S.cov || !Object.keys(S.cov).length) COV.rebuildFromSessions();
    /* Known question counts (content-index.js) make progress bars right from the first launch. */
    if(window.CONTENT_INDEX && typeof window.CONTENT_INDEX === 'object'){
      Object.keys(window.CONTENT_INDEX).forEach(k => { if(S.fcount[k] == null) S.fcount[k] = window.CONTENT_INDEX[k]; });
    }
@@@ END


@@@ FILE sw.js

@@@ EDIT sw4-content-index
@@@ OLD
  './config.js',
@@@ NEW
  './config.js',
  './content-index.js',
@@@ END


@@@ FILE README.md

@@@ EDIT rd4-notes
@@@ OLD
## What v1.16 added
@@@ NEW
## What v1.17 added

- **Chapters screen:** chapter cards with progress, a Continue card, and a set picker (or "practise the whole chapter") instead of four dropdowns. The dropdowns remain below as "step by step".
- **Sign in with email or mobile number** as well as the username (`resolveLoginIdentifier_` in `code.gs`).
- **Payments:** the screenshot is shrunk on the phone before upload; Settings has a "Typical approval time" line shown to students after they pay.
- **Question counts:** run `buildContentIndex()` in Apps Script (needs `private-files.gs`), copy the log output into `content-index.js`, commit. Progress bars are then exact from the first launch and no file has to be opened just to count it.
- **Content-Security-Policy** on `index.html`, `user.html` and `admin.html` (a `<meta>` tag, since GitHub Pages cannot set headers). If you add a new external host, add it to the policy in all three pages; `tests/check.js` fails when a page uses a host the policy does not allow.
- **Smoother answering:** progress is saved in batches (400 ms after the last answer, and whenever the page is hidden).

## What v1.16 added
@@@ END


@@@ CREATEONCE content-index.js
/* ═══════════════════════════════════════════════════════════════════════
   CONTENT-INDEX.JS: number of questions in each question file.

   Generate it: in Apps Script run buildContentIndex() (content-index.gs),
   then paste the result from the log over this file and commit it.
   Leaving it empty is fine: counts are then learned as chapters are opened.
   ═══════════════════════════════════════════════════════════════════════ */
window.CONTENT_INDEX = window.CONTENT_INDEX || {};
@@@ END

@@@ NEWFILE content-index.gs
/* content-index.gs (v1.17)
   Counts the questions in every registered question file and prints a ready-to-commit
   content-index.js. Needs private-files.gs (it provides CONTENT_FILE_IDS).

   HOW TO USE
     1. Run buildContentIndex() from the Apps Script editor.
     2. Open View > Logs (or the Execution log) and copy everything between the lines.
        The same text is also saved as content-index.js in the root of your Drive.
     3. Paste it over content-index.js in your repo and commit.
   Run it again whenever you add or remove questions. */
function buildContentIndex() {
  if (typeof CONTENT_FILE_IDS === "undefined") {
    throw new Error("Add private-files.gs to this Apps Script project first.");
  }
  const map = {};
  let failed = 0, skipped = 0;
  const started = Date.now();
  for (let i = 0; i < CONTENT_FILE_IDS.length; i++) {
    if (Date.now() - started > 5 * 60 * 1000) { skipped = CONTENT_FILE_IDS.length - i; break; }
    const id = CONTENT_FILE_IDS[i];
    const res = readJsonFileById_(id);
    if (!res.success) { failed++; continue; }
    const arr = _questionArray_(res.result);
    if (arr) map[id] = arr.length;
    else failed++;
  }
  const keys = Object.keys(map);
  const body = keys.map(k => '  "' + k + '": ' + map[k]).join(",\n");
  const text =
    "/* CONTENT-INDEX.JS: question count per file. Generated " + new Date().toISOString() + " by buildContentIndex(). */\n" +
    "window.CONTENT_INDEX = {\n" + body + "\n};\n";

  const name = "content-index.js";
  const it = DriveApp.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else DriveApp.createFile(name, text, MimeType.PLAIN_TEXT);

  Logger.log("----- copy from here -----\n" + text + "----- to here -----");
  const msg = "Counted " + keys.length + " files. Failed: " + failed + (skipped ? ". Stopped early, " + skipped + " left: run it again." : ".");
  Logger.log(msg);
  return msg;
}
@@@ END


@@@ FILE tests/check.js

@@@ EDIT tst4-more
@@@ OLD
console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + warned + ' warnings');
@@@ NEW
/* ── 8. Content-Security-Policy stays in step with the pages ───────── */
section('Security policy');
['index.html', 'user.html', 'admin.html'].filter(exists).forEach(f => {
  const html = read(f);
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  ok(f + ' has a Content-Security-Policy', !!m);
  if (!m) return;
  const policy = m[1];
  const dir = name => ((policy.match(new RegExp('(?:^|;)\\s*' + name + '\\s+([^;]+)')) || [])[1] || '');
  const scriptSrc = dir('script-src'), styleSrc = dir('style-src');
  const bad = [];
  let x;
  const sre = /<script\b[^>]*\bsrc="(https?:\/\/[^"\/]+)/gi;
  while ((x = sre.exec(html))) if (scriptSrc.indexOf(x[1]) === -1) bad.push('script ' + x[1]);
  const tre = /<link\b[^>]*>/gi;
  while ((x = tre.exec(html))) {
    if (!/rel="stylesheet"/i.test(x[0])) continue;
    const h = (x[0].match(/href="(https?:\/\/[^"\/]+)/i) || [])[1];
    if (h && styleSrc.indexOf(h) === -1) bad.push('style ' + h);
  }
  ok(f + ': every external script and stylesheet host is allowed', !bad.length, bad.join(', '));
  ok(f + ': policy blocks plugins and foreign base URLs', /object-src 'none'/.test(policy) && /base-uri 'self'/.test(policy));
});

/* ── 9. Content index ──────────────────────────────────────────────── */
section('Content index');
if (exists('content-index.js')) {
  const ictx = vm.createContext({ window: {} });
  ictx.window = ictx;
  let idxOk = true, idxMsg = '';
  try { vm.runInContext(read('content-index.js'), ictx); } catch (e) { idxOk = false; idxMsg = e.message; }
  ok('content-index.js runs', idxOk, idxMsg);
  const map = ictx.CONTENT_INDEX || {};
  const unknown = Object.keys(map).filter(k => ids.indexOf(k) === -1);
  ok('content-index.js only lists registered files', !unknown.length, unknown.length + ' unknown');
  ok('content-index.js counts are positive numbers', Object.keys(map).every(k => Number.isInteger(map[k]) && map[k] > 0));
  if (!Object.keys(map).length) warn('content-index.js is empty', 'run buildContentIndex() in Apps Script for exact progress bars');
} else {
  warn('content-index.js is missing');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + warned + ' warnings');
@@@ END
'''


# ---------------------------------------------------------------------------
#  Engine
# ---------------------------------------------------------------------------
def say(msg=""):
    print(msg)


def die(msg):
    say("\n[STOPPED] " + msg)
    say("Nothing was changed.")
    sys.exit(1)


def parse_data(raw):
    raw = raw.replace("__CSP__", CSP)
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
            elif tag in ("NEWFILE", "WRITE", "CREATEONCE"):
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
    for must in ("index.html", "user.html", "admin.html", "app.js", "objective.js", "code.gs", "version.js", "sw.js"):
        if not os.path.exists(os.path.join(HERE, must)):
            die("Cannot find %s next to patch4.py. Put patch4.py in the ROOT of your repo." % must)

    ver = read_text("version.js")[0]
    if "APP_VERSION = '1.16'" not in ver and "APP_VERSION = '1.17'" not in ver:
        die("This is phase 4. Run patch.py, patch2.py and patch3.py first, then run patch4.py.")

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
        elif kind == "createonce":
            st = get(rel)
            if st["exists"]:
                log.append("  [skip] %-30s %s (kept: you may have generated it)" % (kind, rel))
            else:
                st["text"] = op["body"] + "\n"
                log.append("  [ ok ] %-30s %s" % (kind, rel))

    say("Abhyas v1.17 patch (phase 4)")
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
        say("Nothing was written and patch4.py was kept.")
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
        say("\nUpdated / created %d file(s). Originals are in .patch-backup-1.17/" % len(changed))

    if not DRY and have_node() and os.path.exists(os.path.join(HERE, "tests", "check.js")):
        say("\nRunning the checks (node tests/check.js) ...")
        try:
            r = subprocess.run(["node", os.path.join(HERE, "tests", "check.js")],
                               capture_output=True, text=True, timeout=180)
            for l in r.stdout.splitlines():
                if l.startswith("  FAIL") or l.startswith("  warn") or "passed" in l:
                    say(l)
            if r.returncode != 0:
                say("  Some checks failed. Run  node tests/check.js  to see what they point at.")
        except Exception as ex:
            say("  could not run the checks: %s" % ex)

    say("\nNEXT STEPS")
    say("  1. Backend: paste the new code.gs AND content-index.gs into Apps Script, then")
    say("     Deploy > Manage deployments > Edit > New version.")
    say("  2. In Apps Script run buildContentIndex(), copy the log text over content-index.js,")
    say("     commit. (Optional, but makes every progress bar exact.)")
    say("  3. Hard-reload the site once so the v1.17 service worker installs.")
    say("  4. IMPORTANT: open index.html, user.html and admin.html once with the browser console")
    say("     open. The new Content-Security-Policy would show a red message there if it blocked")
    say("     something you use. Sign in with Google, open a PDF and a chapter as a check.")
    say("     If anything is blocked, add its host to the policy (all three pages) or delete the")
    say("     'Content-Security-Policy' <meta> line to switch it off.")
    say("  5. Delete the .patch-backup-1.17 folder when you are happy.")

    if not KEEP:
        try:
            os.remove(os.path.abspath(__file__))
            say("\npatch4.py has deleted itself.")
        except OSError as ex:
            say("\nCould not delete patch4.py automatically (%s). Delete it by hand." % ex)


if __name__ == "__main__":
    main()
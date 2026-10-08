# Abhyas

Offline-first study app for Nepal's Lok Sewa Aayog Level 7 Civil Engineering exam, plus Level 5 Engineering and General Knowledge. Built as a static PWA on top of Google Apps Script + Google Sheets + Google Drive. No build step, no bundler, no server to run.

Client version: 1.32 (version.js)
Backend version: 1.32 (code.gs)
Both must match. tests/check.js fails if they drift.

---

## What it does

For a student studying alone:

- Chapters downloaded to the device, working with no connection during load-shedding or on the bus
- Flashcard practice with instant feedback, and a timed exam mode
- A wrong-answer bank using spaced repetition (1, 3, 7, 14-day intervals), so questions come back just before you would forget them
- Study PDFs: admins upload model answers, notes and past papers (Admin > Study PDFs); students read them under Written answers > Model answers & notes, with search, type filters, a New badge, offline copies, and a button on marked written submissions that opens the model answers for that chapter
- Question reports and corrections: a report button wherever a question appears; the admin sees the options, the marked answer, what the student picked, the section and how many students reported it; fixing a question replaces it on every phone within minutes, including the copies saved in Missed / Saved / Flagged and weekly papers
- Loksewa mark scheme (Admin > Settings): the daily 75-mark paper is built to the groups and marks you enter; Loksewa marking and the group / chapter tables show only on the weekly test, the daily paper and the hourly 50
- A 60-day sprint card on Home: Learn (days 1-35), Drill (36-52) and Mock (53-60) phases with daily topic, question and time targets, plus an ahead/behind pace indicator
- A Today's plan card on Home: weakest chapters, spaced review due, and one new topic, in one tap
- An exam readiness score with confidence, and per-chapter strength verdicts
- Confidence rating after each answer (Sure / Not sure / Guessed), which surfaces misconceptions: things you were sure about and got wrong
- Recovery mode after three or more days away: five easy questions instead of a wall of overdue reviews
- Streak forgiveness: one silent missed day per chain
- Written-answer practice: Question of the Day and full 100-mark papers, uploaded as photos (converted to PDF on the phone) or a PDF, marked by an admin, annotations visible in the app
- Weekly tests: one attempt, timed, server-authoritative start, submit and rank
- Read-aloud button on every question (SpeechSynthesis)
- Full-screen image zoom for engineering figures
- Copy-explanation button for sharing to study groups

For an admin:

- Verify or reject payments (bulk actions supported)
- Grant access (permanent or one year), bulk or single
- Edit or delete students
- Growth panel: sign-ups and approved payments per day, paid rate, revenue estimate
- Fix-the-question editor: correct a reported question directly from the Reports tab; a backup is kept
- Weekly test management: upload, schedule, preview before publishing, view results
- Most-missed-questions analytics
- Announcement banner shown to all students
- Edit payment QR, amount, trial length, approval-time text
- Activity log of every admin action
- Admin permissions: an owner can create admins with granular feature access

---

## Layout

```
index.html  user.html  admin.html  privacy.html  terms.html    Pages (stay at the root: URLs and the PWA depend on them)
sw.js  manifest.json                                           Service worker and PWA manifest (must be at the root)
icon-192.png  icon-512.png  favicon.png                        App icons (root, so existing installs and link previews keep working)

js/
  core/    config.js          GAS_URL, single source of truth for the backend
           version.js         APP_VERSION (client)
           shared.js          Cross-page utilities: sprint planner, progress insights,
                              multi-device merge, frameThrottle
           nav.js             Student navigation: sidebar, phone menus, page headers (one list)
           admin-nav.js       Admin navigation: rail, titles, permissions (one list)
           firebase-config.js Firebase Cloud Messaging config (optional)
  app/     app.js             Core: state, auth, sync, offline, timetable, home
           objective.js       MCQ engine, chapter picker, mixed practice, review
           subjective.js      Written answers: QOTD, exam, Smart Paste parser
           cloud-sync.js      Optional backup to the student's own Google Drive (5 versions, checksum, additive restore)
           storage-health.js  Storage meter and 80% warning, storage breakdown, backup reminder
           display-prefs.js   Text size, high contrast, AMOLED black
           pdf-viewer.js      Shared PDF reader and ink annotation layer
           user-page.js       Student-page features: sprint card, insights charts, sidebar, tools
  data/    chapters-loader.js     Loads chapters-data.js from Drive
           subjective-data.js     Drive file IDs for the written-answer bank
           subjective_chapters.js Written-answer syllabus
           content-index.js       Question count per Drive file (progress bars)

css/       design-system.css      Shared theme tokens
vendor/    Self-hosted fonts, KaTeX, pdf.js, pdf-lib, confetti
gas/       Apps Script files (pasted into the editor, not loaded by the browser)
  code.gs             Backend, all endpoints
  setup.gs            Run-once setup
  private-files.gs    Content file ID list and makeContentFilesPrivate()
  content-index.gs    buildContentIndex() which generates js/data/content-index.js
  debug.gs            Diagnostics (do NOT add to the production project)
tests/check.js        Syntax, links, file references, versions, behaviour, CSP, handlers, navigation, auth audit, contrast, offline cache
tests/browser/        Real-browser checks (accessibility audit, offline start); need `npm i --no-save puppeteer-core @sparticuz/chromium axe-core`, see its README
vendor-assets.py      Re-download vendor/ from npm
```

Script load order is set in each page. user.html loads core, then data, then app files, so keep that order when adding a file. The test "File references resolve" fails if any page, the service worker or the manifest points at a file that is missing.

---

## Setup

Step 1: Deploy the backend in Apps Script

- Open script.google.com and create a New project
- Create a file for each of these and paste the matching content from gas/: code.gs, setup.gs, content-index.gs, private-files.gs
- In the editor, add Services, then Drive API (v3). This is needed to overwrite marked PDFs.
- Run setup() once from the function dropdown. This creates all sheets, seeds the owner admin, and installs the daily triggers.
- Run showInitialAdminPassword() from the dropdown. Copy the one-time password from the log; it is deleted immediately after.
- Deploy as a New deployment, type Web app. Execute as Me, and allow access to Anyone.
- Copy the /exec URL.

Step 2: Wire the frontend

Open config.js and set GAS_URL to the /exec URL.

Step 3: Content

Question files are JSON on Drive, registered by file ID in chapters-data.js (a Drive file, loaded at runtime by chapters-loader.js) and subjective-data.js. After adding files, run makeContentFilesPrivate() once from the Apps Script editor so the paywall in getFile cannot be bypassed.

Step 4: Optional exact progress bars

Run buildContentIndex() from the Apps Script editor. Copy the output over content-index.js and commit. Without it, progress bars still work; they just learn the totals as chapters are opened.

Step 5: Host the files

Any static host works: GitHub Pages, Cloudflare Pages, Netlify, Firebase Hosting. PWA install requires HTTPS or localhost.

---

## Running the tests

    node tests/check.js        (or: npm test)

Checks:

- Every JS file and inline script block parses
- version.js and gas/code.gs agree
- Every script src and link href in the HTML resolves
- Every entry in sw.js's SHELL list exists
- manifest.json is valid JSON
- No private keys are committed
- Behaviour tests on normQ, isOk, COV, PSYNC._syncPayload, REV.trackAnswer, SUBJ_SMART
- Every onclick handler target exists
- Content-Security-Policy in all three pages allows exactly the hosts they use
- content-index.js (if populated) only lists registered files

Exit code is non-zero on failure, so it is CI-safe. .github/workflows/check.yml runs it on every push.

---

## How data flows

Browser sends POST requests to Apps Script, which reads and writes Google Sheets and Google Drive.

- Sheets are the database: Users, Payments, Settings, Logs, Admins, Progress, PushTokens, WeeklySets, WeeklyAttempts, WeeklyStarts, QuestionReports, SubjectiveSubmissions, AdminPermissions, ProgressImports, ProgressBackups
- Drive hosts content: question JSON, payment screenshots, submitted PDFs, weekly-set uploads
- The browser keeps its own copy: sessions in localStorage, question sets and per-file coverage in IndexedDB, everything else in localStorage

---

## Offline

The service worker caches the app shell network-first with a four-second timeout. Question files, fonts, KaTeX, pdf.js and pdf-lib are cached on first use. Once a chapter is downloaded, it opens with no connection at all.

admin.html is deliberately never served from cache.

---

## Things that must stay in sync

APP_VERSION         version.js and gas/code.gs
GAS_URL             config.js
Cache key           level_chapter_book_subtopic, built once in chapters-data.js and used by ON, PSY, CACHE and QUIZ
abhyas_session      Written by index.html, read by app.js
Progress payload    prog, chapStats, cov, bk, fl, wr, stk (45,000 character limit)
sw.js SHELL list    Must include every same-origin file the app loads
CSP                 Every external host in any of the three pages must be allowed

node tests/check.js catches drift on most of these.

---

## Notes

- The admin seed password is random and shown once. The owner is forced to change it at first login.
- Google Sign-In: set the OAuth client ID in config.js and gas/code.gs, and add your origin to the authorised list.
- Push notifications require a Firebase project. Fill in firebase-config.js and set FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY in Apps Script Script Properties. Without these, PUSH.supported() returns false and the notification buttons are hidden; nothing breaks.
- Delete gas/debug.gs from the production Apps Script project before going live. It contains a password-reset helper.
- MailApp has a daily quota (about 100 recipients on a free Gmail account). Password resets and verification emails count against it.

---

## Status

v1.26   Sidebar simplified: search / heatmap / share / export moved to the
        Progress page. Small topbar search icon. More tools section removed.
        Sidebar finder searches both screens and questions in one input.
v1.25   Loksewa paper 75 questions at 60-minute timer, focus mode removed,
        sidebar trimmed under More tools, Daily 10 auto-hides, practice resume
v1.24   Daily 10, study calendar, chapter forecast, weekly digest, hardest-20
        drill, syllabus progress, daily 75-mark Loksewa paper (25 GK + 50 L7),
        compact sidebar with More tools
v1.23   Note shown only after the question is answered; weakest-question
        flag, note sync, "practice 5 more like this", question history,
        global search, keyboard sheet, focus mode, export notes
v1.22   Personal notes on any question
v1.21   Hard-question badge renders, note on missed questions, answer-changed tracking
v1.20   Missed questions by chapter, syllabus heatmap, Loksewa-format mock paper,
        hard-question badge, hourly grading tab, rich Google AI prompt,
        skipped-exam-answer fix, careless / concept-gap tagging
v1.19   Confidence rating, misconceptions, recovery mode, read-aloud
v1.18   Today's plan, exam readiness, resume, chapter verdicts, streak forgiveness, image zoom, fast-guess flag
v1.17   Chapters grid, Content-Security-Policy, content index
v1.16   Question editor, growth panel, announcements, tests
v1.15   Weekly test start/resume/rank recorded on the server, cached settings, nightly backup, crash reports
v1.14   Self-service data control, offline hardening

Tests: 383 passing, 0 failing.

---

## Contact

Abhyas is an independent product. Not affiliated with Lok Sewa Aayog or any government office.

Email: abhyasbymku@gmail.com
Live:  https://app.mku.name.np/
# Abhyas: Loksewa Civil Engineering exam prep

Offline-first practice app for Nepal's Lok Sewa Aayog Level 7 Civil Engineering exam, plus Level 5 Engineering and General Knowledge. Static HTML/JS frontend, Google Apps Script + Google Sheets/Drive backend, installable as a PWA. No build step.

- Frontend version: `version.js` (`APP_VERSION`). Backend version: `code.gs` (`APP_VERSION`). **Bump both together.**
- Live address and Google client ID: `config.js` (single source; `cloud-sync.js` and `index.html` still keep a copy of the client ID).

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page, sign in / sign up / reset, trial countdown, manual payment, hand-off to the app |
| `user.html` | The student app (quizzes, weekly test, written answers, progress, downloads, backup) |
| `admin.html` | Admin console (students, payments, weekly sets, grading, reports, settings, upkeep) |
| `privacy.html`, `terms.html` | Legal pages, linked from the sign-up form and the app |

## Scripts (loaded by `user.html` in this order)

`config.js` → `version.js` → `shared.js` → `chapters-data.js` → `subjective_chapters.js` → `subjective-data.js` → `app.js` → `objective.js` → `subjective.js` → `cloud-sync.js` → `pdf-viewer.js`

- `app.js`: state, storage, auth, sync (`PSYNC`), coverage store (`COV`), home, study plan, downloads, data tools, tutorial, boot.
- `objective.js`: MCQ engine (`QUIZ`), chapter picker (`ON`), mixed practice (`PSY`), review lists (`REV`), progress panel (`ONPROG`).
- `subjective.js`: question of the day, full paper, custom paper, question list, photo-to-PDF upload, Smart Paste parser used by the admin.
- `pdf-viewer.js`: the one PDF reader/marker used by students and admins.
- `sw.js`: service worker (network-first shell with a timeout, offline CDN assets, tolerant precache).

## Backend (Apps Script)

`code.gs` (API), `setup.gs` (run-once setup), `debug.gs` (**delete before sharing the project**), `private-files.gs` (one-off: make content files private).

First deploy:
1. Create an Apps Script project and paste `code.gs`, `setup.gs`, `private-files.gs`. Enable **Services → Drive API** (needed to overwrite marked PDFs).
2. Run `setup()`, then `showInitialAdminPassword()`. Sign in as `admin` and change the password when asked.
3. Set Script Properties if you use push: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
4. Run `makeContentFilesPrivate()` once so no question file is reachable by a public link.
5. Deploy as a Web app (Execute as me, access: Anyone). Put the `/exec` URL in `config.js`.

Updating: paste the new `code.gs`, then **Deploy → Manage deployments → Edit → New version** (the URL stays the same).

## Things that must stay in sync

- `APP_VERSION` in `version.js` and `code.gs`.
- `SHELL` in `sw.js` must list every file the app loads from its own origin.
- Cache key for a question set: `level_chapter_book_subtopic` (built in `chapters-data.js`).
- The `abhyas_session` localStorage shape (written by `index.html`, read by `app.js`).
- The synced progress object: `prog`, `chapStats`, `cov`, `bk`, `fl`, `wr`, `stk` (max 45,000 characters).

## How progress is stored

- `S.prog.sessions`: last 50 sessions (with per-question results while they fit).
- `S.cov`: one small record per question file (`p` = one character per question, `a` attempts, `c` correct). Coverage screens read this, so they do not shrink when old sessions are trimmed.
- The sync payload always fits: per-question detail is dropped from the oldest sessions first.

## Content

Question files are JSON in Drive, registered in `chapters-data.js` (objective) and `subjective-data.js` (written). Keep every file **private**; the script reads them as its owner. Weekly sets are uploaded from the admin console.

## Before you launch: checklist

- [ ] Replace the Water Resource file in `subjective-data.js` (it still holds Geotechnical content).
- [ ] Run `makeContentFilesPrivate()` in Apps Script.
- [ ] Configure push (`firebase-config.js` + Script Properties) or leave it off.
- [ ] Self-host pdf.js in `vendor/pdfjs/` (offline marked papers) and Inter/KaTeX if you want fully offline typography.
- [ ] Provide a maskable app icon (with safe-zone padding) in `manifest.json`.
- [ ] Delete `debug.gs` from the production Apps Script project.
- [ ] Have the Terms and Privacy pages reviewed by someone qualified.

## What v1.15 added

- **Weekly test integrity:** the start of a graded weekly test is recorded on the server (`WeeklyStarts` sheet). Restarting cannot be used to peek at the questions; a saved test can be resumed on the same device, and the server refuses submissions long after the window closes. Rank and percentile appear when the window closes (`getWeeklyStanding`).
- **Backend:** Drive uploads happen before the script lock is taken; public settings are cached for two minutes; a nightly trigger copies the spreadsheet into the `AbhyasBackups` Drive folder (last 14 kept); `logClientError` stores short crash reports in the Activity log.
- **Study flow:** unseen questions come first, weak-topic mode targets chapters under 60%, timed tests have a question grid and mark-for-review, the picker skips the pointless book step, and Home has an exam-date countdown.
- **Self-hosted assets:** `vendor-assets.py` downloads pdf.js, pdf-lib, KaTeX, confetti and the Inter/JetBrains Mono fonts from the npm registry into `vendor/` and points the pages at them. Safe to re-run; run it again after any version bump.

## Known limits

- Google Sheets is the database: fine for a launch, plan a move to a real database before very large exam-season traffic.
- Payments are verified by a person; there is no payment gateway yet.
- `MailApp` has a daily quota (about 100 recipients on a free Gmail account).

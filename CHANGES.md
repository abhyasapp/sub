# v1.32 changes

## Security
- `getFile` served any Drive file the script owner could read. It now serves only CONTENT_FILE_IDS and files in the
  WeeklySets / SubjectiveQuestions folders. Weekly-set files reach students only after release time (gas/code.gs).
- Weekly tests: the server now uses its own recorded start time to compute duration, and rejects a submission whose
  answer count does not match the answer key instead of trusting the client's score.
- Duplicate payment transaction IDs across accounts are rejected.
- Password-reset global cap raised from 10 to 40 per hour (the old cap let one attacker block everyone) and mail quota is checked.

## Performance (login and every authenticated request)
- `_findRowFast_` caches the row number of a key (never the data), re-reads and re-verifies the live row, and falls back to
  the TextFinder scan only on a miss. It also does one sheet read instead of two.

## Correctness
- Spaced repetition: the 14-day review was never reached (questions graduated after the 7-day review). Fixed.
- index.html and admin.html closed inline scripts with `<\/script>`, which browsers do not treat as a closing tag. The
  session-bridge and frame-busting scripts and the icon/manifest links after them were swallowed. Fixed.

## More fixes (second pass)
- **Weekly test crash:** the student page called `MODAL.sheet()`, which only existed in admin.html. Opening an
  already-attempted weekly test threw a ReferenceError. Added a student-side `MODAL` (Esc / backdrop close, focus restore).
- **Sync failures:** personal notes were never trimmed, so enough of them made every progress sync fail permanently.
  Oldest notes are now dropped last when the payload nears the 45,000-character server limit.
- **Sprint follows you:** the sprint start date now syncs with progress, so a new device restores the same day number.
- **Reset link:** the emailed token is now in the URL #fragment (not sent to servers or Referer headers). Old ?query links still work.
- Sprint card shows minutes studied today against the day's target.

## Third pass
- **Two devices no longer overwrite each other.** The server compares the revision a device last saw. If another device
  saved first, it returns that copy; the app merges both (sessions, coverage, bookmarks, flashcards, review queue,
  study days, notes, sprint date; nothing is dropped) and saves the combined result. Old clients keep working.
- **Username enumeration closed.** Unknown usernames now lock after the same 5 failures, with the same message, as real
  accounts, using the evicting cache so storage stays bounded.
- **Passwords:** students need 8+ characters (was 6) on signup, reset and admin set; the most common passwords,
  repeated characters and passwords containing the username are rejected. Existing passwords still work.
- Tests extended to 112: merge rules, password rule, revision comparison.

## Speed, structure and progress charts (fourth pass)
- **Folders:** scripts now live in `js/core`, `js/app` and `js/data`; the stylesheet is in `css/`. Pages, `sw.js`, `manifest.json`
  and the icons stay at the root so URLs, PWA installs and link previews keep working. A new test fails if any page, the
  service worker or the manifest references a missing file (and it was checked against a deliberately stale path).
- **Lag:** found with a headless boot of the student page. Submitting a 75-question exam called `HOME.updateBadges` 117
  times and re-rendered Home 4 times in one burst. Home renders now run once immediately, and repeat calls in the same
  frame collapse into one. Measured in the headless test: exam submit 983 ms to about 620 ms; 10 back-to-back Home
  renders 135 ms to under 1 ms. Answering an exam question also searches inside its own card instead of the whole page.
- **Progress Insights (Progress page):** questions per day for 14 days against a daily goal, score trend with a 70% line,
  this-week-vs-last-week questions, accuracy and study time, and a 12-week study-day grid with streak. Inline SVG, no
  library, no network. The numbers come from `insightsData()` in shared.js and are unit-tested.

## Navigation, Home and exam marks (fifth pass)
- **Marks no longer show during an exam.** The daily 75-mark Loksewa paper had a live "Score" tile in the exam bar. Because
  it moved after every answer, a student could tell which answers were right. Removed. The weekly test never showed one.
- **One marking rule everywhere.** Weekly tests and the daily Loksewa paper use +1 right, -0.2 wrong, 0 skipped. The daily
  paper's headline used to be the plain percentage (50%) while the line under it said 44%; both now say 44%. On the server,
  weekly rankings, the student's restored history and the admin results used plain correct/total; they now use the same
  marks (function `weeklyMarks_`). Past weeks re-rank by marks, since nothing is stored per mark. A negative total shows as 0%.
- **Student navigation defined once** (`js/core/nav.js`): the sidebar, the phone menus and every page header are generated
  from one list. Before, they were written in four places that had drifted: Hourly challenge was missing from the phone
  menu (patched in by a separate script), and the heatmap was in no menu at all. Groups are now Practice, Written answers,
  Review, Progress & plan, Tools; groups collapse and remember their state; the group of the current screen opens itself.
- **Screen hooks** (`UI.onEnter`, `UI.onEnterAny`) replace three stacked wrappers around `UI._goRaw`.
- **Home** has one Today card (greeting, sprint, plan, start buttons) instead of five cards that each said "start", the exam
  date and predicted readiness share one Goal card, and the duplicate "This week" row was removed. The sprint block is a compact strip.
- **Admin navigation defined once** (`js/core/admin-nav.js`): the rail, `UI.TITLES` and `UI.FEATURES` come from one list.
- **Login page:** removed the "New to Abhyas? Create an account" and "Already registered? Sign in" lines; the tabs at the
  top already do that and show in exactly those two modes.
- Fixed a missing icon (`ph-seedling`) on the First 100 badge.
- Tests: 169, including navigation consistency, admin navigation, negative marking and "no marks during an exam".

## Study PDFs from the admin (sixth pass)
- **Admin:** new Content > Study PDFs screen. Upload a PDF (under 9 MB) with a title, type (model answers, notes, past papers,
  syllabus, other), a short note and an optional written-answer chapter; edit, hide or show, open to preview, delete.
  Permissions `studydocs_view` and `studydocs_manage` can be granted to sub-admins in the "Add an admin" screen.
- **Student:** Written answers > Model answers & notes. Search, type filters, a "New" tag and sidebar count for PDFs added
  since the last visit, and PDFs you have opened are kept on the device so they read offline (newest 20, up to 8 MB each;
  offline copies of PDFs the admin hides or deletes are removed on the next online visit). When a written answer has been
  marked, its card shows a "model answer" button if the admin tied a PDF to that chapter.
- **Security:** files sit in a private Drive folder and are only served through `getStudyDocPdf`, which checks sign-in and the
  paid-access gate and rate-limits requests. Students never receive a Drive file id or link. Uploads are checked on the server
  for size and for real PDF bytes.
- Tests: permissions are now cross-checked (every permission the backend checks exists and can be granted, except the
  deliberately owner-only `admins_manage`, which the test confirms is role-enforced), plus 36 tests for the study-PDF rules.

## Review of the remaining files (seventh pass)
- **Offline bug fixed:** `sw.js` never precached `js/app/user-page.js`, the biggest student script (Home sprint card, insights,
  study PDFs, sidebar search, achievements). After a first visit, going offline left those features missing. Proven with a real
  browser: server stopped, page reloaded, the script was not loaded before the fix and is now. A new test fails if any script,
  stylesheet or image the public pages load is missing from the offline list.
- **Accessibility (axe-core, WCAG 2.1 AA, real Chromium, 15 screens in light and dark): 0 violations.** Fixed: the admin side rail
  buttons had no accessible name (icons only); muted text colours were below 4.5:1 in several places (light `--ink-3`, the login
  footer, the admin dark theme, tinted buttons, the admin dark error banner); links inside sentences relied on colour alone; the
  achievements strip was not keyboard-reachable and its locked items were nearly invisible. A test now reads the CSS colour tokens
  of all three pages in both themes and fails below 4.5:1.
- **Security audit made permanent:** all 91 backend actions were checked. Only the 9 intended public ones (login, sign-up, password
  reset, public info/settings, client error log, admin login) lack an authentication check, and a test now fails if a new endpoint
  is added without one. Self-service admin actions (change own password, list admins) are confirmed to act on the caller's own
  account only. No duplicate names exist across the five Apps Script files (they share one global scope).
- **Formula injection:** study-PDF titles and notes that start with = + - @ are now neutralised before they reach the sheet.
- Lint (eslint:recommended with cross-file globals) is clean on every script. Toasts use `textContent`, so error messages cannot
  inject HTML.
- `tests/browser/` added: `a11y.js` and `offline.js` for repeatable real-browser checks.

## Data-loss fix: sync only ever adds (eighth pass)
**What went wrong.** A student's large missed-question bank was cut down after "Combined progress from your other device".
Two things combined. (1) The cloud copy has always been limited to about 45,000 characters, and to fit it the app cut the lists
down (a bank of 250 became about 20) before uploading. (2) The two-device merge added earlier in v1.32 started from that
cut-down copy instead of the full data on the device, and then wrote the result back over the device. Reproduced: 250 missed and
60 saved questions became 21 and 20.

**What changed.**
- Every merge starts from the complete data on the device, and a result smaller than what the device already had is refused.
- The cloud copy is the complete state, compressed (`gz1:`) when large; a 2,000-question bank fits. Small copies stay plain JSON.
  If a copy cannot fit even compressed, nothing is cut and nothing is uploaded; the device keeps everything.
- The page-closing upload never sends a cut-down copy.
- "Restore", "Load a backup file", first sign-in on a new device and every save conflict now ADD to the device. Nothing replaces
  anything. (Before, Restore and file import replaced the lists wholesale.)
- Safety copies: before any of those changes, the device keeps the last 3 copies of its own data (Data > Recover data > Add back).
  The server also keeps up to 3 earlier cloud copies per student (sheet `ProgressHistory`, taken at least 30 minutes apart, and
  always when a save would make the copy much smaller). Adding a copy back only adds.
- Running totals (questions answered, correct) and earned badges are merged, not overwritten by one device's numbers.
- Signing in with the same account in different capitals no longer counts as a different account (a different account still
  starts clean, after keeping a copy for the first one).
- Tests: the real sync code is loaded and run against the failing case, and a real-browser test (`tests/browser/sync-merge.js`)
  covers conflict, restore, import, recovery after loss, and account switching. With trimming put back, 8 of these fail.

**Deploy order matters.** Paste the new `gas/code.gs` and create a new deployment BEFORE publishing the new site files.
A new app talking to the old backend cannot upload compressed copies; it keeps all data on the device and retries.

**Limits.** Adding means deleted items can come back from another device (a bookmark removed on one device can reappear after a
sync). Data already lost cannot be re-created by this update; it can come back only from a device that still holds it, a backup file,
or the optional Google Drive backup.

## Question corrections and the Loksewa mark scheme (ninth pass)
**Why Loksewa marks appeared everywhere.** The result page printed "Loksewa-style score ... each wrong answer costs 0.2" for every
quiz, including chapter practice. Loksewa marking, the score line and the group / chapter tables now appear only on the weekly test,
the daily 75-mark paper and the hourly 50. Every other result shows the plain percentage and no Loksewa wording.

**Why the daily 75 did not follow a mark scheme.** There was none. The paper was 25 General Knowledge + 50 Level 7 questions picked at
random from the whole pool, so one big chapter could dominate and others be missing, and the "Marks by group" table read a group map
(`WEEKLY.LOKSEWA_GROUPS`) that was never defined, so every question landed in "Other". Now:
- Admin > Settings > **Loksewa mark scheme**: groups, the marks each carries, the level and the chapters that feed it. Enter it from the PSC
  syllabus (the app does not guess official weights). Until one is saved the paper is 25 + 50, drawn evenly across chapters.
- The daily paper takes exactly each group's marks, chapters take turns inside a group, and a group that has too few questions is
  reported honestly instead of being padded from another group. Time is 0.8 minute per mark (75 marks = 60 minutes).
- The result page shows marks by group out of each group's marks (daily paper) or out of the set's own questions (weekly, hourly).
- Students receive the scheme with the public info they already fetch; the server refuses a malformed scheme.

**Reported-question corrections, in every section.**
- A report button now appears in chapter practice, timed exams, the daily paper, weekly tests, the hourly 50, the results review and the
  full Missed, Saved and Flagged lists (it was in chapter practice only). A report carries the options, the answer the app marks correct,
  what the student picked, the section and the app version. Questions from a student's own bank have no button.
- Admin > Reports shows all of that, plus how many different students reported the same question (the best sign it is wrong), the
  position in the file and a link to the file. **Mark fixed** closes every open report on that question and tells all phones to refresh
  that file. **No change needed** closes without telling phones. **Refresh a file** is for files edited directly in Drive.
- Phones ask every few minutes which files were corrected. For each: drop the downloaded copy (it used to linger up to 24 hours), download
  the corrected file, and update the questions saved for review and weekly papers. Streaks, due dates, tags and notes are kept. A saved
  question that is no longer in the file is marked **Withdrawn**, kept, and never practised. A failed download changes nothing and is retried.
- A saved question is matched to the corrected file by position AND by wording and options, so a deleted question is never overwritten by a
  look-alike neighbour. The Missed practice screen also no longer swaps a saved question for a different one at the same position.
- The student who reported a question is thanked when it is fixed.
- Editing a question in the admin editor now does the same refresh.
- Correct questions in place: do not delete or reorder questions in a file, because progress is tied to each question's position.

**Deploy:** paste the new `gas/code.gs` and create a new deployment first (new report columns are added automatically), then publish the
site. Then open Admin > Settings and enter the mark scheme.

## Learning
- New 60-day sprint card (shared.js sprintPlan + SPRINT in user-page.js): daily topic, question and time targets,
  pace indicator, and a one-tap start (mock paper in the last 8 days).

## Tests
- Harness fixed (CSP regex, JSON-LD blocks, marker locations) and extended: 87 checks, including sprint planner and
  spaced-repetition behaviour. Versions are aligned at 1.32.

## Deploy
1. Paste the new gas/code.gs into Apps Script and create a New deployment version. The StudyDocs sheet and Drive folder are created on first use. Grant the new Study PDFs permissions to any sub-admin who should upload (the owner has them already).
2. Deploy the static files; the service worker cache refreshes because APP_VERSION changed.

## Not changed (recommended next)
- CSP still allows 'unsafe-inline' (about 400 inline onclick handlers). Password hashing is salted SHA-256, not iterated (an upgrade needs care: admin and user rows of the same person must keep identical hashes).
- chapters-loader.js ships a Google API key: restrict it to your domain and the Drive API in Google Cloud Console.
- escAttrJs is defined in shared.js and redefined in user-page.js (both safe for single-quoted JS inside HTML attributes); keep one.

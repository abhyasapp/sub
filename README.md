# Abhyas

Offline-first exam-prep PWA for **Loksewa Civil Engineering** (Nepal): practice
questions by chapter, weekly sets, subjective answers with PDF upload and
grading, progress/streak tracking, reports, and an admin console.

Live: https://app.mku.name.np/

## Quick start

```bash
npm install
npm run serve        # http://localhost:5500
npm run verify       # syntax + i18n + SEO audit + lint + tests (what CI runs)
```

There is no build step: the app is static files (plain browser scripts, no bundler).

## How it fits together

| Path | What it is |
|---|---|
| `index.html` | Landing, sign-in, registration, payment entry |
| `user.html` | The signed-in student app |
| `admin.html` | Admin console (never cached by the service worker) |
| `privacy.html`, `terms.html` | Legal pages |
| `sw.js` | Service worker: app-shell precache, network-first shell, cache-first CDN/vendor |
| `manifest.json` | PWA manifest |
| `css/` | `tokens.css` (design tokens, light + dark, shared by both student pages) and `app.css` (all styles of `user.html`). The landing page keeps its small stylesheet inline for first paint; `admin.html` is self-contained |
| `js/core/` | Shared foundations: config, constants, auth, access rules, storage, sync, net, text/format helpers, `modal.js` (dialog focus manager), `i18n.js` (English / Nepali) |
| `js/features/settings-ui.js` | The "Display and accessibility" (theme, text size, language, reduce motion, focus mode) and "Storage" (usage meter, downloaded sets, protect data, backup, remove downloads) cards on Data & backup |
| `js/features/` | Student features: quiz engine, review, weekly/hourly sets, PDF viewer, insights, subjective exams |
| `js/admin/` | Admin features: users, payments, weekly sets, subjective grading, logs |
| `js/report/` | User and admin reports |
| `js/data/` | Loaders/indexes for chapter and question data |
| `js/app/` | Page entry point for the landing page (`index-page.js`); the old `document.write` loader shims were removed |
| `tools/` | `audit*.mjs/js`, `check-syntax.mjs`, `check-i18n.mjs`, `sync-shell.mjs`, `build-content-index.mjs`, `e2e/` (Playwright + axe suites) and self-hosted `vendor/` libraries |
| `tests/` | Vitest unit + repo-integrity tests |

### Backend (three tiers)

- **Supabase Edge Function** (`SUPABASE_URL`): primary API for everything not in `DRIVE_ACTIONS`.
- **Google Apps Script** (`GAS_URL`): Drive-only actions (files, content keys, e-mail verification, hard questions).
- **jsDelivr CDN** (`CONTENT_CDN_BASE`): question content from the `abhyasapp/content` repo.

`abhyasEndpointFor(action)` in `js/core/config.js` decides which tier an action goes to.
The server code lives in [`../backend`](../backend).

### Things to know before editing

- **Script load order matters.** `js/core/config.js` must load first and exactly once;
  `constants.js`, `text.js`, `format.js` etc. follow. Everything shares globals.
- **Always escape.** Any dynamic value put into `innerHTML` must go through `esc()`.
- **Click handlers** are `data-on-click="OBJ.method()"` attributes dispatched by `js/core/actions.js`.
  The target must be reachable as a global (see `js/core/expose.js`).
- **PDFs share one component.** `js/features/pdf-viewer.js` is the only PDF
  surface in the app — students read study PDFs and answer papers with it, admins
  open the same paper in annotate mode. Marks are stored in PDF points (they
  survive zooming and rotation) and on save it hands ink-only per-page PNG
  overlays to `annotate.onSave(overlays, info)`; the admin console stamps them
  onto the original PDF with pdf-lib. The pdf.js engine is self-hosted in
  `tools/vendor/pdfjs/` (service-worker precached) with a cdnjs fallback.
- **Content changes reach offline downloads.** `chapters-loader.js` fires
  `abhyas:chapters-updated` when `chapters-data.js` changes while the app is open;
  `CACHE.refreshFromUpdate` (`js/features/cache.js`) then purges deleted files,
  fetches files added to your picked groups, and rechecks every downloaded set
  against the CDN (`refresh=1` bypasses the service worker's CDN mirror in
  `cdnCacheFirst`). Offline or on a weak connection it stores
  `abhyas_chapters_refresh_pending` and retries on reconnect / next boot.
- **Releasing:** bump the version in all three places — `js/core/config.js`,
  `js/core/version.js`, `package.json` (a test fails if they differ). The service
  worker cache name is derived from it, which is how clients pick up new files.
  Add new shell files to the `SHELL` list in `sw.js`: run `npm run sync-shell` (a test fails if a script or
  stylesheet loaded by `index.html`/`user.html` is not precached, or if a listed file does not exist).

## Testing

```bash
npm test             # vitest run
npm run test:cov     # with coverage
npm run lint         # ESLint (lenient on purpose — see eslint.config.mjs; no-eval / no-new-func are errors)
npm run check-syntax # node --check on every first-party file
npm run audit:buttons # boots every page, checks each button has a working handler (~45 s)
npm run check-i18n   # every data-i18n string has a Nepali translation
npm run audit:seo    # titles, canonical, structured data, heading and CSS-weight checks
npm run audit        # duplicate symbols, orphan files, unused vendor files (report only)

# real-browser suites (need: pip install playwright && playwright install chromium; npm i --no-save axe-core)
python3 tools/e2e/walk.py light 390   # every screen: JS errors, axe, overflow (also dark 390, light 320/768/1280, dark 1280)
python3 tools/e2e/flows.py            # onboarding, quiz, bookmark, saved progress
python3 tools/e2e/flows2.py           # landing, register, login, admin smoke, service worker + OFFLINE reload
python3 tools/e2e/sprint.py           # 60-day sprint end to end
python3 tools/e2e/search.py           # question search
python3 tools/e2e/exam.py             # timed exam: unselect an answer (click again, Clear, c key) and scoring
python3 tools/e2e/qbank.py            # remove from the wrong-answer bank (with Undo), report a question
python3 tools/e2e/history.py          # practice history is never trimmed or lost on cloud merge
python3 tools/e2e/storage.py          # early storage warning, nothing deleted automatically
python3 tools/e2e/sprint-accuracy.py  # syllabus is complete only at 85% accuracy
python3 tools/e2e/sprint-i18n.py      # sprint page in Nepali
python3 tools/e2e/admin-perms.py      # what each kind of admin can see
python3 tools/e2e/settings.py         # Data & backup: display and storage cards
```

Scripts are plain globals, so tests load them with `tests/helpers/load-globals.js`
(a small `vm` sandbox) instead of importing them.

`tests/pages.test.js` boots `index.html`, `user.html` and `admin.html` in jsdom with
the real scripts and fails on any `SyntaxError`. A classic-script redeclaration
(two files both declaring `const ADMIN`) silently kills the later file — and the
feature with it — so this is the check that catches it.

## Roadmap (suggested)

1. Tests for progress sync (`js/core/psync.js`), scoring and the quiz engine.
2. Replace the ~300 empty `catch {}` blocks with a tiny `warn()` helper (`no-empty` now flags empty non-catch blocks; empty catches are still allowed).
3. ~~Remove `document.write` shims in `js/app/`~~ (done in 1.48.0).
4. Move inline CSS/JS out of `user.html` / `admin.html`; then drop `'unsafe-inline'` from the CSP.
5. Replace the `new Function` dispatcher with `addEventListener`-based delegation; then drop `'unsafe-eval'`.
6. Add a licence once you decide how the code may be used.

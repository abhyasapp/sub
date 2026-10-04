/* ═══════════════════════════════════════════════════════════════════════
   VERSION.JS — single source of truth for the client app version.

   Loaded via <script src="version.js"> on every page (before
   shared.js/app.js) AND via importScripts() in sw.js. Bumping this
   value alone is what forces every open browser tab to drop its old
   cached shell and start a fresh session — the SW derives its
   CACHE_NAME from this number.

   Keep in sync with CODE.gs's own APP_VERSION constant (the backend
   runs in a different runtime and can't import this file directly).

   ── Version history ──
   1.00 — initial release
   1.01 — login enumeration fix, admin cleanup actions
   1.02 — sliding admin tokens, private screenshots, Google rate limit
   1.03 — formatting / layout only
   1.04 — security + correctness + Weekly Set attempt capture
   1.05 — config consolidation, admin password enforcement
   1.06 — Subjective module, admin roles, dual-role switch
   1.07 — modular split (app.js + objective.js + subjective.js),
          cloud-sync.js Personal Drive backup, manifest.json PWA
          metadata, firebase-config.js, aligned SW shell list,
          admin permissions UI, Smart Paste upload/commit
   1.08 — client realigned with backend v1.11: getFile now sends the
          session (GETFILE_REQUIRES_AUTH) and is paced under the
          per-account rate limit; students read their own marked PDF
          through getMySubmissionPdf; admins read and annotate answer
          papers through adminDownloadSubmissionPdf; annotations are
          stamped onto the original PDF instead of flattening it;
          fixed the ReferenceError that aborted SUBJ.init(); shared
          pdf-viewer.js precached; iOS focus-zoom and 100dvh fixes.
   1.09 — one shared PDF surface (pdf-viewer.js) for students and admins:
          reader mode plus an annotation mode that stores ink in PDF
          points and stamps it onto the original pages. The console's
          duplicate viewer is gone. Mobile quiz gained a fixed
          Back / Next / Finish bar above the tab bar, a density pass so a
          question and its options fit one screen, and guards against a
          double tap skipping a question or submitting twice.
   1.13 - self-service data control: resetMyProgress + deleteMyAccount
          (Backup page -> "Your data on the server"); account deletion now
          also trashes Drive files and anonymises log/report references;
          per-file reset button fixed; Firebase SDK only loads when push is
          configured; sw precaches icon-512/favicon; manifest tidy-up;
          privacy page.
   ═══════════════════════════════════════════════════════════════════════ */
/* 1.14 - launch hardening: opt-in auto-download, cache-first question sets,
          per-file coverage store, sync payload that always fits, quiz
          keyboard fix, photo-to-PDF written answers, trial pill in the top
          bar, quiz-safe session expiry, tolerant service worker with offline
          fonts/KaTeX/pdf.js, privacy + terms pages, honest copy. */
/* 1.15 - phase 2: unseen-first practice, real weak-topic mode, question grid
          and mark-for-review, exam countdown, weekly test start/resume/rank
          recorded on the server, safer uploads, cached settings, nightly
          spreadsheet backup, client error log, self-hosted assets. */
/* 1.16 - phase 3: question editor + growth panel + announcements in the admin
          console, text-size button, study-plan calendar export, styled confirm
          dialogs, landing-page sample question, automatic checks (tests/). */
/* 1.17 - phase 4: chapter cards + Continue, sign in with email or mobile,
          payment screenshot shrunk on the phone, approval-time note,
          question-count index, Content-Security-Policy, batched progress saves. */
/* 1.18 - solo-student 10/10: personalized Today plan, exam readiness on Home,
          chapter strength verdicts, "Just 5" quick session, resume chip,
          pace feedback, streak forgiveness, image fullscreen, copy-explanation
          button, fast-guess flag on results. */
/* 1.19 - confidence rating (Sure / Not sure / Guessed), misconceptions card,
          recovery mode after 3+ days away, read-aloud button. */
/* 1.20 - chapters refresh when you're online; weekly leaderboard; badges;
          wrong-first results; streak insurance; sidebar search; push nudge. */
/* 1.21 - weekly test retakes: the first attempt is the official record;
          later attempts are local-only practice, and the retake modal
          shows the last score with Review / Retake options. Every system
          Drive folder now lives under "Abhyas System Data", and uploaded
          files are renamed to a standard YYYY-MM-DD_HHMMSS_user_type.ext
          pattern. */
/* 1.22 - polish: rate-limit retry-after shown to the student, exam
          copy protection, live Loksewa negative-marking score in the
          exam bar, boot error boundary, search inside Saved/Flagged/
          Missed lists, faster progress flush, weekly admin summary. */
/* 1.32 - weekly test hardening. Fixed the entire weekly feature:
            • objective.js — removed a duplicate `const isWeekly`
              declaration in _showResults that was a parse-time syntax
              error. The whole file was being rejected by the browser,
              so QUIZ/REV/ON/LOC/PSY/CNT/ONPROG were all undefined and
              every quiz-related feature silently failed.
            • app.js — Review button on the retake modal no longer
              throws ReferenceError (uses escAttrJs(s.id) instead of a
              bare `id`).
            • app.js — _startRetake no longer requires s.fileId before
              attempting a fresh chapter-pool build.
            • app.js — _buildLoksewaPaperRetake falls back to the
              weekly set's own file when the pools are empty, so the
              retake always opens.
            • app.js — _buildLoksewaPaper is now awaited with a
              try/catch, so a rejected build surfaces a toast instead
              of leaving the student on the home screen.
            • app.js — _startReview is async and refuses a Loksewa-
              format attempt whose saved paper is missing, showing a
              clear message rather than every question blank.
            • app.js — Loksewa chapter matching now falls back to
              keyword fragments against chapter names, so the "Could
              not build the full Loksewa paper" toast stops firing
              when chapter IDs don't match the expected scheme.
            • app.js — every weekly score shown to the student now
              uses Loksewa negative marking (+1 correct, −0.2 wrong,
              0 skipped). Applies to the home card, retake modal, and
              the results ring. Non-weekly quizzes keep the plain
              percentage.
            • app.js — added WEEKLY._savePaper/_loadPaper: the paper
              the student actually sat is now saved on the device, so
              Review and Retake always have questions to work with
              even when the chapter pools and the weekly set's Drive
              file are both unreachable. */
const APP_VERSION = '1.32';
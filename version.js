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
const APP_VERSION = '1.15';
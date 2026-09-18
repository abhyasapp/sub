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
   ═══════════════════════════════════════════════════════════════════════ */
const APP_VERSION = '1.07';
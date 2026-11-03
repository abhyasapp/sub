/* ═══════════════════════════════════════════════════════════════════════
   js/app.js — the student app's entry point. LAST script on the page.

   Assumes: every core/*, data/*, report/*, and features/* file has already
   loaded. AUTH, PWA, NETCHECK, and PUSH are all present when this runs.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* 1. Restore the saved session or bounce to index.html.
        AUTH.restore() reads LS.USER, validates it (offline-valid or with
        the server), and either enters the app (AUTH._enter → APP.init)
        or redirects via AUTH._bounce(). Every failure path is silent —
        AUTH._bounce() handles the redirect for us. */
  if (typeof AUTH === 'undefined' || typeof AUTH.restore !== 'function') {
    console.error('[app.js] AUTH missing — check that js/core/auth.js loaded.');
    return;
  }
  AUTH.restore().catch(err => console.error('[app.js] AUTH.restore failed:', err));

  /* 2. Service worker + install banner. PWA.init() is safe to call before
        login — it only sets up listeners. It handles beforeinstallprompt
        and calls navigator.serviceWorker.register(). */
  try { if (typeof PWA !== 'undefined' && PWA.init) PWA.init(); } catch (e) {}

  /* 3. Start the reachability poller so S.online reflects real network
        health, not just navigator.onLine (which lies on flaky mobile). */
  try { if (typeof NETCHECK !== 'undefined' && NETCHECK.start) NETCHECK.start(); } catch (e) {}

  /* 4. If the browser supports push and the user has previously granted
        permission, refresh the button state. PUSH.refreshButtonUI() is a
        no-op when the module is not loaded. */
  try { if (typeof PUSH !== 'undefined' && PUSH.refreshButtonUI) PUSH.refreshButtonUI(); } catch (e) {}
})();
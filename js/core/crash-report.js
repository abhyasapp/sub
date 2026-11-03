// js/core/crash-report.js — sends a short note to Activity log when something throws.
// At most 5 per page load. Never any answers or personal details.

(function () {
  let sent = 0;
  const seen = {};

  function report(msg, src, line) {
    try {
      if (sent >= 5) return;
      msg = String(msg || '').slice(0, 200);
      if (!msg || msg === 'Script error.' || seen[msg]) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.SUPABASE_URL) || '';
      if (!url) return;
      seen[msg] = 1; sent++;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        keepalive: true,
        body: JSON.stringify({
          action: 'logClientError',
          msg,
          src: String(src || '').split('/').pop().slice(0, 80),
          line: line || 0,
          page: (location.pathname || '').split('/').pop() || 'index',
          v: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
          ua: (navigator.userAgent || '').slice(0, 80)
        })
      }).catch(() => {});
    } catch (e) {}
  }

  window.addEventListener('error', e => report(e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason;
    report(r && r.message ? r.message : String(r), 'promise', 0);
  });
})();
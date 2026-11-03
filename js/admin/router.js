// js/admin/router.js — the view dispatcher + keyboard handlers + periodic refresh.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, MODAL, CONFIRM, TOAST, BUSY,
// LS_USER, LS_ADMIN, FALLBACK_BANNER), core/admin-nav.js (ADMIN_NAV),
// features/today.js / users.js / payments.js / logs.js / expiring.js /
// admins.js / palette.js / weeklysets.js / studydocs.js / subjective-*.js /
// dashboard.js / settings.js / data.js — all deferred to call time.
// PDFVIEW, PALETTE, EXPIRING, TRENDS, MISSED, SUBJ_TABS, SUBJ_STORE,
// STUDYDOCS are referenced at call time via typeof where possible.

const UI = {
  current: 'today',
  TITLES: ADMIN_NAV.TITLES,
  FEATURES: ADMIN_NAV.FEATURES,
  _scroll: {},

  nav(id, opts = {}){
    const tabMap = { 'subj-qotd':'qotd', 'subj-exam':'exam', 'subj-add':'add' };
    let tab = null;
    if (tabMap[id]) { tab = tabMap[id]; id = 'subjective'; }

    const feat = this.FEATURES[id];
    const allowed = !feat || (Array.isArray(feat) ? feat.some(f => ADMIN.can(f)) : ADMIN.can(feat));
    if (!allowed) return TOAST.show('You do not have access to that section', 'warning');

    if (this.current) this._scroll[this.current] = window.scrollY;

    $$('.view').forEach(v => { v.classList.remove('on', 'animate'); });
    const view = $('view-' + id);
    if (view) { view.classList.add('on'); if (id !== this.current) view.classList.add('animate'); }

    $$('.rail-item').forEach(i => { i.classList.remove('active'); i.removeAttribute('aria-current'); });
    const navBtn = $('nav-' + id);
    if (navBtn) { navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page'); }

    const crumb = $('crumb');
    if (crumb) crumb.textContent = this.TITLES[id] || 'Abhyas';
    document.title = (this.TITLES[id] || 'Admin') + ' · Abhyas Admin';

    const prev = this.current;
    this.current = id;

    /* Paint the screen we just switched to. Without this, Students/Payments/
       Activity/Settings stay blank on first visit until the 30s paintSync tick
       (the data is already in ADMIN.data — only the render was missing). */
    try {
      if (id === 'today') { TODAY.render(); EXPIRING.load(); }
      if (id === 'users') USERS.render();
      if (id === 'payments') PAYMENTS.render();
      if (id === 'logs') LOGS.render();
      if (id === 'weeklysets') WEEKLYSETS.render(ADMIN.data.weeklysets);
      if (id === 'settings') SETTINGS.load();
      if (id === 'dashboard') TRENDS.load();
      if (id === 'dashboard' && !MISSED.lastResults.length) MISSED.load();
      if (id === 'subjective') {
        /* SUBJ_TABS lives in subjective-store.js. If that module failed to
           load, the outer catch would swallow the ReferenceError and leave
           an empty panel. Show a visible error instead. */
        if (typeof SUBJ_TABS !== 'undefined') {
          SUBJ_TABS.go(tab || SUBJ_TABS.current);
        } else {
          const v = $('view-subjective');
          if (v) v.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>Grading module failed to load. Reload the page.</span></div>';
        }
      }
      if (id === 'admins') ADMIN._paintCurrentView('admins');
      if (id === 'studydocs') STUDYDOCS.load();
      if (id === 'qna' && typeof QNA_ADMIN !== 'undefined') QNA_ADMIN.load();
      if (id === 'qreports' && typeof QREPORTS !== 'undefined') QREPORTS.load();
    } catch (e) {
      console.warn('[router] paint for', id, 'failed:', e && e.message);
    }

    this.railClose();
    if (opts.keepScroll && prev === id) window.scrollTo(0, this._scroll[id] || 0);
    else window.scrollTo({ top: 0, behavior: 'auto' });
    const content = $('content'); if (content) content.focus({ preventScroll:true });
  },

  scrollTop(){ window.scrollTo({ top: 0, behavior:'smooth' }); },

  railOpen(){
    $('rail').classList.add('open');
    $('rail-scrim').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('rail').querySelector('.rail-item')?.focus(), 60);
  },
  railClose(){
    $('rail').classList.remove('open');
    $('rail-scrim').classList.remove('show');
    if (!document.querySelector('.overlay.show') && !(window.PDFVIEW && PDFVIEW.isOpen())) document.body.style.overflow = '';
  },

  toggleMenu(e){
    e.stopPropagation();
    const m = $('account-menu');
    const open = m.classList.toggle('show');
    $('account-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  },
  closeMenu(){
    $('account-menu').classList.remove('show');
    $('account-btn').setAttribute('aria-expanded', 'false');
  }
};

/* ═══════════════ Runtime bindings that must not depend on admin.html ═══════
   Small, self-contained fixes that keep the console working even when the
   markup is not updated at the same time as the JS. Each is idempotent.
   ──────────────────────────────────────────────────────────────────────── */

/* 1. The rail's "Student app" button is bound in admin.html to
      ADMIN._leaveAdminMode() — which reloads the console. The right action is
      ADMIN.goToStudentApp(), which actually leaves for the student app. We
      rebind at runtime so the fix ships with this file. */
(function fixRailSwitch(){
  const btn = document.getElementById('rail-switch');
  if (!btn) return;
  btn.setAttribute('data-on-click', 'ADMIN.goToStudentApp()');
})();

/* 2. Ensure the "Using backup system" banner element exists. core.js dispatches
      a window 'abhyas:fallback' event when a request falls back to the other
      backend; FALLBACK_BANNER listens and shows this element. If admin.html
      does not declare it, we create it now, between the topbar and the
      content column. */
(function ensureFallbackBanner(){
  if (document.getElementById('fallback-banner')) return;
  const host = document.getElementById('main-col') || document.body;
  const topbar = document.getElementById('topbar');
  const bar = document.createElement('div');
  bar.id = 'fallback-banner';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:8px 16px;' +
    'background:var(--warning-soft,#FAEFE0);color:var(--warning,#9A5A0B);' +
    'font-size:12px;font-weight:600;line-height:1.4;' +
    'border-bottom:1px solid var(--sep,#E4E6E4);';
  bar.innerHTML =
    '<i class="ph ph-wifi-slash" style="flex-shrink:0;font-size:1rem"></i>' +
    '<span style="flex:1">Using backup system — recent changes may not be reflected.</span>' +
    '<button type="button" class="icon-btn sm" aria-label="Dismiss" ' +
      'data-on-click="FALLBACK_BANNER.hide()">' +
      '<i class="ph ph-x"></i></button>';
  if (topbar && topbar.parentNode) topbar.parentNode.insertBefore(bar, topbar.nextSibling);
  else host.insertBefore(bar, host.firstChild);
})();

/* 3. Install the FALLBACK_BANNER listener (idempotent). */
if (typeof FALLBACK_BANNER !== 'undefined') FALLBACK_BANNER.installListener();

/* ═══════════════ Gate form ═══════════════════════════════════════════════ */
const _gateForm = $('gate-form');
if (_gateForm) _gateForm.addEventListener('submit', e => { e.preventDefault(); ADMIN.login(); });
['ad-user','ad-pass'].forEach(id => { const el = $(id); if (el) el.addEventListener('input', () => ADMIN.hideErr()); });

if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  const kh = $('kbd-hint'); if (kh) kh.textContent = '⌘K';
  $$('.menu-item .kb').forEach(k => k.textContent = '⌘K');
}

document.addEventListener('click', e => {
  if (!e.target.closest || !e.target.closest('.menu-wrap')) UI.closeMenu();
  const picker = $('promote-results');
  if (picker && picker.classList.contains('show') && !e.target.closest('.picker')) picker.classList.remove('show');
});

/* ═══════════════ Keyboard ═══════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement && document.activeElement.tagName) || '');

  if (window.PDFVIEW && PDFVIEW.isOpen()) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const app = $('app'); if (app && app.classList.contains('on')) PALETTE.open();
    return;
  }
  if (e.key === '/' && !typing) {
    const app = $('app'); if (app && app.classList.contains('on')) { e.preventDefault(); PALETTE.open(); return; }
  }
  if (e.key === 'Escape') {
    const confirmOv = $('ov-confirm');
    if (confirmOv && confirmOv.classList.contains('show')) { CONFIRM._no(); return; }
    const palette = $('palette');
    if (palette && palette.classList.contains('show')) { PALETTE.close(); return; }
    UI.closeMenu();
    MODAL.closeAll();
    UI.railClose();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.key === 'r') { e.preventDefault(); ADMIN.refresh(); return; }
    const order = ['today','dashboard','users','payments','admins','weeklysets','subjective','qreports','logs'];
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= order.length) { e.preventDefault(); UI.nav(order[n - 1]); }
  }
});

window.addEventListener('beforeunload', e => {
  if (!window.PDFVIEW || typeof PDFVIEW.isOpen !== 'function' || !PDFVIEW.isOpen()) return;
  const hasUnsaved = (typeof PDFVIEW.hasUnsavedMarks === 'function')
    ? PDFVIEW.hasUnsavedMarks()
    : (typeof PDFVIEW.isAnnotating === 'function' ? PDFVIEW.isAnnotating() : false);
  if (!hasUnsaved) return;
  e.preventDefault();
  e.returnValue = '';
});

/* ═══════════════ Silent background refresh ═══════════════════════════════
   Rather than calling ADMIN.refresh() — which pops a warning toast for every
   failure — we drive _refreshOne directly. A dead backend produces no
   notification noise; the fallback banner already says "something's off",
   and the next foreground action will surface a real error if it matters.
   ─────────────────────────────────────────────────────────────────────── */
setInterval(async () => {
  if (document.hidden || !ADMIN.creds) return;
  if (document.querySelector('.overlay.show, #palette.show') || (window.PDFVIEW && PDFVIEW.isOpen())) return;
  const scope = ({
    today:['stats'], dashboard:['stats'], users:['users'], payments:['payments'],
    admins:['admins'], weeklysets:['weeklysets'], qreports:['qreports'],
    logs:['logs'], settings:['settings']
  })[UI.current];
  if (!scope) return;
  for (const s of scope) {
    try { await ADMIN._refreshOne(s); } catch (e) { /* silent */ }
  }
  ADMIN.markSynced();
  try { if (typeof ADMIN._paintCurrentView === 'function') ADMIN._paintCurrentView(UI.current); } catch (e) {}
}, 60000);

setInterval(() => ADMIN.paintSync(), 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ADMIN.paintSync(); });

/* ═══════════════ Static boot-time tweaks ═════════════════════════════════ */
(function updateRailLabel(){
  try {
    const s = JSON.parse(localStorage.getItem(LS_USER) || 'null');
    const admin = (JSON.parse(localStorage.getItem(LS_ADMIN) || '{}').user || '').toLowerCase();
    if (s && s.type === 'user' && s.username && admin && s.username.toLowerCase() === admin) {
      const lbl = $('rail-switch-label');
      if (lbl) lbl.textContent = 'Switch to student app';
    }
  } catch(e){}
})();

(function paintVersion(){
  try {
    const el = $('rail-version');
    if (el) el.textContent = 'Abhyas V1' + (typeof APP_VERSION !== 'undefined' ? ' · v' + APP_VERSION : '');
  } catch(e){}
})();

(function offlinePill(){
  const pill = $('offline-pill');
  let wasOffline = !navigator.onLine;
  function paint(){
    const off = !navigator.onLine;
    if (pill) pill.classList.toggle('show', off);
    if (off && !wasOffline) {
      TOAST.show('You\u2019re offline \u2014 showing the last synced data', 'warning', 4000);
    } else if (!off && wasOffline) {
      TOAST.show('Back online \u2014 refreshing', 'success');
      ADMIN.refresh(({
        today:['stats'], dashboard:['stats'], users:['users'], payments:['payments'],
        admins:['admins'], weeklysets:['weeklysets'], qreports:['qreports'],
        logs:['logs'], settings:['settings']
      })[UI.current]);
    }
    wasOffline = off;
  }
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  if (pill) pill.classList.toggle('show', !navigator.onLine);
})();

ADMIN.init();

window.UI = UI;
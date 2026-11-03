// js/app/index-admin-router.js
// Admin-login routing for index.html.
// Load AFTER js/app/index-page.js so the student handler is already bound.
//
// Behaviour:
//   • Admin-like usernames (admin, root, owner, …) → try adminLogin first.
//     Success → save abhyas_admin, redirect to admin.html.
//     Failure → fall back to the normal student login.
//   • Any other username → normal student login runs first.
//     If it fails with "invalid credentials", adminLogin is tried silently.
//   • The student login flow is never altered or interrupted.

(function () {
  'use strict';

  var ADMIN_URL = './admin.html';
  var LS_ADMIN  = 'abhyas_admin';

  // These usernames always try admin login first.
  // Every other username goes through the student flow first.
  var ADMIN_FIRST = /^(admin|administrator|root|owner|system|support|abhyas)$/i;

  // ── Session persistence ────────────────────────────────────────────
  function saveAdminSession(res) {
    var creds = {
      user: (res && res.user && res.user.username) || (res && res.username) || '',
      token: (res && (res.adminToken || res.token)) || '',
      expires: Date.now() + (Number(res && res.expiresInMs) || 86400000),
      mustChangePassword: !!(res && res.mustChangePassword)
    };
    try { localStorage.setItem(LS_ADMIN, JSON.stringify(creds)); } catch (e) {}
    return creds;
  }

  // ── Endpoint selection + transport ─────────────────────────────────
  function pickEndpoint(action, params) {
    var cfg = window.ABHYAS_CONFIG || {};
    if (typeof window.abhyasEndpointFor === 'function') {
      try {
        if (window.abhyasEndpointFor(action, params) === 'supabase') {
          return cfg.SUPABASE_URL || '';
        }
      } catch (e) { /* fall through */ }
    }
    return cfg.GAS_URL || window.GAS_URL || '';
  }

  async function postTo(url, action, params) {
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, params || {}))
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  }

  async function callBackend(action, params) {
    // Prefer the app's own transport when it exists.
    if (window.ApiAdapter && typeof ApiAdapter.call === 'function') {
      try { return await ApiAdapter.call(action, params); } catch (e) { /* try next */ }
    }
    if (window.AUTH && typeof AUTH.call === 'function') {
      try { return await AUTH.call(action, params); } catch (e) { /* try next */ }
    }

    // Raw fallback: primary backend, then the other one.
    var cfg = window.ABHYAS_CONFIG || {};
    var supabase = cfg.SUPABASE_URL || '';
    var gas      = cfg.GAS_URL || window.GAS_URL || '';
    var primary  = pickEndpoint(action, params);
    var other    = primary === supabase ? gas : supabase;

    var primaryErr = null;
    if (primary) {
      try { return await postTo(primary, action, params); }
      catch (e) { primaryErr = e; }
    }
    if (other && other !== primary) {
      try { return await postTo(other, action, params); }
      catch (e) { return { success: false, error: e.message || 'Network error' }; }
    }
    return { success: false, error: (primaryErr && primaryErr.message) || 'No backend reachable.' };
  }

  // ── Button state helper ────────────────────────────────────────────
  function showSigningIn(btn) {
    if (!btn) return function () {};
    var orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    return function () { btn.disabled = false; btn.textContent = orig; };
  }

  // ── 1. Capture-phase interceptor ───────────────────────────────────
  function installCapture(form) {
    form.addEventListener('submit', async function (event) {
      // Re-dispatch path (admin failed, let the student handler run)
      if (form.dataset.adminBypass === '1') {
        form.dataset.adminBypass = '';
        return;
      }

      var userEl = document.getElementById('in-user');
      var passEl = document.getElementById('in-pass');
      if (!userEl || !passEl) return;

      var identifier = String(userEl.value || '').trim();
      var password   = String(passEl.value || '');
      if (!identifier || !password) return;               // let original show its validation
      if (!ADMIN_FIRST.test(identifier)) return;          // not an admin-like username → student flow

      // Block the original handler while we check admin credentials.
      event.preventDefault();
      event.stopImmediatePropagation();

      var restore = showSigningIn(document.getElementById('btn-login'));
      var res;
      try {
        res = await callBackend('adminLogin', { username: identifier, password: password });
      } catch (e) { res = { success: false }; }

      if (res && res.success) {
        saveAdminSession(res);
        window.location.href = ADMIN_URL;
        return;
      }

      // Admin login failed — restore button and let student login run.
      restore();
      form.dataset.adminBypass = '1';
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, true);  // ← capture phase: runs before the original bubble-phase handler
  }

  // ── 2. Post-failure fallback for non-admin-like usernames ─────────
  function installErrorFallback() {
    var errEl  = document.getElementById('err');
    var errTxt = document.getElementById('err-text');
    if (!errEl || !errTxt) return;
    if (errEl.dataset.adminObserver === '1') return;
    errEl.dataset.adminObserver = '1';

    var running = false;
    var tryAdmin = async function () {
      if (running) return;
      if (!errEl.classList.contains('show')) return;

      var msg = String(errTxt.textContent || '');
       if (!/invalid (username|credentials)|incorrect password|wrong password|invalid admin credentials/i.test(msg)) return;

      var userEl = document.getElementById('in-user');
      var passEl = document.getElementById('in-pass');
      if (!userEl || !passEl) return;
      var identifier = String(userEl.value || '').trim();
      var password   = String(passEl.value || '');
      if (!identifier || !password) return;

      running = true;
      try {
        var res = await callBackend('adminLogin', { username: identifier, password: password });
        if (res && res.success) {
          saveAdminSession(res);
          window.location.href = ADMIN_URL;
        }
      } catch (e) { /* ignore */ }
      running = false;
    };

    var observer = new MutationObserver(tryAdmin);
    observer.observe(errEl,  { attributes: true, attributeFilter: ['class'] });
    observer.observe(errTxt, { childList: true, characterData: true, subtree: true });
  }

  // ── 3. Global helper for "Switch to admin" buttons ─────────────────
  // Call window.SWITCH_TO_ADMIN() from the student dashboard if you want
  // a button that promotes the current session into the admin console.
  window.SWITCH_TO_ADMIN = async function () {
    var session = null;
    try { session = JSON.parse(localStorage.getItem('abhyas_session') || 'null'); } catch (e) {}
    if (!session || !session.username || !session.token) {
      return { success: false, error: 'You need to be signed in first.' };
    }
    var res = await callBackend('adminswitchfromuser', {
      username: session.username,
      token: session.token
    });
    if (!res || !res.success) return res || { success: false, error: 'Switch failed.' };
    saveAdminSession(res);
    window.location.href = ADMIN_URL;
    return { success: true };
  };

  // ── Install ────────────────────────────────────────────────────────
  function install() {
    var form = document.getElementById('form-login');
    if (!form) return;
    if (form.dataset.adminRouter !== '1') {
      form.dataset.adminRouter = '1';
      installCapture(form);
    }
    installErrorFallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  // Expose for console debugging.
  window.ADMIN_ROUTER = { saveAdminSession: saveAdminSession, callBackend: callBackend, ADMIN_URL: ADMIN_URL };
})();
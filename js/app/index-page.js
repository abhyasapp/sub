// js/app/index-page.js — the login/signup/payment front door.
// Load AFTER: config.js, net.js, text.js, dom.js, access.js, theme.js, toast.js, storage.js, state.js
// Load BEFORE: expose.js

(function () {
  'use strict';

  var GAS_URL = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || '';
  var SESSION_KEY = (typeof LS !== 'undefined' && LS.USER) || 'abhyas_session';
  var COOKIE_KEY = 'abhyas_cookie_seen';

  var _session = null;
  var _publicInfo = null;
  var _pendingPaymentFile = null;
  var _trialTimer = null;
  var _mode = 'login';

  /* Google sign-in state */
  var GOOGLE_CLIENT_ID =
    (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GOOGLE_CLIENT_ID) || '';
  var _googleReady = false;
  /* Only hosts the OAuth client is expected to authorize get a button. Any
     other host (including the temporary Sites preview URL) gets no button,
     instead of a button that fails with a 403 when clicked. */
  var GOOGLE_ALLOWED_HOSTS = ['app.mku.name.np', 'abhyasapp.github.io', 'localhost', '127.0.0.1'];
  var _googleScriptState = 0;                     // 0 idle, 1 loading, 2 loaded, -1 failed

  function _get(id) { return document.getElementById(id); }
  function _show(id) { var el = _get(id); if (el) el.style.display = ''; }
  function _hide(id) { var el = _get(id); if (el) el.style.display = 'none'; }

  function _showErr(msg) {
    var e = _get('err'), t = _get('err-text');
    if (t) t.textContent = msg || 'Something went wrong.';
    if (e) e.classList.add('show');
  }
  function _clearErr() {
    var e = _get('err');
    if (e) e.classList.remove('show');
  }

  function _setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = !!busy;
    if (busy) {
      if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.innerHTML;
      btn.innerHTML = '<span class="spin"></span>' + (btn.dataset.origLabel || '');
    } else if (btn.dataset.origLabel) {
      btn.innerHTML = btn.dataset.origLabel;
      delete btn.dataset.origLabel;
    }
  }

  function _fmtHMS(sec) {
    if (sec < 0) sec = 0;
    var h = Math.floor(sec / 3600),
        m = Math.floor((sec % 3600) / 60),
        s = sec % 60;
    return String(h).padStart(2, '0') + ':' +
           String(m).padStart(2, '0') + ':' +
           String(s).padStart(2, '0');
  }

  /* ================================================================ */
  /* Transport                                                         */
  /* ================================================================ */

  function _resolveEndpoint(action, params) {
    if (typeof abhyasEndpointFor === 'function'
        && typeof ABHYAS_CONFIG !== 'undefined'
        && ABHYAS_CONFIG.SUPABASE_URL) {
      try {
        if (abhyasEndpointFor(action, params) === 'supabase') {
          return ABHYAS_CONFIG.SUPABASE_URL;
        }
      } catch (e) { /* fall through to GAS */ }
    }
    return GAS_URL;
  }

  function _timeoutFor(action) {
    var rc = (typeof RETRY_CONFIG !== 'undefined' && RETRY_CONFIG.timeouts) ? RETRY_CONFIG.timeouts : {};
    var a = String(action || '').toLowerCase();
    if (a === 'submitpayment') return rc.upload || 120000;
    if (a === 'requestpasswordreset' || a === 'resetpassword') return 30000;
    return rc.normal || 20000;
  }

  function _post(action, params) {
    var fullParams = Object.assign({ action: action }, params || {});
    var primaryUrl = _resolveEndpoint(action, fullParams);
    if (!primaryUrl) return Promise.reject(new Error('The backend address is not configured.'));

    if (typeof netFetch === 'function') {
      return netFetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(fullParams)
      }, _timeoutFor(action)).then(function (r) {
        return r.json();
      });
    }

    return fetch(primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(fullParams)
    }).then(function (r) {
      if (!r.ok) throw new Error('The server replied with HTTP ' + r.status + '.');
      return r.json();
    });
  }

  /* ================================================================ */
  /* Session storage                                                   */
  /* ================================================================ */

  function _readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.type !== 'user' || !s.username || !s.token) return null;
      return s;
    } catch (e) { return null; }
  }
  function _writeSession(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    _session = s;
  }
  function _clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    _session = null;
  }

  function _computeAccess(res, user) {
    if (typeof computeAccessLevel === 'function') {
      try { return computeAccessLevel(res, user); } catch (e) {}
    }
    return {
      level: res.permanentAccess || (user && user.status === 'active') ? 'permanent'
           : res.isTrial ? 'trial'
           : (res.needsPayment && user && user.status === 'payment_pending') ? 'pending_review'
           : res.needsPayment ? 'expired'
           : 'unknown',
      trialExpiresAt: res.trialExpiresAt || (user && user.trialExpiresAt) || '',
      permanent: !!(res.permanentAccess || (user && user.status === 'active')),
      accessType: res.accessType || (user && user.accessType) || 'permanent',
      accessExpiresAt: res.accessExpiresAt || (user && user.accessExpiresAt) || ''
    };
  }

  function _buildSession(res, username) {
    var user = res.user || { username: username };
    return {
      type: 'user',
      username: user.username || username,
      name: user.name || '',
      email: user.email || '',
      mobile: user.mobile || '',
      token: res.token || '',
      access: _computeAccess(res, user),
      needsPayment: !!(res.needsPayment || (res.access && res.access.level === 'expired')),
      emailVerified: res.emailVerified !== false,
      adminCapable: !!res.adminCapable,
      lastVerified: Date.now()
    };
  }

  /* ================================================================ */
  /* Form switching                                                    */
  /* ================================================================ */

  var FORMS = ['form-login', 'form-signup', 'form-forgot', 'form-reset',
               'form-trial', 'form-payment', 'form-status', 'form-redirecting'];
  var TABS_VISIBLE = { login: true, signup: true, forgot: false, reset: false };

  function _setMode(mode) {
    _mode = mode || 'login';
    _clearErr();
    FORMS.forEach(function (id) { _hide(id); });

    var tabs = _get('auth-tabs');
    if (tabs) tabs.style.display = TABS_VISIBLE[_mode] ? '' : 'none';

    ['login', 'signup', 'forgot', 'reset'].forEach(function (k) {
      var t = tabs && tabs.querySelector('[data-tab="' + k + '"]');
      if (t) t.classList.toggle('active', _mode === k);
    });

    if (_mode === 'login')   _show('form-login');
    if (_mode === 'signup')  _show('form-signup');
    if (_mode === 'forgot')  _show('form-forgot');
    if (_mode === 'reset')   _show('form-reset');
    if (_mode === 'trial')   _show('form-trial');
    if (_mode === 'payment') _show('form-payment');
    if (_mode === 'status')  _show('form-status');
    if (_mode === 'redirecting') _show('form-redirecting');

    /* Update Google button visibility when changing modes */
    _applyGoogleVisibility();
  }

  /* ================================================================ */
  /* Trial timer                                                       */
  /* ================================================================ */

  function _stopTrialTimer() {
    if (_trialTimer) { clearInterval(_trialTimer); _trialTimer = null; }
  }

  function _startTrialTimer() {
    _stopTrialTimer();
    var el = _get('trial-timer');
    if (!el || !_session) return;
    var expires = _session.access && _session.access.trialExpiresAt
      ? new Date(_session.access.trialExpiresAt).getTime()
      : 0;
    if (!expires) return;

    function paint() {
      var left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      el.textContent = _fmtHMS(left);
      if (left <= 0) {
        _stopTrialTimer();
        _showErr('Your trial has ended. Choose "Pay now" to keep your access.');
        _setMode('payment');
      }
    }
    paint();
    _trialTimer = setInterval(paint, 1000);
  }

  /* ================================================================ */
  /* Routing after session is established                              */
  /* ================================================================ */

  function _routeByAccess() {
    if (!_session) { _setMode('login'); return; }
    var a = _session.access || {};
    if (a.level === 'permanent') {
      _setMode('redirecting');
      var n = _get('redir-name');
      if (n) n.textContent = _session.name ? ', ' + _session.name : '';
      setTimeout(function () { window.location.href = 'user.html'; }, 400);
      return;
    }
    if (a.level === 'trial') {
      _setMode('trial');
      _startTrialTimer();
      _maybeShowVerifyBanner();
      _maybeShowMobilePrompt();
      return;
    }
    if (a.level === 'pending_review') { _setMode('status'); return; }
    if (a.level === 'expired') { _setMode('payment'); _renderPayment(); return; }
    _setMode('login');
  }

  function _maybeShowVerifyBanner() {
    var b = _get('verify-banner');
    if (!b) return;
    b.style.display = (_session && _session.emailVerified === false) ? '' : 'none';
  }

  function _maybeShowMobilePrompt() {
    var hasMobile = !!(_session && _session.mobile);
    ['mobile-prompt-trial', 'mobile-prompt-pay'].forEach(function (id) {
      var el = _get(id);
      if (el) el.style.display = hasMobile ? 'none' : '';
    });
  }

  /* ================================================================ */
  /* Google sign-in                                                    */
  /* ================================================================ */

  function _initGoogleSignIn() {
    var wrap  = _get('g-signin-wrap');
    var btnEl = _get('g-signin-btn');
    if (!wrap || !btnEl || !GOOGLE_CLIENT_ID) return;
    if (GOOGLE_ALLOWED_HOSTS.indexOf(window.location.hostname) === -1) return;
    if (_googleReady) return;

    if (typeof google === 'undefined' ||
        !google.accounts || !google.accounts.id) {
      _loadGoogleScript();
      return;
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: _onGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup'
    });

    _renderGoogleButton();

    _googleReady = true;
    _applyGoogleVisibility();
  }

  /* Load GSI only on the hosts the OAuth client authorizes. The hosted Sites
     build must not fetch Google's script on an origin that cannot use it. */
  function _loadGoogleScript() {
    if (_googleScriptState) return;
    _googleScriptState = 1;
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = function () {
      _googleScriptState = 2;
      _initGoogleSignIn();
    };
    s.onerror = function () { _googleScriptState = -1; };
    document.head.appendChild(s);
  }

  /* Keep Google's iframe in the same language as the page. GSI otherwise
     follows the browser/geo locale, which produced Nepali on an English
     page for visitors in Nepal. Re-rendering is safe: the old iframe is
     replaced rather than stacked. */
  function _renderGoogleButton() {
    var btnEl = _get('g-signin-btn');
    if (!btnEl || typeof google === 'undefined' || !google.accounts || !google.accounts.id) return;
    /* GSI does not shrink its iframe: asking for a fixed 380 px made the
       button 20 px wider than the auth card on a 360 px phone, which put a
       horizontal scrollbar on the sign-in page. Size it to the slot instead. */
    var hostW = btnEl.parentElement ? btnEl.parentElement.getBoundingClientRect().width : 0;
    var btnW = Math.max(200, Math.min(380, Math.floor(hostW || (window.innerWidth - 64))));
    btnEl.innerHTML = '';
    google.accounts.id.renderButton(btnEl, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: btnW,
      locale: (typeof I18N !== 'undefined' && I18N.lang === 'ne') ? 'ne' : 'en'
    });
  }

  function _applyGoogleVisibility() {
    var wrap = _get('g-signin-wrap');
    if (!wrap) return;
    var show = _googleReady && (_mode === 'login' || _mode === 'signup');
    wrap.classList.toggle('g-hidden', !show);
  }

  async function _onGoogleCredential(response) {
    _clearErr();
    if (!response || !response.credential) {
      _showErr('Google sign-in failed. Please try again.');
      return;
    }
    var wrap = _get('g-signin-wrap');
    if (wrap) wrap.classList.add('g-busy');
    try {
      var res = await _post('googlelogin', { idToken: response.credential });
      if (!res || !res.success) throw new Error((res && res.error) || 'Google sign-in failed.');
      if (!res.token) throw new Error('The server did not return a session token.');

      var session = _buildSession(res, (res.user && res.user.username) || '');
      _writeSession(session);
      try { localStorage.setItem('abhyas_last_user', session.username); } catch (e) {}
      await _loadPublicInfo();
      _routeByAccess();
    } catch (err) {
      _showErr(err.message || 'Google sign-in failed.');
    }
    if (wrap) wrap.classList.remove('g-busy');
  }

  /* ================================================================ */
  /* Payment render                                                    */
  /* ================================================================ */

  function _renderPayment() {
    if (!_session) return;
    var s = _publicInfo || {};
    var amt = _get('pay-amt');
    if (amt) amt.textContent = String(s.paymentAmount || 100);
    var phone = _get('pay-phone');
    if (phone) phone.textContent = String(s.contactPhone || '');
    var inst = _get('pay-inst');
    if (inst) inst.textContent = s.paymentInstructions || 'Scan the QR code, then send us the transaction ID below.';
    var warn = _get('pay-settings-warn');
    if (warn) warn.style.display = _publicInfo ? 'none' : '';
    var banner = _get('pay-banner');
    if (banner) banner.style.display = (_session.access && _session.access.level === 'expired') ? '' : 'none';

    var qr = _get('qr-img');
    var fallback = _get('qr-fallback');
    if (qr && s.qrCodeUrl) {
      qr.src = s.qrCodeUrl;
      qr.style.display = '';
      if (fallback) fallback.style.display = 'none';
    } else {
      if (qr) qr.style.display = 'none';
      if (fallback) fallback.style.display = '';
    }

    var price = _get('faq-price');
    if (price) price.textContent = s.paymentAmount ? ('Rs ' + s.paymentAmount) : 'a small amount';

    _maybeShowMobilePrompt();
  }

  /* ================================================================ */
  /* Public info (amount, phone, QR)                                   */
  /* ================================================================ */

  async function _loadPublicInfo() {
    try {
      var res = await _post('getPublicInfo', {});
      if (res && res.success) {
        _publicInfo = res;
        try { localStorage.setItem('abhyas_public_info', JSON.stringify(res)); } catch (e) {}
        return res;
      }
    } catch (e) {}
    try {
      var cached = localStorage.getItem('abhyas_public_info');
      if (cached) _publicInfo = JSON.parse(cached);
    } catch (e) {}
    return _publicInfo;
  }

  /* ================================================================ */
  /* Form handlers                                                     */
  /* ================================================================ */

  async function _doLogin(e) {
    if (e) e.preventDefault();
    _clearErr();
    var userEl = _get('in-user'), passEl = _get('in-pass'), btn = _get('btn-login');
    var username = (userEl && userEl.value || '').trim();
    var password = (passEl && passEl.value) || '';
    if (!username || !password) { _showErr('Enter your username and password.'); return; }
    _setBusy(btn, true);
    try {
      var res = await _post('login', { username: username, password: password });
      if (!res || !res.success) throw new Error((res && res.error) || 'Sign-in failed.');
      if (res.isAdmin && res.adminToken && !res.token) {
        try { localStorage.setItem('abhyas_admin_token', res.adminToken); } catch (e) {}
        window.location.href = 'admin.html';
        return;
      }
      if (!res.token) throw new Error('The server did not return a session token.');
      var session = _buildSession(res, username);
      _writeSession(session);
      try { localStorage.setItem('abhyas_last_user', session.username); } catch (e) {}
      await _loadPublicInfo();
      _routeByAccess();
    } catch (err) {
      _showErr(err.message || 'Could not sign in.');
    }
    _setBusy(btn, false);
  }

  async function _doSignup(e) {
    if (e) e.preventDefault();
    _clearErr();
    var btn = _get('btn-signup');
    var name   = (_get('su-name')   && _get('su-name').value   || '').trim();
    var mobile = (_get('su-mobile') && _get('su-mobile').value || '').trim();
    var email  = (_get('su-email')  && _get('su-email').value  || '').trim();
    var uname  = (_get('su-user')   && _get('su-user').value   || '').trim();
    var pass   = (_get('su-pass')   && _get('su-pass').value   || '');
    var cpass  = (_get('su-cpass')  && _get('su-cpass').value  || '');
    if (!name) return _showErr('Enter your full name.');
    if (!mobile) return _showErr('Enter your mobile number.');
    if (!email) return _showErr('Enter your email.');
    if (!uname || uname.length < 3) return _showErr('Username must be at least 3 characters.');
    if (pass.length < 8) return _showErr('Password must be at least 8 characters.');
    if (pass !== cpass) return _showErr('The two passwords do not match.');
    _setBusy(btn, true);
    try {
      var res = await _post('signup', {
        name: name, mobile: mobile, email: email,
        username: uname, password: pass
      });
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not create the account.');
      if (!res.token) throw new Error('The server did not return a session token.');
      var session = _buildSession(res, uname);
      _writeSession(session);
      try { localStorage.setItem('abhyas_last_user', session.username); } catch (e) {}
      await _loadPublicInfo();
      _routeByAccess();
    } catch (err) {
      _showErr(err.message || 'Could not create the account.');
    }
    _setBusy(btn, false);
  }

  async function _doForgot(e) {
    if (e) e.preventDefault();
    _clearErr();
    var btn = _get('btn-forgot');
    var ident = ((_get('fg-id') && _get('fg-id').value) || '').trim();
    if (!ident) return _showErr('Enter your username or email.');
    _setBusy(btn, true);
    try {
      var res = await _post('requestPasswordReset', { identifier: ident });
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not send the reset code.');
      if (typeof toast === 'function') toast('If that matches an account, a reset code is on its way.', 4500);
      _setMode('reset');
      var rc = _get('rs-code');
      if (rc) rc.focus();
    } catch (err) {
      _showErr(err.message || 'Could not send the reset code.');
    }
    _setBusy(btn, false);
  }

  async function _doReset(e) {
    if (e) e.preventDefault();
    _clearErr();
    var btn = _get('btn-reset');
    var code = ((_get('rs-code') && _get('rs-code').value) || '').trim();
    var pass = ((_get('rs-pass') && _get('rs-pass').value) || '');
    if (!code) return _showErr('Paste the reset code from your email.');
    if (pass.length < 8) return _showErr('Password must be at least 8 characters.');
    _setBusy(btn, true);
    try {
      var res = await _post('resetPassword', { code: code, newPassword: pass });
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not reset the password.');
      if (typeof toast === 'function') toast('Password updated. Sign in with your new password.', 4500);
      _setMode('login');
    } catch (err) {
      _showErr(err.message || 'Could not reset the password.');
    }
    _setBusy(btn, false);
  }

  /* ================================================================ */
  /* Payment submit                                                    */
  /* ================================================================ */

  function _onFile() {
    var input = _get('pay-file');
    var nameEl = _get('pay-file-name');
    var f = input && input.files && input.files[0];
    if (!f) { if (nameEl) nameEl.textContent = 'No file chosen'; _pendingPaymentFile = null; return; }
    if (f.size > 5 * 1024 * 1024) {
      _showErr('That image is over 5 MB. Choose a smaller one.');
      input.value = '';
      if (nameEl) nameEl.textContent = 'No file chosen';
      _pendingPaymentFile = null;
      return;
    }
    _pendingPaymentFile = f;
    if (nameEl) nameEl.textContent = f.name;
  }

  async function _submitPayment() {
    _clearErr();
    if (!_session) return _showErr('Please sign in first.');
    var txn = ((_get('pay-txn') && _get('pay-txn').value) || '').trim();
    var rem = ((_get('pay-rem') && _get('pay-rem').value) || '').trim();
    if (!txn) return _showErr('Enter the transaction ID.');
    if (txn.length < 4) return _showErr('That transaction ID looks too short.');
    var btn = _get('btn-pay');
    _setBusy(btn, true);
    try {
      var dataUrl = '';
      if (_pendingPaymentFile) {
        dataUrl = await new Promise(function (resolve, reject) {
          var rd = new FileReader();
          rd.onload = function () { resolve(rd.result); };
          rd.onerror = function () { reject(new Error('Could not read the image.')); };
          rd.readAsDataURL(_pendingPaymentFile);
        });
      }
      var res = await _post('submitPayment', {
        username: _session.username,
        token: _session.token,
        txId: txn,
        remarks: rem,
        screenshot: dataUrl,
        screenshotDataUrl: dataUrl
      });
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not send the payment.');
      try {
        var check = await _post('checkSession', { username: _session.username, token: _session.token });
        if (check && check.success) {
          var updated = _buildSession(check, _session.username);
          _writeSession(updated);
        }
      } catch (e) {}
      _setMode('status');
      if (typeof toast === 'function') toast('Payment sent. An admin will review it soon.', 5000);
    } catch (err) {
      _showErr(err.message || 'Could not send the payment.');
    }
    _setBusy(btn, false);
  }

  /* ================================================================ */
  /* Awaiting-review refresh                                           */
  /* ================================================================ */

  async function _refreshAccess(silent) {
    _clearErr();
    if (!_session) return _setMode('login');
    var btn = _get('btn-recheck');
    if (btn) _setBusy(btn, true);
    try {
      var res = await _post('checkSession', { username: _session.username, token: _session.token });
      if (res && res.sessionInvalid) {
        _clearSession();
        return _setMode('login');
      }
      if (res && res.success) {
        var updated = _buildSession(res, _session.username);
        _writeSession(updated);
        _routeByAccess();
        if (!silent && updated.access.level === 'pending_review' && typeof toast === 'function') {
          toast('Still being reviewed. Try again in a few minutes.', 4500);
        }
      }
    } catch (err) {
      if (!silent) _showErr(err.message || 'Could not check the status.');
    }
    if (btn) _setBusy(btn, false);
  }

  /* ================================================================ */
  /* Verification resend                                               */
  /* ================================================================ */

  async function _resendVerification() {
    _clearErr();
    if (!_session) return;
    var btn = _get('verify-resend');
    if (btn) _setBusy(btn, true);
    try {
      var res = await _post('resendVerification', { username: _session.username, token: _session.token });
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not send that email.');
      if (res.alreadyVerified) {
        _session.emailVerified = true;
        _writeSession(_session);
        _maybeShowVerifyBanner();
        if (typeof toast === 'function') toast('Your email is already confirmed.');
      } else if (typeof toast === 'function') {
        toast('Sent. Check your inbox.', 4500);
      }
    } catch (err) {
      _showErr(err.message || 'Could not send that email.');
    }
    if (btn) _setBusy(btn, false);
  }

  /* ================================================================ */
  /* Save mobile                                                       */
  /* ================================================================ */

  async function _saveMobile(inputId) {
    _clearErr();
    if (!_session) return;
    var el = _get(inputId);
    var val = ((el && el.value) || '').trim();
    if (!val) return _showErr('Enter your mobile number.');
    if (!/^[0-9]{7,15}$/.test(val.replace(/[^0-9]/g, ''))) return _showErr('That mobile number looks wrong.');
    try {
      var res = await _post('updateProfile', { username: _session.username, token: _session.token, mobile: val });
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not save the mobile number.');
      _session.mobile = val;
      _writeSession(_session);
      _maybeShowMobilePrompt();
      if (typeof toast === 'function') toast('Mobile number saved.');
    } catch (err) {
      _showErr(err.message || 'Could not save the mobile number.');
    }
  }

  /* ================================================================ */
  /* QR error fallback                                                 */
  /* ================================================================ */

  function _onQrError() {
    var qr = _get('qr-img');
    var fallback = _get('qr-fallback');
    if (qr) qr.style.display = 'none';
    if (fallback) fallback.style.display = '';
  }

  /* ================================================================ */
  /* Network indicator                                                 */
  /* ================================================================ */

  function _paintNet() {
    var dot = _get('ndot'), txt = _get('nstat');
    if (!dot || !txt) return;
    if (navigator.onLine) {
      dot.classList.remove('off', 'warn');
      txt.textContent = 'Online';
    } else {
      dot.classList.add('off');
      dot.classList.remove('warn');
      txt.textContent = 'Offline — you can still sign in if you were signed in before';
    }
  }

  /* ================================================================ */
  /* Cookie notice                                                     */
  /* ================================================================ */

  function _cookieCheck() {
    var banner = _get('cookie-banner');
    if (!banner) return;
    try {
      if (localStorage.getItem(COOKIE_KEY) === '1') return;
    } catch (e) {}
    banner.hidden = false;
    document.body.classList.add('cookie-open');
  }
  function _cookieAccept() {
    try { localStorage.setItem(COOKIE_KEY, '1'); } catch (e) {}
    var banner = _get('cookie-banner');
    if (banner) banner.hidden = true;
    document.body.classList.remove('cookie-open');
  }

  /* ================================================================ */
  /* Try a question                                                    */
  /* ================================================================ */

  var TRY_QUESTIONS = [
    {
      q: 'The minimum grade of concrete for reinforced cement concrete work as per IS 456:2000 is:',
      options: ['M15', 'M20', 'M25', 'M30'],
      correct: 1,
      exp: 'IS 456 mandates M20 as the minimum grade for RCC work in general, to ensure adequate durability and strength.'
    },
    {
      q: 'Which of the following is the unit of dynamic viscosity?',
      options: ['N·s/m²', 'm²/s', 'kg/m³', 'N/m'],
      correct: 0,
      exp: 'Dynamic viscosity (μ) is measured in pascal-seconds (Pa·s), equivalent to N·s/m².'
    },
    {
      q: 'The maximum permissible free fall of concrete during placement is approximately:',
      options: ['0.5 m', '1.0 m', '1.5 m', '3.0 m'],
      correct: 2,
      exp: 'As per IS 456, concrete should not be dropped from a height exceeding 1.5 m to prevent segregation.'
    }
  ];
  var _tryIdx = -1;

  function _tryRender() {
    _tryIdx = (_tryIdx + 1) % TRY_QUESTIONS.length;
    var q = TRY_QUESTIONS[_tryIdx];
    var qEl = _get('try-q'), optsEl = _get('try-opts'), expEl = _get('try-exp'), nextBtn = _get('try-next');
    if (!qEl || !optsEl) return;
    qEl.textContent = q.q;
    expEl.hidden = true;
    expEl.textContent = '';
    if (nextBtn) nextBtn.hidden = true;
    optsEl.innerHTML = '';
    q.options.forEach(function (opt, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String.fromCharCode(65 + i) + '. ' + opt;
      btn.style.cssText =
        'text-align:left;padding:.6rem .8rem;min-height:44px;border-radius:10px;border:1px solid var(--sep-strong);' +
        'background:var(--surface-alt);font-size:var(--fs-callout);cursor:pointer;color:var(--ink)';
      btn.addEventListener('click', function () {
        optsEl.querySelectorAll('button').forEach(function (b, j) {
          b.disabled = true;
          if (j === q.correct) {
            b.style.background = 'var(--accent-soft)';
            b.style.borderColor = 'var(--accent)';
            b.style.color = 'var(--accent)';
          } else if (j === i) {
            b.style.background = 'var(--danger-soft)';
            b.style.borderColor = 'var(--danger)';
            b.style.color = 'var(--danger)';
          }
        });
        expEl.textContent = q.exp;
        expEl.hidden = false;
        if (nextBtn) nextBtn.hidden = false;
      });
      optsEl.appendChild(btn);
    });
  }

  /* ================================================================ */
  /* Boot                                                              */
  /* ================================================================ */

  function _bindForms() {
    var forms = {
      'form-login':  _doLogin,
      'form-signup': _doSignup,
      'form-forgot': _doForgot,
      'form-reset':  _doReset
    };
    Object.keys(forms).forEach(function (id) {
      var el = _get(id);
      if (el) el.addEventListener('submit', forms[id]);
    });
  }

  async function _boot() {
    _paintNet();
    window.addEventListener('online', _paintNet);
    window.addEventListener('offline', _paintNet);

    _bindForms();
    _initGoogleSignIn();
    document.addEventListener('abhyas:lang', function () {
      if (_googleReady) _renderGoogleButton();
    });

    await _loadPublicInfo();

    var existing = _readSession();
    if (existing) {
      _session = existing;
      try {
        var res = await _post('checkSession', { username: _session.username, token: _session.token });
        if (res && res.sessionInvalid) {
          _clearSession();
        } else if (res && res.success) {
          var updated = _buildSession(res, _session.username);
          _writeSession(updated);
        }
      } catch (e) {
        // Network error — trust the cached session
      }
    }

    document.documentElement.classList.remove('boot-session');

    if (_session) _routeByAccess();
    else _setMode('login');

    _cookieCheck();
    _tryRender();
  }

  /* ================================================================ */
  /* Public API                                                        */
  /* ================================================================ */

  window.APP = {
    setMode: _setMode,
    logout: function () {
      _stopTrialTimer();
      _clearSession();
      try { localStorage.removeItem('abhyas_last_user'); } catch (e) {}
      _setMode('login');
      if (typeof toast === 'function') toast('Signed out.');
    },
    goUser: function () {
      window.location.href = 'user.html';
    },
    submitPayment: _submitPayment,
    refreshAccess: _refreshAccess,
    resendVerification: _resendVerification,
    saveMobile: _saveMobile,
    onFile: _onFile,
    onQrError: _onQrError
  };

  window.TRY_Q = { next: _tryRender };
  window.COOKIE_NOTICE = { accept: _cookieAccept };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }
})();
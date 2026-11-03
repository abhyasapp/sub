// js/admin/core.js — the admin console foundation: auth, transport, modal,
// confirm, toast, busy, focus-trap, state, and the small helpers.
//
// LOAD ORDER (admin.html):
//   1. js/core/config.js      (ABHYAS_CONFIG, RETRY_CONFIG — must be first)
//   2. js/core/text.js        (esc / escAttrJs / formatBytes / localISODate / driveFileId)
//   3. js/core/loksewa.js     (normalizeLoksewaScheme / loksewaSchemeConflict)
//   4. js/core/study-docs.js  (STUDYDOC_LABELS / subjChapterName)
//   5. js/core/admin-nav.js   (ADMIN_NAV)
//   6. THIS FILE              ($ / $$ / ADMIN / MODAL / …)
//   7. js/admin/features/*       (loaded directly by admin.html)

/* ── shared helpers (guarded — js/core/* wins if it loaded first) ─────── */
if (typeof esc !== 'function') {
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  };
}
if (typeof escAttrJs !== 'function') {
  window.escAttrJs = function (s) {
    const js = String(s == null ? '' : s).replace(/[\\'"]/g, c => '\\' + c);
    return js.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  };
}
if (typeof formatBytes !== 'function') {
  window.formatBytes = function (n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };
}
if (typeof localISODate !== 'function') {
  window.localISODate = function (d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
}
if (typeof normalizeLoksewaScheme !== 'function') {
  window.normalizeLoksewaScheme = raw => {
    try {
      const o = (typeof raw === 'string') ? JSON.parse(raw || 'null') : raw;
      if (o && Array.isArray(o.groups)) return o;
    } catch (e) {}
    return { version: 1, isDefault: true, total: 75, groups: [] };
  };
}
if (typeof loksewaSchemeConflict !== 'function') {
  window.loksewaSchemeConflict = rows =>
    (Array.isArray(rows) && rows.length ? '' : 'Add at least one group.');
}
if (typeof STUDYDOC_LABELS === 'undefined') {
  window.STUDYDOC_LABELS = {
    'model-answer': 'Model answers', notes: 'Notes', 'past-paper': 'Past papers',
    syllabus: 'Syllabus', other: 'Other'
  };
}
if (typeof subjChapterName !== 'function') {
  window.subjChapterName = function (chapterId) {
    try {
      const c = (window.SUBJECTIVE_CHAPTERS || []).find(x => x.id === chapterId);
      return c ? c.name : '';
    } catch (e) { return ''; }
  };
}

/* ── helpers unique to the console ────────────────────────────────────── */
const THEME_COLORS = { light: '#F6F7F6', dark: '#0F1213' };
function _paintThemeColor(colour) {
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', colour));
}

if (typeof $ === 'undefined') {
  window.$  = id => document.getElementById(id);
  window.$$ = sel => Array.from(document.querySelectorAll(sel));
}

function relTime(ts) {
  if (!ts) return '—';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
  return new Date(t).toLocaleDateString();
}
function fullTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? '—' : d.toLocaleString();
}
function initials(name) {
  if (!name) return '?';
  const p = String(name).trim().split(/\s+/);
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
function statusLabel(s) {
  return ({
    trial: 'Trial', active: 'Paid', expired: 'Expired', payment_pending: 'Awaiting review',
    rejected: 'Rejected', pending: 'Awaiting review', verified: 'Verified',
    graded: 'Graded', open: 'Open', resolved: 'Resolved', dismissed: 'Dismissed',
    live: 'Live', scheduled: 'Scheduled', archived: 'Archived'
  })[s] || (s ? String(s).replace(/_/g, ' ') : '—');
}
function badge(status, label) {
  return '<span class="badge st-' + esc(status) + '">' + esc(label || statusLabel(status)) + '</span>';
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function copyText(text, label) {
  navigator.clipboard.writeText(text).then(
    () => TOAST.show((label || 'Copied'), 'success'),
    () => TOAST.show('Copy failed — select the text manually', 'error')
  );
}

/* Safe DOM setters — no crash when an element is missing. */
function setVal(id, v)  { const el = $(id); if (el) el.value       = (v == null ? '' : v);  return !!el; }
function setText(id, v) { const el = $(id); if (el) el.textContent = (v == null ? '' : v);  return !!el; }
function setHTML(id, v) { const el = $(id); if (el) el.innerHTML   = (v == null ? '' : v);  return !!el; }

/* ── FSTATE + USER_SESSION + LS keys ──────────────────────────────────── */
const FSTATE = {
  get(k, fb) { try { return sessionStorage.getItem('abhyas_f_' + k) ?? fb; } catch (e) { return fb; } },
  set(k, v) { try { sessionStorage.setItem('abhyas_f_' + k, v); } catch (e) {} }
};
const LS_ADMIN = 'abhyas_admin';
const LS_USER  = 'abhyas_session';
const GAS_URL  = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || '';
const USER_SESSION = {
  read() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_USER) || 'null');
      return (s && s.type === 'user' && s.username) ? s : null;
    } catch (e) { return null; }
  },
  token(s) {
    s = s || this.read();
    if (!s) return '';
    return s.token || s.sessionToken || s.authToken || s.userToken || '';
  }
};

/* ── TOAST ── */
const TOAST = {
  ICONS: { success: 'ph-check-circle', error: 'ph-warning-circle', warning: 'ph-warning', info: 'ph-info' },
  show(msg, kind = 'info', duration = 3600) {
    const box = $('toasts');
    if (!box) return;
    while (box.children.length >= 3) box.firstElementChild.remove();
    const dup = [...box.children].find(t => t.dataset.msg === msg && Date.now() - (+t.dataset.ts) < 2500);
    if (dup) return;
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.dataset.msg = msg; t.dataset.ts = Date.now();
    t.innerHTML = '<i class="ph ' + (this.ICONS[kind] || this.ICONS.info) + '"></i><span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, duration);
  }
};

/* ── BUSY ── */
const BUSY = {
  _n: 0,
  start() {
    this._n++;
    const el = $('busy'); if (el) { el.classList.add('on'); el.setAttribute('aria-hidden', 'false'); }
  },
  stop() {
    this._n = Math.max(0, this._n - 1);
    if (!this._n) { const el = $('busy'); if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); } }
  },
  reset() { this._n = 0; const el = $('busy'); if (el) el.classList.remove('on'); }
};

/* ── FALLBACK BANNER ── */
const FALLBACK_BANNER = {
  _shownAt: 0,
  _timer: null,
  show() {
    this._shownAt = Date.now();
    const banner = $('fallback-banner');
    if (!banner) return;
    banner.hidden = false;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), 24000);
  },
  hide() {
    const banner = $('fallback-banner');
    if (banner) banner.hidden = true;
    clearTimeout(this._timer);
    this._timer = null;
  },
  installListener() {
    if (window._fallbackListenerInstalled) return;
    window._fallbackListenerInstalled = true;
    window.addEventListener('abhyas:fallback', () => { try { FALLBACK_BANNER.show(); } catch (e) {} });
  }
};
window.FALLBACK_BANNER = FALLBACK_BANNER;

/* ── FOCUS_TRAP ── */
const FOCUS_TRAP = {
  _state: {},
  _list(root) {
    return Array.from(root.querySelectorAll('button,[href],input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  },
  open(id) {
    const root = $(id);
    if (!root || this._state[id]) return;
    const handler = e => {
      if (e.key !== 'Tab') return;
      const list = this._list(root);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    this._state[id] = { prev: document.activeElement, handler };
    root.addEventListener('keydown', handler);
    setTimeout(() => {
      const list = this._list(root);
      const target = root.querySelector('input:not([type="hidden"]),textarea') || list[0];
      if (target) target.focus();
    }, 40);
  },
  close(id) {
    const root = $(id), st = this._state[id];
    if (root && st) {
      root.removeEventListener('keydown', st.handler);
      if (st.prev && st.prev.focus) st.prev.focus();
    }
    delete this._state[id];
  }
};

/* ── MODAL ── */
const MODAL = {
  open(name) {
    const el = $('ov-' + name);
    if (!el) return;
    el.classList.add('show');
    document.body.style.overflow = 'hidden';
    FOCUS_TRAP.open('ov-' + name);
  },
  close(name) {
    if (name === 'pwd' && ADMIN._forcedPwChange) return;
    const el = $('ov-' + name);
    if (!el || !el.classList.contains('show')) return;
    el.classList.remove('show');
    FOCUS_TRAP.close('ov-' + name);
    if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
  },
  closeAll() {
    document.querySelectorAll('.overlay.show').forEach(el => {
      this.close(el.id.replace(/^ov-/, ''));
    });
  },
  sheet(title, html, opts = {}) {
    const tt = $('tt-sheet'), bd = $('bd-sheet'), ov = $('ov-sheet');
    if (!tt || !bd || !ov) return;
    tt.textContent = title;
    bd.innerHTML = html;
    ov.querySelector('.dialog').classList.toggle('wide', opts.wide !== false);
    this.open('sheet');
  }
};

/* ── CONFIRM ── */
const CONFIRM = {
  _resolve: null,
  ask({ title, body, confirmText, tone, requireType }) {
    if (this._resolve) return Promise.resolve(false);
    return new Promise(resolve => {
      this._resolve = resolve;
      $('tt-confirm').textContent = title || 'Confirm';
      $('bd-confirm').innerHTML =
        '<p class="t-callout" style="line-height:1.6;color:var(--ink)">' + body + '</p>' +
        (requireType
          ? '<div class="field mt4"><label for="cnf-type">Type <span class="mono" style="color:var(--danger)">' + esc(requireType) + '</span> to confirm</label>' +
            '<input class="input" type="text" id="cnf-type" autocomplete="off" data-expect="' + escAttrJs(requireType) + '"></div>'
          : '') +
        '<div class="flex g2 mt4">' +
          '<button class="btn btn-quiet" style="flex:1" data-on-click="CONFIRM._no()">Cancel</button>' +
          '<button class="btn ' + (tone === 'danger' ? 'btn-danger' : 'btn-primary') + '" style="flex:1" id="cnf-ok" data-on-click="CONFIRM._ok()">' + esc(confirmText || 'Confirm') + '</button>' +
        '</div>';
      MODAL.open('confirm');
      const inp = $('cnf-type');
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') CONFIRM._ok(); });
    });
  },
  _ok() {
    const inp = $('cnf-type');
    if (inp && inp.value !== inp.dataset.expect) {
      inp.classList.add('invalid');
      TOAST.show('That does not match — type it exactly', 'error');
      inp.focus();
      return;
    }
    this._settle(true);
  },
  _no() { if (this._resolve) this._settle(false); },
  _settle(v) {
    const ov = $('ov-confirm');
    if (ov) ov.classList.remove('show');
    FOCUS_TRAP.close('ov-confirm');
    if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
    const r = this._resolve; this._resolve = null;
    if (r) r(v);
  }
};

/* ── ADMIN ─────────────────────────────────────────────────────────────── */
const ADMIN = {
  creds: null,
  _perms: null,
  _forcedPwChange: false,
  _lastSync: 0,
  data: {
    users: [], payments: [], settings: {}, logs: [], admins: [], stats: {},
    weeklysets: [], qreports: [],
    usersTotalCount: 0, usersTruncated: false,
    paymentsTotalCount: 0, paymentsTruncated: false,
    weeklysetsTotalCount: 0, weeklysetsTruncated: false,
    qreportsTotalCount: 0, qreportsTruncated: false
  },
  state: { uPage: 1, pPage: 1, lPage: 1, qrPage: 1, uPerPage: 15, pPerPage: 15, lPerPage: 20, qrPerPage: 10 },
  ALL_SCOPES: ['stats', 'users', 'payments', 'settings', 'logs', 'admins', 'weeklysets', 'qreports'],

  /* ── boot ── */
  init() {
    let theme = 'light';
    try { theme = JSON.parse(localStorage.getItem('abhyas_theme') || '"light"'); } catch (e) {}
    document.documentElement.classList.toggle('dark', theme === 'dark');
    _paintThemeColor(theme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light);

    FALLBACK_BANNER.installListener();
    setTimeout(() => { const el = $('ad-user'); if (el && !el.value) el.focus(); }, 60);

    this._trySessionUnlock();
  },

  _trySessionUnlock() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_ADMIN) || 'null'); } catch (e) {}
    if (!saved || !saved.token || !saved.user) return;
    if (saved.expires && Date.now() > saved.expires) {
      try { localStorage.removeItem(LS_ADMIN); } catch (e) {}
      return;
    }
    this.creds = saved;
    /* F5 must not bypass a pending forced password change — the flag is
       persisted into LS_ADMIN in login() and read back here. */
    this._forcedPwChange = !!saved.mustChangePassword;
    this._enterAdminMode().catch(err => {
      console.warn('[ADMIN] session unlock failed:', err && err.message);
      this.creds = null;
      this._forcedPwChange = false;
      try { localStorage.removeItem(LS_ADMIN); } catch (e) {}
    });
  },

  async _enterAdminMode() {
    const gate = $('gate'); if (gate) gate.hidden = true;
    const app  = $('app');  if (app)  app.classList.add('on');
    await this.loadPermissions();
    this._applyPermissions();            // sidebar is correct before any data arrives
    await this.refresh();
    this._applyPermissions();            // refresh can promote us to owner (adminListAdmins.isOwner)
    if (!this._perms) TOAST.show('Could not load your permissions, so admin sections are hidden. Reload to try again.', 'warning', 8000);
    if (this._forcedPwChange) this.changePassword();
    const land = (UI.current && this._viewAllowed(UI.current)) ? UI.current : this.firstAllowedView();
    if (land && typeof UI !== 'undefined' && UI.nav) UI.nav(land);
  },

  async login() {
    const userEl = $('ad-user'), passEl = $('ad-pass');
    if (!userEl || !passEl) return;
    const username = userEl.value.trim();
    const password = passEl.value;
    if (!username || !password) return this.showErr('Enter your username and password.');
    this._gateBusy(true); this.hideErr();
    try {
      const r = await this.post('adminLogin', { username, password });
      if (!r || !r.success) throw new Error((r && r.error) || 'Sign-in failed.');
      const adminToken = r.adminToken || r.token;
      const adminUsername = (r.user && r.user.username) || r.username || username;
      if (!adminToken) throw new Error('The server did not return a session token.');
      const creds = {
        user: adminUsername,
        token: adminToken,
        expires: Date.now() + (Number(r.expiresInMs) || 86400000),
        mustChangePassword: !!r.mustChangePassword
      };
      try { localStorage.setItem(LS_ADMIN, JSON.stringify(creds)); } catch (e) {}
      this.creds = creds;
      this._forcedPwChange = !!r.mustChangePassword;
      passEl.value = '';
      await this._enterAdminMode();
    } catch (e) {
      this.showErr(e.message || 'Could not sign in.');
    }
    this._gateBusy(false);
  },

  unlock() { this._trySessionUnlock(); },
  logout() { this._leaveAdminMode(); },

  _leaveAdminMode() {
    try { localStorage.removeItem(LS_ADMIN); } catch (e) {}
    this.creds = null;
    this._perms = null;
    this._forcedPwChange = false;
    try { window.location.reload(); } catch (e) {}
  },

  goToStudentApp() {
    try { localStorage.removeItem(LS_ADMIN); } catch (e) {}
    this.creds = null;
    this._perms = null;
    this._forcedPwChange = false;
    try { window.location.href = './'; } catch (e) {}
  },

  /* ── transport ──────────────────────────────────────────────────────
     Routes through abhyasEndpointFor (config.js), falls back on:
       • timeout / network error
       • HTTP 5xx
       • success:false + "unknown action" (safe — the handler never ran)
     Normalizes getFile content → result so existing admin features keep
     working without change. Sets _fallbackUsed so the UI banner can fire.
     ──────────────────────────────────────────────────────────────────── */
  async post(action, params = {}, opts = {}) {
    const useSupabase = (
      typeof ABHYAS_CONFIG !== 'undefined' &&
      typeof abhyasEndpointFor === 'function' &&
      abhyasEndpointFor(action, params) === 'supabase' &&
      !!ABHYAS_CONFIG.SUPABASE_URL
    );
    const primaryUrl = useSupabase ? ABHYAS_CONFIG.SUPABASE_URL : GAS_URL;
    if (!primaryUrl) return { success: false, error: 'Backend URL is not configured.' };

       /* The console has only ever carried an admin token; both fields carry
       the same value so admin-context getFile works on backends that
       validate `token`. Splitting these requires adminLogin to return a
       user token too — a backend change, not a client one.

       IMPORTANT: the actor's identity (username/token/adminToken) is
       injected AFTER params, so a caller passing `params.username` can
       never overwrite it. Otherwise the backend sees username="alice"
       with admin's token → sessionInvalid → _leaveAdminMode() wipes the
       session and reloads the page.

       Actions whose `params.username` means "the TARGET of this action"
       (not the actor) get that value moved to `targetUsername` instead. */
    const TARGET_USERNAME_ACTIONS = new Set([
      'adminGrantAccess',
      'adminDeleteUser',
      'adminUpdateUser',
      'adminReviewPayment',
      'adminDeletePayment',
      'adminPromoteUserToAdmin',
      'adminSetAdminPermissions',
      'adminDeleteAdmin',
      'adminCreateAdmin'
    ]);
    const _params = Object.assign({}, params || {});
    if (TARGET_USERNAME_ACTIONS.has(action) && _params.username != null) {
      if (_params.targetUsername == null) _params.targetUsername = _params.username;
      delete _params.username;
    }
    /* adminLogin is the only action that establishes identity — it must
       NOT receive the (empty) creds fields, or it would blank out the
       login username the caller passed in. */
    const _authFields = (action === 'adminLogin')
      ? { action }
      : {
          action,
          username:   this.creds ? this.creds.user  : '',
          token:      this.creds ? this.creds.token : '',
          adminToken: this.creds ? this.creds.token : ''
        };
    const body = JSON.stringify(Object.assign({}, _params, _authFields));

    const timeoutMs = Number(opts.timeoutMs) > 0
      ? Number(opts.timeoutMs)
      : ((typeof RETRY_CONFIG !== 'undefined' && RETRY_CONFIG.timeouts && RETRY_CONFIG.timeouts.normal) || 30000);

    const _attempt = async (url) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (r.status >= 500) {
          return { success: false, error: 'The server replied with HTTP ' + r.status + '.', _httpError: true };
        }
        if (!r.ok) return { success: false, error: 'The server replied with HTTP ' + r.status + '.' };
        return await r.json();
      } catch (e) {
        clearTimeout(timer);
        throw e;
      }
    };

    const _needsFallback = (res) => {
      if (!res) return true;
      if (res._httpError) return true;
      if (res.success === false &&
          /^unknown action|not deployed|not supported|not implemented/i.test(String(res.error || ''))) return true;
      return false;
    };

    const fallbackUrl = useSupabase
      ? GAS_URL
      : (typeof ABHYAS_CONFIG !== 'undefined' ? ABHYAS_CONFIG.SUPABASE_URL : '');
    /* Some actions mutate storage that lives in one specific backend: signed
       upload URLs, submission PDF paths, weekly-set Drive files. Retrying
       those on the other backend would leave an orphaned file in the primary
       storage while the fallback records a path it cannot read. Callers that
       touch that kind of data opt out with { fallback: false }. */
    const allowFallback = opts.fallback !== false;
    const canFallback = allowFallback && !!(fallbackUrl && fallbackUrl !== primaryUrl);

    /* Normalize getFile so downstream code can keep reading res.result. */
    const _normalizeGetFile = (res) => {
      if (!res) return res;
      if ((action === 'getFile' || action === 'getfile') &&
          res.success && res.result == null && res.content != null) {
        try {
          res.result = typeof res.content === 'string' ? JSON.parse(res.content) : res.content;
        } catch (e) {
          console.warn('[admin] getFile content was not valid JSON:', e && e.message);
        }
      }
      return res;
    };

    let primaryErr;
    try {
      let res = await _attempt(primaryUrl);
      if (canFallback && _needsFallback(res)) {
        console.warn('[admin]', action, 'fell back to the other backend');
        try {
          const retry = await _attempt(fallbackUrl);
          if (retry && (retry.success || !_needsFallback(retry))) {
            try { retry._fallbackUsed = useSupabase ? 'gas' : 'supabase'; } catch (e) {}
            try { window.dispatchEvent(new CustomEvent('abhyas:fallback')); } catch (e) {}
            res = retry;
          }
        } catch (e) {
          /* fallback fetch failed — keep the primary response */
        }
      }
      res = _normalizeGetFile(res);
      if (res && res.sessionInvalid) {
        this._leaveAdminMode();
        return { success: false, error: 'Your session has expired. Please sign in again.' };
      }
      return res || { success: false, error: 'The server sent an empty response.' };
    } catch (e) {
      primaryErr = e;
    }

    /* Primary threw network / timeout. Try the other backend once. */
    if (canFallback) {
      try {
        const res = await _attempt(fallbackUrl);
        if (res) {
          try { res._fallbackUsed = useSupabase ? 'gas' : 'supabase'; } catch (e) {}
          try { window.dispatchEvent(new CustomEvent('abhyas:fallback')); } catch (e) {}
          const norm = _normalizeGetFile(res);
          if (norm && norm.sessionInvalid) {
            this._leaveAdminMode();
            return { success: false, error: 'Your session has expired. Please sign in again.' };
          }
          return norm;
        }
      } catch (fallbackErr) {
        /* Both backends failed — report the primary error below. */
      }
    }

    const msg = primaryErr && primaryErr.name === 'AbortError'
      ? 'The request timed out — the server is taking too long.'
      : (primaryErr && primaryErr.message) || 'Network error.';
    return { success: false, error: msg };
  },

  /* ── permissions ── */
  async loadPermissions() {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await this.post('adminGetPermissions', {});
        if (r && r.success) {
          this._perms = {
            role: r.role || (r.isOwner ? 'owner' : 'admin'),
            features: r.features || {}
          };
          return;
        }
      } catch (e) {}
    }
    this._perms = null;
  },

  /* Fail CLOSED: until the server has told us what this admin may do, they may do
     nothing. (This used to return true, so one failed request showed every section,
     button and export to a restricted sub-admin.) The server still enforces; this
     keeps the UI honest. An owner is recovered via adminListAdmins.isOwner. */
  can(key) {
    if (!this._perms) return false;
    if (this._perms.role === 'owner') return true;
    return !!(this._perms.features && this._perms.features[key]);
  },
  _hasFeature(k) { return this.can(k); },

  _featAllowed(feat) {
    if (!feat) return true;
    return Array.isArray(feat) ? feat.some(f => this.can(f)) : this.can(feat);
  },
  _viewAllowed(view) {
    const F = (typeof ADMIN_NAV !== 'undefined' && ADMIN_NAV.FEATURES) || {};
    return this._featAllowed(F[view]);
  },
  firstAllowedView() {
    const all = (typeof ADMIN_NAV !== 'undefined' && ADMIN_NAV.ALL) || [];
    const hit = all.find(it => this._featAllowed(it.feature));
    return hit ? hit.view : null;
  },

  _applyPermissions() {
    document.querySelectorAll('[data-perm]').forEach(el => {
      const perm = el.getAttribute('data-perm');
      if (!perm) return;
      const allowed = this.can(perm);
      el.hidden = !allowed;
      if (el.tagName === 'BUTTON' || el.tagName === 'A') el.disabled = !allowed;
    });
    /* Sidebar: each .rail-item is id="nav-<view>"; the permission it needs lives in
       ADMIN_NAV.FEATURES. (The old code looked for a data-feat attribute that the
       generated items never carry, so nothing was ever hidden.) */
    document.querySelectorAll('.rail-item').forEach(el => {
      const legacy = el.getAttribute('data-feat');
      const view = (el.id || '').replace(/^nav-/, '');
      el.hidden = legacy ? !this.can(legacy) : !this._viewAllowed(view);
    });
    /* Hide a group heading when every item under it is hidden. */
    document.querySelectorAll('.rail-group').forEach(h => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('rail-group')) { if (n.classList.contains('rail-item') && !n.hidden) any = true; n = n.nextElementSibling; }
      h.hidden = !any;
    });
  },

  /* ── refresh ── */
  async refresh(scope) {
    const list = Array.isArray(scope) ? scope
      : (typeof scope === 'string' ? [scope] : this.ALL_SCOPES.slice());
    const wanted = list.filter(s => this.ALL_SCOPES.indexOf(s) !== -1);
    if (!wanted.length) return;
    this.setLoading(true);
    const fails = [];
    await Promise.all(wanted.map(async s => {
      try { await this._refreshOne(s); }
      catch (e) { fails.push(s + ': ' + (e.message || 'failed')); }
    }));
    this.setLoading(false);
    this.markSynced();
    this._applyPermissions();
    if (typeof UI !== 'undefined' && UI.current) this._paintCurrentView(UI.current);
    if (typeof BADGES !== 'undefined') { try { BADGES.update(); } catch (e) {} }
    if (fails.length) TOAST.show('Some data could not be loaded: ' + fails.join('; '), 'warning', 6000);
  },

  _paintCurrentView(view) {
    try {
      if (view === 'today')      { TODAY.render(); EXPIRING.load(); }
      if (view === 'users')      USERS.render();
      if (view === 'payments')   PAYMENTS.render();
      if (view === 'logs')       LOGS.render();
      if (view === 'admins')     ADMINS.render(this.data.admins, this._perms && this._perms.role === 'owner', this._labels);
      if (view === 'weeklysets') WEEKLYSETS.render(this.data.weeklysets);
      if (view === 'dashboard')  { TRENDS.load(); if (!MISSED.lastResults.length) MISSED.load(); }
      if (view === 'settings')   SETTINGS.load();
      if (view === 'studydocs' && typeof STUDYDOCS !== 'undefined') STUDYDOCS.load();
      if (view === 'qna' && typeof QNA_ADMIN !== 'undefined') QNA_ADMIN.load();
      if (view === 'qreports'  && typeof QREPORTS  !== 'undefined') QREPORTS.render(this.data.qreports);
    } catch (e) { console.warn('[ADMIN] paint after refresh failed:', e); }
  },

  async _refreshOne(scope) {
    switch (scope) {
      case 'stats': {
        const r = await this.post('adminStats', {});
        if (!r.success) throw new Error(r.error || 'Could not load stats.');
        this.renderStats(r.stats || r);
        break;
      }
      case 'users': {
        const r = await this.post('adminListUsers', {});
        if (!r.success) throw new Error(r.error || 'Could not load students.');
        this.data.users = r.users || [];
        this.data.usersTotalCount = r.totalCount || this.data.users.length;
        this.data.usersTruncated = !!r.truncated;
        break;
      }
      case 'payments': {
        const r = await this.post('adminListPayments', {});
        if (!r.success) throw new Error(r.error || 'Could not load payments.');
        this.data.payments = r.payments || [];
        this.data.paymentsTotalCount = r.totalCount || this.data.payments.length;
        this.data.paymentsTruncated = !!r.truncated;
        break;
      }
      case 'settings': {
        const r = await this.post('adminGetSettings', {});
        if (!r.success) throw new Error(r.error || 'Could not load settings.');
        this.data.settings = r.settings || {};
        break;
      }
      case 'logs': {
        const r = await this.post('adminListLogs', {});
        if (!r.success) throw new Error(r.error || 'Could not load the log.');
        this.data.logs = r.logs || [];
        break;
      }
      case 'admins': {
        const r = await this.post('adminListAdmins', {});
        if (!r.success) throw new Error(r.error || 'Could not load admins.');
        this.data.admins = r.admins || [];
        this._labels = r.labels || this._labels || {};
        if (r.isOwner) {
          if (!this._perms) this._perms = { role: 'owner', features: {} };
          else this._perms.role = 'owner';
        }
        break;
      }
      case 'weeklysets': {
        const r = await this.post('adminListWeeklySets', {});
        if (!r.success) throw new Error(r.error || 'Could not load weekly sets.');
        this.data.weeklysets = r.sets || r.weeklysets || [];
        this.data.weeklysetsTotalCount = r.totalCount || this.data.weeklysets.length;
        this.data.weeklysetsTruncated = !!r.truncated;
        break;
      }
      case 'qreports': {
        const r = await this.post('adminListQuestionReports', {});
        if (!r.success) throw new Error(r.error || 'Could not load reports.');
        this.data.qreports = r.reports || r.qreports || [];
        this.data.qreportsTotalCount = r.totalCount || this.data.qreports.length;
        this.data.qreportsTruncated = !!r.truncated;
        if (typeof QREPORTS !== 'undefined') QREPORTS.all = this.data.qreports;
        break;
      }
    }
  },

  /* ── render helpers ── */
  renderStats(s) {
    if (!s) return;
    /* The Supabase shape is:
         { users: {total, trial, active, expired, paymentPending},
           payments: {total, pending, verified, rejected} }
       The old version overwrote `s` and lost `payments` entirely, leaving
       the three payment counters permanently at 0. Preserve both halves. */
    let payments = null;
    if (s.users && typeof s.users === 'object') {
      payments = s.payments || null;
      s = {
        totalUsers:      s.users.total,
        trialUsers:      s.users.trial,
        activeUsers:     s.users.active,
        expiredUsers:    s.users.expired,
        pendingPayments: s.users.paymentPending
      };
    }
    this.data.stats = s;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = (v == null ? '—' : v); };

    /* Accounts row (admin.html: st-users, st-trial, st-active, st-expired) */
    set('st-users',   s.totalUsers);
    set('st-trial',   s.trialUsers);
    set('st-active',  s.activeUsers);
    set('st-expired', s.expiredUsers);

    /* Payments row (admin.html: st-pending, st-payments, st-verified, st-rejected) */
    set('st-pending', s.pendingPayments);
    if (payments) {
      set('st-payments', payments.total);
      set('st-verified', payments.verified);
      set('st-rejected', payments.rejected);
    }

    /* Legacy IDs (harmless if not present in this build of admin.html) */
    set('stat-total',    s.totalUsers);
    set('stat-active',   s.activeUsers);
    set('stat-pending',  s.pendingPayments);
    set('stat-trial',    s.trialUsers);
    set('stat-expired',  s.expiredUsers);
    set('stat-revenue',  s.revenue);
    set('stat-today',    s.signupsToday);
    set('stat-week',     s.signupsThisWeek);
  },

  markSynced() { this._lastSync = Date.now(); this.paintSync(); },
  paintSync() {
    const el = $('sync-note');
    if (!el || !this._lastSync) return;
    el.textContent = 'Updated ' + relTime(this._lastSync);
  },

  setLoading(on) {
    const el = $('app-loading'); if (el) el.classList.toggle('on', on);
    document.body.classList.toggle('is-loading', on);
  },
  _gateBusy(on) {
    const btn = $('gate-btn'); if (btn) { btn.disabled = on; btn.classList.toggle('loading', on); }
    document.body.classList.toggle('gate-busy', on);
  },
  showErr(msg) { const t = $('gate-err-text'); if (t) t.textContent = msg; const e = $('gate-err'); if (e) e.classList.add('show'); },
  hideErr()    { const e = $('gate-err'); if (e) e.classList.remove('show'); },

  /* ── CSV ── */
  toCSV(headers, rows) {
    const e = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return [headers.map(e).join(','), ...rows.map(r => r.map(e).join(','))].join('\n');
  },
  downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
  exportUsers() {
    const rows = (this.data.users || []).map(u => [
      u.username, u.name || '', u.email || '', u.mobile || '',
      u.status || '', u.accessType || '',
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
      u.trialExpiresAt ? new Date(u.trialExpiresAt).toISOString() : '',
      u.permanentAccess ? 'yes' : 'no'
    ]);
    this.downloadCSV(this.toCSV(
      ['Username','Name','Email','Mobile','Status','Access','Joined','Trial ends','Permanent'],
      rows
    ), 'students_' + localISODate(new Date()) + '.csv');
  },
  exportPayments() {
    const rows = (this.data.payments || []).map(p => [
      p.username, p.name || '', p.txId || '', p.status || '',
      p.submittedAt ? new Date(p.submittedAt).toISOString() : '',
      p.reviewedAt ? new Date(p.reviewedAt).toISOString() : '',
      p.remarks || ''
    ]);
    this.downloadCSV(this.toCSV(
      ['Username','Name','Transaction ID','Status','Submitted','Reviewed','Remarks'],
      rows
    ), 'payments_' + localISODate(new Date()) + '.csv');
  },

  /* ── screenshots ── */
  async renderScreenshot(containerId, url, username) {
    const box = $(containerId);
    if (!box) return;
    if (url && /^https?:\/\//i.test(url)) {
      box.innerHTML = '<img src="' + esc(url) + '" alt="Payment screenshot" style="max-width:100%;border-radius:8px;display:block" data-on-error="ACT.hideParent(this)">';
      return;
    }
    if (!username) { box.innerHTML = '<p class="t-foot">No screenshot was attached.</p>'; return; }
    box.innerHTML = '<span class="inline-loader">Loading the screenshot</span>';
    try {
      const r = await this.post('adminDownloadScreenshot', { targetUsername: username });
      if (!r.success) throw new Error(r.error || 'Could not load that screenshot.');
      if (!r.url) throw new Error('The server did not return a screenshot URL.');
      box.innerHTML = '<img src="' + esc(r.url) + '" alt="Payment screenshot" style="max-width:100%;border-radius:8px;display:block" data-on-error="ACT.hideParent(this)">';
    } catch (e) {
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) + '</span></div>';
    }
  },

  async downloadScreenshot(url, filename) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return TOAST.show('The screenshot link is not a URL — reload the review dialog and try again.', 'warning');
    }
    BUSY.start();
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error('The server replied with HTTP ' + res.status + '.');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'screenshot.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      TOAST.show('Downloaded', 'success');
    } catch (e) { TOAST.show(e.message || 'Could not download that screenshot', 'error'); }
    BUSY.stop();
  },

  /* ── password ── */
  changePassword() {
    const tt = $('tt-pwd'), bd = $('bd-pwd');
    if (!tt || !bd) return;
    tt.textContent = this._forcedPwChange ? 'Set a new password to continue' : 'Change password';
    bd.innerHTML =
      '<p class="t-callout mb4">' + (this._forcedPwChange
        ? 'Your current password has expired. Choose a new one to continue.'
        : 'Choose a new password for <b>' + esc(this.creds ? this.creds.user : 'this account') + '</b>.') + '</p>' +
      '<div class="field"><label for="pwd-current">Current password</label>' +
        '<input class="input" type="password" id="pwd-current" autocomplete="current-password"></div>' +
      '<div class="field"><label for="pwd-new">New password</label>' +
        '<input class="input" type="password" id="pwd-new" autocomplete="new-password"></div>' +
      '<div class="field"><label for="pwd-confirm">Confirm new password</label>' +
        '<input class="input" type="password" id="pwd-confirm" autocomplete="new-password"></div>' +
      '<div class="flex g2 mt4">' +
        (this._forcedPwChange ? '' : '<button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'pwd\')">Cancel</button>') +
        '<button class="btn btn-primary" style="flex:2" id="pwd-save" data-on-click="ADMIN.doChangePassword()">Change password</button>' +
      '</div>';
    MODAL.open('pwd');
  },

  async doChangePassword() {
    const cur = ($('pwd-current') || {}).value || '';
    const neu = ($('pwd-new') || {}).value || '';
    const conf = ($('pwd-confirm') || {}).value || '';
    if (!cur) return TOAST.show('Enter your current password.', 'error');
    if (neu.length < 6) return TOAST.show('Use at least 6 characters.', 'error');
    if (neu !== conf) return TOAST.show('The two new passwords do not match.', 'error');
    const btn = $('pwd-save'); if (btn) btn.classList.add('loading');
    try {
      const r = await this.post('adminChangePassword', { currentPassword: cur, newPassword: neu });
      if (!r.success) throw new Error(r.error || 'Could not change your password.');
      if (r.token && this.creds) {
        /* The admin token was invalidated by the change — replace it AND
           drop the pending forced-change marker in one write. */
        this.creds = Object.assign({}, this.creds, { token: r.token, mustChangePassword: false });
        try { localStorage.setItem(LS_ADMIN, JSON.stringify(this.creds)); } catch (e) {}
      }
      this._forcedPwChange = false;
      MODAL.close('pwd');
      TOAST.show('Password changed', 'success');
    } catch (e) { TOAST.show(e.message, 'error'); }
    if (btn) btn.classList.remove('loading');
  }
};

/* ── expose to inline handlers ── */
window.ADMIN      = ADMIN;
window.TOAST      = TOAST;
window.BUSY       = BUSY;
window.MODAL      = MODAL;
window.CONFIRM    = CONFIRM;
window.FOCUS_TRAP = FOCUS_TRAP;
window.FSTATE     = FSTATE;
window.USER_SESSION = USER_SESSION;
window.setVal     = setVal;
window.setText    = setText;
window.setHTML    = setHTML;

/* ── sanity check ── */
(function () {
  const missing = ['esc', 'escAttrJs', 'TOAST', 'MODAL', 'CONFIRM', 'ADMIN']
    .filter(n => typeof window[n] === 'undefined');
  if (missing.length) {
    console.error('[admin/core.js] Missing globals: ' + missing.join(', ') +
      ' — check that admin.html loads the js/core/* dependencies before this file.');
  }
})();
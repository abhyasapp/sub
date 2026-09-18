/* ═══════════════════════════════════════════════════════════════════════
   SHARED.JS — small utilities used by index.html, user.html (via
   app.js/objective.js/subjective.js), and admin.html.

   Loaded via <script src="shared.js"> on every page, BEFORE the page's
   own logic. Classic script, no modules — the project intentionally has
   no build step.

   Exposes on window (implicitly, since everything is top-level):
     esc()                — HTML-escape
     escAttrJs()          — dual-layer escape for onclick="...('${x}')"
     pluralize()          — "1 file" vs "5 files"
     computeAccessLevel() — canonical trial/permanent/expired/pending
     getStoredTheme()     — 'dark' | 'light'
     applyTheme()
     toggleTheme()
     togglePwVisibility() — the eye icon in every password field
     pingBackend()        — one-shot reachability check against GAS
     THEME_KEY            — 'abhyas_theme', shared storage key
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Escape a value for safe interpolation into onclick="...('${value}')"
 * style attributes — i.e. inside an HTML double-quoted attribute that
 * itself contains a JS single-quoted string literal.
 *
 * esc() alone isn't enough here: the browser HTML-decodes the attribute
 * value BEFORE handing it to the JS parser, so a plain HTML-escaped `"`
 * would still close the JS string wrapper (after decoding) even though
 * it looks "escaped". This handles both layers in the right order.
 *
 * Note: this does NOT escape newlines. Every value ever passed here
 * (usernames, ids, chapter names) is either validated upstream against
 * a scheme with no newline character, or comes from a JSON question file
 * that never emits literal newlines inside string fields. If a call
 * site ever passes unvalidated free text, this MUST be extended —
 * a literal newline inside a JS single-quoted string literal is a
 * syntax error, not an injection vector, but it breaks the page.
 */
function escAttrJs(s) {
  return String(s == null ? '' : s).replace(/[\\'"<>]/g, c => ({
    '\\': '\\\\',
    "'": "\\'",
    '"': '&quot;',
    '<': '&lt;',
    '>': '&gt;'
  }[c]));
}

/**
 * HTML-escape a value for safe interpolation into innerHTML.
 *
 * Note the explicit null check — the naive `s || ''` coerces 0 and
 * false to '' which would silently drop legitimate zero values
 * (e.g. a counter that reads 0).
 */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

/**
 * "1 question" vs "5 questions". Several chapters/subtopics genuinely
 * have exactly 1 question, so the singular case isn't theoretical.
 * Pass an explicit pluralWord for irregular nouns.
 */
function pluralize(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : (pluralWord || word + 's')}`;
}

/**
 * Computes a user's access level from a checkSession / login / signup
 * API response. This is now the ONLY place this logic lives — it was
 * previously duplicated character-for-character in index.html's
 * handleUserAuth() and app.js's AUTH._buildSession(), a real risk
 * since the two copies had no mechanism forcing them to stay identical.
 *
 * @param {object} res    The API response (checkSession / login / signup).
 * @param {object} [user] Optional — pass res.user explicitly if the
 *                        caller has already destructured it; otherwise
 *                        this reads res.user itself.
 */
function computeAccessLevel(res, user) {
  user = user || res.user || {};
  return {
    level: res.permanentAccess || user.status === 'active' ? 'permanent'
           : res.isTrial ? 'trial'
           : res.needsPayment && user.status === 'payment_pending' ? 'pending_review'
           : res.needsPayment ? 'expired'
           : 'unknown',
    trialExpiresAt: res.trialExpiresAt || user.trialExpiresAt,
    permanent: !!(res.permanentAccess || user.status === 'active'),
    accessType: res.accessType || user.accessType || 'permanent',
    accessExpiresAt: res.accessExpiresAt || user.accessExpiresAt || ''
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   DARK MODE — shared across index.html and admin.html.

   user.html/app.js ships its OWN complete dark mode (the .dark class
   on <body>, UI.theme(), and a real toggle button in the top bar) —
   this does NOT touch or duplicate that. It exists only so index.html
   and admin.html, which don't load app.js, can offer the same toggle
   and land on the SAME preference.

   To stay compatible with the existing implementation this deliberately
   mirrors app.js's _save()/_load(): the same localStorage key, the same
   JSON.stringify/parse encoding, and the same mechanism — toggling a
   .dark class rather than a data-* attribute, so design-system.css's
   shared dark rules and user.html's own .dark{} block can both key off
   plain ".dark".

   index.html and admin.html apply the class to <html> (via an inline
   pre-paint script in <head>, and via applyTheme() below); user.html
   applies it to <body> via app.js's UI.theme() and the inline boot
   code. Both work with design-system.css's shared .dark rules.
   ═══════════════════════════════════════════════════════════════════════ */
const THEME_KEY = 'abhyas_theme';

function getStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v === 'dark' || v === 'light') return v;
    }
  } catch (e) { /* unavailable or malformed — fall through */ }
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function toggleTheme() {
  const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch (e) { /* non-fatal */ }
  applyTheme(next);
  return next;
}

/* ═══════════════════════════════════════════════════════════════════════
   PASSWORD-VISIBILITY TOGGLE
   Expects the button to be the input's previous sibling inside a
   .pw-field wrapper, containing a single <i class="ph ph-eye|ph-eye-slash">
   icon. See design-system.css's .pw-field / .pw-toggle rules.
   ═══════════════════════════════════════════════════════════════════════ */
function togglePwVisibility(btn) {
  const input = btn.previousElementSibling;
  if (!input || input.tagName !== 'INPUT') return;
  const icon = btn.querySelector('i');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  if (icon) icon.className = showing ? 'ph ph-eye' : 'ph ph-eye-slash';
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  btn.setAttribute('aria-pressed', String(!showing));
}

/* ═══════════════════════════════════════════════════════════════════════
   BACKEND REACHABILITY
   One-shot ping used by index.html's checkNet and app.js's NETCHECK.
   Each page owns its own online-state variable and UI updates — this
   just answers "can we reach the backend right now, yes or no".
   ═══════════════════════════════════════════════════════════════════════ */
async function pingBackend(gasUrl, timeoutMs = 8000) {
  if (!gasUrl) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${gasUrl}?action=ping&_=${Date.now()}`, {
      signal: ctrl.signal,
      cache: 'no-store'
    });
    clearTimeout(to);
    if (!r.ok) return false;
    const data = await r.json();
    return !!(data.pong || data.success);
  } catch (e) {
    return false;
  }
}
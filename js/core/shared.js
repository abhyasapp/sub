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
/* ═══════════════════════════════════════════════════════════════════════
   CRASH REPORTS (v1.15)
   Sends a SHORT technical note (page, error message, script name, app version,
   browser) to the Activity log so you find out about bugs from real phones.
   At most 5 per page load, never any answers or personal details.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  let sent = 0;
  const seen = {};
  function report(msg, src, line) {
    try {
      if (sent >= 5) return;
      msg = String(msg || '').slice(0, 200);
      if (!msg || msg === 'Script error.' || seen[msg]) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || '';
      if (!url) return;
      seen[msg] = 1; sent++;
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, keepalive: true,
        body: JSON.stringify({
          action: 'logClientError', msg: msg,
          src: String(src || '').split('/').pop().slice(0, 80), line: line || 0,
          page: (location.pathname || '').split('/').pop() || 'index',
          v: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
          ua: (navigator.userAgent || '').slice(0, 80)
        })
      }).catch(function () {});
    } catch (e) { /* never let the reporter itself throw */ }
  }
  window.addEventListener('error', function (e) { report(e.message, e.filename, e.lineno); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    report(r && r.message ? r.message : String(r), 'promise', 0);
  });
})();

async function pingBackend(gasUrl, timeoutMs = 12000) {
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

/* ═══════════════════════════════════════════════════════════════════════
   60-DAY SPRINT PLANNER (pure function, unit-tested in tests/check.js)

   Three phases over 60 days:
     Days  1-35  LEARN  cover every topic once, 40 questions a day
     Days 36-52  DRILL  attack weak chapters, 80 questions a day
     Days 53-60  MOCK   one full paper a day plus review, 100 questions

   opts: { startISO:'YYYY-MM-DD', now:Date, totalTopics, coveredTopics,
           dueReview, questionsToday }
   Day numbers use calendar days (not 24 h blocks), so they stay correct
   across clock changes and late-night study.
   ═══════════════════════════════════════════════════════════════════════ */
const SPRINT_DAYS = 60, SPRINT_LEARN_END = 35, SPRINT_DRILL_END = 52;

function sprintDayNumber(startISO, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startISO || ''));
  if (!m) return 0;
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000) + 1;
}

function sprintPlan(o) {
  const day = sprintDayNumber(o.startISO, o.now || new Date());
  if (!day || day < 1) return { state: 'notstarted' };
  if (day > SPRINT_DAYS) return { state: 'finished', day };

  const total = Math.max(1, o.totalTopics | 0);
  const covered = Math.min(total, Math.max(0, o.coveredTopics | 0));
  const due = Math.max(0, o.dueReview | 0);
  const doneQ = Math.max(0, o.questionsToday | 0);
  const left = total - covered;

  let phase, label, qTarget, mins, newTopics = 0, mock = false, expectedPct;
  if (day <= SPRINT_LEARN_END) {
    phase = 'learn'; label = 'Learn'; qTarget = 40; mins = 90;
    newTopics = Math.min(left, Math.max(1, Math.ceil(left / (SPRINT_LEARN_END - day + 1))));
    expectedPct = day / SPRINT_LEARN_END;
  } else if (day <= SPRINT_DRILL_END) {
    phase = 'drill'; label = 'Drill'; qTarget = 80; mins = 120;
    newTopics = Math.min(left, Math.ceil(left / (SPRINT_DRILL_END - day + 1)));
    expectedPct = 1;
  } else {
    phase = 'mock'; label = 'Mock'; qTarget = 100; mins = 150; mock = true;
    expectedPct = 1;
  }

  const actualPct = covered / total;
  const gap = actualPct - expectedPct;
  const pace = gap >= 0.05 ? 'ahead' : gap <= -0.1 ? 'behind' : 'on-track';

  return {
    state: 'active', day, daysLeft: SPRINT_DAYS - day, phase, label,
    qTarget, mins, newTopics, mock, due, doneQ,
    qRemaining: Math.max(0, qTarget - doneQ),
    covered, total, pace,
    coveragePct: Math.round(actualPct * 100),
    goalMet: doneQ >= qTarget && due === 0
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   MULTI-DEVICE PROGRESS MERGE (pure function, unit-tested)

   When two devices save progress, the server no longer lets the later save
   silently erase the earlier one. The loser gets the other copy back and
   merges it with its own using this function, then saves again.

   Rules: nothing is ever lost by a merge.
     sessions   union by timestamp, newest first, max 50
     chapStats  keep the record with more attempts
     cov        union of answered-question bits, max of counters
     bk/fl/wr   union by uid; this device's copy wins a conflict
     stk        union of study days
     qnotes     union; this device wins a conflict
     sprint     this device's start date, else the other's
   ═══════════════════════════════════════════════════════════════════════ */
function mergeSyncData(local, remote) {
  const L = (local && typeof local === 'object') ? local : {};
  const R = (remote && typeof remote === 'object') ? remote : {};
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const arr = v => Array.isArray(v) ? v : [];

  const unionBy = (a, b, keyOf) => {
    const seen = new Set(), out = [];
    arr(a).concat(arr(b)).forEach(x => {
      if (x === null || x === undefined) return;
      const k = keyOf(x);
      if (seen.has(k)) return;
      seen.add(k); out.push(x);
    });
    return out;
  };
  const uidOf = x => (x && x.uid !== undefined) ? 'u:' + x.uid : 'j:' + JSON.stringify(x);

  const lp = isObj(L.prog) ? L.prog : {}, rp = isObj(R.prog) ? R.prog : {};
  const sessions = unionBy(lp.sessions, rp.sessions, s => (s && s.at) ? 'a:' + s.at + ':' + (s.fid || s.chapter || '') : 'j:' + JSON.stringify(s))
    .sort((a, b) => (Number(b && b.at) || 0) - (Number(a && a.at) || 0)).slice(0, 50);
  const prog = Object.assign({}, rp, lp, { sessions });

  const chapStats = Object.assign({}, isObj(R.chapStats) ? R.chapStats : {});
  Object.keys(isObj(L.chapStats) ? L.chapStats : {}).forEach(k => {
    const l = L.chapStats[k], r = chapStats[k];
    if (!r || (Number(l && l.attempted) || 0) >= (Number(r && r.attempted) || 0)) chapStats[k] = l;
  });

  const cov = {};
  const lc = isObj(L.cov) ? L.cov : {}, rc = isObj(R.cov) ? R.cov : {};
  new Set(Object.keys(lc).concat(Object.keys(rc))).forEach(fid => {
    const a = isObj(lc[fid]) ? lc[fid] : null, b = isObj(rc[fid]) ? rc[fid] : null;
    if (!a || !b) { const o = a || b; cov[fid] = { p: String(o.p || ''), a: Number(o.a) || 0, c: Number(o.c) || 0 }; return; }
    const pa = String(a.p || ''), pb = String(b.p || ''); let p = '';
    for (let i = 0, n = Math.max(pa.length, pb.length); i < n; i++) { const x = pa[i] || '0'; p += x !== '0' ? x : (pb[i] || '0'); }
    cov[fid] = { p, a: Math.max(Number(a.a) || 0, Number(b.a) || 0), c: Math.max(Number(a.c) || 0, Number(b.c) || 0) };
  });

  const ls = isObj(L.stk) ? L.stk : {}, rs = isObj(R.stk) ? R.stk : {};
  const days = Array.from(new Set(arr(ls.days).concat(arr(rs.days)))).sort().slice(-400);
  const stk = Object.assign({}, rs, ls, { days, last: days.length ? days[days.length - 1] : (ls.last || rs.last || '') });

  const qnotes = Object.assign({}, isObj(R.qnotes) ? R.qnotes : {}, isObj(L.qnotes) ? L.qnotes : {});
  const okDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const sprint = okDate(L.sprint) ? L.sprint : (okDate(R.sprint) ? R.sprint : '');

  return {
    prog, chapStats, cov, stk, qnotes, sprint,
    bk: unionBy(L.bk, R.bk, uidOf),
    fl: unionBy(L.fl, R.fl, uidOf),
    wr: unionBy(L.wr, R.wr, uidOf)
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   frameThrottle: run immediately, then at most once per animation frame.

   Rendering functions such as HOME.render() and HOME.updateBadges() are
   called from many places, often several times in one burst (for example
   once per wrong answer when an exam is submitted). Each call rebuilt the
   same DOM. The first call still runs synchronously, so code that reads the
   DOM straight afterwards is unaffected; repeat calls in the same frame
   collapse into ONE trailing call that uses the latest arguments.
   ═══════════════════════════════════════════════════════════════════════ */
function frameThrottle(fn, schedule) {
  const next = schedule || ((typeof requestAnimationFrame === 'function')
    ? (f => requestAnimationFrame(f))
    : (f => setTimeout(f, 16)));
  let busy = false, queued = false, lastArgs = null, lastThis = null;
  function run(self, args) {
    busy = true;
    try { return fn.apply(self, args); }
    finally {
      next(() => {
        busy = false;
        if (queued) {
          queued = false;
          const a = lastArgs, s = lastThis;
          lastArgs = lastThis = null;
          try { run(s, a); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
        }
      });
    }
  }
  return function throttled(...args) {
    if (busy) { queued = true; lastArgs = args; lastThis = this; return undefined; }
    return run(this, args);
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   PROGRESS INSIGHTS (pure data, unit-tested): everything the Progress
   charts draw comes from here, so the maths is testable without a browser.

   sessions : S.prog.sessions   [{at, total, correct, durationSec, ...}]
   studyDays: S.stk.days        ['YYYY-MM-DD', ...]
   now      : Date
   ═══════════════════════════════════════════════════════════════════════ */
function localISODate(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function insightsData(sessions, studyDays, now) {
  const list = Array.isArray(sessions) ? sessions.filter(s => s && Number(s.at) > 0) : [];
  const days = new Set(Array.isArray(studyDays) ? studyDays : []);
  const today = new Date((now || new Date()).getTime());
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const byDate = {};
  list.forEach(s => {
    const k = localISODate(new Date(Number(s.at)));
    const r = byDate[k] || (byDate[k] = { q: 0, correct: 0, secs: 0 });
    r.q += Math.max(0, Number(s.total) || 0);
    r.correct += Math.max(0, Number(s.correct) || 0);
    r.secs += Math.max(0, Number(s.durationSec) || 0);
  });

  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() - i);
    const k = localISODate(d), r = byDate[k] || { q: 0, correct: 0, secs: 0 };
    last14.push({ date: k, label: WD[d.getDay()], q: r.q, correct: r.correct, mins: Math.round(r.secs / 60), isToday: i === 0 });
  }

  const recent = list.filter(s => Number(s.total) > 0).slice(0, 12).reverse()
    .map(s => ({ at: Number(s.at), pct: Math.max(0, Math.min(100, Math.round(Number(s.pct) || ((Number(s.correct) || 0) / Number(s.total)) * 100))) }));

  const week = last14.slice(7), prev = last14.slice(0, 7);
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const acc = a => { const q = sum(a, x => x.q); return q ? Math.round(sum(a, x => x.correct) / q * 100) : null; };
  const accWeek = acc(week), accPrev = acc(prev);

  const cells = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() - i);
    const k = localISODate(d);
    cells.push({ date: k, active: days.has(k) || !!(byDate[k] && byDate[k].q > 0), q: byDate[k] ? byDate[k].q : 0 });
  }
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].active) streak++;
    else if (i === cells.length - 1) continue;   /* today not studied yet doesn't break the streak */
    else break;
  }

  return {
    last14, recent, cells, streak,
    weekQuestions: sum(week, x => x.q), prevWeekQuestions: sum(prev, x => x.q),
    weekMinutes: sum(week, x => x.mins),
    activeDays12w: cells.filter(c => c.active).length,
    accWeek, accPrev,
    accDelta: (accWeek !== null && accPrev !== null) ? accWeek - accPrev : null,
    bestDay: last14.reduce((b, x) => x.q > b.q ? x : b, { q: 0, date: '', label: '' })
  };
}


/* ═══════════════════════════════════════════════════════════════════════
   STUDY PDFs (pure helpers, unit-tested): labels, filtering, "new" tracking.
   ═══════════════════════════════════════════════════════════════════════ */
const STUDYDOC_LABELS = {
  'model-answer': 'Model answers', 'notes': 'Notes', 'past-paper': 'Past papers', 'syllabus': 'Syllabus', 'other': 'Other'
};

/* opts: { cat: 'all' | category, q: search text }. Order is preserved. */
function studyDocsFilter(docs, opts) {
  const o = opts || {};
  const cat = o.cat && o.cat !== 'all' ? String(o.cat) : '';
  const words = String(o.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (Array.isArray(docs) ? docs : []).filter(d => {
    if (!d) return false;
    if (cat && d.category !== cat) return false;
    if (!words.length) return true;
    const hay = ((d.title || '') + ' ' + (d.description || '') + ' ' + (STUDYDOC_LABELS[d.category] || '')).toLowerCase();
    return words.every(w => hay.indexOf(w) !== -1);
  });
}

/* Documents the student has not opened the list for yet. */
function studyDocsNewIds(docs, seenIds) {
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  return (Array.isArray(docs) ? docs : []).filter(d => d && d.id && !seen.has(d.id)).map(d => d.id);
}

/* [{category, label, count}] for the chips, only categories that have documents. */
function studyDocsCategories(docs) {
  const counts = {};
  (Array.isArray(docs) ? docs : []).forEach(d => { if (d) counts[d.category] = (counts[d.category] || 0) + 1; });
  return Object.keys(STUDYDOC_LABELS).filter(c => counts[c]).map(c => ({ category: c, label: STUDYDOC_LABELS[c], count: counts[c] }));
}

function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/* Published documents attached to one written-answer chapter (newest order preserved). */
function studyDocsForChapter(docs, chapterId) {
  const id = String(chapterId || '');
  if (!id) return [];
  return (Array.isArray(docs) ? docs : []).filter(d => d && d.chapterId === id);
}

/* Chapter name for a subjective chapter id ('' when unknown). */
function subjChapterName(chapterId) {
  try {
    const c = (window.SUBJECTIVE_CHAPTERS || []).find(x => x.id === chapterId);
    return c ? c.name : '';
  } catch (e) { return ''; }
}

// js/core/format.js — the small pure helpers every module uses.

function shuf(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function fmt(s) {
  if (s < 0) s = 0;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtHMS(s) {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Centralized time formatter.
 * @param {number} seconds - The time in seconds.
 * @param {boolean} alwaysShowHours - If true, forces HH:MM:SS even if hours is 0.
 * @returns {string}
 */
function formatTime(seconds, alwaysShowHours = false) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const p = n => String(n).padStart(2, '0');
  return (alwaysShowHours || h > 0) ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateOffset(baseDate, daysOffset) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + daysOffset);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isOk(sel, cor) {
  if (sel === null || sel === undefined || cor === null || cor === undefined) return false;
  const s = String(sel).trim(), c = String(cor).trim();
  return (!isNaN(s) && !isNaN(c) && s !== '' && c !== '')
    ? Number(s) === Number(c)
    : s.toLowerCase() === c.toLowerCase();
}

/* KaTeX is ~270 KB of script; most sessions never show a formula. Load it the first
   time some text actually contains math delimiters. */
let _mathLoading = null;
function _loadMath() {
  if (typeof window.renderMathInElement === 'function') return Promise.resolve(true);
  if (_mathLoading) return _mathLoading;
  const add = (src) => new Promise((ok, no) => { const t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = no; document.head.appendChild(t); });
  _mathLoading = add('tools/vendor/katex/katex.min.js')
    .then(() => add('tools/vendor/katex/auto-render.min.js'))
    .then(() => true)
    .catch(() => { _mathLoading = null; return false; });
  return _mathLoading;
}

function renderMath(el) {
  if (!el) return;
  if (typeof window.renderMathInElement !== 'function') {
    const txt = el.textContent || '';
    if (txt.indexOf('$') === -1 && txt.indexOf('\\(') === -1 && txt.indexOf('\\[') === -1) return;
    _loadMath().then((ok) => { if (ok) renderMath(el); });
    return;
  }
  try {
    window.renderMathInElement(el, {
      /* Order matters: the long forms must be listed before `$` or `$$` is
         taken one dollar at a time. `\(` and `\[` are what LaTeX sources and
         Overleaf actually put on the clipboard, so copied math that has no
         dollars at all still renders. */
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  } catch (e) {}
}

// Expose globally
window.formatTime = formatTime;
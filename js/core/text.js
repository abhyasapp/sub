// js/core/text.js — the ONE HTML escaper, plus the tiny string helpers.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function escAttrJs(s) {
  const js = String(s == null ? '' : s)
    .replace(/[\\'"]/g, c => '\\' + c)
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); // would end the JS string
  return js.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function pluralize(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : (pluralWord || word + 's')}`;
}

function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function localISODate(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
window.esc          = esc;
window.escAttrJs    = escAttrJs;
window.pluralize    = pluralize;
window.formatBytes  = formatBytes;
window.localISODate = localISODate;

function driveFileId(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s || /^data:/i.test(s)) return '';
  if (/^[-\w]{25,}$/.test(s)) return s;
  const m = s.match(/\/d\/([-\w]{25,})/) ||
            s.match(/[?&]id=([-\w]{25,})/) ||
            s.match(/\/([-\w]{25,})(?:\/|$)/);
  return m ? m[1] : '';
}
window.driveFileId = driveFileId;

/* repairPasted — notes are copied from anywhere (PDF, Word, HTML source,
   JSON), so they arrive carrying the damage those sources do. This repairs
   only what is already broken and never rewrites what the student meant:
     · invisible characters that render as nothing (soft hyphen, zero-width
       space, word joiner, BOM) are dropped. ZWJ/ZWNJ are KEPT — Devanagari
       needs them for shaping, so stripping them would corrupt Nepali notes.
     · HTML entities left over from copying markup become their character,
       in ONE pass, so `&amp;lt;` becomes `&lt;` and not `<`.
     · NBSP becomes a normal space; that is where most `&nbsp;` trails end.
     · `\\frac` (a backslash escaped by JSON or a code block) collapses to
       `\frac`, but only when a command name follows, so a genuine LaTeX line
       break (`a \\ b`) and `\\[2pt]` survive untouched.
   Returns a string for any input, so corrupt storage cannot throw here.     */
function repairPasted(s) {
  let out = String(s == null ? '' : s);
  if (!out) return out;
  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(/[\u00AD\u200B\u2060\uFEFF]/g, '');
  out = out.replace(/\u00A0/g, ' ');
  out = out.replace(/&(nbsp|amp|lt|gt|quot|#39|#x27);/gi, (m, k) => ({
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'"
  }[k.toLowerCase()]));
  out = out.replace(/\\{2,}(?=[A-Za-z])/g, '\\');
  return out;
}
window.repairPasted = repairPasted;
// js/core/dom.js — the two DOM shorthand helpers the feature files use.
// Every body extracted from user-page.js / subjective.js is verbatim;
// only the helper's home is new.
const $  = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
window.$  = $;
window.$$ = $$;
/* ── set(idOrEl, value) ────────────────────────────────────────────────
   Sets text content of an element by ID (or element reference).
   If the target is a form control, sets .value instead.
   ─────────────────────────────────────────────────────────────────── */
if (typeof window.set !== 'function') {
  window.set = function (id, value) {
    var el = (typeof id === 'string') ? document.getElementById(id) : id;
    if (!el) return null;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      el.value = (value == null) ? '' : value;
    } else {
      el.textContent = (value == null) ? '' : String(value);
    }
    return el;
  };
}
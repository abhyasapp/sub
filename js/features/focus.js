// js/features/focus.js — auto-scroll on mobile when a keyboard would cover
// the focused field; repaint date-sensitive cards at midnight.

(function focusScroll() {
  if (!window.matchMedia || !matchMedia('(pointer:coarse)').matches) return;
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!el || !el.matches || !el.matches('input, textarea, select')) return;
    if (el.type === 'hidden' || el.readOnly || el.disabled) return;
    setTimeout(() => {
      try {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (r.top > vh * 0.55) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {}
    }, 300);
  });
})();

(function midnightRepaint() {
  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
  let last = dayStart(new Date());
  function check() {
    const now = dayStart(new Date());
    if (now === last) return;
    last = now;
    try { if (typeof EXAM_DATE !== 'undefined' && EXAM_DATE.render) EXAM_DATE.render(); } catch (e) {}
    try { if (typeof DAILY10 !== 'undefined' && DAILY10.render) DAILY10.render(); } catch (e) {}
    try { if (typeof SPRINT !== 'undefined' && SPRINT.render) SPRINT.render(); } catch (e) {}
    try { if (typeof TODAY_PLAN !== 'undefined' && TODAY_PLAN.render) TODAY_PLAN.render(); } catch (e) {}
    try { if (typeof SYLLABUS_MOCK !== 'undefined' && SYLLABUS_MOCK.render) SYLLABUS_MOCK.render(); } catch (e) {}
  }
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
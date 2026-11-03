// js/core/perf.js — coalesce repeated calls into one per animation frame.

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
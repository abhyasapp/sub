/* js/core/actions.js — the ONE dispatcher for every data-on-* attribute.
 *
 *   data-on-click="QUIZ.fcAnswer(0)"
 *   data-on-change="QUIZ._tagCurrent(this.value)"
 *   data-on-keydown="ACT.enterOrSpace(event)&&this.querySelector('input').click()"
 *   data-on-error="ACT.hideParent(this)"
 *   data-on-click="this.parentElement.classList.toggle('open')"
 *   data-on-click="PAYMENTS.toggle('user', event)"
 *
 * Binding rules (match standard inline handler semantics):
 *   this  = the element carrying the attribute
 *   event = the DOM event
 *   return false  →  preventDefault() + stopPropagation()
 *
 * Handlers run inside `new Function('event', code)` — top-level const QUIZ,
 * PAYMENTS, SUBJ, etc. are visible because new Function bodies run in the
 * global scope, which includes the global lexical environment.
 */
(function () {
  'use strict';

  const _cache = new Map();
  const MAX_CACHE_SIZE = 1000;

  function _compile(code) {
    let fn = _cache.get(code);
    if (fn) return fn;
    
    try {
      // Wrap in strict mode and return the result properly.
      // eslint-disable-next-line no-new-func -- the data-on-* dispatcher is the single intended use
      fn = new Function('event', '"use strict";\n' + code);
    }
    catch (e) {
      console.error('[actions] Failed to compile:', code, e);
      fn = function () {};
    }
    
    if (_cache.size >= MAX_CACHE_SIZE) {
      // Simple cache eviction: clear half the cache if it gets too big
      const keys = Array.from(_cache.keys()).slice(0, MAX_CACHE_SIZE / 2);
      keys.forEach(k => _cache.delete(k));
    }
    
    _cache.set(code, fn);
    return fn;
  }

  function _fire(el, attrName, evt) {
    const code = el.getAttribute(attrName);
    if (!code) return;
    
    let stopRequested = false;
    evt.stopPropagation = function () { stopRequested = true; evt.__actStopped = true; };
    
    let result;
    try { 
      result = _compile(code).call(el, evt); 
    }
    catch (e) {
      console.error(`[actions] Handler threw (${attrName}):`, code, e);
      if (typeof toast === 'function') {
        toast('An unexpected error occurred. Please try again.', 4000);
      }
      return;
    }
    finally { delete evt.stopPropagation; }
    
    if (result === false && evt) {
      if (evt.preventDefault) evt.preventDefault();
      stopRequested = true; evt.__actStopped = true;
    }
    
    if (stopRequested && evt.bubbles) {
      const stopper = ev => { if (ev === evt) ev.stopPropagation(); };
      el.addEventListener(evt.type, stopper);
      setTimeout(() => el.removeEventListener(evt.type, stopper), 0);
    }
  }

  const TYPES = ['click', 'keydown', 'change', 'input', 'focus', 'mousedown', 'error'];

  TYPES.forEach(type => {
    document.addEventListener(type, e => {
      let el = e.target;
      while (el && el !== document && el !== window) {
        if (el.getAttribute && el.getAttribute('data-on-' + type) != null) {
          _fire(el, 'data-on-' + type, e);
          if (e.__actStopped) break;
        }
        el = el.parentElement;
      }
    }, true);
  });

  window.ACT = {
    enterOrSpace(e) {
      return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
    },

    /* Full-page navigation from a data-on-click (the trial chip uses it to
       reach the payment screen). Kept here because both pages need it. */
    go(url) {
      if (!url) return;
      try { window.location.assign(String(url)); } catch (e) { console.error('[ACT.go]', e); }
    },

    /* "Save new chapters automatically on Wi-Fi". CACHE reads this key in
       autoSync(), so persisting it here is all the wiring the toggle needs. */
    autosync(el) {
      try { _save('abhyas_autosync', !!(el && el.checked)); } catch (e) {}
    },
    hideParent(el) {
      if (el && el.parentNode) el.parentNode.style.display = 'none';
    },
    showParent(el) {
      if (el && el.parentNode) el.parentNode.style.display = '';
    },
    later(ms, target, method) {
      const rest = Array.prototype.slice.call(arguments, 3);
      setTimeout(() => {
        try {
          if (typeof target === 'function') target.apply(null, method === undefined ? [] : [method].concat(rest));
          else if (target && typeof target[method] === 'function') target[method].apply(target, rest);
        } catch (e) { console.error('[ACT.later]', e); }
      }, Number(ms) || 0);
    }
  };
})();
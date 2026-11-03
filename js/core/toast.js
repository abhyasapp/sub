/* js/core/toast.js — window.toast / window.toastUndo.
   Load AFTER text.js and BEFORE storage.js. */
(function () {
  'use strict';

  function _stack() {
    let box = document.getElementById('toast-stack');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'toast-stack';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.style.cssText =
      'position:fixed;left:1rem;right:1rem;bottom:calc(1rem + env(safe-area-inset-bottom,0px));' +
      'z-index:10030;display:flex;flex-direction:column;gap:.4rem;pointer-events:none;align-items:center';
    document.body.appendChild(box);
    return box;
  }

  function _bg(tone) {
    return tone === 'error'   ? '#b91c1c'
         : tone === 'warning' ? '#b45309'
         : tone === 'success' ? '#15803d'
         : 'rgba(20,20,20,.92)';
  }

  function _push(message, tone, duration, undo) {
    const t = document.createElement('div');
    t.style.cssText =
      'pointer-events:auto;color:#fff;padding:.6rem .9rem;border-radius:10px;' +
      'font-size:.85rem;line-height:1.4;max-width:min(88vw,520px);' +
      'box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;' +
      'display:flex;gap:.6rem;align-items:center;background:' + _bg(tone);
    const span = document.createElement('span');
    span.style.flex = '1';
    span.textContent = String(message == null ? '' : message);
    t.appendChild(span);
    if (undo) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Undo';
      btn.style.cssText =
        'background:none;border:1px solid rgba(255,255,255,.35);color:#fff;' +
        'padding:.25rem .55rem;border-radius:6px;font-size:.78rem;cursor:pointer';
      btn.onclick = function () {
        try { undo(); } catch (e) {}
        t.remove();
      };
      t.appendChild(btn);
    }
    _stack().appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 250);
    }, duration || 3500);
    return t;
  }

  window.toast = function (message, duration) {
    return _push(message, 'info', duration);
  };
  window.toastUndo = function (message, onUndo, duration) {
    return _push(message, 'info', duration || 6000, onUndo);
  };
})();
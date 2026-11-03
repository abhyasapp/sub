// js/core/modal.js — the sheet modal plus the destructive-confirm dialog.

/* ═════════════════════════════════════════════════════════════════════
   DIALOG — the ONE focus manager for every dialog in the app.

   A dialog is any element that should behave like a modal: it traps the
   Tab key inside itself, moves focus in when it opens, restores focus to
   the control that opened it when it closes, and (optionally) closes on
   Escape. The app chrome (#tb topbar, #layout, #bnav) is marked
   aria-hidden + inert while a dialog is open so screen readers and the
   keyboard never land behind it.

   Dialogs are stacked: opening a confirm over a sheet pushes a second
   entry; Escape only ever dismisses the top one.
   ═════════════════════════════════════════════════════════════════════ */
const DIALOG = (() => {
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  /* App chrome hidden while any dialog is open. Each of these is a direct
     child of <body>, so a dialog (also body-level) is never trapped inside. */
  const BG = ['#tb', '#layout', '#bnav'];
  const stack = []; // [{ container, restoreTo, onEscape }]

  function _visible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function _items(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(_visible);
  }
  function _onKey(e) {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    if (e.key === 'Escape') {
      if (top.onEscape) { e.stopPropagation(); top.onEscape(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const items = _items(top.container);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const inside = top.container.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault(); first.focus();
    }
  }
  function _hideChrome(on) {
    BG.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (on) { el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); }
      else { el.removeAttribute('aria-hidden'); el.removeAttribute('inert'); }
    });
  }
  function open(container, opts) {
    if (!container) return;
    opts = opts || {};
    /* Re-opening a dialog that's already trapped (a content re-render) must not
       push a second entry — just refresh its behaviour and re-focus. */
    const existing = stack.find(en => en.container === container);
    if (existing) { existing.onEscape = opts.onEscape || existing.onEscape; }
    else {
      if (!stack.length) {
        document.addEventListener('keydown', _onKey, true);
        _hideChrome(true);
      }
      stack.push({ container, restoreTo: opts.restoreTo || document.activeElement, onEscape: opts.onEscape || null });
    }
    let target = opts.focus ? container.querySelector(opts.focus) : null;
    if (!target) { const list = _items(container); target = list[0] || null; }
    try {
      if (target) target.focus();
      else { container.setAttribute('tabindex', '-1'); container.focus(); }
    } catch (e) {}
  }
  function release(container) {
    const idx = container ? stack.findIndex(en => en.container === container) : stack.length - 1;
    if (idx === -1) return;
    const entry = stack.splice(idx, 1)[0];
    if (!stack.length) {
      document.removeEventListener('keydown', _onKey, true);
      _hideChrome(false);
    }
    try {
      if (entry.restoreTo && entry.restoreTo.focus && document.contains(entry.restoreTo)) entry.restoreTo.focus();
    } catch (e) {}
  }
  return { open, release, _stack: stack };
})();
window.DIALOG = DIALOG;

function openMod(title, html, opts) {
  const bg = document.getElementById('mbg');
  const box = bg.querySelector('.mbox');
  if (box) box.classList.toggle('wide', !!(opts && opts.wide));
  document.getElementById('mtitle').textContent = title;
  document.getElementById('mbody').innerHTML = html;
  bg.classList.add('show');
  /* Trap only the first time it opens; re-renders just swap content. Escape is
     handled by shell-hooks.js, so leave onEscape off to avoid a double-close. */
  if (!bg._trapped) { bg._trapped = true; DIALOG.open(bg); }
}
function closeMod() {
  const bg = document.getElementById('mbg');
  bg.classList.remove('show');
  if (bg._trapped) { bg._trapped = false; DIALOG.release(bg); }
}
function _anyModalOpen() {
  if (document.getElementById('mbg')?.classList.contains('show')) return true;
  return ['#quiz-limit-modal', '#exam-resume-modal', '#quiz-exit-modal', '#quiz-error-card', '#quiz-loader']
    .some(sel => { const el = document.querySelector(sel); return el && el.offsetParent !== null; });
}

/* A destructive action needs a typed confirmation, so it can never be
   dismissed by accident. Same contract as before: resolves true / false,
   disables the OK button until the typed text matches, traps Tab. */
const ASK = {
  confirm(o) {
    o = o || {};
    return new Promise(resolve => {
      const prev = document.activeElement;
      const need = o.requireText ? String(o.requireText) : '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:var(--scrim);backdrop-filter:blur(4px)';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML = `<div style="width:100%;max-width:380px;background:var(--surface-2,var(--surface));border:1px solid var(--sep);border-radius:var(--r-sheet);box-shadow:var(--sh-modal,var(--sh-3));padding:1.25rem">
        <div style="font-size:var(--fs-t3);font-weight:650;margin-bottom:.4rem">${esc(o.title || 'Are you sure?')}</div>
        <div class="t-callout" style="margin-bottom:${need ? '.8rem' : '1.1rem'};line-height:1.55">${esc(o.body || '')}</div>
        ${need ? `<input class="input" id="ask-typed" autocomplete="off" placeholder="Type ${esc(need)} to confirm" style="margin-bottom:1rem">` : ''}
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-quiet" id="ask-no" style="flex:1" type="button">Cancel</button>
          <button class="btn ${o.danger ? 'btn-r' : 'btn-solid'}" id="ask-yes" style="flex:1" type="button" ${need ? 'disabled' : ''}>${esc(o.ok || 'Confirm')}</button>
        </div></div>`;
      document.body.appendChild(wrap);
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
      const done = v => {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        try { if (prev && prev.focus) prev.focus(); } catch (e) {}
        resolve(v);
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => { if (e.target === wrap) done(false); });
      wrap.querySelector('#ask-no').onclick = () => done(false);
      const yes = wrap.querySelector('#ask-yes');
      yes.onclick = () => done(true);
      const typed = wrap.querySelector('#ask-typed');
      if (typed) {
        typed.addEventListener('input', () => { yes.disabled = typed.value.trim().toUpperCase() !== need.toUpperCase(); });
        typed.focus();
      } else yes.focus();
    });
  }
};
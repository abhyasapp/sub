// js/features/module-sheet.js — the retake/resume/preview sheet used by
// WEEKLY, SESSION, SUBJ_BUILDER, TODAY_PLAN, MISCONCEPTIONS, etc.

window.MODAL = window.MODAL || {
  _el: null, _prevFocus: null, _onKey: null,
  _build() {
    if (this._el) return this._el;
    const ov = document.createElement('div');
    ov.id = 'ov-sheet';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'tt-sheet');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45)';
    ov.innerHTML =
      '<div class="dialog" style="background:var(--surface,var(--bg,#fff));color:var(--ink,inherit);width:100%;max-width:520px;max-height:90vh;overflow:auto;' +
        'border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<h3 id="tt-sheet" style="flex:1;margin:0;font-size:1rem"></h3>' +
          '<button type="button" class="btn btn-quiet" aria-label="Close" data-modal-close>&times;</button>' +
        '</div>' +
        '<div id="bd-sheet"></div>' +
      '</div>';
    ov.addEventListener('click', e => {
      if (e.target === ov || (e.target.closest && e.target.closest('[data-modal-close]'))) MODAL.close('sheet');
    });
    document.body.appendChild(ov);
    return (this._el = ov);
  },
  sheet(title, html, opts) {
    const ov = this._build();
    this._prevFocus = document.activeElement;
    ov.querySelector('#tt-sheet').textContent = String(title == null ? '' : title);
    ov.querySelector('#bd-sheet').innerHTML = html;
    const wide = !opts || opts.wide !== false;
    ov.querySelector('.dialog').style.maxWidth = wide ? '640px' : '520px';
    ov.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    /* Tab-trap + Escape + chrome hiding are all handled by the shared trap. */
    DIALOG.open(ov, { onEscape: () => MODAL.close('sheet') });
    const first = ov.querySelector('#bd-sheet button, [data-modal-close]');
    if (first && first.focus) first.focus();
  },
  open() { if (this._el) this._el.style.display = 'flex'; },
  close() {
    if (!this._el || this._el.style.display === 'none') return;
    this._el.style.display = 'none';
    document.body.style.overflow = '';
    DIALOG.release(this._el);
    this._prevFocus = null;
  },
  closeAll() { this.close(); }
};

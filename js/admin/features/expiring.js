// js/admin/features/expiring.js — the expiring-trials panel.
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, initials, plural).
// Uses TODAY.render() at call time.

const EXPIRING = {
  _inflight: null,

  /* TODAY.render() kicks a load, and the router calls it right after —
     dedupe so that first visit costs one network round-trip, not two. */
  load(){
    if (this._inflight) return this._inflight;
    this._inflight = this._load().finally(() => { this._inflight = null; });
    return this._inflight;
  },

  async _load(){
    const box = $('expiring-list');
    if (!box) return;
    const hoursEl = $('exp-hours');
    const hours = (hoursEl && hoursEl.value) || 24;
    box.innerHTML = '<div class="skeleton sk-80"></div><div class="skeleton sk-60"></div>';
    try {
      const res = await ADMIN.post('adminExpiringTrials', { hours });
      if (!res.success) throw new Error(res.error || 'Could not load trials.');
      box.dataset.count = String(res.count || 0);
      if (!res.count) {
        box.innerHTML = '<div class="empty" style="padding:var(--sp-8) var(--sp-4)"><i class="ph ph-hourglass"></i>' +
          '<div class="t">No trials ending soon</div>' +
          '<div class="d">When push notifications are set up, students are reminded two hours before their trial runs out.</div></div>';
        if (typeof TODAY !== 'undefined') TODAY.render();
        return;
      }
      const users = Array.isArray(res.users) ? res.users : [];
      box.innerHTML =
        '<p class="t-foot mb3">' + plural(res.count, 'trial') + ' ending within ' + hours + ' hours. Reminders go out two hours before, once push notifications are set up.</p>' +
        '<div class="rows">' + users.map(u => {
          const exp = u.trialExpiresAt ? new Date(u.trialExpiresAt).getTime() : 0;
          const mins = exp ? Math.max(0, Math.round((exp - Date.now()) / 60000)) : 0;
          const left = !exp ? '—' : mins < 60 ? mins + ' min left' : Math.round(mins / 60) + ' h left';
          return '<div class="row">' +
            '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
            '<div class="row-main"><div class="row-title">' + esc(u.name || u.username) + '</div>' +
            '<div class="row-sub mono">' + esc(u.username) + (u.email ? ' · ' + esc(u.email) : '') + '</div></div>' +
            '<span class="badge st-trial">' + esc(left) + '</span>' +
            '<button class="icon-btn sm" data-on-click="USERS.view(\'' + escAttrJs(u.username) + '\')" aria-label="Open ' + esc(u.username) + '"><i class="ph ph-arrow-right"></i></button>' +
          '</div>';
        }).join('') + '</div>';
      if (typeof TODAY !== 'undefined') TODAY.render();
    } catch(e){
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' + esc(e.message) +
        ' <button class="btn btn-sm btn-quiet" style="margin-left:.5rem" data-on-click="EXPIRING.load()">Try again</button></span></div>';
    }
  }
};

window.EXPIRING = EXPIRING;
// js/admin/features/logs.js — the Activity log + shared pager and table sort.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, relTime, fullTime, plural).
// paintSort and PAGINATION are used by USERS and PAYMENTS from other files.

const LOGS = {
  _t: null,
  debounced(){ clearTimeout(this._t); this._t = setTimeout(() => this.filter(), 250); },
  filter(){
    const search = $('l-search'), filt = $('l-filter');
    const q = (search && search.value || '').toLowerCase();
    const f = (filt && filt.value) || 'all';
    ADMIN.state.lPage = 1;
    this.renderPage(this._rows(q, f));
  },
  _rows(q, f){
    const search = $('l-search'), filt = $('l-filter');
    q = q != null ? q : (search && search.value || '').toLowerCase();
    f = f != null ? f : ((filt && filt.value) || 'all');
    return (ADMIN.data.logs || []).filter(l => {
      if (!l) return false;
      const match = !q ||
        (l.admin || '').toLowerCase().includes(q) ||
        (l.target || '').toLowerCase().includes(q) ||
        (l.action || '').toLowerCase().includes(q);
      return match && (f === 'all' || (l.action || '').toLowerCase().includes(f));
    });
  },
  render(){ this.renderPage(this._rows()); },
  renderPage(rows){
    const per = ADMIN.state.lPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.lPage > total) ADMIN.state.lPage = total;
    const page = rows.slice((ADMIN.state.lPage - 1) * per, ADMIN.state.lPage * per);
    const el = $('logs-list');
    if (!el) return;
    if (!page.length) {
      el.innerHTML = '<div class="empty"><i class="ph ph-clock-counter-clockwise"></i><div class="t">Nothing here</div>' +
        '<div class="d">' + ((ADMIN.data.logs || []).length ? 'No activity matches this search.' : 'Actions taken in this console will show up here.') + '</div></div>';
      const pg = $('l-pg'); if (pg) pg.innerHTML = '';
      return;
    }
    el.innerHTML = page.map(l =>
      '<div class="log"><time datetime="' + esc(l.timestamp) + '" title="' + esc(fullTime(l.timestamp)) + '">' + esc(relTime(l.timestamp)) + '</time>' +
      '<div class="grow"><div><span class="act">' + esc(l.action || 'Action') + '</span> <span class="who">by ' + esc(l.admin || 'unknown') + '</span>' +
      (l.target ? ' <span class="mono dim">' + esc(l.target) + '</span>' : '') + '</div>' +
      (l.details ? '<div class="det">' + esc(l.details) + '</div>' : '') + '</div></div>'
    ).join('');
    PAGINATION.render('l-pg', ADMIN.state.lPage, total, 'LOGS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.lPage = p; this.renderPage(this._rows()); UI.scrollTop(); }
};

const PAGINATION = {
  render(containerId, current, total, cb, count){
    const el = $(containerId);
    if (!el) return;
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = '<button ' + (current === 1 ? 'disabled' : '') + ' data-on-click="' + cb + '(' + (current - 1) + ')" aria-label="Previous page"><i class="ph ph-caret-left"></i></button>';
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) {
        html += '<button class="' + (i === current ? 'active' : '') + '"' + (i === current ? ' aria-current="page"' : '') + ' data-on-click="' + cb + '(' + i + ')">' + i + '</button>';
      } else if (i === current - 2 || i === current + 2) html += '<span class="gap">…</span>';
    }
    html += '<button ' + (current === total ? 'disabled' : '') + ' data-on-click="' + cb + '(' + (current + 1) + ')" aria-label="Next page"><i class="ph ph-caret-right"></i></button>';
    html += '<span class="info">' + (count != null ? plural(count, 'result') : 'Page ' + current + ' of ' + total) + '</span>';
    el.innerHTML = html;
  }
};

function paintSort(tableId, key, dir){
  $$('#' + tableId + ' th.sortable').forEach(th => {
    const on = th.dataset.k === key;
    th.classList.toggle('sorted', on);
    th.setAttribute('aria-sort', on ? (dir === 1 ? 'ascending' : 'descending') : 'none');
    const ic = th.querySelector('.sort-ic');
    if (ic) ic.className = 'ph sort-ic ' + (on && dir === -1 ? 'ph-caret-down' : 'ph-caret-up');
  });
}

window.LOGS       = LOGS;
window.PAGINATION = PAGINATION;
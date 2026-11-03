// js/admin/features/users.js — the student table + edit / view / bulk actions.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, escAttrJs, badge, initials,
// relTime, fullTime, plural, statusLabel, copyText, MODAL, CONFIRM, BUSY,
// TOAST, FSTATE).
// MUST load AFTER: features/logs.js (paintSort, PAGINATION).

const USERS = {
  selected: new Set(), _lastIdx: null, _rows: [], _t: null,
  _sortKey: 'createdAt', _sortDir: -1,

  debouncedFilter(){ clearTimeout(this._t); this._t = setTimeout(() => this.filter(), 250); },

  filterBy(status){
    const sel = $('u-filter');
    if (sel) sel.value = status;
    FSTATE.set('u-filter', status);
    /* Reset pagination — otherwise a metric click from page 3 leaves the
       student staring at an empty list. */
    ADMIN.state.uPage = 1;
    UI.nav('users');
    this.filter();
  },

  sort(key){
    if (this._sortKey === key) this._sortDir *= -1;
    else { this._sortKey = key; this._sortDir = key === 'createdAt' ? -1 : 1; }
    this.filter();
  },

  _visibleRows(){
    const searchEl = $('u-search');
    const filterEl = $('u-filter');
    const q = (searchEl && searchEl.value || '').toLowerCase();
    const f = (filterEl && filterEl.value) || 'all';
    const rows = (ADMIN.data.users || []).filter(u => {
      if (!u || !u.username) return false;
      const match = !q || (u.username || '').toLowerCase().includes(q) ||
                          (u.name || '').toLowerCase().includes(q) ||
                          (u.email || '').toLowerCase().includes(q) ||
                          String(u.mobile || '').includes(q);
      return match && (f === 'all' || u.status === f);
    });
    const k = this._sortKey, d = this._sortDir;
    return rows.sort((a, b) => {
      let av = a[k], bv = b[k];
      if (k === 'name') { av = a.name || a.username; bv = b.name || b.username; }
      if (k === 'createdAt') {
        av = new Date(av || 0).getTime();
        bv = new Date(bv || 0).getTime();
        return (av - bv) * d;
      }
      return String(av || '').localeCompare(String(bv || '')) * d;
    });
  },

  filter(){
    this.selected.clear();
    const all = $('u-chk-all'); if (all) { all.checked = false; all.indeterminate = false; }
    const filterEl = $('u-filter'), searchEl = $('u-search');
    FSTATE.set('u-filter', (filterEl && filterEl.value) || 'all');
    FSTATE.set('u-search', (searchEl && searchEl.value) || '');
    this._lastIdx = null;
    ADMIN.state.uPage = 1;
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  clearFilters(){
    const searchEl = $('u-search'), filterEl = $('u-filter');
    if (searchEl) searchEl.value = '';
    if (filterEl) filterEl.value = 'all';
    FSTATE.set('u-search', '');
    FSTATE.set('u-filter', 'all');
    this.filter();
  },
  render(){
    const filterEl = $('u-filter'), searchEl = $('u-search');
    if (filterEl) filterEl.value = FSTATE.get('u-filter', 'all');
    if (searchEl) searchEl.value = FSTATE.get('u-search', '');
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },

  renderPage(rows){
    paintSort('users-tbl', this._sortKey, this._sortDir);
    const trunc = $('u-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.usersTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + ADMIN.data.users.length + ' of ' + ADMIN.data.usersTotalCount + ' students. Narrow the search to see the rest.</span></div>' : '';
    const count = $('u-result-count');
    if (count) count.textContent = rows.length === (ADMIN.data.users || []).length ? plural(rows.length, 'student') : plural(rows.length, 'match', 'matches');

    const per = ADMIN.state.uPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.uPage > total) ADMIN.state.uPage = total;
    const page = rows.slice((ADMIN.state.uPage - 1) * per, ADMIN.state.uPage * per);
    const tb = $('users-body');
    if (!tb) return;

    if (!page.length) {
      tb.innerHTML = '<tr><td colspan="7">' + ((ADMIN.data.users || []).length
        ? '<div class="empty"><i class="ph ph-magnifying-glass"></i><div class="t">No students match</div><div class="d">Try a shorter search, or reset the status filter.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="USERS.clearFilters()">Reset filters</button></div></div>'
        : '<div class="empty"><i class="ph ph-users-three"></i><div class="t">No students yet</div><div class="d">Accounts appear here as soon as someone signs up in the app.</div></div>')
        + '</td></tr>';
      const pg = $('u-pg'); if (pg) pg.innerHTML = '';
      return;
    }

    const canManage = ADMIN.can('users_manage');
    tb.innerHTML = page.map(u => {
      const st = u.status || 'trial';
      const un = escAttrJs(u.username);
      return '<tr class="' + (this.selected.has(u.username) ? 'selected' : '') + '">' +
        '<td class="td-check"><input type="checkbox"' + (this.selected.has(u.username) ? ' checked' : '') +
          ' data-on-click="USERS.toggle(\'' + un + '\', event)" aria-label="Select ' + esc(u.username) + '"></td>' +
        '<td class="td-user"><button class="cell-user" data-on-click="USERS.view(\'' + un + '\')" style="text-align:left">' +
          '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
          '<span style="min-width:0"><span class="nm truncate" style="display:block">' + esc(u.name || u.username) + '</span>' +
          '<span class="un truncate" style="display:block">' + esc(u.username) + '</span></span></button></td>' +
        '<td data-label="Contact"><div class="t-foot" style="color:var(--ink)">' + (esc(u.email) || '—') + '</div>' +
          '<div class="t-cap">' + (esc(u.mobile) || '—') + '</div></td>' +
        '<td data-label="Status">' + badge(st) + '</td>' +
        '<td data-label="Joined"><span title="' + esc(fullTime(u.createdAt)) + '">' + relTime(u.createdAt) + '</span></td>' +
        '<td data-label="Access" class="t-foot">' + esc(this.accessLabel(u)) + '</td>' +
        '<td class="td-actions"><div class="row-actions">' +
          '<button class="icon-btn sm" data-on-click="USERS.view(\'' + un + '\')" aria-label="Open ' + esc(u.username) + '" title="Open"><i class="ph ph-arrow-right"></i></button>' +
          (canManage ? '<button class="icon-btn sm" data-on-click="USERS.edit(\'' + un + '\')" aria-label="Edit ' + esc(u.username) + '" title="Edit"><i class="ph ph-pencil-simple"></i></button>' : '') +
          (canManage ? '<button class="icon-btn sm danger" data-on-click="USERS.del(\'' + un + '\')" aria-label="Delete ' + esc(u.username) + '" title="Delete"><i class="ph ph-trash"></i></button>' : '') +
        '</div></td></tr>';
    }).join('');
    PAGINATION.render('u-pg', ADMIN.state.uPage, total, 'USERS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.uPage = p; this.renderPage(this._rows); UI.scrollTop(); },

  /* The bug: the old version short-circuited on `!permanentAccess` before
     checking `accessType === 'yearly'`, so an active yearly user showed
     "None". Order matters — check accessType first, then permanentAccess,
     then status. */
  accessLabel(u){
    if (!u) return 'None';
    if (u.accessType === 'yearly') {
      if (!u.accessExpiresAt) return 'One year';
      const exp = new Date(u.accessExpiresAt).getTime();
      const when = new Date(u.accessExpiresAt).toLocaleDateString();
      return exp < Date.now() ? 'Until ' + when + ' (expired)' : 'Until ' + when;
    }
    if (u.permanentAccess) return 'Permanent';
    if (u.status === 'trial') return 'Free trial';
    if (u.status === 'active') return 'Active';
    if (u.status === 'payment_pending') return 'Awaiting payment';
    return 'None';
  },

  toggle(username, event){
    if (event && event.shiftKey && this._lastIdx !== null) {
      const idx = this._rows.findIndex(r => r.username === username);
      if (idx !== -1) {
        const [lo, hi] = [Math.min(idx, this._lastIdx), Math.max(idx, this._lastIdx)];
        const adding = !this.selected.has(username);
        for (let i = lo; i <= hi; i++) adding ? this.selected.add(this._rows[i].username) : this.selected.delete(this._rows[i].username);
      }
    } else {
      if (this.selected.has(username)) this.selected.delete(username);
      else this.selected.add(username);
    }
    this._lastIdx = this._rows.findIndex(r => r.username === username);
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  toggleAll(){
    const cb = $('u-chk-all');
    const on = cb && cb.checked;
    this._rows.forEach(u => on ? this.selected.add(u.username) : this.selected.delete(u.username));
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  updateBulkBar(){
    const n = this.selected.size;
    const cnt = $('u-bulk-count'); if (cnt) cnt.textContent = plural(n, 'student') + ' selected';
    const bar = $('u-bulk'); if (bar) bar.classList.toggle('show', n > 0);
    const all = $('u-chk-all');
    if (all) { all.checked = n > 0 && n === this._rows.length; all.indeterminate = n > 0 && n < this._rows.length; }
  },
  clearSelection(){
    this.selected.clear();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },

  async bulkGrantAccess(duration){
    if (!this.selected.size) return;
    const ok = await CONFIRM.ask({
      title:'Grant access',
      body:'Give <b>' + (duration === 'year' ? 'one year' : 'permanent') + '</b> access to <b>' + plural(this.selected.size, 'student') + '</b>?',
      confirmText:'Grant access'
    });
    if (!ok) return;
    const usernames = [...this.selected];
    BUSY.start();
    try {
      const res = await ADMIN.post('adminGrantAccessBatch', { usernames: JSON.stringify(usernames), duration });
      if (!res.success) throw new Error(res.error || 'That did not work.');
      const results = Array.isArray(res.results) ? res.results : [];
      const good = results.filter(r => r && r.success).length;
      const bad  = results.length - good;
      TOAST.show(good + ' granted' + (bad ? ', ' + bad + ' failed' : ''), bad ? 'warning' : 'success');
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
    this.selected.clear();
    ADMIN.refresh(['stats','users']);
  },
  async bulkDelete(){
    if (!this.selected.size) return;
    const ok = await CONFIRM.ask({
      title:'Delete students',
      body:'Permanently delete <b>' + plural(this.selected.size, 'account') + '</b>. This removes their progress, payments, weekly attempts, written submissions and backups. There is no undo.',
      confirmText:'Delete ' + this.selected.size, tone:'danger', requireType:'DELETE'
    });
    if (!ok) return;
    const usernames = [...this.selected];
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteUsersBatch', { usernames: JSON.stringify(usernames) });
      if (!res.success) throw new Error(res.error || 'That did not work.');
      const results = Array.isArray(res.results) ? res.results : [];
      const good = results.filter(r => r && r.success).length;
      const bad  = results.length - good;
      TOAST.show(plural(good, 'account') + ' deleted' + (bad ? ', ' + bad + ' failed' : ''), bad ? 'warning' : 'success');
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
    this.selected.clear();
    ADMIN.refresh(['stats','users','payments']);
  },

  view(username){
    const u = (ADMIN.data.users || []).find(x => x.username === username);
    if (!u) return;
    const bd = $('bd-user'), tt = $('tt-user');
    if (!bd || !tt) return;
    const un = escAttrJs(u.username);
    const pay = (ADMIN.data.payments || []).find(p => p.username === username);
    const canManage = ADMIN.can('users_manage');
    const isAdmin = (ADMIN.data.admins || []).some(a => a.username.toLowerCase() === username.toLowerCase());

    tt.textContent = u.name || u.username;
    bd.innerHTML =
      '<div class="flex center g3 mb4">' +
        '<span class="avatar lg">' + esc(initials(u.name || u.username)) + '</span>' +
        '<div><div class="t-t3">' + esc(u.name || u.username) + '</div>' +
        '<div class="t-cap mono">' + esc(u.username) +
        '<button class="copy-btn" data-on-click="copyText(\'' + un + '\',\'Username copied\')" aria-label="Copy username"><i class="ph ph-copy"></i></button></div></div>' +
        '<span style="margin-left:auto">' + badge(u.status || 'trial') + '</span>' +
      '</div>' +
      (isAdmin ? '<div class="banner banner-info"><i class="ph ph-shield-check"></i><span>This person is also an admin.</span></div>' : '') +
      '<dl class="dl mb4">' +
        '<div><dt>Email</dt><dd>' + (esc(u.email) || '—') + '</dd></div>' +
        '<div><dt>Mobile</dt><dd>' + (esc(u.mobile) || '—') + '</dd></div>' +
        '<div><dt>Access</dt><dd>' + esc(this.accessLabel(u)) + '</dd></div>' +
        '<div><dt>Email confirmed</dt><dd>' + (u.emailVerified ? 'Yes' : 'Not yet') + '</dd></div>' +
        '<div><dt>Joined</dt><dd>' + esc(fullTime(u.createdAt)) + '</dd></div>' +
        '<div><dt>Trial ends</dt><dd>' + esc(fullTime(u.trialExpiresAt)) + '</dd></div>' +
      '</dl>' +
      (pay
        ? '<h4 class="t-cap mb2">Payment</h4><div class="panel" style="margin:0 0 var(--sp-4);background:var(--bg-grouped);border:none">' +
          '<dl class="dl"><div><dt>Transaction ID</dt><dd class="mono">' + esc(pay.txId || '') + '</dd></div>' +
          '<div><dt>Status</dt><dd>' + badge(pay.status) + '</dd></div>' +
          (pay.remarks ? '<div><dt>Remarks</dt><dd>' + esc(pay.remarks) + '</dd></div>' : '') + '</dl>' +
          (pay.screenshotUrl && pay.screenshotUrl.startsWith('http')
            ? '<button class="btn btn-secondary btn-sm mt3" data-on-click="ADMIN.downloadScreenshot(\'' + escAttrJs(pay.screenshotUrl) + '\',\'' + un + '_payment.png\')"><i class="ph ph-download-simple"></i> Download screenshot</button>' : '') +
          '</div>'
        : '<p class="t-foot mb4">No payment on record.</p>') +
      (canManage
        ? '<h4 class="t-cap mb2">Grant access</h4><div class="flex g2 mb4 wrap">' +
          '<button class="btn btn-primary grow" data-on-click="USERS.grantAccess(\'' + un + '\',\'permanent\')"><i class="ph ph-infinity"></i> Permanent</button>' +
          '<button class="btn btn-secondary grow" data-on-click="USERS.grantAccess(\'' + un + '\',\'year\')"><i class="ph ph-calendar"></i> One year</button></div>'
        : '') +
      '<div class="flex g2 wrap">' +
        (canManage ? '<button class="btn btn-secondary" data-on-click="USERS.edit(\'' + un + '\')"><i class="ph ph-pencil-simple"></i> Edit details</button>' : '') +
        (canManage ? '<button class="btn btn-danger" data-on-click="USERS.del(\'' + un + '\')"><i class="ph ph-trash"></i> Delete student</button>' : '') +
        '<button class="btn btn-quiet" style="margin-left:auto" data-on-click="MODAL.close(\'user\')">Close</button>' +
      '</div>';
    MODAL.open('user');
  },

  edit(username){
    const u = (ADMIN.data.users || []).find(x => x.username === username);
    if (!u) return;
    const bd = $('bd-user'), tt = $('tt-user');
    if (!bd || !tt) return;
    const un = escAttrJs(username);
    tt.textContent = 'Edit ' + username;
    bd.innerHTML =
      '<div class="field-row">' +
        '<div class="field"><label for="edit-name">Full name</label><input class="input" type="text" id="edit-name" value="' + esc(u.name || '') + '"></div>' +
        '<div class="field"><label for="edit-mobile">Mobile</label><input class="input" type="tel" inputmode="tel" id="edit-mobile" value="' + esc(u.mobile || '') + '" placeholder="98XXXXXXXX"></div>' +
      '</div>' +
      '<div class="field"><label for="edit-email">Email</label><input class="input" type="email" inputmode="email" id="edit-email" value="' + esc(u.email || '') + '" placeholder="student@example.com"></div>' +
      '<div class="field"><label for="edit-status">Status</label><select class="select" id="edit-status">' +
        ['trial','active','expired','payment_pending','rejected'].map(s =>
          '<option value="' + s + '"' + (u.status === s ? ' selected' : '') + '>' + statusLabel(s) + '</option>').join('') +
      '</select></div>' +
      '<label class="perm-row mb4" style="min-height:36px"><input type="checkbox" id="edit-permanent"' + (u.permanentAccess ? ' checked' : '') + '><span>Permanent access</span></label>' +
      '<div class="field"><label for="edit-password">Reset password</label>' +
        '<input class="input" type="text" id="edit-password" placeholder="Leave blank to keep the current one" autocomplete="off">' +
        '<span class="field-hint">Share the new password with them yourself — they are not notified.</span></div>' +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="USERS.view(\'' + un + '\')">Cancel</button>' +
      '<button class="btn btn-primary" style="flex:1" id="edit-save" data-on-click="USERS.saveEdit(\'' + un + '\')">Save changes</button></div>';
    MODAL.open('user');
  },

  async saveEdit(username){
    const btn = $('edit-save');
    if (btn) btn.classList.add('loading');
    /* Omit the password field entirely when blank — sending `''` invites the
       backend to hash empty and lock the student out. */
    const pw = (($('edit-password') || {}).value || '');
    const payload = {
      username,
      name: (($('edit-name') || {}).value || '').trim(),
      email: (($('edit-email') || {}).value || '').trim(),
      mobile: (($('edit-mobile') || {}).value || '').trim(),
      status: (($('edit-status') || {}).value) || 'trial',
      permanentAccess: !!($('edit-permanent') && $('edit-permanent').checked)
    };
    if (pw) payload.password = pw;
    try {
      const res = await ADMIN.post('adminUpdateUser', payload);
      if (!res.success) throw new Error(res.error);
      TOAST.show('Changes saved', 'success');
      MODAL.close('user');
      ADMIN.refresh(['stats','users']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    if (btn) btn.classList.remove('loading');
  },

  async grantAccess(username, duration){
    const ok = await CONFIRM.ask({
      title:'Grant access',
      body:'Give <b>' + (duration === 'year' ? 'one year' : 'permanent') + '</b> access to <b>' + esc(username) + '</b>?',
      confirmText:'Grant access'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminGrantAccess', { username, duration });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Access granted to ' + username, 'success');
      MODAL.close('user');
      ADMIN.refresh(['stats','users']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  async del(username){
    const ok = await CONFIRM.ask({
      title:'Delete student',
      body:'Delete <b>' + esc(username) + '</b> and everything attached to the account — progress, payment record, weekly attempts and written submissions. There is no undo.',
      confirmText:'Delete student', tone:'danger', requireType:'DELETE'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteUser', { username });
      if (!res.success) throw new Error(res.error);
      TOAST.show(username + ' deleted', 'success');
      MODAL.close('user');
      ADMIN.refresh(['stats','users','payments']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

window.USERS = USERS;
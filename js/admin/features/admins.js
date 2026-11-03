// js/admin/features/admins.js — admin list, promote, permissions editor.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, escAttrJs, badge, initials,
// relTime, plural, MODAL, CONFIRM, BUSY, TOAST), core/admin-nav.js (ADMIN_NAV).

const ADMINS = {
  _list: [], _isOwner: false, _labels: {}, _selected: null,

  GROUPS: [
    { name:'Overview',  keys:['dashboard'] },
    { name:'Students',  keys:['users_view','users_manage','users_bulk'] },
    { name:'Payments',  keys:['payments_view','payments_review','payments_bulk','screenshots'] },
    { name:'Weekly sets', keys:['weeklysets_view','weeklysets_manage'] },
    { name:'Study PDFs', keys:['studydocs_view','studydocs_manage'] },
    { name:'Reports',   keys:['qreports_view','qreports_manage'] },
    { name:'Grading',   keys:['subjective_view','subjective_grade','subjective_import'] },
    { name:'Activity & settings', keys:['logs_view','settings_view','settings_manage'] },
    { name:'Admins',    keys:['admins_view'] },
    { name:'Data',      keys:['maintenance','exports','imports'] }
  ],

  render(admins, isOwner, labels){
    this._list = admins || [];
    this._isOwner = !!isOwner;
    this._labels = labels || this._labels || {};
    const box = $('admins-list');
    if (!box) return;
    const addBtn = $('btn-add-admin');
    if (addBtn) addBtn.hidden = !this._isOwner;

    if (!this._list.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-shield-check"></i><div class="t">No admin accounts yet</div>' +
        '<div class="d">Add one so you are not the only person who can verify payments.</div>' +
        (this._isOwner ? '<div class="a"><button class="btn btn-primary" data-on-click="ADMINS.openPromote()">Add admin</button></div>' : '') + '</div>';
      return;
    }

    const me = (ADMIN.creds?.user || '').toLowerCase();
    box.innerHTML = '<div class="rows">' + this._list.map(a => {
      const isMe = a.username.toLowerCase() === me;
      const isOwnerRow = a.role === 'owner';
      const perms = a.permissions || [];
      const dual = (ADMIN.data.users || []).some(u => u.username.toLowerCase() === a.username.toLowerCase());
      const pills = (!isOwnerRow && perms.length)
        ? perms.slice(0, 3).map(k => '<span class="perm-pill">' + esc(this._labels[k] || k) + '</span>').join('') +
          (perms.length > 3 ? '<span class="perm-pill more">+' + (perms.length - 3) + '</span>' : '')
        : '';
      return '<div class="row" style="align-items:flex-start;flex-wrap:wrap">' +
        '<span class="avatar" style="margin-top:2px">' + esc(initials(a.username)) + '</span>' +
        '<div class="row-main">' +
          '<div class="row-title">' + esc(a.username) +
            (isMe ? '<span class="t-cap">you</span>' : '') +
            (isOwnerRow ? badge('active','Owner') : badge('trial','Admin')) +
            (dual ? '<span class="badge flat" title="Also studies on this account">Also a student</span>' : '') +
          '</div>' +
          '<div class="row-sub">' + (a.createdBy ? 'Added by ' + esc(a.createdBy) : 'Added ' + relTime(a.createdAt)) +
            (isOwnerRow ? ' · full access' : '') + '</div>' +
          (pills ? '<div class="flex wrap g1 mt2">' + pills + '</div>' : '') +
          '<div class="admin-perms" id="perms-' + escAttrJs(a.username) + '">' + this._permEditor(a.username, perms, isOwnerRow) + '</div>' +
        '</div>' +
        '<div class="flex g2" style="flex-shrink:0">' +
          ((!isMe && this._isOwner) ? '<button class="btn btn-quiet btn-sm" data-on-click="ADMINS.togglePerms(\'' + escAttrJs(a.username) + '\')"><i class="ph ph-sliders-horizontal"></i> Access</button>' : '') +
          ((!isMe && this._isOwner && !isOwnerRow) ? '<button class="icon-btn sm danger" data-on-click="ADMINS.demote(\'' + escAttrJs(a.username) + '\')" aria-label="Remove admin role from ' + esc(a.username) + '"><i class="ph ph-user-minus"></i></button>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  },

  _permEditor(username, granted, isOwnerRow){
    if (isOwnerRow) return '<p class="t-foot">The owner always has full access.</p>';
    const has = new Set(granted);
    return '<div class="perm-grid">' + this.GROUPS.map(g => {
      const keys = g.keys.filter(k => this._labels[k]);
      if (!keys.length) return '';
      return '<div><div class="perm-group-t">' + esc(g.name) + '</div>' +
        keys.map(k => '<label class="perm-row"><input type="checkbox" data-admin="' + escAttrJs(username) + '" data-feat="' + escAttrJs(k) + '"' + (has.has(k) ? ' checked' : '') + '><span>' + esc(this._labels[k]) + '</span></label>').join('') +
      '</div>';
    }).join('') + '</div>' +
    '<div class="flex g2 mt4"><button class="btn btn-primary btn-sm" data-on-click="ADMINS.savePerms(\'' + escAttrJs(username) + '\')">Save access</button>' +
    '<button class="btn btn-quiet btn-sm" data-on-click="ADMINS.togglePerms(\'' + escAttrJs(username) + '\')">Cancel</button></div>';
  },

  togglePerms(username){
    const el = $('perms-' + username);
    if (el) el.classList.toggle('show');
  },

  async savePerms(username){
    const features = {};
    document.querySelectorAll('input[data-admin="' + CSS.escape(username) + '"][data-feat]').forEach(cb => { features[cb.dataset.feat] = cb.checked; });
    BUSY.start();
    try {
      const r = await ADMIN.post('adminSetAdminPermissions', { username, features: JSON.stringify(features) });
      if (!r.success) throw new Error(r.error || 'Could not save.');
      TOAST.show('Access updated for ' + username, 'success');
      ADMIN.refresh(['admins']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  },

  openPromote(){
    this._selected = null;
    this._modeVal = 'existing';
    const starter = ['dashboard','users_view','payments_view','subjective_view','weeklysets_view','studydocs_view','qreports_view','logs_view'];
    MODAL.sheet('Add an admin',
      '<div class="segmented mb4" role="tablist">' +
        '<button class="active" id="ap-tab-existing" data-on-click="ADMINS._mode(\'existing\')">Existing student</button>' +
        '<button id="ap-tab-new" data-on-click="ADMINS._mode(\'new\')">New account</button>' +
      '</div>' +
      '<div id="ap-existing">' +
        '<p class="t-callout mb4">They keep their password and their study access — you are only adding an admin role.</p>' +
        '<div class="field picker">' +
          '<label for="promote-search">Find a student</label>' +
          '<input class="input" type="text" id="promote-search" placeholder="Search by name, username or email" autocomplete="off" data-on-input="ADMINS._searchPromote(this.value)" data-on-focus="ADMINS._searchPromote(this.value)">' +
          '<div class="picker-list" id="promote-results"></div>' +
        '</div>' +
        '<div id="promote-selected" hidden></div>' +
      '</div>' +
      '<div id="ap-new" hidden>' +
        '<p class="t-callout mb4">Use this only for someone who does not study on Abhyas. They will have no student account to fall back on.</p>' +
        '<div class="field"><label for="ca-user">Username</label><input class="input" type="text" id="ca-user" placeholder="letters, numbers, . _ -" autocapitalize="none"></div>' +
        '<div class="field"><label for="ca-pass">Temporary password</label><input class="input" type="text" id="ca-pass" placeholder="At least 6 characters"></div>' +
      '</div>' +
      '<div class="field mt4"><span class="field-label">What they can do</span>' +
        '<span class="field-hint">You can change this at any time.</span>' +
        '<div class="perm-grid mt2" id="promote-perms">' + (this.GROUPS.map(g => {
          const keys = g.keys.filter(k => this._labels[k]);
          if (!keys.length) return '';
          return '<div><div class="perm-group-t">' + esc(g.name) + '</div>' +
            keys.map(k => '<label class="perm-row"><input type="checkbox" data-feat="' + escAttrJs(k) + '"' + (starter.includes(k) ? ' checked' : '') + '><span>' + esc(this._labels[k] || k) + '</span></label>').join('') +
          '</div>';
        }).join('') || '<p class="t-foot">Permissions load with the admin list — refresh and try again.</p>') + '</div>' +
      '</div>' +
      '<div class="flex g2 mt4"><button class="btn btn-primary btn-block" id="ap-submit" data-on-click="ADMINS.submit()">Add admin</button></div>'
    );
  },
  _mode(m){
    const existing = m === 'existing';
    $('ap-existing').hidden = !existing;
    $('ap-new').hidden = existing;
    $('ap-tab-existing').classList.toggle('active', existing);
    $('ap-tab-new').classList.toggle('active', !existing);
    $('ap-submit').textContent = existing ? 'Add admin' : 'Create admin account';
    this._modeVal = m;
  },

  _searchPromote(q){
    const list = $('promote-results');
    if (!list) return;
    const term = String(q || '').trim().toLowerCase();
    const taken = new Set((this._list || []).map(a => a.username.toLowerCase()));
    const matches = (ADMIN.data.users || []).filter(u => {
      if (taken.has(u.username.toLowerCase())) return false;
      if (!term) return true;
      return (u.username || '').toLowerCase().includes(term) ||
             (u.name || '').toLowerCase().includes(term) ||
             (u.email || '').toLowerCase().includes(term);
    }).slice(0, 12);

    if (!matches.length) {
      list.innerHTML = '<div class="picker-empty">' + (term ? 'No student matches that.' : 'Start typing a name, username or email.') + '</div>';
      list.classList.add('show');
      return;
    }
    list.innerHTML = matches.map(u =>
      '<button class="picker-item" data-on-click="ADMINS._selectPromote(\'' + escAttrJs(u.username) + '\')">' +
        '<span class="flex center g2" style="min-width:0">' +
          '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
          '<span style="min-width:0"><span class="nm truncate" style="display:block">' + esc(u.name || u.username) + '</span>' +
          '<span class="un truncate" style="display:block">' + esc(u.username) + (u.email ? ' · ' + esc(u.email) : '') + '</span></span>' +
        '</span>' + badge(u.status || 'trial') +
        (u.emailVerified ? '' : '<span class="badge badge-warning flat" title="They must confirm their email before they can be made an admin">unconfirmed email</span>') +
      '</button>').join('');
    list.classList.add('show');
  },

  _selectPromote(username){
    const u = (ADMIN.data.users || []).find(x => x.username === username);
    if (!u) return;
    this._selected = username;
    $('promote-results').classList.remove('show');
    $('promote-search').value = '';
    const sel = $('promote-selected');
    sel.hidden = false;
    sel.innerHTML = '<div class="row" style="border-top:none;background:var(--accent-soft);border-radius:var(--r-card);padding:var(--sp-3)">' +
      '<span class="avatar">' + esc(initials(u.name || u.username)) + '</span>' +
      '<div class="row-main"><div class="row-title">' + esc(u.name || u.username) + '</div>' +
      '<div class="row-sub mono">' + esc(u.username) + '</div></div>' +
      '<button class="btn btn-quiet btn-sm" data-on-click="ADMINS._clearPromote()">Change</button></div>';
  },
  _clearPromote(){
    this._selected = null;
    const sel = $('promote-selected');
    if (sel) { sel.hidden = true; sel.innerHTML = ''; }
    setTimeout(() => $('promote-search')?.focus(), 30);
  },

  async submit(){
    const btn = $('ap-submit');
    const features = {};
    document.querySelectorAll('#promote-perms input[data-feat]').forEach(cb => { features[cb.dataset.feat] = cb.checked; });
    btn.classList.add('loading');
    try {
      if (this._modeVal === 'new') {
        const username = $('ca-user').value.trim();
        const password = $('ca-pass').value;
        if (!username || !password) throw new Error('Fill in both fields.');
        if (password.length < 6) throw new Error('Use at least 6 characters.');
        const r = await ADMIN.post('adminCreateAdmin', { username, password, permissions: JSON.stringify(features) });
        if (!r.success) throw new Error(r.error || 'Could not create that account.');
        TOAST.show(username + ' can now sign in as an admin', 'success');
      } else {
        if (!this._selected) throw new Error('Pick a student first.');
        const r = await ADMIN.post('adminPromoteUserToAdmin', { username: this._selected, permissions: JSON.stringify(features) });
        if (!r.success) throw new Error(r.error || 'Could not add that admin.');
        TOAST.show(this._selected + ' is now an admin', 'success');
      }
      MODAL.close('sheet');
      ADMIN.refresh(['admins']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    btn.classList.remove('loading');
  },

  async demote(username){
    const alsoUser = (ADMIN.data.users || []).some(u => u.username.toLowerCase() === username.toLowerCase());
    const ok = await CONFIRM.ask({
      title: 'Remove admin role',
      body: alsoUser
        ? '<b>' + esc(username) + '</b> keeps their student account and password. They only lose access to this console.'
        : '<b>' + esc(username) + '</b> has no student account. Removing the admin role locks them out completely.',
      confirmText: 'Remove role', tone: 'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeleteAdmin', { username });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Admin role removed', 'success');
      ADMIN.refresh(['admins']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

window.ADMINS = ADMINS;
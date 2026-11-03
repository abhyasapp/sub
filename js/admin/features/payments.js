// js/admin/features/payments.js — the payments queue + review sheet.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, escAttrJs, badge, initials,
// relTime, fullTime, plural, statusLabel, copyText, MODAL, CONFIRM, BUSY,
// TOAST, FSTATE). MODAL.openReview / MODAL.confirmReview are set at the
// bottom of this file — they are payment-specific extensions of the shared
// MODAL object from core.js.

const PAYMENTS = {
  selected: new Set(), _lastIdx: null, _rows: [], _t: null,
  _sortKey: 'submittedAt', _sortDir: -1,

  debouncedFilter(){ clearTimeout(this._t); this._t = setTimeout(() => this.filter(), 250); },
  filterBy(status){
    const sel = $('p-filter');
    if (sel) sel.value = status;
    FSTATE.set('p-filter', status);
    ADMIN.state.pPage = 1;
    UI.nav('payments');
    this.filter();
  },
  sort(key){
    if (this._sortKey === key) this._sortDir *= -1;
    else { this._sortKey = key; this._sortDir = key === 'submittedAt' ? -1 : 1; }
    this.filter();
  },

  _visibleRows(){
    const searchEl = $('p-search');
    const filterEl = $('p-filter');
    const q = (searchEl && searchEl.value || '').toLowerCase();
    const f = (filterEl && filterEl.value) || 'all';
    const rows = (ADMIN.data.payments || []).filter(p => {
      if (!p || !p.username) return false;
      const match = !q || (p.username || '').toLowerCase().includes(q) || (p.txId || '').toLowerCase().includes(q);
      return match && (f === 'all' || p.status === f);
    });
    const k = this._sortKey, d = this._sortDir;
    return rows.sort((a, b) => {
      if (k === 'submittedAt') return (new Date(a[k] || 0) - new Date(b[k] || 0)) * d;
      return String(a[k] || '').localeCompare(String(b[k] || '')) * d;
    });
  },

  filter(){
    this.selected.clear();
    const all = $('p-chk-all'); if (all) { all.checked = false; all.indeterminate = false; }
    const filterEl = $('p-filter'), searchEl = $('p-search');
    FSTATE.set('p-filter', (filterEl && filterEl.value) || 'all');
    FSTATE.set('p-search', (searchEl && searchEl.value) || '');
    this._lastIdx = null;
    ADMIN.state.pPage = 1;
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  clearFilters(){
    const s = $('p-search'), f = $('p-filter');
    if (s) s.value = '';
    if (f) f.value = 'all';
    FSTATE.set('p-search', '');
    FSTATE.set('p-filter', 'all');
    this.filter();
  },
  render(){
    const f = $('p-filter'), s = $('p-search');
    if (f) f.value = FSTATE.get('p-filter', 'all');
    if (s) s.value = FSTATE.get('p-search', '');
    this._rows = this._visibleRows();
    this.renderPage(this._rows);
    this.updateBulkBar();
  },

  renderPage(rows){
    paintSort('payments-tbl', this._sortKey, this._sortDir);
    const trunc = $('p-trunc');
    if (trunc) trunc.innerHTML = ADMIN.data.paymentsTruncated
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>Showing ' + ADMIN.data.payments.length + ' of ' + ADMIN.data.paymentsTotalCount + ' payments.</span></div>' : '';
    const count = $('p-result-count');
    if (count) count.textContent = rows.length === (ADMIN.data.payments || []).length ? plural(rows.length, 'payment') : plural(rows.length, 'match', 'matches');

    const per = ADMIN.state.pPerPage;
    const total = Math.ceil(rows.length / per) || 1;
    if (ADMIN.state.pPage > total) ADMIN.state.pPage = total;
    const page = rows.slice((ADMIN.state.pPage - 1) * per, ADMIN.state.pPage * per);
    const tb = $('payments-body');
    if (!tb) return;

    if (!page.length) {
      tb.innerHTML = '<tr><td colspan="7">' + ((ADMIN.data.payments || []).length
        ? '<div class="empty"><i class="ph ph-magnifying-glass"></i><div class="t">No payments match</div><div class="d">Try a different status, or search the transaction ID.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="PAYMENTS.clearFilters()">Reset filters</button></div></div>'
        : '<div class="empty"><i class="ph ph-credit-card"></i><div class="t">No payments yet</div><div class="d">Transfers submitted from the app land here for review.</div></div>')
        + '</td></tr>';
      const pg = $('p-pg'); if (pg) pg.innerHTML = '';
      return;
    }

    const canReview = ADMIN.can('payments_review');
    const amount = (ADMIN.data.settings && ADMIN.data.settings.paymentAmount) || '100';
    tb.innerHTML = page.map(p => {
      const un = escAttrJs(p.username);
      const dup = p.duplicateTxId
        ? ' <span class="badge badge-warning flat" title="Also submitted by ' + escAttrJs((p.duplicateTxIdUsers || []).join(', ')) + '"><i class="ph ph-warning"></i> seen before</span>' : '';
      return '<tr class="' + (this.selected.has(p.username) ? 'selected' : '') + '">' +
        '<td class="td-check"><input type="checkbox"' + (this.selected.has(p.username) ? ' checked' : '') +
          ' data-on-click="PAYMENTS.toggle(\'' + un + '\', event)" aria-label="Select payment from ' + esc(p.username) + '"></td>' +
        '<td class="td-user"><button class="cell-user" data-on-click="PAYMENTS.review(\'' + un + '\')" style="text-align:left">' +
          '<span class="avatar">' + esc(initials(p.name || p.username)) + '</span>' +
          '<span style="min-width:0"><span class="nm truncate" style="display:block">' + esc(p.name || p.username) + '</span>' +
          '<span class="un truncate" style="display:block">' + esc(p.username) + '</span></span></button></td>' +
        '<td data-label="Transaction" class="mono t-foot">' + esc(p.txId || '') + dup + '</td>' +
        '<td data-label="Amount" class="mono t-foot">Rs ' + esc(amount) + '</td>' +
        '<td data-label="Status">' + badge(p.status || 'pending') + '</td>' +
        '<td data-label="Submitted"><span title="' + esc(fullTime(p.submittedAt)) + '">' + relTime(p.submittedAt) + '</span></td>' +
        '<td class="td-actions"><div class="row-actions">' +
          (p.status === 'pending' && canReview
            ? '<button class="btn btn-primary btn-sm" data-on-click="PAYMENTS.review(\'' + un + '\')">Review</button>'
            : '<button class="icon-btn sm" data-on-click="PAYMENTS.review(\'' + un + '\')" aria-label="Open payment from ' + esc(p.username) + '" title="Open"><i class="ph ph-arrow-right"></i></button>') +
          (canReview ? '<button class="icon-btn sm danger" data-on-click="PAYMENTS.del(\'' + un + '\')" aria-label="Delete payment record" title="Delete record"><i class="ph ph-trash"></i></button>' : '') +
        '</div></td></tr>';
    }).join('');
    PAGINATION.render('p-pg', ADMIN.state.pPage, total, 'PAYMENTS.goPage', rows.length);
  },
  goPage(p){ ADMIN.state.pPage = p; this.renderPage(this._rows); UI.scrollTop(); },

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
    const cb = $('p-chk-all');
    const on = cb && cb.checked;
    this._rows.forEach(p => on ? this.selected.add(p.username) : this.selected.delete(p.username));
    this.renderPage(this._rows);
    this.updateBulkBar();
  },
  updateBulkBar(){
    const n = this.selected.size;
    const cnt = $('p-bulk-count'); if (cnt) cnt.textContent = plural(n, 'payment') + ' selected';
    const bar = $('p-bulk'); if (bar) bar.classList.toggle('show', n > 0);
    const all = $('p-chk-all');
    if (all) { all.checked = n > 0 && n === this._rows.length; all.indeterminate = n > 0 && n < this._rows.length; }
  },
  clearSelection(){ this.selected.clear(); this.renderPage(this._rows); this.updateBulkBar(); },

  async bulkVerify(){
    if (!this.selected.size) return;
    const ok = await CONFIRM.ask({
      title:'Verify payments',
      body:'Verify <b>' + plural(this.selected.size, 'payment') + '</b> and unlock permanent access for each student?',
      confirmText:'Verify all'
    });
    if (ok) this._bulkReview('verified');
  },

  /* Large batches require typing REJECT — a mis-click must not void fifty
     payments. Small batches keep the one-dialog flow. */
  async bulkReject(){
    if (!this.selected.size) return;
    const n = this.selected.size;
    const batchConfirm = n >= 10;
    MODAL.sheet('Reject ' + plural(n, 'payment'),
      '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' +
        'Rejecting ' + plural(n, 'payment') + ' does <b>not</b> delete the record — the students will see your reason and can re-submit.' +
      '</span></div>' +
      '<div class="field"><label for="bulk-reason">Why are these being rejected?</label>' +
      '<input class="input" type="text" id="bulk-reason" placeholder="Students see this message">' +
      (batchConfirm ? '<span class="field-hint">Type <b>REJECT</b> below to confirm a batch this large.</span>' : '') + '</div>' +
      (batchConfirm ? '<div class="field"><label for="bulk-typed">Type <b>REJECT</b></label>' +
        '<input class="input" type="text" id="bulk-typed" autocomplete="off"></div>' : '') +
      '<div class="flex g2 mt4"><button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
      '<button class="btn btn-danger" style="flex:1" id="bulk-reject-go" data-on-click="PAYMENTS._bulkRejectGo(' + (batchConfirm ? 'true' : 'false') + ')">Reject ' + n + '</button></div>',
      { wide:false });
  },
  _bulkRejectGo(requireType){
    const reason = (($('bulk-reason') || {}).value || '').trim();
    if (!reason) {
      TOAST.show('Give a reason — the students see it', 'error');
      if ($('bulk-reason')) $('bulk-reason').focus();
      return;
    }
    if (requireType) {
      const typed = (($('bulk-typed') || {}).value || '').trim().toUpperCase();
      if (typed !== 'REJECT') {
        TOAST.show('Type REJECT to confirm the batch', 'error');
        if ($('bulk-typed')) $('bulk-typed').focus();
        return;
      }
    }
    MODAL.close('sheet');
    this._bulkReview('rejected', reason);
  },

  async _bulkReview(status, reason){
    if (this._bulkBusy) return;
    this._bulkBusy = true;
    const usernames = [...this.selected];
    BUSY.start();
    try {
      const res = await ADMIN.post('adminReviewPaymentsBatch', {
        usernames: JSON.stringify(usernames),
        status,
        rejectionReason: reason || ''
      });
      if (!res.success) throw new Error(res.error || 'That did not work.');
      const results = Array.isArray(res.results) ? res.results : [];
      const good = results.filter(r => r && r.success).length;
      const bad  = results.length - good;
      if (bad > 0) {
        const failedNames = results.filter(r => r && !r.success).map(r => r.username || '').filter(Boolean);
        TOAST.show(
          good + ' ' + (status === 'verified' ? 'verified' : 'rejected') + ', ' + bad + ' failed' +
          (failedNames.length ? ': ' + failedNames.slice(0, 3).join(', ') + (failedNames.length > 3 ? '…' : '') : ''),
          'warning', 7000
        );
      } else {
        TOAST.show(good + ' ' + (status === 'verified' ? 'verified' : 'rejected'), 'success');
      }
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
    this.selected.clear();
    this._bulkBusy = false;
    ADMIN.refresh(['stats','payments','users']);
  },

  review(username){ MODAL.openReview(username); },

  async del(username){
    const ok = await CONFIRM.ask({
      title:'Delete payment record',
      body:'Delete the payment record for <b>' + esc(username) + '</b>? Their access is not changed.',
      confirmText:'Delete record', tone:'danger'
    });
    if (!ok) return;
    BUSY.start();
    try {
      const res = await ADMIN.post('adminDeletePayment', { username });
      if (!res.success) throw new Error(res.error);
      TOAST.show('Payment record deleted', 'success');
      ADMIN.refresh(['stats','payments']);
    } catch(e){ TOAST.show(e.message, 'error'); }
    BUSY.stop();
  }
};

MODAL.openReview = function(username){
  const p = (ADMIN.data.payments || []).find(x => x.username === username);
  if (!p) return;
  const un = escAttrJs(username);
  const settled = p.status !== 'pending';
  const canReview = ADMIN.can('payments_review');
  const amount = (ADMIN.data.settings && ADMIN.data.settings.paymentAmount) || '100';

  const tt = $('tt-review'), bd = $('bd-review');
  if (!tt || !bd) return;
  tt.textContent = settled ? 'Payment from ' + p.username : 'Review payment';
  bd.innerHTML =
    (p.duplicateTxId
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>This transaction ID was also submitted by <b>' +
        esc((p.duplicateTxIdUsers || []).join(', ')) + '</b>. Check the screenshot before verifying.</span></div>' : '') +
    '<div class="flex center g3 mb4"><span class="avatar lg">' + esc(initials(p.name || p.username)) + '</span>' +
      '<div><div class="t-t3">' + esc(p.name || p.username) + '</div><div class="t-cap mono">' + esc(p.username) + '</div></div>' +
      '<span style="margin-left:auto">' + badge(p.status || 'pending') + '</span></div>' +
    '<dl class="dl mb4">' +
      '<div><dt>Transaction ID</dt><dd class="mono">' + esc(p.txId || '') +
        '<button class="copy-btn" data-on-click="copyText(\'' + escAttrJs(p.txId || '') + '\',\'Transaction ID copied\')" aria-label="Copy transaction ID"><i class="ph ph-copy"></i></button></dd></div>' +
      '<div><dt>Amount</dt><dd class="mono">Rs ' + esc(amount) + '</dd></div>' +
      '<div><dt>Submitted</dt><dd>' + esc(fullTime(p.submittedAt)) + '</dd></div>' +
      '<div><dt>Remarks</dt><dd>' + (esc(p.remarks) || '—') + '</dd></div>' +
    '</dl>' +
    (p.screenshotUrl && p.screenshotUrl.startsWith('http')
      ? '<h4 class="t-cap mb2">Screenshot</h4>' +
        '<div id="rev-shot" class="mb2"><span class="inline-loader">Loading the screenshot</span></div>' +
        '<button class="btn btn-quiet btn-sm mb4" data-on-click="ADMIN.downloadScreenshot(\'' + escAttrJs(p.screenshotUrl) + '\',\'' + un + '_payment.png\')"><i class="ph ph-download-simple"></i> Download</button>'
      : '<p class="t-foot mb4">No screenshot was attached.</p>') +
    (settled || !canReview
      ? '<div class="flex g2"><button class="btn btn-quiet btn-block" data-on-click="MODAL.close(\'review\')">Close</button></div>'
      : '<div class="field"><label for="grant-duration">If verified, give them</label>' +
        '<select class="select" id="grant-duration"><option value="permanent">Permanent access</option><option value="year">One year</option></select></div>' +
        '<div class="field"><label for="rej-reason">If rejected, tell them why</label>' +
        '<input class="input" type="text" id="rej-reason" placeholder="Students see this message"></div>' +
        '<div class="flex g2 mt4">' +
          '<button class="btn btn-danger" style="flex:1" id="rev-reject" data-on-click="MODAL.confirmReview(\'' + un + '\',\'rejected\')"><i class="ph ph-x"></i> Reject</button>' +
          '<button class="btn btn-primary" style="flex:1" id="rev-verify" data-on-click="MODAL.confirmReview(\'' + un + '\',\'verified\')"><i class="ph ph-check"></i> Verify</button>' +
        '</div>');
  MODAL.open('review');
  if (p.screenshotUrl && p.screenshotUrl.startsWith('http')) {
    ADMIN.renderScreenshot('rev-shot', p.screenshotUrl, p.username);
  }
};

MODAL.confirmReview = async function(username, status){
  const reason = (($('rej-reason') || {}).value || '');
  const duration = (($('grant-duration') || {}).value) || 'permanent';
  if (status === 'rejected' && !reason.trim()) {
    if ($('rej-reason')) {
      $('rej-reason').classList.add('invalid');
      $('rej-reason').focus();
    }
    return TOAST.show('Give a reason — the student sees it', 'error');
  }
  if (status === 'verified') {
    const p = (ADMIN.data.payments || []).find(x => x.username === username);
    if (p && p.duplicateTxId) {
      const ok = await CONFIRM.ask({
        title:'Duplicate transaction ID',
        body:'This ID was also submitted by <b>' + esc((p.duplicateTxIdUsers || []).join(', ')) + '</b>. Verify anyway?',
        confirmText:'Verify anyway', tone:'danger'
      });
      if (!ok) return;
    }
  }
  const btn = $(status === 'verified' ? 'rev-verify' : 'rev-reject');
  if (btn) btn.classList.add('loading');
  try {
    const res = await ADMIN.post('adminReviewPayment', { username, status, rejectionReason: reason });
    if (!res.success) throw new Error(res.error);
    if (status === 'verified' && duration === 'year') {
      await ADMIN.post('adminGrantAccess', { username, duration: 'year' });
    }
    TOAST.show(
      status === 'verified'
        ? username + ' now has ' + (duration === 'year' ? 'one year of' : 'permanent') + ' access'
        : 'Payment rejected — ' + username + ' has been told why',
      'success', 5000
    );
    MODAL.close('review');
    ADMIN.refresh(['stats','payments','users']);
  } catch(e){ TOAST.show(e.message, 'error'); }
  if (btn) btn.classList.remove('loading');
};

window.PAYMENTS = PAYMENTS;
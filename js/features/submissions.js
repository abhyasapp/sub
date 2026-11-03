// js/features/submissions.js — my submissions list, email verify, custom
// paper builder.
// MUST load AFTER: core/state.js (S), core/dom.js ($, set), core/text.js
// (esc, escAttrJs), core/toast.js (toast), core/scope.js (fidFromUid),
// core/study-docs.js (studyDocsForChapter, subjChapterName, STUDYDOC_LABELS),
// core/net.js (netFetch), core/config.js (ABHYAS_CONFIG),
// features/study-docs.js (STUDYDOCS).

window.MY_SUBJ = {
  _loading: false,
  _loaded: false,
  _items: [],

  _user(){
    try { return (typeof S !== 'undefined' && S.user) ? S.user : null; }
    catch(e){ return null; }
  },
  _online(){
    try { return !!(typeof S !== 'undefined' && S.online && !S.forcedOffline); }
    catch(e){ return navigator.onLine; }
  },

  async load(force){
    const box = $('subj-mine-body');
    if (!box) return;
    if (this._loaded && !force) { this.render(); this.refreshHint(); return; }
    if (this._loading) return;
    this._loading = true;

    box.innerHTML = `<div class="card">
      <div class="skel w80"></div><div class="skel w60"></div><div class="skel w100"></div>
    </div>`;

    const user = this._user();

    if (!user || !user.token) {
      box.innerHTML = '<div class="card"><div class="empty">' +
        '<div class="empty-i"><i class="ph ph-user"></i></div>' +
        '<p>Not signed in</p>' +
        '<p>Sign in to see your submissions.</p>' +
        '</div></div>';
      this._loading = false;
      return;
    }

    if (!this._online()) {
      box.innerHTML = '<div class="card"><div class="banner banner-warning">' +
        '<i class="ph ph-wifi-slash"></i>' +
        '<span>You are offline. Connect to the internet to see your submissions — nothing is lost while you wait.</span>' +
        '</div></div>';
      this._loading = false;
      return;
    }

    try {
      const r = await netFetch(ABHYAS_CONFIG.SUPABASE_URL, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({
          action:'getMySubjectiveSubmissions',
          username:user.username,
          token:user.token
        })
      }, 15000);
      if (!r.ok) throw new Error('The server replied with HTTP ' + r.status + '.');
      const res = await r.json();
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not load your submissions.');
      
      this._items = (res.submissions || []).slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      this._loaded = true;
      this.render();
      this.refreshHint();
    } catch(e){
      box.innerHTML = '<div class="card"><div class="banner banner-danger">' +
        '<i class="ph ph-warning-circle"></i>' +
        '<span>' + esc(e.message || 'Could not load.') +
        ' <button class="btn btn-sm btn-quiet" data-on-click="MY_SUBJ.load(true)">Try again</button></span>' +
        '</div></div>';
    }
    this._loading = false;
  },

  refreshHint(){
    const n = this._items.length;
    const pending = this._items.filter(s => s.status !== 'graded').length;
    const badge = $('subj-mine-badge');
    const hint = $('subj-mine-hint');
    if (badge) {
      badge.hidden = pending === 0;
      badge.textContent = pending > 99 ? '99+' : pending;
    }
    if (hint) {
      hint.textContent = n === 0 ? 'Nothing submitted yet'
        : pending > 0 ? pending + ' awaiting marking'
        : n === 1 ? '1 marked' : n + ' marked';
    }
  },

  render(){
    const box = $('subj-mine-body');
    if (!box) return;
    if (!this._items.length) {
      box.innerHTML = '<div class="card"><div class="empty">' +
        '<div class="empty-i"><i class="ph ph-file-text"></i></div>' +
        '<p>No submissions yet</p>' +
        '<p>Send in a written answer and it will show up here with the PDF you uploaded.</p>' +
        '<div class="bg" style="justify-content:center;margin-top:var(--sp-4)">' +
          '<button class="btn btn-a" data-on-click="UI.go(\'subj-qotd\')"><i class="ph ph-sun-horizon"></i> Today\'s question</button>' +
        '</div>' +
        '</div></div>';
      return;
    }
    
    requestAnimationFrame(() => {
      box.innerHTML = this._items.map(s => this._renderCard(s)).join('');
      if (!this._modelChecked && typeof STUDYDOCS !== 'undefined' && this._items.some(s => s.chapterId)) {
        this._modelChecked = true;
        STUDYDOCS.ensureLoaded().then(() => { if (STUDYDOCS.docs.length) this.render(); });
      }
    });
  },

  _renderCard(s){
    const graded = s.status === 'graded';
    const cls = graded ? 'graded' : s.status === 'rejected' ? 'rejected' : 'pending';
    const kind = (s.kind === 'exam') ? 'Full paper' : 'Question of the day';
    const marks = s.questionMarks || (s.kind === 'exam' ? 100 : 10);
    const when = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—';

    const marked = !!s.pdfReplacedAt;
    const pdfBtn = s.pdfUrl
      ? '<button class="subm-pdf-btn" data-on-click="MY_SUBJ.openPdf(\'' + escAttrJs(s.id) + '\',\'' + escAttrJs(kind) + '\')">' +
          '<i class="ph ph-file-pdf"></i> ' + (marked ? 'Open the marked paper' : 'Open my answer') + '</button>' +
        (marked ? '<span class="ctag tc"><i class="ph ph-highlighter-circle"></i> Marked by hand</span>' : '')
      : '<span class="t-cap">No PDF attached</span>';

    const statusChip = graded
      ? '<span class="ctag tg">Marked</span>'
      : s.status === 'rejected'
        ? '<span class="ctag tr">Returned</span>'
        : '<span class="ctag tw">Awaiting marking</span>';

    const gradeBlock = graded
      ? '<div class="subm-grade">' +
          '<span class="v">' + (s.score != null ? s.score : '—') + '</span>' +
          '<span class="out">/ ' + marks + '</span>' +
          '<span class="lbl">' + (s.gradedBy ? 'marked by ' + esc(s.gradedBy) : '') + '</span>' +
        '</div>'
      : '';

    const feedbackBlock = (graded && s.feedback)
      ? '<div class="subm-feedback"><strong>Feedback:</strong> ' + esc(s.feedback) + '</div>'
      : '';

    const qText = s.questionText
      ? '<div class="subm-q">' + esc(s.questionText) + '</div>'
      : '';

    const modelDocs = (typeof STUDYDOCS !== 'undefined' && s.chapterId) ? studyDocsForChapter(STUDYDOCS.docs, s.chapterId) : [];
    const modelBtn = modelDocs.length
      ? '<div class="subm-pdf-row"><button class="subm-pdf-btn" data-on-click="STUDYDOCS.showChapter(\'' + escAttrJs(s.chapterId) + '\')">' +
          '<i class="ph ph-book-open-text"></i> ' + (modelDocs.length === 1 ? 'Read the model answer' : 'Model answers for ' + esc(subjChapterName(s.chapterId) || 'this chapter') + ' (' + modelDocs.length + ')') + '</button></div>'
      : '';

    return '<div class="subm-card ' + cls + '">' +
      '<div class="subm-top">' +
        '<div>' +
          '<div class="subm-kind">' + kind + '</div>' +
          '<div class="subm-meta">' +
            '<span>' + esc(when) + '</span>' +
            '<span>' + marks + ' marks</span>' +
            (s.solveSec ? '<span>' + Math.round(s.solveSec / 60) + ' min spent</span>' : '') +
          '</div>' +
        '</div>' +
        statusChip +
      '</div>' +
      qText +
      '<div class="subm-pdf-row">' + pdfBtn + '</div>' +
      gradeBlock +
      feedbackBlock +
      modelBtn +
    '</div>';
  },

  async openPdf(id, label){
    const user = this._user();
    if (!user || !user.token) { toast('Please log in again.'); return; }
    if (!this._online()) { toast('You are offline. Connect to open your submitted PDF.'); return; }

    /* Supabase returns a signed URL; the viewer needs base64. Fetch once,
       re-encode, hand back the shape PDFVIEW.open expects. */
    const fetchPdf = async () => {
      const r = await netFetch(ABHYAS_CONFIG.SUPABASE_URL, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({
          action:'getMySubmissionPdf',
          username:user.username,
          token:user.token,
          id
        })
      }, 15000);
      if (!r.ok) throw new Error('The server replied with an error (' + r.status + ').');
      const res = await r.json();
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not load that PDF.');
      if (res.base64) return res;                    /* legacy GAS shape */
      if (!res.url) throw new Error('The server did not return a PDF URL.');
      const blob = await fetch(res.url).then(rr => {
        if (!rr.ok) throw new Error('The signed URL replied with HTTP ' + rr.status + '.');
        return rr.blob();
      });
      const base64 = await new Promise((ok, bad) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(',')[1]);
        fr.onerror = () => bad(new Error('Could not read the PDF.'));
        fr.readAsDataURL(blob);
      });
      return { base64, filename: res.filename || 'submission.pdf', mimeType: 'application/pdf' };
    };

    if (window.PDFVIEW) {
      PDFVIEW.open({
        title: label || 'My answer paper',
        load: fetchPdf
      });
      return;
    }

    toast('Loading your PDF…');
    try {
      const res = await fetchPdf();
      const chars = atob(res.base64);
      const bytes = new Uint8Array(chars.length);
      for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: res.mimeType || 'application/pdf' }));
      const tab = window.open(blobUrl, '_blank');
      if (!tab) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = res.filename || 'answer.pdf';
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 300000);
    } catch(e){
      toast(e.message || 'Could not open that PDF.', 5000);
    }
  }
};

window.VERIFY = {
  KEY: 'abhyas_verify_hidden',

  _unverified(){
    try {
      if (typeof S !== 'undefined' && S.user && S.user.emailVerified === false) return true;
      const raw = JSON.parse(localStorage.getItem('abhyas_session') || 'null');
      return !!(raw && raw.emailVerified === false);
    } catch(e){ return false; }
  },
  _hidden(){
    try { return Number(localStorage.getItem(this.KEY) || 0) > Date.now(); } catch(e){ return false; }
  },
  render(){
    const el = $('verify-banner');
    if (!el) return;
    el.hidden = !(this._unverified() && !this._hidden());
  },
  dismiss(){
    try { localStorage.setItem(this.KEY, String(Date.now() + 7 * 24 * 3600 * 1000)); } catch(e){}
    this.render();
  },
  _mark(){
    try {
      if (typeof S !== 'undefined' && S.user) S.user.emailVerified = true;
      const raw = JSON.parse(localStorage.getItem('abhyas_session') || 'null');
      if (raw) { raw.emailVerified = true; localStorage.setItem('abhyas_session', JSON.stringify(raw)); }
    } catch(e){}
  },
  async resend(){
    /* resendVerification is one of the four SMTP actions that stays on GAS
       (per config.js DRIVE_ACTIONS). Route it explicitly. */
    let user = null, url = '';
    try { user = (typeof S !== 'undefined' && S.user) ? S.user : null; } catch(e){}
    try { url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || ''; } catch(e){}
    if (!user || !user.token || !url) return toast('Please sign in again.');
    const btn = $('verify-resend');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const r = await fetch(url, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({ action:'resendVerification', username:user.username, token:user.token })
      });
      const res = await r.json();
      if (!res || !res.success) throw new Error((res && res.error) || 'Could not send that email.');
      if (res.alreadyVerified) { this._mark(); this.render(); toast('Your email is already confirmed.'); }
      else toast('Sent — open the link in your inbox.', 5000);
    } catch(e){
      toast(e.message || 'Could not send that email right now.', 5000);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Send the link again'; }
  }
};

window.SUBJ_BUILDER = {
  _populated: false,
  _populate(){
    if (this._populated) return;
    const box = $('exam-builder-chapters');
    if (!box) return;
    const refs = (window.SUBJECTIVE_FILE_REFS || []).filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));
    if (!refs.length) {
      box.innerHTML = '<p class="t-foot" style="padding:.4rem .5rem">No chapters are set up yet.</p>';
      this._populated = true;
      return;
    }
    
    requestAnimationFrame(() => {
      const byGroup = {};
      refs.forEach(r => { const g = r.group || 'A'; (byGroup[g] = byGroup[g] || []).push(r); });
      box.innerHTML = Object.keys(byGroup).sort().map(gk =>
        '<div class="t-cap" style="font-weight:700;padding:.35rem .5rem .1rem">Group ' + esc(gk) + '</div>' +
        byGroup[gk].map(r =>
          '<label class="ch-item" style="cursor:pointer">' +
            '<input type="checkbox" class="eb-ch" value="' + window.escAttrJs(r.chapterId) + '" checked>' +
            '<span class="ch-name" style="color:var(--ink)">' + esc(r.name) + '</span>' +
          '</label>'
        ).join('')
      ).join('');
      this._populated = true;
    });
  },
  _updateCooldownUI(){
    const btn = $('exam-builder-go');
    const note = $('exam-builder-note');
    if (!btn || typeof SUBJ === 'undefined' || typeof SUBJ.customExamIsLocked !== 'function') return;
    const locked = SUBJ.customExamIsLocked();
    btn.disabled = locked;
    btn.innerHTML = locked
      ? '<i class="ph ph-clock"></i> Available again in ' + SUBJ.customExamCooldownLabel()
      : '<i class="ph ph-shuffle"></i> Build the paper';
    if (note) note.textContent = locked ? 'You can build one custom paper every six hours.' : '';
  },
  selectAll(){ document.querySelectorAll('#exam-builder-chapters input.eb-ch').forEach(c => c.checked = true); },
  clear(){ document.querySelectorAll('#exam-builder-chapters input.eb-ch').forEach(c => c.checked = false); },
  generate(){
    const ids = [...document.querySelectorAll('#exam-builder-chapters input.eb-ch:checked')].map(c => c.value);
    if (!ids.length) return toast('Choose at least one chapter.');
    const marks = parseInt($('exam-builder-marks').value, 10) || 100;
    const mode = $('exam-builder-mode').value;
    if (typeof SUBJ === 'undefined' || typeof SUBJ._buildCustomExam !== 'function') {
      return toast('The question bank is still loading — try again in a moment.');
    }
    SUBJ._buildCustomExam(ids, marks, mode);
  }
};
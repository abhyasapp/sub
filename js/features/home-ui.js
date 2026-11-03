// js/features/home-ui.js — home notice stack, hint refresher, hard-question
// badge, trial pill, exam-date accessor, share card.

function _briefDuration(ms){
  if (ms < 0) return 'now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return mins + ' min';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour' : ' hours');
  const d = Math.floor(hrs / 24);
  return d + (d === 1 ? ' day' : ' days');
}

function _dueItems(){
  const out = [];

  try {
    if (typeof SUBJ !== 'undefined' && SUBJ._hasBank && SUBJ._hasBank() && SUBJ._qotdPublicState) {
      const st = SUBJ._qotdPublicState();
      if (!st || st.phase === 'idle') {
        out.push({ icon:'ph-sun-horizon', title:"Today's written question", sub:'Ready when you are', meta:(st && st.marks ? st.marks + ' marks' : ''), go:"UI.go('subj-qotd')" });
      } else if (st.phase === 'solving') {
        out.push({ icon:'ph-pencil-line', title:'You are writing now', sub:'Time left to finish', meta:st.left, urgent:(st.leftSec || 0) < 120, go:"UI.go('subj-qotd')" });
      } else if (st.phase === 'upload') {
        out.push({ icon:'ph-upload-simple', title:'Upload your answer', sub:'The window closes soon', meta:st.left, urgent:true, go:"UI.go('subj-qotd')" });
      }
    }
  } catch(e){}

  try {
    if (typeof WEEKLY !== 'undefined') {
      const sets = WEEKLY.sets || [], attempts = WEEKLY.attempts || {};
      sets.forEach(s => {
        if (!s.released) {
          const ms = new Date(s.releaseAt).getTime() - Date.now();
          if (ms > 0 && ms < 24 * 60 * 60 * 1000) {
            out.push({ icon:'ph-lock-simple', title:s.title, sub:'Unlocks soon', meta:'in ' + _briefDuration(ms), go:"UI.go('weekly')" });
          }
          return;
        }
        if (attempts[s.id]) return;
        const closeAt = WEEKLY.examCloseAt ? WEEKLY.examCloseAt(s) : null;
        if (closeAt && Date.now() < closeAt) {
          const left = closeAt - Date.now();
          out.push({
            icon:'ph-calendar-check', title:s.title, sub:'One attempt, closes soon',
            meta:_briefDuration(left) + ' left', urgent:left < 60 * 60 * 1000, go:"UI.go('weekly')"
          });
        }
      });
    }
  } catch(e){}

  try {
    if (typeof REV !== 'undefined' && REV.dueCount) {
      const n = REV.dueCount();
      if (n > 0) out.push({
        icon:'ph-arrow-counter-clockwise',
        title:(n === 1 ? '1 question is' : n + ' questions are') + ' ready again',
        sub:'You missed these before',
        meta:'Review', go:"REV.start('wr','flashcard',true)"
      });
    }
  } catch(e){}

  return out;
}

function _renderDueStrip(){
  const box = $('due-strip');
  if (!box) return;
  const items = _dueItems();
  if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  
  requestAnimationFrame(() => {
    box.innerHTML = items.slice(0, 3).map(i =>
      '<button class="due-item' + (i.urgent ? ' urgent' : '') + '" data-on-click="' + i.go + '">' +
        '<span class="due-ic"><i class="ph ' + i.icon + '"></i></span>' +
        '<span class="due-body">' +
          '<span class="due-title">' + esc(i.title) + '</span>' +
          '<span class="due-sub">' + esc(i.sub) + '</span>' +
        '</span>' +
        (i.meta ? '<span class="due-meta">' + esc(i.meta) + '</span>' : '') +
      '</button>'
    ).join('');
  });
}

function _renderMarquee(){
  const bar = $('home-marquee'), track = $('marquee-track');
  if (!bar || !track) return;
  const items = _dueItems().filter(i => i.urgent);
  
  if (!items.length) { 
    bar.style.display = 'none'; 
    return; 
  }
  
  const i = items[0];
  bar.style.display = '';
  bar.classList.add('urgent');
  track.innerHTML = '<span class="marquee-item"><strong>' + esc(i.title) + '</strong> — ' + esc(i.meta || i.sub) + '</span>';
}

window.SB_HINTS = {
  refresh(){
    const qHint = $('subj-qotd-hint'), qBadge = $('subj-qotd-badge');
    if (qHint && qBadge && typeof SUBJ !== 'undefined') {
      const st = SUBJ._qotdPublicState ? SUBJ._qotdPublicState() : null;
      const ready = SUBJ._hasBank ? SUBJ._hasBank() : false;
      if (!ready)                       { qHint.textContent = 'Nothing set up yet';        qBadge.hidden = true; }
      else if (!st || st.phase === 'idle'){ qHint.textContent = 'Ready — tap to begin';    qBadge.hidden = false; }
      else if (st.phase === 'solving')  { qHint.textContent = 'Writing · ' + (st.left||''); qBadge.hidden = true; }
      else if (st.phase === 'upload')   { qHint.textContent = 'Upload window is open';     qBadge.hidden = false; }
      else if (st.phase === 'submitted'){ qHint.textContent = 'Sent for marking';          qBadge.hidden = true; }
      else                              { qHint.textContent = 'Back tomorrow';             qBadge.hidden = true; }
    }

    const wHint = $('weekly-hint'), wBadge = $('weekly-badge');
    if (wHint && wBadge && typeof WEEKLY !== 'undefined') {
      const sets = WEEKLY.sets || [], attempts = WEEKLY.attempts || {};
      const live = sets.filter(s => s.released && !attempts[s.id] && WEEKLY.examOpen && WEEKLY.examOpen(s));
      const upcoming = sets.filter(s => !s.released);
      if (live.length) {
        wHint.textContent = live.length === 1 ? 'One test is open now' : live.length + ' tests are open now';
        wBadge.hidden = false;
      } else if (upcoming.length) {
        const next = upcoming.slice().sort((a,b) => new Date(a.releaseAt) - new Date(b.releaseAt))[0];
        wHint.textContent = 'Next unlocks in ' + _briefDuration(new Date(next.releaseAt).getTime() - Date.now());
        wBadge.hidden = true;
      } else if (sets.length) {
        wHint.textContent = sets.length === 1 ? 'One set to review' : sets.length + ' sets to review';
        wBadge.hidden = true;
      } else {
        wHint.textContent = 'No sets yet';
        wBadge.hidden = true;
      }
    }

    if (typeof MY_SUBJ !== 'undefined') MY_SUBJ.refreshHint();
    if (typeof VERIFY !== 'undefined') VERIFY.render();
    if (typeof SUBJ_BUILDER !== 'undefined') SUBJ_BUILDER._updateCooldownUI();

    _renderDueStrip();
    _renderMarquee();
  }
};

window.HARDQ = {
  _map: null,
  load(){
    try {
      const raw = localStorage.getItem('abhyas_hardq');
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.map && Date.now() - o.at < 24*60*60*1000) { this._map = o.map; return; }
      }
    } catch(e){}
    
    if (!S.online || S.forcedOffline) return;

    /* gethardquestions is Supabase per handover §3, and requires auth. */
    const user = (typeof S !== 'undefined' && S.user) || null;
    if (!user || !user.token) return;

    const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.SUPABASE_URL) || '';
    if (!url) return;

    const queryString = new URLSearchParams({
      action: 'gethardquestions',
      username: user.username,
      token: user.token
    }).toString();

    fetch(url + '?' + queryString, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d && d.success && d.map) {
          this._map = d.map;
          try { localStorage.setItem('abhyas_hardq', JSON.stringify({ at: Date.now(), map: d.map })); } catch(e){}
        }
      })
      .catch(() => {});
  },
  forUid(uid){ return (this._map && this._map[uid]) || 0; }
};

function _renderHomeExtras(){
  try { if (typeof RECOVERY !== 'undefined') RECOVERY.render(); } catch(e){}
  try { if (typeof TODAY_PLAN !== 'undefined') TODAY_PLAN.render(); } catch(e){}
  try { if (typeof TODAY_PLAN !== 'undefined') TODAY_PLAN._renderResume(); } catch(e){}
  try { if (typeof READINESS !== 'undefined') READINESS.render(); } catch(e){}
  try { if (typeof PACE !== 'undefined') PACE.render(); } catch(e){}
  try { if (typeof BADGES_UI !== 'undefined') BADGES_UI.render(); } catch(e){}
  try { if (typeof WEEKLY_BOARD !== 'undefined') WEEKLY_BOARD.render(); } catch(e){}
}

function _refreshHints(){
  try { document.documentElement.classList.remove('focus-mode'); } catch(e){}
  try { if (typeof RESET_SNAPSHOT !== 'undefined') RESET_SNAPSHOT.renderCard(); } catch(e){}
  try { if (typeof SIDEBAR   !== 'undefined') SIDEBAR.init(); } catch(e){}
  try { SB_HINTS.refresh(); } catch(e){}
  try { TRIAL_PILL.render(); } catch(e){}
  try { ANNOUNCE.load(); } catch(e){}
  try { _renderHomeExtras(); } catch(e){}
  try { HARDQ.load(); } catch(e){}
  try { if (typeof SYLLABUS_MOCK     !== 'undefined') SYLLABUS_MOCK.render(); } catch(e){}
  try { if (typeof PRACTICE_RESUME   !== 'undefined') PRACTICE_RESUME.render(); } catch(e){}
  try { if (typeof SPRINT_PAGE !== 'undefined' && SPRINT_PAGE.renderHomeStrip) SPRINT_PAGE.renderHomeStrip(); } catch(e){}
  try { if (typeof DAILY10           !== 'undefined') DAILY10.render(); } catch(e){}
  try { if (typeof DIGEST            !== 'undefined') DIGEST.render(); } catch(e){}
  try { if (typeof CALENDAR          !== 'undefined') CALENDAR.render(); } catch(e){}
  try { if (typeof FORECAST          !== 'undefined') FORECAST.render(); } catch(e){}
  try { if (typeof SYLLABUS_PROGRESS !== 'undefined') SYLLABUS_PROGRESS.render(); } catch(e){}
}

window.TRIAL_PILL = {
  render(){
    const b = $('tb-trial'), t = $('tb-trial-txt');
    if (!b || !t) return;
    let a = null;
    try { a = (S.user && S.user.access) || null; } catch(e){}
    if (!a || a.level !== 'trial' || !a.trialExpiresAt) { b.hidden = true; return; }
    const ms = new Date(a.trialExpiresAt).getTime() - Date.now();
    b.hidden = false;
    if (!(ms > 0)) { t.textContent = 'Trial ended'; return; }
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    t.textContent = h >= 48 ? Math.floor(h / 24) + 'd left' : h > 0 ? h + 'h ' + m + 'm left' : m + 'm left';
  }
};

window.EXAM_DATE = {
  KEY: 'abhyas_exam_date',
  get(){ try { return localStorage.getItem(this.KEY) || ''; } catch(e){ return ''; } }
};

window.SHARECARD = {
  text(){
    const p = S.prog || {}, total = Number(p.total) || 0, correct = Number(p.correct) || 0;
    const pct = total ? Math.round(correct * 100 / total) : 0;
    const days = new Set(((S.stk && S.stk.days) || []).map(String)).size;
    return total
      ? `I have practised ${total} questions on Abhyas with ${pct}% accuracy` + (days ? ` over ${days} study days` : '') + '. Loksewa preparation, one day at a time.'
      : 'I have started my Loksewa preparation on Abhyas.';
  },
  async run(){
    const text = SHARECARD.text();
    try {
      if (navigator.share){ await navigator.share({ text }); return; }
    } catch(e){ if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in a message to share.'); }
    catch(e){ toast('Could not share here. Your summary: ' + text, 8000); }
  }
};
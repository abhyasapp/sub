// js/features/home.js — greeting, stats, badges, recent sessions.

const HOME = {
  render(){
    try {
      const h = new Date().getHours();
      const G = [
        {t:'Burning midnight oil?', i:'🌙', r:[0,5]},
        {t:'Good morning!',          i:'🌅', r:[5,12]},
        {t:'Good afternoon!',        i:'☀️', r:[12,17]},
        {t:'Good evening!',          i:'🌆', r:[17,21]},
        {t:'Working late?',          i:'🌙', r:[21,24]}
      ];
      const g = G.find(x=>h>=x.r[0] && h<x.r[1]) || G[1];

      const gt = document.getElementById('greeting-title'); if(gt) gt.textContent = g.t;
      const gi = document.getElementById('greeting-icon');  if(gi) gi.textContent = g.i;
      const gEl = document.getElementById('greeting');
      if(gEl) gEl.textContent = `${S.user?.name||S.user?.username||'Student'} — Nepal Engineering & PSC exam prep.`;

      HOME.updateStats();
      HOME.updateBadges();
      if (typeof STREAK !== 'undefined') STREAK.renderBar();
      HOME.renderRecent();
      HOME.tickClock();

      if(typeof WEEKLY!=='undefined') WEEKLY._renderHomeCard();
      if(typeof SB_HINTS!=='undefined') SB_HINTS.refresh();
    } catch (e) {
      console.error('[HOME.render] Failed:', e);
    }
  },

  updateStats(){
    const total = S.prog.total || 0, correct = S.prog.correct || 0, wrong = total - correct;
    const pct = total ? Math.round((correct/total)*100) : 0;
    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent = v; };
    set('hs-tot', total); set('hs-cor', correct); set('hs-wrg', wrong); set('hs-pct', pct+'%');
    HOME._updateStudyTime();
  },

  _updateStudyTime(){
    const el = document.getElementById('hs-time');
    if(!el) return;
    const weekAgo = Date.now() - 7*24*60*60*1000;
    const totalSec = (S.prog.sessions||[])
      .filter(s => s && s.at && s.at >= weekAgo)
      .reduce((sum,s)=> sum + (Number(s.durationSec)||0), 0);
    const hrs = Math.floor(totalSec/3600);
    const mins = Math.round((totalSec%3600)/60);
    
    if (hrs > 0) el.textContent = `${hrs}h ${mins}m`;
    else if (mins > 0) el.textContent = `${mins}m`;
    else el.textContent = '0m';
  },

  updateBadges(){
    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent = v; };
    const dueWr = (typeof REV !== 'undefined' && REV.dueCount) ? REV.dueCount() : 0;
    set('bkc', S.bk.length); set('wrc', S.wr.length);
    
    const wrDueEl = document.getElementById('wrc-due');
    if(wrDueEl) wrDueEl.textContent = dueWr;
    
    const total = S.bk.length + dueWr;
    const bnBadge = document.getElementById('bn-badge');
    if(bnBadge){
      if(total>0){ bnBadge.textContent = total>99?'99+':total; bnBadge.style.display=''; }
      else bnBadge.style.display='none';
    }
    set('nav-bk-badge', S.bk.length);
    set('nav-wr-badge', S.wr.length);
    
    const oldDueBadge = document.getElementById('nav-wr-due-badge');
    if(oldDueBadge){ oldDueBadge.textContent = dueWr; oldDueBadge.style.display = dueWr>0?'':'none'; }
  },

  renderRecent(){
    const el = document.getElementById('recent-sessions');
    if(!el) return;
    const sessions = (S.prog.sessions||[]).slice(0,6);
    
    if(!sessions.length){
      el.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-trend-up"></i></div><p>No sessions yet — start a quiz!</p></div>';
      return;
    }

    requestAnimationFrame(() => {
      const mIc = m => m==='exam' ? '<i class="ph ph-note-pencil"></i>'
                      : m==='flashcard' ? '<i class="ph ph-lightning"></i>'
                      : '<i class="ph ph-chart-bar"></i>';
      
      el.innerHTML = sessions.map(s=>{
        if (!s || !s.at) return '';
        const chName = String(s.chapter || 'Study');
        const ic = chName.includes('Wrong')     ? '<i class="ph ph-x-circle" style="color:var(--danger)"></i>'
                 : chName.includes('Daily')     ? '<i class="ph ph-star" style="color:var(--warning)"></i>'
                 : chName.includes('Bookmarks') ? '<i class="ph ph-star" style="color:var(--accent)"></i>'
                 : mIc(s.mode);
        
        const pct = Number(s.pct) || 0;
        const cls = pct>=70?'tg':pct>=40?'ta':'tr';
        
        let dt = new Date(s.at);
        if (isNaN(dt.getTime())) dt = new Date();
        
        let dateStr = dt.toLocaleDateString(undefined,{month:'short',day:'numeric'});
        let timeStr = dt.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        
        if (dt.toDateString() === new Date().toDateString()) {
          dateStr = 'Today';
        } else if (dt.toDateString() === new Date(Date.now() - 86400000).toDateString()) {
          dateStr = 'Yesterday';
        }

        return `<div class="sess-row">
          <span class="sess-ic">${ic}</span>
          <div class="sess-info">
            <div class="sess-ch">${esc(chName)}</div>
            <div class="sess-ts">${dateStr} · ${timeStr}</div>
          </div>
          <span class="ctag ${cls}">${pct}%</span>
        </div>`;
      }).join('');
    });
  },

  _clockTimer:null,
  tickClock(){
    if(HOME._clockTimer) clearInterval(HOME._clockTimer);
    if(!document.getElementById('hclock') && !document.getElementById('h-session')) return;
    
    const tick = ()=>{
      if (!document.body.contains(document.getElementById('hclock'))) {
        if (HOME._clockTimer) { clearInterval(HOME._clockTimer); HOME._clockTimer = null; }
        return;
      }
      const now = new Date();
      const cl = document.getElementById('hclock'); if(cl) cl.textContent = now.toLocaleTimeString();
      const dt = document.getElementById('hdate');   if(dt) dt.textContent = now.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      if(typeof TT !== 'undefined') TT.renderCurrentSessionWidget('h-session');
    };
    tick();
    HOME._clockTimer = setInterval(tick, 1000);
  }
};

window.HOME = HOME;
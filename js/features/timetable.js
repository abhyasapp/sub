// js/features/timetable.js — study plan: sessions, reminders, calendar export.
// MUST load AFTER: core/constants.js (LS, DAYS), core/storage.js,
// core/state.js, core/format.js (today). Uses toast() at call time only.

const TT = {
  add(){
    const day = Number(document.getElementById('tt-day')?.value);
    const nameEl = document.getElementById('tt-name');
    const startEl = document.getElementById('tt-s');
    const endEl = document.getElementById('tt-e');
    
    if(nameEl && startEl && endEl){
      const name = nameEl.value.trim();
      const start = startEl.value;
      const end = endEl.value;
      if(!name || !start || !end){ toast('Fill in all fields'); return; }
      S.tt.sessions.push({id: Date.now()+'', day, name, start, end});
      _save(LS.TT, S.tt);
      nameEl.value = '';
      TT.render();
      toast('✅ Session added');
      return;
    }
    const timeEl = document.getElementById('tt-time');
    const labelEl = document.getElementById('tt-label');
    if(timeEl && labelEl){
      const time = timeEl.value;
      const label = labelEl.value.trim();
      if(!time){ toast('Pick a time'); return; }
      S.tt.sessions.push({
        id: Date.now()+'_'+Math.random().toString(36).slice(2),
        day, time, label,
        name: label || 'Study', start: time, end: ''
      });
      _save(LS.TT, S.tt);
      labelEl.value = '';
      TT.render();
      toast('✅ Session added');
    }
  },
  remove(id){
    S.tt.sessions = (S.tt.sessions||[]).filter(s=>s.id!==id);
    _save(LS.TT, S.tt);
    TT.render();
  },
  _reminderTimer:null,
  _notifiedToday:null,
  _lastCheckedDay:null,

  async toggleReminders(enabled){
    if(enabled){
      if(!('Notification' in window)){
        toast('❌ Notifications aren\'t supported in this browser');
        const t = document.getElementById('tt-remind-toggle'); if(t) t.checked = false;
        const t2 = document.getElementById('tt-reminders-toggle'); if(t2) t2.checked = false;
        return;
      }
      let perm = Notification.permission;
      if(perm === 'default') perm = await Notification.requestPermission();
      if(perm !== 'granted'){
        toast('❌ Notifications blocked — enable them in your browser/site settings');
        const t = document.getElementById('tt-remind-toggle'); if(t) t.checked = false;
        const t2 = document.getElementById('tt-reminders-toggle'); if(t2) t2.checked = false;
        return;
      }
    }
    S.tt.reminders.enabled = enabled;
    _save(LS.TT, S.tt);
    TT._startReminderChecker();
    toast(enabled ? '🔔 Reminders on' : '🔕 Reminders off');
  },
  setLeadMinutes(mins){
    const n = Math.max(0, Math.min(60, Number(mins)||0));
    S.tt.reminders.leadMinutes = n;
    _save(LS.TT, S.tt);
  },
  _startReminderChecker(){
    if(TT._reminderTimer) clearInterval(TT._reminderTimer);
    if(!S.tt.reminders.enabled) return;
    TT._loadNotifiedToday();
    TT._checkReminders();
    TT._reminderTimer = setInterval(TT._checkReminders, 20000);
  },
  _todayKey(){ return today(); },
  _loadNotifiedToday(){
    const saved = _load(LS.TT_NOTIFIED, {date:'', ids:[]});
    TT._notifiedToday = (saved.date === TT._todayKey()) ? new Set(saved.ids) : new Set();
  },
  _saveNotifiedToday(){
    _save(LS.TT_NOTIFIED, {date: TT._todayKey(), ids:[...TT._notifiedToday]});
  },
  async _checkReminders(){
    if(!S.tt.reminders.enabled) return;
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    if(!TT._notifiedToday) TT._loadNotifiedToday();
    const now = new Date();
    const todayKey = TT._todayKey();
    if(TT._lastCheckedDay !== todayKey){ TT._lastCheckedDay = todayKey; TT._loadNotifiedToday(); }

    const lead = S.tt.reminders.leadMinutes || 0;
    const nowMs = now.getTime();
    const todayDay = now.getDay();

    for(const s of (S.tt.sessions||[])){
      if(s.day !== todayDay) continue;
      const start = s.start || s.time;
      if(!start) continue;
      const dedupKey = `${todayKey}_${s.id}`;
      if(TT._notifiedToday.has(dedupKey)) continue;
      const [h,m] = start.split(':').map(Number);
      const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
      const fireAt = startMs - lead*60000;
      if(nowMs >= fireAt && nowMs < startMs + 5*60000){
        TT._fireReminder(s, lead);
        TT._notifiedToday.add(dedupKey);
        TT._saveNotifiedToday();
      }
    }
  },
  async _fireReminder(s, lead){
    const name = s.name || s.label || 'Study session';
    const title = lead > 0 ? `Starting in ${lead} min: ${name}` : `Now: ${name}`;
    const body = s.end ? `${s.start}–${s.end}` : (s.time || '');
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.ready){
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, { body, icon:'./icon-192.png', tag:'tt-'+s.id });
      } else {
        new Notification(title, { body, icon:'./icon-192.png' });
      }
    }catch(e){ }
  },
  _clockTimer:null,
  render(){
    const t1 = document.getElementById('tt-remind-toggle');   if(t1) t1.checked = !!S.tt.reminders.enabled;
    const t2 = document.getElementById('tt-reminders-toggle'); if(t2) t2.checked = !!S.tt.reminders.enabled;
    const leadEl = document.getElementById('tt-remind-lead');
    if(leadEl) leadEl.value = S.tt.reminders.leadMinutes ?? 5;

    TT._startReminderChecker();
    
    if(TT._clockTimer) clearInterval(TT._clockTimer);
    const tick = ()=>{
      const now = new Date();
      const cl = document.getElementById('tt-clock'); if(cl) cl.textContent = now.toLocaleTimeString();
      const dt = document.getElementById('tt-date');  if(dt) dt.textContent = now.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      TT.renderCurrentSessionWidget('tt-now');
    };
    tick();
    TT._clockTimer = setInterval(tick, 1000);

    const todayDay = new Date().getDay();
    const nowHHMM = new Date().toTimeString().slice(0,5);

    const sessionStart = s => s.start || s.time || '00:00';
    const sessionEnd   = s => s.end   || '23:59';
    const sessionName  = s => s.name  || s.label || 'Study';

    const todayEl = document.getElementById('tt-today');
    if(todayEl){
      const todaySessions = (S.tt.sessions||[]).filter(s=>s.day===todayDay).sort((a,b)=>sessionStart(a).localeCompare(sessionStart(b)));
      
      requestAnimationFrame(() => {
        todayEl.innerHTML = todaySessions.length ? todaySessions.map(s=>{
          const isNow = sessionStart(s)<=nowHHMM && nowHHMM<sessionEnd(s);
          return `
          <div class="tt-row" style="${isNow?'background:rgba(30,122,76,.08);border-radius:8px;padding-left:.4rem;border-left:3px solid var(--accent)':''}">
            <div class="tt-ti">${sessionStart(s)}${s.end?'–'+s.end:''}</div>
            <div class="tt-na">${isNow?'<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--success);margin-right:.35rem;animation:npulse 2s infinite"></span>':''}${esc(sessionName(s))}</div>
            <button class="ib" data-on-click='TT.remove(${JSON.stringify(String(s.id))})' title="Remove this slot" aria-label="Remove this slot"><i class="ph ph-trash"></i></button>
          </div>`;
        }).join('') : '<div class="empty"><div class="empty-i"><i class="ph ph-calendar-blank"></i></div><p>Nothing scheduled today</p></div>';
      });
    }

    const weekEl = document.getElementById('tt-week');
    if(weekEl){
      const todayIdx = new Date().getDay();
      
      requestAnimationFrame(() => {
        weekEl.innerHTML = `
          <div class="tt-week-scroll" role="region" aria-label="Weekly study plan" tabindex="0">
          <div class="tt-week-grid">
            ${DAYS.map((d,i)=>`
              <div class="tt-dayhd ${i===todayIdx?'today':''}">
                ${d.slice(0,3)}
              </div>
            `).join('')}
            ${DAYS.map((d,di)=>{
              const sess = (S.tt.sessions||[]).filter(s=>s.day===di).sort((a,b)=>sessionStart(a).localeCompare(sessionStart(b)));
              const isToday = di===todayIdx;
              return `<div class="tt-daycol ${isToday?'today':''}">
                ${sess.length ? sess.map(s=>`
                  <div class="tt-chip" title="${esc(sessionName(s))} ${sessionStart(s)}${s.end?'–'+s.end:''}">
                    <div class="tt-chip-t">${sessionStart(s)}</div>
                    <div class="tt-chip-n">${esc(sessionName(s))}</div>
                    <button data-on-click='TT.remove(${JSON.stringify(String(s.id))})' class="tt-chip-x"><i class="ph ph-x"></i></button>
                  </div>
                `).join('') : `<div class="tt-empty-col">—</div>`}
              </div>`;
            }).join('')}
          </div>
          </div>
        `;
      });
    }
  },

  renderCurrentSessionWidget(elId){
    const el = document.getElementById(elId);
    if(!el) return;
    const now = new Date();
    const hhmm = now.toTimeString().slice(0,5);
    const todayDay = now.getDay();
    const sessionStart = s => s.start || s.time || '00:00';
    const sessionEnd   = s => s.end   || '23:59';
    const sessionName  = s => s.name  || s.label || 'Study';

    const active = (S.tt.sessions||[]).find(s=>s.day===todayDay && sessionStart(s)<=hhmm && hhmm<sessionEnd(s));
    const next   = (S.tt.sessions||[])
      .filter(s=>s.day===todayDay && sessionStart(s)>hhmm)
      .sort((a,b)=>sessionStart(a).localeCompare(sessionStart(b)))[0];

    if(active){
      el.innerHTML = `<div class="tt-now"><div class="tt-nl">Now</div><div class="tt-nn">${esc(sessionName(active))}</div><div class="tt-nt">until ${active.end || active.time || ''}</div></div>`;
    } else if(next){
      el.innerHTML = `<div class="tt-now"><div class="tt-nl">Next</div><div class="tt-nn">${esc(sessionName(next))}</div><div class="tt-nt">starts ${sessionStart(next)}</div></div>`;
    } else {
      el.innerHTML = `<div style="font-size:.74rem;color:var(--t3);text-align:center;padding:.4rem 0">No more sessions today</div>`;
    }
  },

  exportICS(){
    const sess = (S.tt.sessions || []).filter(s => (s.start || s.time));
    if(!sess.length){ toast('Add a session to your study plan first.'); return; }
    const pad = n => String(n).padStart(2, '0');
    const codes = ['SU','MO','TU','WE','TH','FR','SA'];
    const clean = t => String(t).replace(/([,;\\])/g, '\\$1').replace(/[\r\n]+/g, ' ');
    const lead = Math.max(0, Number(S.tt.reminders && S.tt.reminders.leadMinutes) || 5);
    const now = new Date();
    const stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Abhyas//Study plan//EN', 'CALSCALE:GREGORIAN'];
    sess.forEach(s => {
      const st = String(s.start || s.time).split(':').map(Number);
      const en = s.end ? String(s.end).split(':').map(Number) : [(st[0] + 1) % 24, st[1]];
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() + (((Number(s.day) || 0) - d.getDay() + 7) % 7));
      const ymd = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
      lines.push('BEGIN:VEVENT', 'UID:abhyas-' + s.id + '@app.mku.name.np', 'DTSTAMP:' + stamp,
        'DTSTART:' + ymd + 'T' + pad(st[0]) + pad(st[1]) + '00',
        'DTEND:' + ymd + 'T' + pad(en[0]) + pad(en[1]) + '00',
        'RRULE:FREQ=WEEKLY;BYDAY=' + codes[Number(s.day) || 0],
        'SUMMARY:' + clean((s.name || s.label || 'Study') + ' (Abhyas)'),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Study session', 'TRIGGER:-PT' + lead + 'M', 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], {type:'text/calendar'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'abhyas-study-plan.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Open the file to add your study plan to your calendar.', 4500);
  },
  exportJ(){
    const blob = new Blob([JSON.stringify(S.tt,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable.json';
    a.click();
  },
  importJ(){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = ()=>{
      const f = inp.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = e=>{
        try{
          const data = JSON.parse(e.target.result);
          if(data && Array.isArray(data.sessions)){
            S.tt = data;
            if(!S.tt.reminders) S.tt.reminders = {enabled:false, leadMinutes:5};
            _save(LS.TT, S.tt);
            TT.render();
            toast('✅ Timetable imported');
          } else toast('❌ Invalid timetable file');
        }catch{ toast('❌ Invalid JSON'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }
};

window.TT = TT;
// js/features/streak.js — study days, streak current/longest, 7-day bar.

const STREAK = {
  markToday(){
    const t = today();
    if(!S.stk.days) S.stk.days = [];
    if(!Array.isArray(S.stk.days)) S.stk.days = [];
    if(!S.stk.days.includes(t)) S.stk.days.push(t);
    S.stk.last = t;
    if(S.stk.days.length>400) S.stk.days = S.stk.days.slice(-400);
    _save(LS.STK, S.stk);
    if (typeof HOME !== 'undefined') HOME.render();
  },
  currentStreak(){
    const days = Array.isArray(S.stk && S.stk.days) ? S.stk.days : [];
    const set = new Set(days.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)));
    if(!set.size) return 0;
    const hasToday = set.has(today());
    const hasYesterday = set.has(localDateOffset(new Date(), -1));
    if(!hasToday && !hasYesterday){
      if(!set.has(localDateOffset(new Date(), -2))) return 0;
    }
    let n = 0;
    let offset = hasToday ? 0 : 1;
    let skipBudget = 1;
    while(n <= 400){
      if(set.has(localDateOffset(new Date(), -offset))){
        n++;
        offset++;
        continue;
      }
      if(skipBudget > 0){
        skipBudget--;
        offset++;
        continue;
      }
      break;
    }
    return n;
  },
  current(){ return STREAK.currentStreak(); },
  longest(){
    const days = Array.isArray(S.stk && S.stk.days) ? S.stk.days : [];
    const validDays = [...new Set(days.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
    if(!validDays.length) return 0;
    let longest = 1, cur = 1;
    for(let i=1;i<validDays.length;i++){
      const prev = new Date(validDays[i-1] + 'T12:00:00');
      const curD = new Date(validDays[i] + 'T12:00:00');
      if (isNaN(prev.getTime()) || isNaN(curD.getTime())) continue;
      const diffDays = Math.round((curD-prev)/(24*60*60*1000));
      if(diffDays===1){ cur++; longest=Math.max(longest,cur); }
      else cur = 1;
    }
    return longest;
  },
  renderBar(){
    const el = document.getElementById('sk-bar');
    if(!el) return;
    const days = [];
    const d = new Date();
    for(let i=6;i>=0;i--) days.push(localDateOffset(d,-i));
    el.innerHTML = days.map(ds=>{
      const isDone = Array.isArray(S.stk.days) && S.stk.days.includes(ds);
      const isToday = ds===today();
      const [yy,mm,dd] = ds.split('-').map(Number);
      const labelDate = new Date(yy,mm-1,dd);
      const label = isNaN(labelDate.getTime()) ? '?' : labelDate.toLocaleDateString(undefined,{weekday:'short'})[0];
      return `<div class="sk-d ${isDone?'done':''} ${isToday?'today':''}">${label}</div>`;
    }).join('');
    const tag = document.getElementById('stk-tag');
    if(tag) tag.textContent = `🔥 ${STREAK.currentStreak()} day streak`;
  }
};

window.STREAK = STREAK;
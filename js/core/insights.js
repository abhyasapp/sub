// js/core/insights.js — pure data for the Progress charts.

function insightsData(sessions, studyDays, now) {
  const list = Array.isArray(sessions) ? sessions.filter(s => s && Number(s.at) > 0) : [];
  const days = new Set(Array.isArray(studyDays) ? studyDays : []);
  const today = new Date((now || new Date()).getTime());
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const byDate = {};
  list.forEach(s => {
    const k = localISODate(new Date(Number(s.at)));
    const r = byDate[k] || (byDate[k] = { q: 0, correct: 0, secs: 0 });
    r.q += Math.max(0, Number(s.total) || 0);
    r.correct += Math.max(0, Number(s.correct) || 0);
    r.secs += Math.max(0, Number(s.durationSec) || 0);
  });

  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() - i);
    const k = localISODate(d), r = byDate[k] || { q: 0, correct: 0, secs: 0 };
    last14.push({
      date: k, label: WD[d.getDay()],
      q: r.q, correct: r.correct, mins: Math.round(r.secs / 60), isToday: i === 0
    });
  }

  const recent = list.filter(s => Number(s.total) > 0).slice(0, 12).reverse()
    .map(s => ({
      at: Number(s.at),
      pct: Math.max(0, Math.min(100, Math.round(Number(s.pct)
        || ((Number(s.correct) || 0) / Number(s.total)) * 100)))
    }));

  const week = last14.slice(7), prev = last14.slice(0, 7);
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const acc = a => {
    const q = sum(a, x => x.q);
    return q ? Math.round(sum(a, x => x.correct) / q * 100) : null;
  };
  const accWeek = acc(week), accPrev = acc(prev);

  const cells = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() - i);
    const k = localISODate(d);
    cells.push({ date: k, active: days.has(k) || !!(byDate[k] && byDate[k].q > 0), q: byDate[k] ? byDate[k].q : 0 });
  }
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].active) streak++;
    else if (i === cells.length - 1) continue;
    else break;
  }

  return {
    last14, recent, cells, streak,
    weekQuestions: sum(week, x => x.q),
    prevWeekQuestions: sum(prev, x => x.q),
    weekMinutes: sum(week, x => x.mins),
    activeDays12w: cells.filter(c => c.active).length,
    accWeek, accPrev,
    accDelta: (accWeek !== null && accPrev !== null) ? accWeek - accPrev : null,
    bestDay: last14.reduce((b, x) => x.q > b.q ? x : b, { q: 0, date: '', label: '' })
  };
}
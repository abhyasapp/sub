// js/features/insights.js — charts, pace, readiness, badges, leaderboard, per-file coverage.

window.INSIGHTS = {
  GOAL: 40,

  _safeMax(arr, fallback) {
    let m = fallback;
    for (let i = 0; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; }
    return m;
  },

  _bars(days){
    const W = 320, H = 120, padL = 4, padB = 18, padT = 8, n = days.length;
    const qvals = days.map(d => Number(d.q) || 0);
    const max = this._safeMax(qvals, this.GOAL);
    const bw = (W - padL * 2) / Math.max(n, 1), plotH = H - padB - padT;
    const y = v => padT + plotH - (v / max) * plotH;
    
    const bars = days.map((d, i) => {
      const q = Number(d.q) || 0;
      const h = Math.max(q ? 2 : 0, (q / max) * plotH), x = padL + i * bw + 2;
      const col = q >= this.GOAL ? 'var(--grn)' : q > 0 ? 'var(--accent)' : 'transparent';
      return `<rect x="${x.toFixed(1)}" y="${(padT + plotH - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col}" style="transition:height 0.5s ease-out, y 0.5s ease-out"${d.isToday ? ' opacity="1"' : ' opacity=".85"'}></rect>` +
        `<text x="${(x + (bw - 4) / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="8" fill="var(--t3)"${d.isToday ? ' font-weight="700"' : ''}>${String(d.label || '').charAt(0)}</text>`;
    }).join('');
    
    const gy = y(this.GOAL).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Questions answered per day over the last 14 days" style="overflow:visible">` +
      `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--t3)" stroke-width=".8" stroke-dasharray="3 3" opacity=".6"></line>` +
      `<text x="${W - 2}" y="${Number(gy) - 3}" text-anchor="end" font-size="8" fill="var(--t3)">goal ${this.GOAL}</text>` +
      bars + `</svg>`;
  },

  _line(points){
    if (points.length < 2) return '';
    const W = 320, H = 110, p = 10, n = points.length;
    const x = i => p + (i / (n - 1)) * (W - p * 2), y = v => p + (1 - v / 100) * (H - p * 2);
    const path = points.map((pt, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(pt.pct).toFixed(1)).join(' ');
    const dots = points.map((pt, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(pt.pct).toFixed(1)}" r="${i === n - 1 ? 4 : 2.5}" fill="${pt.pct >= 70 ? 'var(--grn)' : pt.pct >= 50 ? 'var(--amb)' : 'var(--ros)'}"></circle>`).join('');
    const py = y(70).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Score of your last ${n} sessions" style="overflow:visible">` +
      `<line x1="${p}" x2="${W - p}" y1="${py}" y2="${py}" stroke="var(--grn)" stroke-width=".8" stroke-dasharray="3 3" opacity=".6"></line>` +
      `<text x="${W - p}" y="${Number(py) - 3}" text-anchor="end" font-size="8" fill="var(--t3)">70% target</text>` +
      `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>` + dots + `</svg>`;
  },

  _strip(cells){
    const cols = 12, size = 14, gap = 3, W = cols * (size + gap), H = 7 * (size + gap);
    const out = cells.map((c, i) => {
      const col = Math.floor(i / 7), row = i % 7;
      const q = Number(c.q) || 0;
      const fill = c.active ? (q >= this.GOAL ? 'var(--grn)' : 'var(--accent)') : 'var(--t3)';
      return `<rect x="${col * (size + gap)}" y="${row * (size + gap)}" width="${size}" height="${size}" rx="3" fill="${fill}" opacity="${c.active ? '1' : '.18'}"><title>${c.date}${c.active ? ' \u2713' : ''}</title></rect>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:260px" role="img" aria-label="Study days over the last 12 weeks">${out}</svg>`;
  },

  _delta(label, cur, prev, unit){
    if (prev === null || cur === null) return `<div class="t-cap">${label}: <b>${cur === null ? '\u2014' : cur + unit}</b></div>`;
    const d = cur - prev, cls = d > 0 ? 'ok' : d < 0 ? 'low' : 'mid', arrow = d > 0 ? '\u25B2' : d < 0 ? '\u25BC' : '\u25AC';
    return `<div class="t-cap">${label}: <b>${cur}${unit}</b> <span class="pct ${cls}">${arrow} ${Math.abs(d)}${unit} vs last week</span></div>`;
  },

  render(){
    const box = $('insights-card');
    if (!box) return;
    const d = insightsData((S.prog && S.prog.sessions) || [], (S.stk && S.stk.days) || [], new Date());
    
    if (!d.recent.length && !d.activeDays12w) {
      box.innerHTML = `<div class="card-hd"><h3><i class="ph ph-chart-line-up"></i> Insights</h3></div>` +
        `<div class="empty"><p>Finish a quiz and your daily activity, score trend and study streak will appear here.</p></div>`;
      return;
    }
    
    requestAnimationFrame(() => {
      box.innerHTML =
        `<div class="card-hd"><h3><i class="ph ph-chart-line-up"></i> Insights</h3></div>` +
        `<div class="t-cap" style="margin-bottom:6px"><b>Questions per day</b> \u00b7 last 14 days</div>` + this._bars(d.last14) +
        `<div style="margin:10px 0 14px">` +
          this._delta('Questions this week', d.weekQuestions, d.prevWeekQuestions, '') +
          this._delta('Accuracy this week', d.accWeek, d.accPrev, '%') +
          `<div class="t-cap">Study time this week: <b>${d.weekMinutes >= 60 ? Math.floor(d.weekMinutes / 60) + ' h ' + (d.weekMinutes % 60) + ' min' : d.weekMinutes + ' min'}</b></div>` +
        `</div>` +
        (d.recent.length > 1 ? `<div class="t-cap" style="margin-bottom:6px"><b>Score trend</b> \u00b7 last ${d.recent.length} sessions</div>` + this._line(d.recent) : '') +
        `<div class="t-cap" style="margin:14px 0 6px"><b>Consistency</b> \u00b7 ${d.activeDays12w} study days in 12 weeks${d.streak ? ' \u00b7 \ud83d\udd25 ' + d.streak + '-day streak' : ''}</div>` + this._strip(d.cells);
    });
  }
};

window.PACE = {
  render(){
    const el = $('hs-time');
    if (!el || !el.parentElement) return;
    let pace = null;
    try { pace = PACE._compute(); } catch(e){}
    let line = el.parentElement.querySelector('.pace-line');
    if (!line) {
      line = document.createElement('span');
      line.className = 'pace-line';
      el.parentElement.appendChild(line);
    }
    if (!pace) { line.textContent = ''; return; }

    /* First run: "300 min behind your weekly pace" scolds someone who has not
       studied yet. An empty state should say how to start, not how far behind
       they are. */
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    if (!sessions.length) {
      line.innerHTML = ' \u00b7 <span class="on-track"><i class="ph ph-play-circle"></i> start your first session to set a pace</span>';
      return;
    }

    if (pace.onTrack) {
      line.innerHTML = ' \u00b7 <span class="on-track"><i class="ph ph-check-circle"></i> on pace for your target</span>';
    } else {
      const gap = Math.max(1, Math.round((pace.target - pace.actual) / 60));
      line.innerHTML = ' \u00b7 <span class="behind"><i class="ph ph-warning-circle"></i> ' + gap + ' min behind your weekly pace</span>';
    }
  },
  _compute(){
    /* A brand-new account has no history, so "behind pace" would be a scolding on day one. */
    if (!((S.prog && S.prog.sessions) || []).length) return null;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let actualSec = 0;
    ((S.prog && S.prog.sessions) || []).forEach(s => {
      if (s && Number(s.at) >= weekAgo) actualSec += (Number(s.durationSec) || 0);
    });
    let targetSec = 5 * 3600;
    try {
      const v = (typeof EXAM_DATE !== 'undefined' && EXAM_DATE.get) ? EXAM_DATE.get() : '';
      if (v) {
        const p = v.split('-').map(Number);
        const target = new Date(p[0], p[1] - 1, p[2]).getTime();
        if (!isNaN(target)) {
          const days = Math.max(1, Math.round((target - Date.now()) / 86400000));
          targetSec = Math.min(20 * 3600, Math.max(3 * 3600, (120 * 3600) / Math.max(7, days) * 7));
        }
      }
    } catch(e){}
    return { actual: actualSec, target: targetSec, onTrack: actualSec >= targetSec * 0.85 };
  }
};

window.READINESS = {
  render(){
    const card = $('readiness-card');
    if (!card) return;
    let p = null;
    try { p = (typeof PROG !== 'undefined' && PROG.predict) ? PROG.predict() : null; } catch(e){}
    if (!p || typeof p.predicted !== 'number' || isNaN(p.predicted)) { card.hidden = true; return; }
    card.hidden = false;
    const v = Math.max(0, Math.min(100, p.predicted));
    const cls = v >= 70 ? '' : v >= 50 ? 'warn' : 'low';
    const el = $('readiness-val');
    if (el) { el.textContent = v + '%'; el.className = 'readiness-val ' + cls; }
    const conf = $('readiness-conf');
    if (conf) conf.textContent = (p.confidence || 'Low') + ' confidence \u00b7 \u00b1 ' + (p.margin || 0) + '%';
    const fill = $('readiness-fill');
    if (fill) {
      fill.style.width = v + '%';
      fill.style.background = v >= 70 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)';
    }
    const det = $('readiness-detail');
    if (det) {
      const weakest = (typeof TODAY_PLAN !== 'undefined' && TODAY_PLAN._weakest) ? TODAY_PLAN._weakest(2) : [];
      if (weakest.length) {
        det.innerHTML = 'Focus on: ' +
          weakest.map(w => '<b>' + esc(w.chapter) + '</b> (' + w.accuracy + '%)').join(' \u00b7 ');
      } else {
        det.textContent = 'Complete a few more sessions for a sharper estimate.';
      }
    }
  }
};

window.BADGES_UI = {
  DEFS: [
    { id:'first_100',   icon:'ph-plant',     name:'First 100',  need:s => (s.prog.total||0) >= 100 },
    { id:'half_500',    icon:'ph-books',     name:'500 answered', need:s => (s.prog.total||0) >= 500 },
    { id:'streak_7',    icon:'ph-fire',      name:'7-day streak', need:() => STREAK.currentStreak() >= 7 },
    { id:'streak_30',   icon:'ph-mountains', name:'30-day streak', need:() => STREAK.currentStreak() >= 30 },
    { id:'perfect_exam',icon:'ph-medal',     name:'Perfect paper', need:s => (s.prog.sessions||[]).some(x => x && x.mode==='exam' && x.pct===100) },
    { id:'bookmark_50', icon:'ph-star',      name:'50 saved',     need:s => (s.bk||[]).length >= 50 },
    { id:'due_clear',   icon:'ph-target',    name:'Caught up',    need:() => S.wr && S.wr.length > 20 && REV.dueCount() === 0 }
  ],
  render(){
    const slot = $('badges-strip');
    if (!slot) return;
    if (!S.prog.badges) S.prog.badges = {};
    let changed = false;
    this.DEFS.forEach(d => {
      try {
        if (!S.prog.badges[d.id] && d.need(S)) {
          S.prog.badges[d.id] = new Date().toISOString().slice(0,10);
          changed = true;
        }
      } catch(e){}
    });
    if (changed) _save(LS.PROG, S.prog);
    const earned = this.DEFS.filter(d => S.prog.badges[d.id]).length;
    if (!earned && this.DEFS.length === 0) { slot.innerHTML = ''; return; }
    
    requestAnimationFrame(() => {
      slot.innerHTML =
        '<div class="card"><div class="card-hd"><h3><i class="ph ph-medal"></i> Achievements</h3>' +
          '<span class="t-cap">' + earned + ' / ' + this.DEFS.length + '</span></div>' +
          '<div tabindex="0" role="group" aria-label="Achievements" style="display:flex;gap:var(--sp-3);overflow-x:auto;padding-bottom:var(--sp-2)">' +
            this.DEFS.map(d => {
              const got = !!S.prog.badges[d.id];
              return '<div title="' + esc(d.name) + (got ? ' (earned)' : ' (locked)') + '" style="flex-shrink:0;width:82px;text-align:center">' +
                '<div style="font-size:1.5rem;opacity:' + (got ? 1 : 0.4) + ';color:' + (got ? 'var(--accent)' : 'var(--ink-3)') + '">' +
                  '<i class="ph ' + d.icon + '"></i></div>' +
                '<div class="t-cap" style="margin-top:2px;line-height:1.25">' + esc(d.name) + '</div>' +
              '</div>';
            }).join('') +
          '</div></div>';
    });
  }
};

window.WEEKLY_BOARD = {
  _cache: {},
  async _fetch(id){
    if (this._cache[id] !== undefined) return this._cache[id];
    if (!S.online || S.forcedOffline || !S.user || !S.user.token) {
      this._cache[id] = null;
      return null;
    }
    try {
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({ action:'getWeeklyStanding',
          username:S.user.username, token:S.user.token, weeklyId:id })
      }, 15000);
      const res = await r.json();
      const val = (res && res.success && res.ready && res.attempted) ? res : null;
      this._cache[id] = val;
      return val;
    } catch(e){ this._cache[id] = null; return null; }
  },
  async render(){
    const slot = $('weekly-board-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (typeof WEEKLY === 'undefined') return;

    const sets = WEEKLY.sets || [];
    const attempts = WEEKLY.attempts || {};
    const closed = sets.filter(s => s && s.released && !WEEKLY.examOpen(s) && attempts[s.id]);
    if (!closed.length) return;

    closed.sort((a,b) =>
      (attempts[b.id].submittedAt || 0) - (attempts[a.id].submittedAt || 0));
    const s = closed[0];
    const a = attempts[s.id];
    const st = a.standing || await this._fetch(s.id);
    if (!st || !st.rank) return;

    const pct = st.percentile || 0;
    const icon = pct >= 90 ? 'ph-trophy' : pct >= 75 ? 'ph-target' : pct >= 50 ? 'ph-thumbs-up' : 'ph-trend-up';
    const topPct = Math.max(1, 100 - pct);
    const beat = Math.max(0, st.total - st.rank);

    requestAnimationFrame(() => {
      slot.innerHTML =
        '<section class="card" style="border-color:var(--accent-line)">' +
          '<div class="card-hd"><h3><i class="ph ' + icon + '"></i> Weekly leaderboard</h3>' +
            '<span class="ctag ta">' + esc(s.title) + '</span></div>' +
          '<div class="stats-row" style="margin-bottom:var(--sp-3)">' +
            '<div class="scard"><div class="sv ta2">' + st.rank + '</div><div class="stat-lbl">Your rank</div></div>' +
            '<div class="scard"><div class="sv">' + st.total + '</div><div class="stat-lbl">Attempts</div></div>' +
            '<div class="scard"><div class="sv tcy">' + (a.pct || 0) + '%</div><div class="stat-lbl">Your score</div></div>' +
            '<div class="scard"><div class="sv">' + (st.avgPct || 0) + '%</div><div class="stat-lbl">Average</div></div>' +
          '</div>' +
          '<p class="t-foot">Top ' + topPct + '% of students. You beat ' + beat + ' of them.</p>' +
        '</section>';
    });
  }
};

window.SERVER_PROG = {
  _loaded:false, _loading:false, _sort:'most', _rows:[],

  SORT_LABEL:{ most:'Most done first', least:'Least done first', name:'A to Z' },

  toggleSort(){
    this._sort = this._sort === 'most' ? 'least' : this._sort === 'least' ? 'name' : 'most';
    const el = $('srv-sort-label'); if (el) el.textContent = this.SORT_LABEL[this._sort];
    this.render();
  },

  async load(force){
    const listEl = $('srv-list');
    if (!listEl) return;
    if (this._loaded && !force) { this.render(); return; }
    if (this._loading) return;
    this._loading = true;

    listEl.innerHTML = '<div class="sk-block"><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div><div class="skeleton sk-100"></div></div>';

    let online = true;
    try { online = (typeof S !== 'undefined' && S.online && !S.forcedOffline); } catch(e){}
    if (!online) {
      listEl.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-wifi-slash"></i></div>' +
        '<p>You are offline</p><p>This screen reads from your account, so it needs a connection.</p></div>';
      this._loading = false;
      return;
    }

    let backendUrl = '';
    try { backendUrl = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || (typeof APPS !== 'undefined' ? APPS : ''); } catch(e){}
    if (!backendUrl) {
      listEl.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>The backend address is not configured.</span></div>';
      this._loading = false;
      return;
    }

    try {
      const r = await fetch(backendUrl, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({ action:'getProgress', username:S.user.username, token:S.user.token })
      });
      const res = await r.json();
      if (!res || !res.success || !res.data) {
        listEl.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-tray"></i></div>' +
          '<p>Nothing recorded yet</p><p>Finish a quiz and your per-file coverage shows up here.</p></div>';
        this._loaded = true; this._loading = false;
        return;
      }
      this._compute(JSON.parse(res.data));
      this._loaded = true;
    } catch(e){
      listEl.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' +
        esc(e.message || 'Could not load your coverage.') +
        ' <button class="btn btn-sm btn-quiet" data-on-click="SERVER_PROG.load(true)">Try again</button></span></div>';
      this._loading = false;
      return;
    }
    this._loading = false;
    this.render();
  },

  _compute(data){
    const sessions = (data && data.prog && Array.isArray(data.prog.sessions)) ? data.prog.sessions : [];
    const byFile = new Map();
    sessions.forEach(sess => {
      if (!sess) return;
      (Array.isArray(sess.qres) ? sess.qres : []).forEach(q => {
        if (!q || !q.uid) return;
        const fid = typeof fidFromUid === 'function' ? fidFromUid(q.uid) : String(q.uid).replace(/_\d+$/, '');
        if (!byFile.has(fid)) byFile.set(fid, { fid, attempted:0, correct:0, wrong:0, practised:new Set() });
        const rec = byFile.get(fid);
        rec.attempted++;
        if (q.ok) rec.correct++; else rec.wrong++;
        rec.practised.add(q.uid);
      });
    });

    if (data && data.cov && typeof data.cov === 'object') {
      Object.keys(data.cov).forEach(fid => {
        const c = data.cov[fid];
        if (!c || typeof c !== 'object') return;
        const practised = new Set();
        String(c.p || '').split('').forEach((ch, i) => { if (ch !== '0') practised.add(fid + '_' + i); });
        const att = Number(c.a) || 0, cor = Number(c.c) || 0;
        byFile.set(fid, { fid, attempted: att, correct: cor, wrong: Math.max(0, att - cor), practised });
      });
    }
    const refMap = new Map();
    if (typeof ChapterData !== 'undefined') {
      ChapterData.allFileRefs().forEach(r => refMap.set(r.fid, r));
    }

    const rows = [];
    byFile.forEach(rec => {
      const found = refMap.get(rec.fid);
      const meta = found
        ? { lv:found.lv, ch:found.ch, book:found.book, subtopic:found.subtopic,
            name: ChapterData.chapterName(found.lv, found.ch) + ' — ' + found.book + ' — ' + found.subtopic }
        : { lv:'', ch:'', book:'', subtopic:'', name:rec.fid };
      const total = (typeof S !== 'undefined' && S.fcount && S.fcount[rec.fid]) || null;
      const practised = rec.practised.size;
      rows.push({ ...rec, practised, total, pct: total ? Math.round((practised / total) * 100) : null, ...meta });
    });
    this._rows = rows;
  },

  render(){
    const listEl = $('srv-list'), summaryEl = $('srv-summary'), levelSel = $('srv-filter-level');
    if (!listEl || !summaryEl) return;

    if (!this._rows.length) {
      listEl.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-tray"></i></div>' +
        '<p>Nothing recorded yet</p><p>Finish a quiz and your per-file coverage shows up here.</p></div>';
      summaryEl.innerHTML = '';
      return;
    }

    if (levelSel && levelSel.options.length <= 1 && typeof ChapterData !== 'undefined') {
      [...new Set(this._rows.map(r => r.lv).filter(Boolean))].sort().forEach(lv => {
        const o = document.createElement('option');
        o.value = lv; o.textContent = ChapterData.levelLabel(lv);
        levelSel.appendChild(o);
      });
    }

    const lvFilter = levelSel ? levelSel.value : '';
    const search = (($('srv-search') || {}).value || '').toLowerCase().trim();
    const onlyStarted = ($('srv-only-started') || {}).checked;

    let rows = this._rows.slice();
    if (lvFilter)    rows = rows.filter(r => r.lv === lvFilter);
    if (search)      rows = rows.filter(r => (r.name || '').toLowerCase().includes(search));
    if (onlyStarted) rows = rows.filter(r => r.practised > 0);

    if (this._sort === 'most')       rows.sort((a,b) => (b.pct ?? -1) - (a.pct ?? -1) || b.practised - a.practised);
    else if (this._sort === 'least') rows.sort((a,b) => (a.pct ?? 999) - (b.pct ?? 999) || a.practised - b.practised);
    else                             rows.sort((a,b) => (a.name || '').localeCompare(b.name || ''));

    const totalFiles = this._rows.length;
    const started = this._rows.filter(r => r.practised > 0).length;
    const done = this._rows.filter(r => r.pct !== null && r.pct >= 100).length;
    summaryEl.innerHTML =
      '<div class="sc"><div class="sv tcy">' + totalFiles + '</div><div class="stat-lbl">Files seen</div></div>' +
      '<div class="sc"><div class="sv ta2">' + started + '</div><div class="stat-lbl">Started</div></div>' +
      '<div class="sc"><div class="sv tc2">' + done + '</div><div class="stat-lbl">Finished</div></div>';

    if (!rows.length) {
      listEl.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-magnifying-glass"></i></div>' +
        '<p>Nothing matches</p><p>Try a shorter search, or clear the level filter.</p></div>';
      return;
    }

    requestAnimationFrame(() => {
      listEl.innerHTML = rows.map(r => {
        const pct = r.pct;
        const barColor = pct === null ? 'var(--sep-strong)' : pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--accent)' : 'var(--info)';
        const acc = r.attempted ? Math.round((r.correct / r.attempted) * 100) : 0;
        const chapter = r.ch && typeof ChapterData !== 'undefined' ? ChapterData.chapterName(r.lv, r.ch) : r.ch;
        return '<div class="srv-row">' +
          '<div class="srv-row-top">' +
            '<div class="grow">' +
              '<div class="srv-name">' + esc(r.subtopic || r.fid) + '</div>' +
              '<div class="srv-sub">' + esc(r.book || '') + (chapter ? ' · ' + esc(chapter) : '') + '</div>' +
            '</div>' +
            '<div class="right" style="flex-shrink:0">' +
              (pct === null
                ? '<span class="mono t-foot">' + r.practised + ' done</span>'
                : '<span class="mono" style="font-size:var(--fs-t3);font-weight:700">' + pct + '%</span>' +
                  '<div class="t-cap mono">' + r.practised + '/' + r.total + '</div>') +
            '</div>' +
          '</div>' +
          '<div class="pb"><div class="pb-f" style="width:' + (pct ?? Math.min(100, r.practised)) + '%;background:' + barColor + ';transition:width 0.4s ease-out"></div></div>' +
          '<div class="srv-meta">' +
            '<span>' + r.attempted + ' attempts</span>' +
            '<span style="color:var(--success)">' + r.correct + ' correct</span>' +
            '<span style="color:var(--danger)">' + r.wrong + ' missed</span>' +
            (r.attempted ? '<span>' + acc + '% accuracy</span>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    });
  }
};

window.CALENDAR = {
  DAYS: 91,
  _byDay(){
    const map = {};
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    sessions.forEach(s => {
      if (!s || !s.at) return;
      const d = new Date(s.at);
      if (isNaN(d.getTime())) return;
      const p = n => String(n).padStart(2, '0');
      const k = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
      map[k] = (map[k] || 0) + (Number(s.total) || 0);
    });
    return map;
  },
  render(){
    const box = document.getElementById('calendar-slot');
    if (!box) return;
    const byDay = this._byDay();
    if (!Object.keys(byDay).length) { box.innerHTML = ''; return; }
    const now = new Date();
    const cells = [];
    for (let i = this.DAYS - 1; i >= 0; i--){
      const d = new Date(now); d.setDate(d.getDate() - i);
      const p = n => String(n).padStart(2, '0');
      const k = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
      const n = byDay[k] || 0;
      const level = n === 0 ? 0 : n <= 5 ? 1 : n <= 15 ? 2 : n <= 30 ? 3 : 4;
      cells.push('<span class="cal-cell cal-' + level + '" title="' + esc(k) + ': ' + n + ' question' + (n === 1 ? '' : 's') + '"></span>');
    }
    let html = '';
    for (let i = 0; i < cells.length; i += 7){ html += '<div class="cal-week">' + cells.slice(i, i + 7).join('') + '</div>'; }
    const activeDays = Object.keys(byDay).length;
    
    requestAnimationFrame(() => {
      box.innerHTML =
        '<div class="card">' +
          '<div class="card-hd"><h3><i class="ph ph-calendar-check"></i> Study calendar</h3>' +
            '<span class="t-cap">' + activeDays + ' day' + (activeDays === 1 ? '' : 's') + ' studied</span></div>' +
          '<div class="cal-grid">' + html + '</div>' +
          '<div class="cal-legend"><span class="t-cap">Less</span>' +
            '<span class="cal-cell cal-0"></span><span class="cal-cell cal-1"></span>' +
            '<span class="cal-cell cal-2"></span><span class="cal-cell cal-3"></span>' +
            '<span class="cal-cell cal-4"></span><span class="t-cap">More</span></div>' +
        '</div>';
    });
  }
};

window.FORECAST = {
  render(){
    const box = document.getElementById('forecast-slot');
    if (!box) return;
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    const since = Date.now() - 14 * 86400000;
    const recent = sessions.filter(s => s && (Number(s.at) || 0) >= since);
    if (recent.length < 3){ box.innerHTML = ''; return; }
    const total = recent.reduce((n, s) => n + (Number(s.total) || 0), 0);
    const perDay = total / 14;
    if (perDay < 1){ box.innerHTML = ''; return; }
    const allRefs = (typeof ChapterData !== 'undefined') ? ChapterData.allFileRefs() : [];
    const cov = S.cov || {}, fcount = S.fcount || {};
    const levels = [['level7','Level 7'], ['level5','Level 5'], ['gk','GK']];
    const lines = [];
    for (const entry of levels){
      const lv = entry[0], label = entry[1];
      const refs = allRefs.filter(r => r.lv === lv);
      if (!refs.length) continue;
      let totalQ = 0, seen = 0, missing = 0;
      refs.forEach(r => {
        const n = fcount[r.fid];
        if (n == null){ missing++; return; }
        totalQ += n;
        const c = cov[r.fid];
        if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
      });
      if (missing > 0 || totalQ === 0) continue;
      const remaining = Math.max(0, totalQ - seen);
      const days = Math.ceil(remaining / perDay);
      if (!isFinite(days)) continue;
      lines.push({ label: label, seen: seen, totalQ: totalQ, remaining: remaining, days: days, target: new Date(Date.now() + days * 86400000) });
    }
    if (!lines.length){ box.innerHTML = ''; return; }
    
    requestAnimationFrame(() => {
      box.innerHTML =
        '<div class="card">' +
          '<div class="card-hd"><h3><i class="ph ph-trend-up"></i> At this pace</h3></div>' +
          '<p class="t-foot" style="margin-bottom:var(--sp-3);line-height:1.55">Based on the last 14 days \u2014 about <b>' + perDay.toFixed(1) + ' questions a day</b>.</p>' +
          lines.map(function(l){
            return '<div class="fc-line"><b>' + esc(l.label) + '</b> \u2014 ' + l.seen + ' of ' + l.totalQ + ' seen. ' +
              (l.remaining === 0
                ? '<span style="color:var(--success);font-weight:700">Complete</span>'
                : 'Finish in <b>' + l.days + ' day' + (l.days === 1 ? '' : 's') + '</b> <span class="t-foot">(' + l.target.toLocaleDateString() + ')</span>') + '</div>';
          }).join('') +
        '</div>';
    });
  }
};

window.DIGEST = {
  render(){
    const boxes = [
      document.getElementById('digest-slot-2'),
      document.getElementById('digest-slot')
    ].filter(Boolean);
    if (!boxes.length) return;

    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    const since = Date.now() - 7 * 86400000;
    const recent = sessions.filter(s => s && (Number(s.at) || 0) >= since);

    if (recent.length < 2){
      boxes.forEach(b => { b.innerHTML = ''; });
      return;
    }

    let answered = 0, correct = 0;
    const dayCount = {}, chapMiss = {};
    recent.forEach(function(s){
      answered += Number(s.total) || 0;
      correct += Number(s.correct) || 0;
      const k = new Date(s.at).toDateString();
      dayCount[k] = (dayCount[k] || 0) + (Number(s.total) || 0);
      const c = s.chapter || 'Other';
      chapMiss[c] = (chapMiss[c] || 0) + ((Number(s.total) || 0) - (Number(s.correct) || 0));
    });
    const pct = answered ? Math.round((correct / answered) * 100) : 0;
    const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
    const worstChapter = Object.entries(chapMiss).sort((a, b) => b[1] - a[1])[0];

    requestAnimationFrame(() => {
      const html =
        '<div class="card">' +
          '<div class="card-hd"><h3><i class="ph ph-chart-bar"></i> This week</h3>' +
            '<span class="ctag ta">last 7 days</span></div>' +
          '<div class="g4" style="margin-bottom:var(--sp-3)">' +
            '<div class="sc"><div class="sv tcy">' + answered + '</div><div class="stat-lbl">Answered</div></div>' +
            '<div class="sc"><div class="sv ' + (pct >= 70 ? 'tc2' : pct >= 50 ? 'ta2' : 'tb2') + '">' + pct + '%</div><div class="stat-lbl">Accuracy</div></div>' +
            '<div class="sc"><div class="sv">' + recent.length + '</div><div class="stat-lbl">Sessions</div></div>' +
            '<div class="sc"><div class="sv">' + Object.keys(dayCount).length + '</div><div class="stat-lbl">Active days</div></div>' +
          '</div>' +
          (bestDay ? '<div class="t-foot">Best day: <b>' + esc(bestDay[0]) + '</b> (' + bestDay[1] + ' answered)</div>' : '') +
          (worstChapter && worstChapter[1] > 0 ? '<div class="t-foot" style="margin-top:2px">Needs work: <b>' + esc(worstChapter[0]) + '</b> (' + worstChapter[1] + ' missed)</div>' : '') +
        '</div>';

      boxes.forEach(b => { b.innerHTML = html; });
    });
  }
};

window.HARDEST20 = {
  COUNT: 20,
  async build(){
    if (!QSEARCH._index) await QSEARCH._build();
    const list = QSEARCH._index || [];
    if (!list.length) return [];
    const scored = [];
    for (let i = 0; i < list.length; i++){
      const q = list[i];
      const hist = QHIST.forUid(q.uid);
      if (!hist || hist.seen < 2) continue;
      const rate = hist.correct / hist.seen;
      if (rate >= 0.7) continue;
      scored.push({ q: q, miss: WRONGBY.missCount(q.uid), rate: rate });
    }
    scored.sort(function(a, b){
      if (b.miss !== a.miss) return b.miss - a.miss;
      return a.rate - b.rate;
    });
    return scored.slice(0, this.COUNT).map(function(x){ return x.q; });
  },
  async start(){
    QUIZ._showLoader('Finding your hardest questions\u2026');
    let picked = [];
    try { picked = await this.build(); } catch(e){}
    QUIZ._hideLoader();
    if (!picked.length){ toast('Practice a few chapters first \u2014 then this drills the ones you keep missing.', 5000); return; }
    QUIZ.startWith(picked, 'flashcard', '\ud83c\udfaf Your hardest ' + picked.length, { sessionKind: 'drill' });
  }
};
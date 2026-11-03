// js/core/router.js — the ONE view dispatcher. Every feature registers
// itself with UI.onEnter / UI.onEnterAny instead of wrapping _goRaw.

const UI = {
  cur: 'home',
  ALIAS: { 'subjective': 'subj-qotd', 'heatmap': 'progress', 'server-progress': 'progress' },
  _enter: {},
  _leave: {},
  _enterAny: [],
  
  onEnter(view, fn) { 
    (UI._enter[view] = UI._enter[view] || []).push(fn); 
  },
  onLeave(view, fn) {
    (UI._leave[view] = UI._leave[view] || []).push(fn);
  },
  onEnterAny(fn) { 
    UI._enterAny.push(fn); 
  },
  
  _goRaw(v) {
    v = UI.ALIAS[v] || v;
    const prev = UI.cur;

    // 1. Fire cleanup hooks for the view we are leaving
    if (prev && prev !== v) {
      (UI._leave[prev] || []).forEach(fn => { 
        try { fn(prev, v); } catch (e) { console.error('leave hook failed for', prev, e); } 
      });
    }

    // 2. Hide all views and show the new one
    const qw = document.getElementById('quiz-wrap');
    if (qw) qw.style.display = 'none';
    
    document.querySelectorAll('.view').forEach(e => e.classList.remove('on'));
    const el = document.getElementById('view-' + v);
    if (el) el.classList.add('on');
    
    // 3. Update sidebar active state
    document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
    const ni = document.getElementById('nav-' + v);
    if (ni) ni.classList.add('active');
    if (typeof NAV !== 'undefined' && NAV.reveal) NAV.reveal(v);

    // 4. Cleanup specific global timers
    if (UI.cur === 'home' && v !== 'home' && typeof HOME !== 'undefined' && HOME._clockTimer) { 
      clearInterval(HOME._clockTimer); HOME._clockTimer = null; 
    }
    if (UI.cur === 'timetable' && v !== 'timetable' && typeof TT !== 'undefined' && TT._clockTimer) { 
      clearInterval(TT._clockTimer); TT._clockTimer = null; 
    }

    UI.cur = v;
    UI._syncViewTitle(v, el);
    UI.sidebarClose();
    
    const mainEl = document.getElementById('main');
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo(0, 0);

    // 5. Trigger render functions for the new view
    try {
      ({
        home:       () => typeof HOME !== 'undefined' && HOME.render(),
        progress:   () => { 
                      if (typeof PROG !== 'undefined') PROG.render(); 
                      if (typeof PUSH !== 'undefined') PUSH.refreshButtonUI(); 
                    },
        qna:        () => typeof QNA !== 'undefined' && QNA.load(),
        online:     () => typeof ONPROG !== 'undefined' && ONPROG.render(),
        offline:    () => typeof CACHE !== 'undefined' && CACHE.render(),
        bookmarks:  () => typeof REV !== 'undefined' && REV.renderList('bk'),
        wrong:      () => typeof REV !== 'undefined' && REV.renderList('wr'),
        timetable:  () => typeof TT !== 'undefined' && TT.render(),
        psycho:     () => typeof PSY !== 'undefined' && PSY.init()
      })[v]?.();
    } catch (err) {
      console.error('[router] render failed for', v, err);
    }

    // 6. Fire enter hooks
    (UI._enter[v] || []).forEach(fn => { 
      try { fn(v); } catch (e) { console.error('enter hook failed for', v, e); } 
    });
    UI._enterAny.forEach(fn => { 
      try { fn(v); } catch (e) { console.error('enter-any hook failed', e); } 
    });
  },

  /* One <h1> per screen: Home has its own greeting; every other screen gets a visually-hidden title. */
  _VIEW_TITLES: {
    home: 'Home', sprint: '60-day sprint', weekly: 'Weekly test', hourly: 'Hourly challenge', 'subj-qotd': 'Question of the day',
    'subj-mine': 'My submissions', studydocs: 'Model answers and notes', qna: 'Questions and answers', 'subj-exam': 'Full paper', 'subj-list': 'Browse questions',
    online: 'Chapters', local: 'Local files', psycho: 'Mixed practice', bookmarks: 'Saved questions', wrong: 'Wrong bank',
    progress: 'Progress', offline: 'Offline downloads', data: 'Data and backup', timetable: 'Study timetable',
  },
  _syncViewTitle(v, el) {
    const h = document.getElementById('view-title');
    if (!h) return;
    const own = el && el.querySelector('h1');
    h.textContent = UI._VIEW_TITLES[v] || 'Abhyas';
    h.hidden = !!own;
  },

  go(v) {
    const qw = document.getElementById('quiz-wrap');
    if (S.quiz.active && qw && qw.style.display !== 'none') {
      QUIZ._exitGuard(() => UI._goRaw(v));
      return;
    }
    UI._goRaw(v);
  },
  
  sidebarToggle() {
    const sb = document.getElementById('sb');
    const ov = document.getElementById('ov');
    if (sb) sb.classList.toggle('open');
    if (ov) ov.classList.toggle('show');
  },
  
  sidebarClose() {
    const sb = document.getElementById('sb');
    const ov = document.getElementById('ov');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('show');
  },
  
  theme() {
    document.body.classList.toggle('dark');
    _save('abhyas_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  }
};

window.UI = UI;
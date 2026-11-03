// js/features/shell-hooks.js — the wiring at the bottom of user-page.js:
// screen hooks, touch/keyboard/hash listeners, DOM observers, perf coalesce.

(function shellHooks() {
  if (typeof UI === 'undefined') return;

  /* ── Small helpers used by the hooks ── */
  function _updateBottomNav(v) {
    document.querySelectorAll('.bn-item').forEach(e => e.classList.remove('active'));
    const b = document.getElementById(NAV.tabForView(v));
    if (b) b.classList.add('active');
  }
  
  function _setAdminVisible(v) {
    ['tb-admin-btn', 'sb-admin-promo', 'bn-admin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = !v;
    });
  }
  window._setAdminVisible = _setAdminVisible;
  
  function _populateChapterFilter() {
    const sel = document.getElementById('subj-list-chapter');
    if (!sel || sel.options.length > 1) return;
    const refs = (window.SUBJECTIVE_FILE_REFS || []).filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));
    refs.forEach(r => {
      const o = document.createElement('option');
      o.value = r.chapterId;
      o.textContent = r.name;
      sel.appendChild(o);
    });
  }

  /* ── Global hooks ── */
  UI.onEnterAny(v => { 
    _updateBottomNav(v); 
    if (typeof BN !== 'undefined') BN.close(); 
    setTimeout(() => { try { _refreshHints(); } catch (e) {} }, 50); 
  });
  
  UI.onEnter('online',   () => { if (typeof CH_GRID !== 'undefined') CH_GRID.render(); });
  
  UI.onEnter('weekly',   () => {
    if (typeof WEEKLY === 'undefined') return;
    if (typeof WEEKLY._renderHomeCard === 'function') WEEKLY._renderHomeCard();
    const outer = document.getElementById('weekly-sets-outer'), empty = document.getElementById('weekly-empty');
    if (outer && empty) empty.style.display = (outer.style.display === 'none') ? '' : 'none';
  });
  
  UI.onEnter('subj-mine', () => { if (typeof MY_SUBJ !== 'undefined') MY_SUBJ.load(false); });
  
  ['subj-qotd', 'subj-exam', 'subj-list'].forEach(view => UI.onEnter(view, () => {
    if (typeof SUBJ !== 'undefined') {
      if (typeof SUBJ.ready === 'function' && SUBJ.ready()) {
        if (typeof SUBJ._renderQotd === 'function') SUBJ._renderQotd();
        if (typeof SUBJ._renderExam === 'function') SUBJ._renderExam();
        if (typeof SUBJ._renderList === 'function') SUBJ._renderList();
      } else if (typeof SUBJ.init === 'function') SUBJ.init();
    }
    if (view === 'subj-exam') setTimeout(() => { if (typeof SUBJ_BUILDER !== 'undefined') { SUBJ_BUILDER._populate(); SUBJ_BUILDER._updateCooldownUI(); } }, 80);
    if (view === 'subj-list') setTimeout(_populateChapterFilter, 80);
  }));
  
  UI.onEnter('progress', () => { if (typeof CLOUD_UI !== 'undefined' && CLOUD_UI.render) setTimeout(CLOUD_UI.render, 0); });
  
  ['home', 'progress'].forEach(view => UI.onEnter(view, () => { if (typeof APP_SWITCH !== 'undefined') APP_SWITCH.refresh(); }));
  
  UI.onEnter('studydocs', () => STUDYDOCS.load(false));
  UI.onEnterAny(v => { if (v !== 'studydocs' && typeof STUDYDOCS !== 'undefined') STUDYDOCS.chapter = ''; });
  UI.onEnter('data', () => { if (typeof RECOVER !== 'undefined') RECOVER.render(); });
  
  // Hourly hooks
  UI.onEnter('hourly', () => setTimeout(() => { try { HOURLY.mount(); } catch (e) {} }, 30));
  UI.onLeave('hourly', () => { try { HOURLY.unmount(); } catch (e) {} });

  /* ── Touch swipe to open the sidebar ── */
  let _tx = 0, _ty = 0;
  document.addEventListener('touchstart', e => { _tx = e.touches[0].clientX; _ty = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _tx;
    const dy = Math.abs(e.changedTouches[0].clientY - _ty);
    if (_tx < 22 && dx > 60 && dy < 70) UI.sidebarToggle();
  }, { passive: true });

  /* ── Keyboard: `/` and `?` and Escape ── */
  document.addEventListener('keydown', e => {
    try {
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
      const modOpen = document.querySelector('.mbg.show');
      if (!typing && !modOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '/') { e.preventDefault(); if (typeof QSEARCH !== 'undefined') QSEARCH.open(); return; }
        if (e.key === '?') { e.preventDefault(); if (typeof KEYSHEET !== 'undefined') KEYSHEET.open(); return; }
      }
    } catch (err) {}
    if (e.key === 'Escape') {
      if (typeof BN !== 'undefined' && BN._activeKey) { BN.close(); return; }
      const mb = document.getElementById('mbg');
      if (mb && mb.classList.contains('show')) { closeMod(); return; }
      if (document.getElementById('sb') && document.getElementById('sb').classList.contains('open')) { UI.sidebarClose(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && S.quiz?.active && S.quiz?.mode !== 'exam') {
      e.preventDefault();
      if (typeof SRCH !== 'undefined' && SRCH.quickSearch) SRCH.quickSearch();
    }
  });

  /* ── The hash route (index.html#offline etc.) ── */
  (function hashRouter() {
    const MAP = {
      home: 'home', offline: 'offline', downloads: 'offline', progress: 'progress',
      subjective: 'subj-qotd', written: 'subj-qotd', weekly: 'weekly',
      chapters: 'online', wrong: 'wrong', bookmarks: 'bookmarks'
    };
    function applyHash() {
      const key = String(location.hash || '').replace(/^#/, '').toLowerCase();
      const view = MAP[key];
      if (view && typeof UI !== 'undefined' && UI.go) UI.go(view);
    }
    window.addEventListener('hashchange', applyHash);
    if (!location.hash) return;
    let tries = 0;
    (function wait() {
      const app = document.getElementById('app');
      if (app && app.classList.contains('on')) { applyHash(); return; }
      if (++tries < 80) setTimeout(wait, 250);
    })();
  })();

  /* ── Image zoom (question figures) ── */
  document.addEventListener('click', function (e) {
    const img = e.target.closest && e.target.closest('.qcard img, #fc-img-wrap img, #ex-qs img, #res-review img');
    if (!img) return;
    if (img.classList.contains('avatar') || img.closest('.bd-mark') || img.closest('.img-fullscreen')) return;
    if ((img.naturalWidth || 0) < 200) return;
    e.preventDefault();
    IMGZOOM.open(img.src, img.alt);
  });

  const _figureObserver = new MutationObserver(() => {
    document.querySelectorAll('.qcard img, #fc-img-wrap img, #ex-qs img, #res-review img').forEach(img => {
      if (!img.classList.contains('question-figure') && !img.classList.contains('avatar')) {
        img.classList.add('question-figure');
      }
    });
  });
  _figureObserver.observe(document.body, { childList: true, subtree: true });

  /* ── Copy-explanation button ── */
  function _decorateExplanations() {
    document.querySelectorAll('.expl.show').forEach(el => {
      if (el.querySelector('.expl-copy')) return;
      const text = el.textContent.trim();
      if (!text) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'expl-copy ib';
      btn.style.cssText = 'width:26px;height:26px;border-radius:6px;background:var(--surface);color:var(--ink-3);border:1px solid var(--sep)';
      btn.title = 'Copy this explanation';
      btn.setAttribute('aria-label', 'Copy this explanation');
      btn.innerHTML = '<i class="ph ph-copy"></i>';
      btn.addEventListener('click', e => { e.stopPropagation(); COPY_EXPL.copy(text, btn); });
      el.insertBefore(btn, el.firstChild);
    });
  }
  new MutationObserver(() => { try { _decorateExplanations(); } catch (e) {} })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ── Progress tabs ── */
  (function progressTabs() {
    const TABS = ['accuracy', 'heatmap', 'coverage'];
    const bar = document.getElementById('prog-tabs');
    if (!bar) return;
    function show(name) {
      if (TABS.indexOf(name) === -1) name = 'accuracy';
      bar.querySelectorAll('button').forEach(b => {
        const on = b.dataset.tab === name;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      TABS.forEach(t => {
        const el = document.getElementById('prog-tab-' + t);
        if (el) el.hidden = (t !== name);
      });
      try {
        if (name === 'heatmap' && typeof HEATMAP !== 'undefined') HEATMAP.render();
        if (name === 'coverage' && typeof SERVER_PROG !== 'undefined') SERVER_PROG.load(false);
        if (name === 'accuracy') {
          if (typeof PROG !== 'undefined' && typeof PROG.render === 'function') PROG.render();
          if (typeof INSIGHTS !== 'undefined') INSIGHTS.render();
        }
      } catch (e) { console.warn('[progress tabs] render failed:', e); }
    }
    bar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(() => show(btn.dataset.tab), 0));
    });
    try {
      if (typeof PROG !== 'undefined' && typeof PROG.tab === 'function' && !PROG.tab.__wired) {
        const orig = PROG.tab.bind(PROG);
        PROG.tab = function (name) {
          const r = orig(name);
          try { setTimeout(() => show(name), 0); } catch (e) {}
          return r;
        };
        PROG.tab.__wired = true;
      }
    } catch (e) {}
    UI.onEnter('progress', () => {
      setTimeout(() => {
        const active = bar.querySelector('button.active');
        show((active && active.dataset.tab) || 'accuracy');
      }, 80);
    });
    let tries = 0;
    (function settle() {
      const ready = typeof HEATMAP !== 'undefined' && typeof SERVER_PROG !== 'undefined';
      if (!ready && ++tries < 20) return setTimeout(settle, 250);
      const active = bar.querySelector('button.active');
      show((active && active.dataset.tab) || 'accuracy');
    })();
  })();

  /* ── Perf coalesce: HOME.render and HOME.updateBadges ── */
  (function coalesceHomeRenders() {
    try {
      if (typeof HOME === 'undefined' || typeof frameThrottle !== 'function') return;
      ['render', 'updateBadges'].forEach(k => {
        if (typeof HOME[k] === 'function' && !HOME[k].__throttled) {
          const t = frameThrottle(HOME[k].bind(HOME));
          t.__throttled = true;
          HOME[k] = t;
        }
      });
    } catch (e) { console.error('perf coalescing skipped:', e); }
  })();

  /* ── First paint — _refreshHints lives in home-ui.js ── */
  setInterval(() => { try { _refreshHints(); } catch (e) {} }, 30000);
  let _lastHintAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - _lastHintAt > 3000) { _lastHintAt = now; _refreshHints(); }
      if (UI.cur === 'subj-mine' && typeof MY_SUBJ !== 'undefined' && MY_SUBJ._loaded) MY_SUBJ.load(true);
    }
  });
  setTimeout(() => { try { _refreshHints(); } catch (e) {} }, 800);
})();
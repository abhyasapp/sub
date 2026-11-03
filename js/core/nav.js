/* ═══════════════════════════════════════════════════════════════════════
   js/core/nav.js — the ONE definition of the student app's navigation.

   Adapted for the v1.46 split:
     • data-on-click= instead of onclick= (dispatched by js/core/actions.js)
     • esc / escAttrJs come from js/core/text.js — no local copies

   LOAD ORDER:
     AFTER  js/core/text.js   (esc, escAttrJs)
     AFTER  js/core/router.js (UI, only at click time)
     AFTER  the #sb-nav and .pg-head[data-head] elements exist in the DOM
     BEFORE js/features/shell-ui.js   (BN.open reads NAV.sheet)
     BEFORE js/features/shell-hooks.js (reads NAV.tabForView)
     BEFORE js/features/boot.js / app.js

   Classic script, no modules. Requires an IIFE for closure.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* i18n.js may load after this file on a cold cache. Translate at render
     time (not at definition time) so switching language re-renders cleanly. */
  const T = s => (typeof I18N !== 'undefined' ? I18N.t(s) : s);

  /* ───────────────────────── Page headers ──────────────────────────── */
  /* One entry per view: sidebar + phone-sheet + page header all read this. */
  const HEADS = {
    studydocs:  { icon: 'ph-file-pdf',        label: 'Model answers & notes',   text: 'PDFs your teacher added: model answers for written questions, notes and past papers. Opened ones work offline.' },
    qna:        { icon: 'ph-text-columns',     label: 'Questions & answers',     text: 'One PDF per question: the question, its worked solution and the mistake to avoid. Pick a chapter or topic, or search the question.' },
    weekly:     { icon: 'ph-calendar-check',  label: 'Weekly test',             text: 'A new set unlocks on schedule and stays open for a limited window. You get one attempt; after that you can review your answers.' },
    hourly:     { icon: 'ph-clock-countdown', label: 'Hourly challenge',        text: 'A fresh written question and a 50-question sprint, reset at the top of every hour. Pick your level to begin.' },
    'subj-qotd':{ icon: 'ph-sun-horizon',     label: 'Question of the day',     text: 'Everyone gets the same question. Write it on paper against the clock, then photograph your answer and upload it as one PDF.' },
    'subj-mine':{ icon: 'ph-file-text',       label: 'My submissions',           text: "Everything you've sent for marking — with the PDF you uploaded, the score once it's marked, and any note from the marker." },
    'subj-exam':{ icon: 'ph-note-pencil',     label: 'Full paper',               text: "A complete 100-mark paper, three hours, uploaded as a single PDF when you're done." },
    'subj-list':{ icon: 'ph-list-dashes',     label: 'Browse questions',         text: 'Every written question in the bank, grouped by chapter and topic.' },
    online:     { icon: 'ph-books',           label: 'Chapters',                 text: 'Pick a chapter, then a set of questions. Anything you open is saved to this device for offline study.' },
    sprint:     { icon: 'ph-rocket',          label: '60-day sprint',            text: 'A structured 60-day plan with daily targets — new topics, reviews and drills — plus an exam date to track your pace against.' },
    local:      { icon: 'ph-folder-open',     label: 'Open a file',              text: 'Load a question bank saved on this device. Works with no connection at all.' },
    psycho:     { icon: 'ph-lightning',       label: 'Mixed practice',           text: 'Draw from several chapters at once — closer to what the real paper feels like.' },
    bookmarks:  { icon: 'ph-star',            label: 'Saved',                    text: 'Questions you starred to come back to.' },
    wrong:      { icon: 'ph-target',          label: 'Weak spots',               text: 'Your missed questions, grouped four ways. Due now is the default — nothing else needs your attention today.' },
    progress:   { icon: 'ph-chart-bar',       label: 'Your progress',            text: 'Accuracy, heatmap and coverage in one place. Switch tabs to change the view.' },
    offline:    { icon: 'ph-download-simple', label: 'Downloads',                text: 'Save question sets to this device so they open during load-shedding or with no signal.' },
    data:       { icon: 'ph-floppy-disk',     label: 'Backup',                   text: 'Save everything on this device to a file, or load one back.' },
    timetable:  { icon: 'ph-calendar-blank',  label: 'Study plan',               text: "Block out when you'll study, and get a nudge just before each session." }
  };

  /* ───────────────────────────── Groups ────────────────────────────── */
  /* kind:'count' → numeric badge (id kept so HOME.updateBadges() can fill it)
     kind:'hint'  → second line under the label (filled by SB_HINTS / WEEKLY) */
  const GROUPS = [
    { key: 'practice', label: 'Practice', tab: 'study', items: [
      { view: 'online', sub: 'Work through a subtopic' },
      { view: 'sprint', sub: 'Daily targets to exam day' },
      { view: 'psycho', sub: 'Several chapters at once' },
      { view: 'hourly', sub: "This hour's set",    hint: { id: 'hourly-hint', text: "This hour's set" }, badge: { id: 'hourly-badge', cls: 'amb', text: 'New',  hidden: true } },
      { view: 'weekly', sub: 'One graded attempt', hint: { id: 'weekly-hint', text: 'No sets yet' },      badge: { id: 'weekly-badge', cls: 'amb', text: 'Live', hidden: true } }
    ]},
    { key: 'written', label: 'Written answers', tab: 'subjective', items: [
      { view: 'subj-qotd', sub: 'Timed write, then upload',       hint:  { id: 'subj-qotd-hint', text: 'Tap to begin' },           badge: { id: 'subj-qotd-badge', cls: 'amb', text: 'New', hidden: true } },
      { view: 'subj-exam', sub: '100 marks, three hours' },
      { view: 'subj-list', sub: 'The whole written bank' },
      { view: 'studydocs', sub: 'PDFs from your teacher',           count: { id: 'sdc', cls: 'ok', hidden: true } },
      { view: 'qna', sub: 'One PDF per question' },
      { view: 'subj-mine', sub: 'What you sent, and your score',    hint:  { id: 'subj-mine-hint', text: 'Nothing submitted yet' }, badge: { id: 'subj-mine-badge', cls: '', text: '0', hidden: true } }
    ]},
    { key: 'review', label: 'Review', tab: 'progress', items: [
      { view: 'wrong',     label: 'Weak spots', icon: 'ph-target', sub: 'What to work on next', count: { id: 'wrc', cls: '' } },
      { view: 'bookmarks', sub: 'Starred for later',              count: { id: 'bkc', cls: 'ok' } }
    ]},
    { key: 'progress', label: 'Progress & plan', tab: 'progress', items: [
      { view: 'progress',  sub: 'Accuracy, heatmap, coverage' },
      { view: 'timetable', sub: 'When you plan to study' }
    ]},
    { key: 'tools', label: 'Tools', tab: 'more', items: [
      { view: 'offline',  sub: 'Save sets for offline' },
      { view: 'local',    sub: 'A question bank you have' },
      { view: 'data',     sub: 'Export or restore a file' },
      { view: 'tutorial', label: 'How this works', icon: 'ph-question', sub: 'A short tour', special: 'tutorial' }
    ]}
  ];

  /* Phone bottom bar: one tab per `tab` value, plus Home (handled in HTML). */
  const TABS = {
    study:      { title: 'Practice',          icon: 'ph-books' },
    subjective: { title: 'Written answers',   icon: 'ph-note-pencil' },
    progress:   { title: 'Review & progress', icon: 'ph-chart-bar' },
    more:       { title: 'Tools',             icon: 'ph-dots-three' }
  };

  const HOME = { view: 'home', label: 'Home', icon: 'ph-house' };

  /* esc and escAttrJs are globals from js/core/text.js.
     Do NOT redeclare them here. */

  /* Fill label/icon from HEADS so each screen's words live in one place. */
  GROUPS.forEach(g => g.items.forEach(it => {
    const h = HEADS[it.view] || {};
    it.label = it.label || h.label || it.view;
    it.icon  = it.icon  || h.icon  || 'ph-circle';
  }));

  const ALL = GROUPS.reduce(
    (a, g) => a.concat(g.items.map(it => Object.assign({ group: g.key, tab: g.tab }, it))),
    []
  );

  /* ─────────────────────── Sidebar item markup ─────────────────────── */
  function itemHtml(it) {
    const go = it.special === 'tutorial'
      ? 'TUTORIAL.open()'
      : 'UI.go(\'' + escAttrJs(it.view) + '\')';
    const ic = '<span class="sb-ic"><i class="ph ' + esc(it.icon) + '"></i></span>';
    const open = '<button type="button" class="sb-item" id="nav-' + esc(it.view) + '" data-on-click="' + go + '">';

    if (it.hint) {
      const b = it.badge
        ? '<span class="sb-badge ' + esc(it.badge.cls) + '" id="' + esc(it.badge.id) + '"' + (it.badge.hidden ? ' hidden' : '') + '>' + esc(it.badge.text) + '</span>'
        : '';
      return open + ic + '<span class="grow"><span style="display:flex;align-items:center;gap:.35rem">' + esc(T(it.label)) + b +
        '</span><span class="sb-sub" id="' + esc(it.hint.id) + '">' + esc(it.hint.text) + '</span></span></button>';
    }

    const c = it.count
      ? '<span class="sb-badge ' + esc(it.count.cls) + '" id="' + esc(it.count.id) + '"' + (it.count.hidden ? ' hidden' : '') + '>0</span>'
      : '';
    return open + ic + esc(T(it.label)) + c + '</button>';
  }

  /* ─────────────────── Collapsed groups (per device) ───────────────── */
  const COLLAPSE_KEY = 'abhyas_sb_collapsed';
  function loadCollapsed() {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') return o; }
    } catch (e) {}
    return { tools: true };
  }
  function saveCollapsed(o) {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(o)); } catch (e) {}
  }

  /* ─────────────────────── Render the sidebar ──────────────────────── */
  function renderSidebar() {
    const box = document.getElementById('sb-nav');
    if (!box) return;
    const collapsed = loadCollapsed();
    const homeBtn =
      '<div class="sb-sec"><button type="button" class="sb-item active" id="nav-home" data-on-click="UI.go(\'home\')">' +
        '<span class="sb-ic"><i class="ph ' + HOME.icon + '"></i></span>' + esc(T(HOME.label)) +
      '</button></div>';

    box.innerHTML = homeBtn + GROUPS.map(g => {
      const shut = !!collapsed[g.key];
      return '<div class="sb-sec' + (shut ? ' shut' : '') + '" data-group="' + esc(g.key) + '">' +
        '<button type="button" class="sb-lbl sb-lbl-btn" aria-expanded="' + (!shut) + '" data-on-click="NAV.toggle(\'' + escAttrJs(g.key) + '\')">' +
          '<span>' + esc(T(g.label)) + '</span><i class="ph ph-caret-down sb-caret" aria-hidden="true"></i>' +
        '</button>' +
        '<div class="sb-items">' + g.items.map(itemHtml).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  function toggle(key) {
    const sec = document.querySelector('#sb-nav .sb-sec[data-group="' + key + '"]');
    if (!sec) return;
    const shut = !sec.classList.contains('shut');
    sec.classList.toggle('shut', shut);
    const b = sec.querySelector('.sb-lbl-btn');
    if (b) b.setAttribute('aria-expanded', String(!shut));
    const c = loadCollapsed(); c[key] = shut; saveCollapsed(c);
  }

  /* Called by UI.go: make sure the group that owns this screen is open. */
  function reveal(view) {
    const it = ALL.find(x => x.view === view);
    if (!it) return;
    const sec = document.querySelector('#sb-nav .sb-sec[data-group="' + it.group + '"]');
    if (sec && sec.classList.contains('shut')) toggle(it.group);
  }

  /* ─────────────────── Render the page headers ─────────────────────── */
  function renderHeads(root) {
    (root || document).querySelectorAll('.pg-head[data-head]').forEach(el => {
      const h = HEADS[el.getAttribute('data-head')];
      if (!h) return;
      /* HEADS is trusted, repo-authored text. */
      el.innerHTML = '<h2><i class="ph ' + esc(h.icon) + '"></i> ' + esc(T(h.label)) + '</h2><p>' + h.text + '</p>';
    });
  }

  /* ─────────────────── Phone bottom-nav sheet ─────────────────────── */
  /* Shape matches what shell-ui.js BN.open() reads:
       { title, icon, sections: [{ label, items: [...] }] } */
  function sheet(tab) {
    const t = TABS[tab];
    if (!t) return null;
    const gs = GROUPS.filter(g => g.tab === tab);
    return {
      title: T(t.title),
      icon: t.icon,
      sections: gs.map(g => ({
        label: gs.length > 1 ? T(g.label) : '',
        items: g.items
      }))
    };
  }

  /* ─────────────────── View → bottom-nav tab mapping ───────────────── */
  const VIEW_TAB = { home: 'bn-home' };
  ALL.forEach(it => {
    if (it.view !== 'tutorial') VIEW_TAB[it.view] = 'bn-' + (it.tab === 'study' ? 'study' : it.tab);
  });

  /* ─────────────────────── Public API ─────────────────────────────── */
  window.NAV = {
    HEADS, GROUPS, TABS, ALL, VIEW_TAB,
    renderSidebar, renderHeads, sheet, itemHtml, toggle, reveal,
    tabForView: v => VIEW_TAB[v] || ''
  };

  /* ─────────────────────── Boot at parse ──────────────────────────── */
  function _boot() {
    renderSidebar();
    renderHeads();
  }
  if (document.readyState === 'loading') {
    /* Loaded in <head>: run once the DOM exists (only safe if nav.js is in head). */
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    /* Loaded in <body> after #sb-nav and .pg-head exist: run immediately
       so HOME.updateBadges() finds #wrc / #bkc / #weekly-hint elements. */
    _boot();
  }
})();
/* ═══════════════════════════════════════════════════════════════════════
   js/core/admin-nav.js — the ONE definition of the admin console's nav.

   LOAD ORDER (admin.html):
     AFTER  js/core/text.js       (esc, escAttrJs)
     AFTER  the <nav id="rail"> element that contains <div id="rail-nav">
     BEFORE js/admin/router.js    (reads ADMIN_NAV.TITLES / .FEATURES at parse time)

   Classic script, IIFE.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* feature: the permission required to open the section (a list means
     any one of them). Matches the keys ADMIN.can() checks.
     badge:   id of the little count bubble on the rail button. */
  const GROUPS = [
    { label: 'Overview', items: [
      { view: 'today',      label: 'Today',          icon: 'ph-sun-horizon',             feature: 'dashboard' },
      { view: 'dashboard',  label: 'Insights',       icon: 'ph-chart-bar',               feature: 'dashboard' }
    ]},
    { label: 'People', items: [
      { view: 'users',      label: 'Students',       icon: 'ph-users-three',             feature: 'users_view' },
      { view: 'payments',   label: 'Payments',       icon: 'ph-credit-card',             feature: 'payments_view', badge: 'badge-payments' },
      { view: 'admins',     label: 'Admins',         icon: 'ph-shield-check',            feature: 'admins_view' }
    ]},
    { label: 'Content', items: [
      { view: 'weeklysets', label: 'Weekly sets',    icon: 'ph-calendar-check',          feature: 'weeklysets_view' },
      { view: 'studydocs',  label: 'Study PDFs',     icon: 'ph-file-pdf',                feature: 'studydocs_view' },
      { view: 'qna',        label: 'Q&A splitter',   icon: 'ph-scissors',                feature: 'studydocs_view' },
      { view: 'subjective', label: 'Grading',        icon: 'ph-note-pencil',             feature: 'subjective_view', badge: 'badge-subjective' },
      { view: 'qreports',   label: 'Reports',        icon: 'ph-flag',                    feature: 'qreports_view',   badge: 'badge-qreports' }
    ]},
    { label: 'System', items: [
      { view: 'logs',       label: 'Activity',       icon: 'ph-clock-counter-clockwise', feature: 'logs_view' },
      { view: 'data',       label: 'Data & upkeep',  icon: 'ph-database',                feature: ['imports', 'maintenance'] },
      { view: 'settings',   label: 'Settings',       icon: 'ph-gear',                    feature: 'settings_view' }
    ]}
  ];

  const ALL = GROUPS.reduce((a, g) => a.concat(g.items), []);
  const TITLES = {}, FEATURES = {};
  ALL.forEach(it => { TITLES[it.view] = it.label; FEATURES[it.view] = it.feature; });

  function itemHtml(it, first) {
    /* The rail shows icons only; aria-label + title expose the name. */
    return '<button class="rail-item' + (first ? ' active' : '') + '" ' +
      'id="nav-' + esc(it.view) + '" ' +
      'aria-label="' + esc(it.label) + '" ' +
      'title="' + esc(it.label) + '" ' +
      'data-on-click="UI.nav(\'' + escAttrJs(it.view) + '\')">' +
      '<i class="ph ' + esc(it.icon) + '"></i><span>' + esc(it.label) + '</span>' +
      (it.badge ? '<span class="rail-badge" id="' + esc(it.badge) + '" hidden>0</span>' : '') +
    '</button>';
  }

  function render() {
    const box = document.getElementById('rail-nav');
    if (!box) return false;
    let first = true;
    box.innerHTML = GROUPS.map(g =>
      '<div class="rail-group">' + esc(g.label) + '</div>' +
      g.items.map(it => { const h = itemHtml(it, first); first = false; return h; }).join('')
    ).join('');
    return true;
  }

  window.ADMIN_NAV = { GROUPS, ALL, TITLES, FEATURES, render, itemHtml };

  /* Render immediately when loaded in <body> after <nav id="rail">;
     fall back to DOMContentLoaded if loaded earlier. */
  if (!render() && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  }
})();
// js/core/loksewa.js — the Loksewa mark scheme, its default, and the paper composer.

const LOKSEWA_NEGATIVE = 0.2;

function isLoksewaFormat(scope) {
  return !!(scope && (scope.weeklyId || scope.loksewaMock || scope.hourlySprint));
}

const LEVEL7_TOPIC_MARKS = [
  { name: 'Engineering Survey',       marks: 7, rank: 6, match: /survey/ },
  { name: 'Construction Materials',   marks: 6, rank: 3, match: /construction material|building material/ },
  { name: 'Geotechnical Engineering', marks: 6, rank: 5, match: /geotech|soil/ },
  { name: 'Construction Management',  marks: 6, rank: 4, match: /construction manag|project manag/ },
  { name: 'Structural Analysis',      marks: 5, rank: 10, match: /structur/ },
  { name: 'Concrete Technology',      marks: 5, rank: 1, match: /concrete/ },
  { name: 'Estimating and Costing',   marks: 5, rank: 2, match: /estimat|costing/ },
  { name: 'Engineering Drawing',      marks: 4, rank: 7, match: /drawing|drafting/ },
  { name: 'Engineering Economics',    marks: 3, rank: 8, match: /economic/ },
  { name: 'Professional Practices',   marks: 3, rank: 9, match: /professional/ }
];

function loksewaTopicScheme(chapters) {
  const ident = v => /^[A-Za-z0-9_.-]{1,40}$/.test(String(v));
  const list = (Array.isArray(chapters) ? chapters : []).filter(c => c && ident(c.id));
  if (!list.length) return null;
  const norm = t => ' ' + String(t == null ? '' : t).toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const order = LEVEL7_TOPIC_MARKS.map((t, i) => i).sort((a, b) => LEVEL7_TOPIC_MARKS[a].rank - LEVEL7_TOPIC_MARKS[b].rank);
  const owner = {};
  list.forEach(c => {
    const n = norm(c.name || c.id);
    for (const i of order) {
      if (LEVEL7_TOPIC_MARKS[i].match.test(n)) { owner[c.id] = i; break; }
    }
  });
  const hit = new Set(Object.keys(owner).map(k => owner[k]));
  if (!hit.size) return null;
  const groups = [{ key: 'g0', name: 'General Knowledge', marks: 25, level: 'gk', chapters: [] }];
  let spare = 0;
  LEVEL7_TOPIC_MARKS.forEach((t, i) => {
    if (!hit.has(i)) { spare += t.marks; return; }
    groups.push({
      key: 'g' + groups.length, name: t.name, marks: t.marks, level: 'level7',
      chapters: list.filter(c => owner[c.id] === i).map(c => String(c.id))
    });
  });
  if (spare && list.some(c => owner[c.id] === undefined)) {
    groups.push({
      key: 'g' + groups.length, name: 'Other Level 7 chapters', marks: spare, level: 'level7', chapters: []
    });
  }
  const total = groups.reduce((n, g) => n + g.marks, 0);
  return { version: 1, isDefault: true, topicBased: true, total, groups };
}

function defaultLoksewaScheme() {
  try {
    if (typeof ChapterData !== 'undefined' && ChapterData && typeof ChapterData.allFileRefs === 'function') {
      const seen = {}, chs = [];
      ChapterData.allFileRefs().forEach(r => {
        if (r.lv !== 'level7' || seen[r.ch]) return;
        seen[r.ch] = 1;
        let name = '';
        try { name = ChapterData.chapterName(r.lv, r.ch) || ''; } catch (e) {}
        chs.push({ id: r.ch, name: name || r.chName || r.ch });
      });
      const t = loksewaTopicScheme(chs);
      if (t) return t;
    }
  } catch (e) {}
  return {
    version: 1, isDefault: true, total: 75, groups: [
      { key: 'g0', name: 'General Knowledge', marks: 25, level: 'gk', chapters: [] },
      { key: 'g1', name: 'Level 7 Civil Engineering', marks: 50, level: 'level7', chapters: [] }
    ]
  };
}

function normalizeLoksewaScheme(raw) {
  try {
    const o = (typeof raw === 'string') ? JSON.parse(raw || 'null') : raw;
    if (!o || !Array.isArray(o.groups)) return defaultLoksewaScheme();
    const ident = v => /^[A-Za-z0-9_.-]{1,40}$/.test(String(v));
    const groups = [];
    o.groups.slice(0, 20).forEach(g => {
      if (!g) return;
      const name = String(g.name == null ? '' : g.name).replace(/\s+/g, ' ').trim().slice(0, 60);
      const marks = Math.round(Number(g.marks));
      const level = String(g.level == null ? '' : g.level).trim();
      if (!name || !isFinite(marks) || marks < 1 || marks > 100 || !ident(level)) return;
      const chapters = (Array.isArray(g.chapters) ? g.chapters : []).map(String).filter(ident).slice(0, 60);
      groups.push({ key: 'g' + groups.length, name, marks, level, chapters });
    });
    const total = groups.reduce((n, g) => n + g.marks, 0);
    if (!groups.length || total < 1 || total > 200) return defaultLoksewaScheme();
    return { version: 1, isDefault: false, total, groups };
  } catch (e) { return defaultLoksewaScheme(); }
}

function loksewaGroupFor(scheme, lv, ch) {
  const gs = (scheme && scheme.groups) || [];
  return gs.find(g => g.level === lv && g.chapters.length && g.chapters.indexOf(ch) !== -1)
      || gs.find(g => g.level === lv && !g.chapters.length)
      || null;
}

function _shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function composeLoksewaPaper(scheme, pool, rng) {
  const sch = scheme || defaultLoksewaScheme();
  const byGroup = {};
  sch.groups.forEach(g => { byGroup[g.key] = {}; });
  (pool || []).forEach(p => {
    const g = loksewaGroupFor(sch, p.lv, p.ch);
    if (!g) return;
    (byGroup[g.key][p.ch] = byGroup[g.key][p.ch] || []).push(p.q);
  });
  const questions = [], perGroup = {}, shortfalls = [];
  sch.groups.forEach(g => {
    const buckets = _shuffled(Object.keys(byGroup[g.key]), rng)
      .map(ch => _shuffled(byGroup[g.key][ch], rng));
    const picked = [];
    for (let round = 0; picked.length < g.marks; round++) {
      let any = false;
      for (const b of buckets) {
        if (picked.length >= g.marks) break;
        if (round < b.length) { picked.push(b[round]); any = true; }
      }
      if (!any) break;
    }
    perGroup[g.key] = picked.length;
    if (picked.length < g.marks) {
      shortfalls.push({ key: g.key, name: g.name, wanted: g.marks, got: picked.length });
    }
    picked.forEach(q => questions.push(q));
  });
  return { questions, perGroup, shortfalls, total: sch.total };
}

function loksewaGroupRows(scheme, items, useSchemeMarks) {
  const sch = scheme || defaultLoksewaScheme();
  const rows = {};
  sch.groups.forEach(g => {
    rows[g.key] = { key: g.key, name: g.name, target: g.marks, total: 0, correct: 0, wrong: 0, skipped: 0 };
  });
  items.forEach(it => {
    const g = (it.lv != null) ? loksewaGroupFor(sch, it.lv, it.ch) : null;
    const k = g ? g.key : 'other';
    const r = rows[k] || (rows[k] = { key: 'other', name: 'Other', target: 0, total: 0, correct: 0, wrong: 0, skipped: 0 });
    r.total++;
    if (it.state === 'skipped') r.skipped++;
    else if (it.state === 'correct') r.correct++;
    else r.wrong++;
  });
  return Object.keys(rows).map(k => rows[k]).filter(r => r.total > 0).map(r => {
    const score = Math.round((r.correct - r.wrong * LOKSEWA_NEGATIVE) * 10) / 10;
    const out = useSchemeMarks && r.target ? r.target : r.total;
    return Object.assign({}, r, {
      score, outOf: out, pct: out ? Math.round((score / out) * 100) : 0
    });
  });
}

function loksewaSchemeConflict(rows) {
  if (!Array.isArray(rows) || !rows.length) return 'Add at least one group.';
  const named = {}, catchAll = {};
  for (const r of rows) {
    const name = String(r && r.name || '').trim();
    const m = Number(r && r.marks);
    if (!name) return 'Every group needs a name.';
    if (!isFinite(m) || m < 1 || m > 100 || Math.floor(m) !== m) {
      return 'Marks must be whole numbers from 1 to 100 (' + name + ').';
    }
    const chs = Array.isArray(r.chapters) ? r.chapters : [];
    if (!chs.length) {
      if (catchAll[r.level]) {
        return 'Two groups use every chapter of the same level ("' + catchAll[r.level] + '" and "' + name + '"). Tick chapters for one of them.';
      }
      catchAll[r.level] = name;
    }
    for (const c of chs) {
      const k = r.level + '|' + c;
      if (named[k]) {
        return 'A chapter can only belong to one group ("' + named[k] + '" and "' + name + '" both have it).';
      }
      named[k] = name;
    }
  }
  return '';
}
window.normalizeLoksewaScheme = normalizeLoksewaScheme;
window.loksewaSchemeConflict  = loksewaSchemeConflict;
window.defaultLoksewaScheme   = defaultLoksewaScheme;
window.composeLoksewaPaper    = composeLoksewaPaper;
window.loksewaGroupFor        = loksewaGroupFor;
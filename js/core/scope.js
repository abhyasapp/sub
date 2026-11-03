// js/core/scope.js — the leaf walker and the per-file stats rollup. Pure.
// Must load before psync.js is CALLED (the sync merge reads scope stats),
// and before objective/features that call fileStatsMap.

function migrateSessionScopes() {
  if (!Array.isArray(S.prog.sessions)) return;
  let changed = false;
  S.prog.sessions.forEach(s => {
    if (!s.chapterKey && s.chapter) {
      const cleaned = String(s.chapter).split(' — ')[0].trim();
      if (cleaned) { s.chapterKey = cleaned; changed = true; }
    }
  });
  if (changed) _save(LS.PROG, S.prog);
}

function scopeLeaves(lv, ch, book, sub) {
  let refs;
  if (!lv) {
    refs = ChapterData.allFileRefs();
  } else if (!ch) {
    refs = [];
    Object.keys(ChapterData.chapters(lv)).forEach(c => refs.push(...ChapterData.chapterFileRefs(lv, c)));
  } else {
    refs = ChapterData.chapterFileRefs(lv, ch);
  }
  if (book) refs = refs.filter(r => r.book === book);
  if (sub)  refs = refs.filter(r => r.subtopic === sub);
  return refs;
}

function fidFromUid(uid) {
  const i = uid.lastIndexOf('_');
  return i > -1 ? uid.slice(0, i) : uid;
}

function fileStatsMap(leaves) {
  const map = new Map();
  leaves.forEach(ref => {
    if (map.has(ref.fid)) return;
    const c = (S.cov && S.cov[ref.fid]) || null;
    const practised = new Set();
    if (c && c.p) {
      for (let i = 0; i < c.p.length; i++) {
        if (c.p[i] !== '0') practised.add(ref.fid + '_' + i);
      }
    }
    const a = c ? (c.a || 0) : 0, k = c ? (c.c || 0) : 0;
    map.set(ref.fid, {
      practised, attempted: a, correct: k, wrong: Math.max(0, a - k)
    });
  });
  return map;
}

function fileMissedNowCount(fid) {
  const c = (S.cov && S.cov[fid]) || null;
  if (!c || !c.p) return 0;
  let n = 0;
  for (let i = 0; i < c.p.length; i++) if (c.p[i] === '2') n++;
  return n;
}

function scopedStats(leaves) {
  const fileMap = fileStatsMap(leaves);
  const uids = new Set();
  let attempted = 0, correct = 0, wrong = 0;
  fileMap.forEach(rec => {
    rec.practised.forEach(u => uids.add(u));
    attempted += rec.attempted; correct += rec.correct; wrong += rec.wrong;
  });
  return { practised: uids.size, attempted, correct, wrong, fileMap };
}
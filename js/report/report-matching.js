/* ═══════════════════════════════════════════════════════════════════════
   report/report-matching.js — pure helpers used when the admin corrects a
   question and a student's saved copies (Missed / Saved / Flagged / weekly
   papers) have to be brought up to date.

   No DOM, no network, no storage. Every function is pure and can be
   unit-tested in Node. Loaded after report-shared.js, before userreport.js.

   Moved verbatim from js/core/shared.js (v1.32). Delete the copies there
   when linking in.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

function qTokens(s) {
  return String(s == null ? '' : s)
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ').filter(Boolean);
}

/* 0..1: share of distinct words the two texts have in common. */
function qSimilarity(a, b) {
  const A = new Set(qTokens(a)), B = new Set(qTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

function qUidParts(uid) {
  const m = String(uid || '').match(/^(.*)_(\d+)$/);
  return m ? { fid: m[1], index: Number(m[2]) } : null;
}

/* How alike are the answer options of two questions? 1 when both have
   none (nothing to compare). */
function qOptionsSimilarity(a, b) {
  const oa = (a && a.options) || [], ob = (b && b.options) || [];
  if (!oa.length && !ob.length) return 1;
  return qSimilarity(oa.join(' '), ob.join(' '));
}

/* Is `fresh` the corrected version of `old`? A corrected answer key leaves
   the wording alone; a typo fix changes a word; a different question shares
   neither the wording nor the options. */
function sameQuestionAfterCorrection(old, fresh, minStem) {
  const stem = qSimilarity(old && old.q, fresh && fresh.q);
  if (stem < minStem) return false;
  return stem >= 0.9 || qOptionsSimilarity(old, fresh) >= 0.5;
}

/* Where is `old` in the corrected file? { index, question, kind }.
   kind: 'same' | 'moved' | 'none'. At its own position a close match is
   enough (0.6); anywhere else it must be near-identical (0.9), so a
   question that was removed is never mistaken for a similar-looking
   neighbour. */
function matchCorrectedQuestion(old, fresh) {
  const parts = qUidParts(old && old.uid);
  const list = Array.isArray(fresh) ? fresh : [];
  if (parts) {
    const here = list.find(q => q && q.uid === old.uid);
    if (here && sameQuestionAfterCorrection(old, here, 0.6)) {
      return { index: parts.index, question: here, kind: 'same' };
    }
  }
  let best = null, bestSim = 0;
  list.forEach(q => {
    const sm = qSimilarity(old && old.q, q && q.q);
    if (sm > bestSim) { bestSim = sm; best = q; }
  });
  if (best && sameQuestionAfterCorrection(old, best, 0.9)) {
    return {
      index: (qUidParts(best.uid) || {}).index,
      question: best,
      kind: best.uid === (old && old.uid) ? 'same' : 'moved'
    };
  }
  return { index: -1, question: null, kind: 'none' };
}

function questionContentChanged(a, b) {
  const pick = q => JSON.stringify([
    q && q.q, q && q.options, String(q && q.correct),
    (q && q.explanation) || '',
    (q && q.img) || '',
    (q && q.imgCaption) || ''
  ]);
  return pick(a) !== pick(b);
}

/* Update a saved copy from the corrected question. Review settings
   (streak, next due, tag, note, reason) are kept. */
function applyQuestionCorrection(item, q, nowMs) {
  const changed = questionContentChanged(item, q);
  const out = Object.assign({}, item, {
    q: q.q,
    options: q.options,
    correct: q.correct,
    explanation: q.explanation,
    img: q.img,
    imgCaption: q.imgCaption,
    uid: q.uid,
    fileId: q.fileId
  });
  delete out._withdrawn;
  if (changed) out._corrected = nowMs;
  return out;
}

/* Bring one saved list up to date with the corrected file `fid`.
   opts.keepAll: never drop or merge items (a weekly paper must keep its
   length so answers still line up).

   Returns { list, updated, moved, merged, withdrawn }. Nothing is ever
   deleted: a question that is no longer in the file is marked _withdrawn
   so the app can show it as withdrawn and leave it out of practice. */
function applyCorrectionsToList(list, fid, fresh, nowMs, opts) {
  const o = opts || {};
  const items = Array.isArray(list) ? list : [];
  const mine = it => it && it.fileId === fid ||
    (it && String(it.uid || '').indexOf(fid + '_') === 0);
  const res = { list: items, updated: 0, moved: 0, merged: 0, withdrawn: 0 };
  if (!Array.isArray(fresh) || !fresh.length) return res;

  const planned = items.map(it =>
    mine(it) ? { it, m: matchCorrectedQuestion(it, fresh) } : { it, m: null });

  const lost = planned.filter(p => p.m && p.m.kind === 'none').length;
  const total = planned.filter(p => p.m).length;
  const suspicious = lost > 0 && lost >= Math.max(3, 0.8 * total);

  const seen = new Set();
  const out = [];
  planned.forEach(p => {
    if (!p.m) { out.push(p.it); seen.add(p.it && p.it.uid); return; }
    if (p.m.kind === 'none') {
      if (suspicious) { out.push(p.it); return; }
      if (!p.it._withdrawn) res.withdrawn++;
      out.push(Object.assign({}, p.it, { _withdrawn: true }));
      return;
    }
    const upd = applyQuestionCorrection(p.it, p.m.question, nowMs);
    if (upd.uid !== p.it.uid) res.moved++;
    if (!o.keepAll && seen.has(upd.uid)) { res.merged++; return; }
    if (questionContentChanged(p.it, p.m.question)) res.updated++;
    seen.add(upd.uid);
    out.push(upd);
  });
  res.list = out;
  return res;
}
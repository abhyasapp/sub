/* ═══════════════════════════════════════════════════════════════════════
   js/core/qna.js — model for the "Questions & answers" section.

   Every question lives in the SAME backend table the study PDFs use
   (study_docs), because the deployed API has no Q&A table and its category
   list is fixed. A question is therefore a study_doc row that says where it
   belongs in the syllabus:

     category    'model-answer'          (one of the server's allowed values)
     chapterId   'qna.<chapter>.<topic>'  ← this prefix is what marks the row
     title       the question text (≤120 chars)
     description '<marks>M · <answer note>'  (≤400 chars)
     sortOrder   question number inside its topic

   Nothing here talks to the network. The student screen and the admin
   splitter both read the same rows, so a question created in the splitter
   appears in the syllabus tree with no extra bookkeeping.

   Classic script; the globals are used by js/features/qna.js and
   js/admin/features/qna.js. Load AFTER js/core/study-docs.js and
   js/data/subjective_chapters.js.
   ═══════════════════════════════════════════════════════════════════════ */

const QNA_PREFIX = 'qna.';
const QNA_MAX_TITLE = 120;
const QNA_MAX_NOTE = 400;

/* Chapters come from the syllabus file; accept an explicit list so the
   functions stay testable without a DOM. */
function qnaChapters(list) {
  if (Array.isArray(list)) return list;
  try { return (typeof window !== 'undefined' && window.SUBJECTIVE_CHAPTERS) || []; } catch (e) { return []; }
}

/* "Soil Mechanics" → "soil-mechanics". Devanagari (or any non-ASCII) topic
   name slugifies to '' — the chapter alone still identifies the row. */
function qnaSlug(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/* The chapterId a question row carries. '' when no chapter was picked, which
   the splitter treats as "ask the teacher to choose one". */
function qnaChapterId(chapterId, topic) {
  const ch = String(chapterId == null ? '' : chapterId).trim().replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 30);
  if (!ch) return '';
  const t = qnaSlug(topic);
  return (QNA_PREFIX + ch + (t ? '.' + t : '')).slice(0, 80);
}

function isQnaDoc(d) {
  return !!d && typeof d.chapterId === 'string' && d.chapterId.indexOf(QNA_PREFIX) === 0;
}

/* { chapterId, topic } — topic is the slug stored in chapterId. */
function qnaParse(d) {
  const raw = d && typeof d.chapterId === 'string' ? d.chapterId : '';
  if (raw.indexOf(QNA_PREFIX) !== 0) return { chapterId: '', topic: '' };
  const rest = raw.slice(QNA_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot < 0) return { chapterId: rest, topic: '' };
  return { chapterId: rest.slice(0, dot), topic: rest.slice(dot + 1) };
}

/* "10M · definition, then the derivation" → { marks: 10, note: 'definition…' } */
function qnaMarksValue(d) {
  const m = /^(\d{1,3})\s*M\s*(?:[·:\-–]\s*)?/i.exec(String((d && d.description) || ''));
  const n = m ? Number(m[1]) : 0;
  return n > 0 && n <= 150 ? n : 0;
}

function qnaNoteText(d) {
  const s = String((d && d.description) || '').trim();
  const m = /^\d{1,3}\s*M\s*(?:[·:\-–]\s*)?/i.exec(s);
  return m ? s.slice(m[0].length).trim() : s;
}

/* Compose the description the splitter writes. */
function qnaDescription(marks, note) {
  const n = Math.round(Number(marks) || 0);
  const text = String(note == null ? '' : note).replace(/\s+/g, ' ').trim();
  const prefix = n > 0 && n <= 150 ? n + 'M · ' : '';
  return (prefix + text).slice(0, QNA_MAX_NOTE);
}

function qnaTitle(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, QNA_MAX_TITLE);
}

/* Topic slug → the name the syllabus uses, so the tree shows the real topic
   even though the row only stores a slug. */
function qnaTopicName(chapter, topicSlug) {
  const slug = String(topicSlug || '');
  if (!slug) return 'General';
  const topics = (chapter && chapter.topics) || [];
  const hit = topics.find(t => qnaSlug(t) === slug);
  if (hit) return hit;
  return slug.split('-').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'General';
}

/* One row → everything a screen needs to show it. `index` is filled by the
   tree builder (the number shown inside its topic). */
function qnaEntry(d) {
  const parsed = qnaParse(d);
  const chapter = qnaChapters().find(c => c.id === parsed.chapterId) || null;
  return {
    id: d && d.id,
    doc: d,
    title: qnaTitle(d && d.title),
    chapterId: parsed.chapterId,
    chapterName: chapter ? chapter.name : (parsed.chapterId || 'Unsorted'),
    group: chapter ? String(chapter.group || '') : '',
    topic: parsed.topic,
    topicName: qnaTopicName(chapter, parsed.topic),
    marks: qnaMarksValue(d),
    note: qnaNoteText(d),
    order: d && Number.isFinite(Number(d.sortOrder)) ? Number(d.sortOrder) : 100,
    updatedAt: d && Number(d.updatedAt || d.uploadedAt || 0),
    sizeBytes: d && Number(d.sizeBytes || 0)
  };
}

function qnaDocs(docs) {
  return (Array.isArray(docs) ? docs : []).filter(isQnaDoc).map(qnaEntry);
}

/* Every word must appear somewhere, so "soil bearing" finds "Bearing
   capacity of soil". Chapter and topic names are searched too. */
function qnaMatches(entry, words) {
  if (!words || !words.length) return true;
  const hay = (entry.title + ' ' + entry.note + ' ' + entry.topicName + ' ' + entry.chapterName).toLowerCase();
  return words.every(w => hay.indexOf(w) !== -1);
}

/* groups: [{ key, chapters: [{ chapterId, name, group, icon, count, topics: [{ key, name, items }] }] }]
   Ordered by the syllabus (chapter order, then topic order), never by
   insertion, so the list reads like the syllabus does. */
function qnaTree(docs, opts) {
  const o = opts || {};
  const chapters = qnaChapters(o.chapters);
  const words = String(o.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const entries = qnaDocs(docs).filter(e => qnaMatches(e, words))
    .filter(e => !o.group || e.group === o.group)
    .filter(e => !o.chapterId || e.chapterId === o.chapterId);

  const byChapter = new Map();
  entries.forEach(e => {
    if (!byChapter.has(e.chapterId)) byChapter.set(e.chapterId, []);
    byChapter.get(e.chapterId).push(e);
  });

  const order = chapters.map(c => c.id);
  const unknown = [...byChapter.keys()].filter(id => order.indexOf(id) === -1).sort();

  const out = [];
  order.concat(unknown).forEach(chId => {
    const items = byChapter.get(chId);
    if (!items || !items.length) return;
    const meta = chapters.find(c => c.id === chId) || null;
    const topicOrder = (meta && meta.topics) ? meta.topics.map(qnaSlug) : [];

    const byTopic = new Map();
    items.forEach(e => {
      if (!byTopic.has(e.topic)) byTopic.set(e.topic, []);
      byTopic.get(e.topic).push(e);
    });
    const tKeys = [...byTopic.keys()].sort((a, b) => {
      const ia = topicOrder.indexOf(a), ib = topicOrder.indexOf(b);
      if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      return String(a).localeCompare(String(b));
    });

    const topics = tKeys.map(key => {
      const list = byTopic.get(key).sort((a, b) => (a.order - b.order) || (a.title.localeCompare(b.title)));
      list.forEach((e, i) => { e.index = i + 1; });
      return { key, name: list[0].topicName, items: list };
    });

    out.push({
      chapterId: chId,
      name: meta ? meta.name : (items[0].chapterName || 'Unsorted'),
      icon: (meta && meta.icon) || '',
      group: (meta && meta.group) || '',
      count: items.length,
      topics,
      items
    });
  });
  return out;
}

/* Which groups have questions, for the filter chips. */
function qnaGroups(docs, chapters) {
  const counts = {};
  qnaDocs(docs).forEach(e => { if (e.group) counts[e.group] = (counts[e.group] || 0) + 1; });
  return Object.keys(counts).sort().map(g => ({ group: g, count: counts[g] }));
}

/* ── Page splitting ──────────────────────────────────────────────────────
   The splitter marks the PDF page each question STARTS on; these turn that
   into the page ranges the slicer copies. Page numbers are 1-based and
   always cover the whole document, with no gaps or overlaps: a question
   runs up to the page before the next marked start. */
function qnaSegments(starts, pageCount) {
  const total = Math.max(0, Math.floor(Number(pageCount) || 0));
  if (!total) return [];
  const marks = [...new Set((Array.isArray(starts) ? starts : [...(starts || [])])
    .map(n => Math.floor(Number(n)))
    .filter(n => n >= 1 && n <= total))];
  if (!marks.includes(1)) marks.push(1);
  marks.sort((a, b) => a - b);
  return marks.map((start, i) => {
    const end = i + 1 < marks.length ? marks[i + 1] - 1 : total;
    return { number: i + 1, start, end, pages: end - start + 1 };
  });
}

if (typeof window !== 'undefined') {
  window.QNA_PREFIX = QNA_PREFIX;
  window.qnaSlug = qnaSlug;
  window.qnaChapterId = qnaChapterId;
  window.isQnaDoc = isQnaDoc;
  window.qnaParse = qnaParse;
  window.qnaMarksValue = qnaMarksValue;
  window.qnaNoteText = qnaNoteText;
  window.qnaDescription = qnaDescription;
  window.qnaDocs = qnaDocs;
  window.qnaTree = qnaTree;
  window.qnaGroups = qnaGroups;
  window.qnaSegments = qnaSegments;
}

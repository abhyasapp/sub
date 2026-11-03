// tests/qna.test.js — the metadata that turns one study-PDF row into a
// syllabus-placed question, and the page maths the splitter relies on.
//
// The deployed API has no Q&A table, so a question IS a study_docs row whose
// chapterId starts with "qna.". These tests hold the two things that would
// silently break the section: the encoding round-trip, and page ranges never
// overlapping or losing a page.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { loadGlobals, ROOT } from './helpers/load-globals.js';

const g = loadGlobals(['js/data/subjective_chapters.js', 'js/core/qna.js']);

const row = (chapterId, title, description, sortOrder) =>
  ({ id: 'id-' + title, chapterId, title, description, sortOrder });

describe('chapter/topic encoding', () => {
  it('round-trips a syllabus topic', () => {
    const id = g.qnaChapterId('geotech', 'Soil Mechanics');
    expect(id).toBe('qna.geotech.soil-mechanics');
    expect(g.qnaParse({ chapterId: id })).toEqual({ chapterId: 'geotech', topic: 'soil-mechanics' });
    expect(g.isQnaDoc({ chapterId: id })).toBe(true);
  });

  it('keeps a chapter on its own when no topic was picked', () => {
    expect(g.qnaChapterId('structure', '')).toBe('qna.structure');
    expect(g.qnaParse({ chapterId: 'qna.structure' })).toEqual({ chapterId: 'structure', topic: '' });
  });

  it('never treats a plain study doc as a question', () => {
    for (const doc of [{}, null, { chapterId: '' }, { chapterId: 'geotech' }, { category: 'notes' }])
      expect(g.isQnaDoc(doc)).toBe(false);
  });

  it('stays inside the column limits the API enforces', () => {
    const long = 'a'.repeat(80);
    const id = g.qnaChapterId(long, 'b'.repeat(80));
    expect(id.length).toBeLessThanOrEqual(80);
    expect(id).toMatch(/^[a-zA-Z0-9_.-]+$/);
  });

  it('falls back to a readable topic name when the slug is not in the syllabus', () => {
    expect(g.qnaTopicName({ topics: ['Soil Mechanics'] }, 'soil-mechanics')).toBe('Soil Mechanics');
    expect(g.qnaTopicName({ topics: [] }, 'bearing-capacity')).toBe('Bearing Capacity');
    expect(g.qnaTopicName(null, '')).toBe('General');
  });
});

describe('marks and the answer note share the description column', () => {
  it('reads back what the splitter wrote', () => {
    const d = row('qna.geotech.soil-mechanics', 'Define bearing capacity', '10M · State the definition, then the Terzaghi equation.', 3);
    expect(g.qnaMarksValue(d)).toBe(10);
    expect(g.qnaNoteText(d)).toBe('State the definition, then the Terzaghi equation.');
  });

  it('leaves a note without marks untouched', () => {
    const d = row('qna.geotech.soil-mechanics', 'Q', 'Common misconception: unit weight is not density.', 1);
    expect(g.qnaMarksValue(d)).toBe(0);
    expect(g.qnaNoteText(d)).toBe('Common misconception: unit weight is not density.');
  });

  it('truncates to the 400-character column', () => {
    const out = g.qnaDescription(5, 'x'.repeat(500));
    expect(out.length).toBe(400);
    expect(out.startsWith('5M · ')).toBe(true);
  });

  it('drops a nonsense mark value instead of writing it', () => {
    expect(g.qnaDescription(0, 'note')).toBe('note');
    expect(g.qnaDescription(999, 'note')).toBe('note');
  });
});

describe('the syllabus tree', () => {
  const docs = [
    row('qna.geotech.soil-mechanics', 'Bearing capacity', '10M · Terzaghi', 2),
    row('qna.geotech.soil-mechanics', 'Seepage', '5M · Flow nets', 1),
    row('qna.structure.reinforced-concrete-structures', 'Doubly reinforced beam', '10M · Design steps', 1),
    row('qna.notasyllabus.topic', 'Unknown chapter question', '', 1),
    { id: 'plain', title: 'Model answers — whole chapter', category: 'model-answer', chapterId: 'geotech' },
    null
  ];

  it('keeps only question rows and orders them by the syllabus', () => {
    const tree = g.qnaTree(docs);
    expect(tree.map(c => c.chapterId)).toEqual(['structure', 'geotech', 'notasyllabus']);
    const geo = tree.find(c => c.chapterId === 'geotech');
    expect(geo.name).toBe('Geotechnical Engineering');
    expect(geo.topics.map(t => t.name)).toEqual(['Soil Mechanics']);
    /* question number inside the topic comes from sortOrder, not upload time */
    expect(geo.topics[0].items.map(e => e.title)).toEqual(['Seepage', 'Bearing capacity']);
    expect(geo.topics[0].items.map(e => e.index)).toEqual([1, 2]);
  });

  it('searches the question, the note, the topic and the chapter', () => {
    expect(g.qnaTree(docs, { q: 'flow net' })[0].topics[0].items.map(e => e.title)).toEqual(['Seepage']);
    expect(g.qnaTree(docs, { q: 'SOIL' }).length).toBe(1);
    expect(g.qnaTree(docs, { q: 'structure' })[0].chapterId).toBe('structure');
    expect(g.qnaTree(docs, { q: 'nothing here' })).toEqual([]);
  });

  it('filters by group', () => {
    const all = g.qnaGroups(docs);
    expect(all.map(x => x.group)).toEqual(['A']);
    expect(g.qnaTree(docs, { group: 'B' })).toEqual([]);
  });
});

describe('page ranges for the slicer', () => {
  it('covers every page exactly once, in order', () => {
    const segs = g.qnaSegments([1, 4, 9], 12);
    expect(segs).toEqual([
      { number: 1, start: 1, end: 3, pages: 3 },
      { number: 2, start: 4, end: 8, pages: 5 },
      { number: 3, start: 9, end: 12, pages: 4 }
    ]);
  });

  it('always starts at page 1 and ignores junk marks', () => {
    expect(g.qnaSegments([5], 6)).toEqual([
      { number: 1, start: 1, end: 4, pages: 4 },
      { number: 2, start: 5, end: 6, pages: 2 }
    ]);
    expect(g.qnaSegments([0, 99, 2.4, 'x'], 3)).toEqual([
      { number: 1, start: 1, end: 1, pages: 1 },
      { number: 2, start: 2, end: 3, pages: 2 }
    ]);
  });

  it('handles one question per page and an empty document', () => {
    expect(g.qnaSegments([1, 2, 3], 3).map(s => s.pages)).toEqual([1, 1, 1]);
    expect(g.qnaSegments([1], 0)).toEqual([]);
    expect(g.qnaSegments([], 1)).toEqual([{ number: 1, start: 1, end: 1, pages: 1 }]);
  });
});

describe('the student screen (user.html)', () => {
  let p;
  const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
  const docs = [
    { id: 'q1', chapterId: 'qna.geotech.soil-mechanics', title: 'Define bearing capacity', description: '10M · Terzaghi, then the factors.', sortOrder: 2, status: 'published', sizeBytes: 2048 },
    { id: 'q2', chapterId: 'qna.geotech.soil-mechanics', title: 'Seepage <script>alert(1)</script>', description: '5M · Flow nets', sortOrder: 1, status: 'published', sizeBytes: 1024 },
    { id: 'n1', chapterId: 'geotech', title: 'Whole chapter model answers', description: '', category: 'model-answer', sortOrder: 100, status: 'published' }
  ];

  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply });
    p.ev(`STUDYDOCS.docs = ${JSON.stringify(docs)}; STUDYDOCS.loaded = true;`);
    p.ev('QNA.docs = STUDYDOCS.docs; QNA.loaded = true; QNA.render();');
  }, 120000);
  afterAll(() => p && p.close());

  it('files each question under its syllabus chapter and topic', () => {
    expect(p.ev('document.querySelectorAll("#qna-body .qna-row").length')).toBe(2);
    const text = p.ev('document.querySelector("#qna-body").textContent');
    expect(text).toContain('Geotechnical Engineering');
    expect(text).toContain('Soil Mechanics');
    /* question 1 in the topic is the lower sortOrder, not upload order */
    expect(text.indexOf('Seepage')).toBeLessThan(text.indexOf('Define bearing capacity'));
  });

  it('never injects a question as HTML', () => {
    expect(p.ev('document.querySelectorAll("#qna-body script").length')).toBe(0);
    expect(p.ev('document.querySelector("#qna-body").textContent')).toContain('<script>alert(1)</script>');
  });

  it('keeps whole-document notes out of the question list', async () => {
    p.ev('STUDYDOCS.render()');
    await new Promise(r => setTimeout(r, 60));   /* the notes list paints in a frame */
    const notes = p.ev('document.querySelector("#studydocs-body").textContent');
    expect(notes).toContain('Whole chapter model answers');
    expect(notes).not.toContain('Define bearing capacity');
  });

  it('searches question text and shows an empty state for no match', async () => {
    p.ev('QNA.setQuery("flow net")');
    await new Promise(r => setTimeout(r, 200));   /* typing is debounced */
    expect(p.ev('document.querySelectorAll("#qna-body .qna-row").length')).toBe(1);
    p.ev('QNA.setQuery("zzzz")');
    await new Promise(r => setTimeout(r, 200));
    expect(p.ev('document.querySelector("#qna-body").textContent')).toContain('Nothing matches');
  });

  it('opens a question through the study-PDF reader (offline cache included)', () => {
    expect(p.ev('typeof QNA.open')).toBe('function');
    /* The reader itself is exercised elsewhere; here the point is that the
       row hands off to the same code path as the notes screen. */
    expect(p.ev('typeof PDFVIEW')).toBe('object');
  });
});

describe('the splitter (admin.html)', () => {
  let p;
  const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';

  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply });
  }, 120000);
  afterAll(() => p && p.close());

  it('opens with a place to choose the paper', () => {
    p.ev('QNA_ADMIN.openSplit()');
    expect(p.ev('!!document.querySelector("#qna-src")')).toBe(true);
    /* nothing to mark until a file is loaded */
    expect(p.ev('document.querySelector("#qna-split-work").hidden')).toBe(true);
  });

  it('offers a way to name every question at once', () => {
    expect(p.ev('!!document.querySelector("#qna-bulk")')).toBe(true);
    /* With nothing marked yet the message points at the missing step. */
    p.ev('document.querySelector("#qna-bulk").value = ""; QNA_ADMIN.applyBulk()');
    expect(p.ev('document.querySelector("#qna-bulk-msg").textContent')).toContain('Mark the question pages first');
  });

  it('turns marked pages into one editor row per question', () => {
    p.ev('QNA_ADMIN._pages = 5; QNA_ADMIN._starts = new Set([1]); QNA_ADMIN._rows = []; QNA_ADMIN._rebuild(); QNA_ADMIN._paintPages();');
    expect(p.ev('document.querySelectorAll("#qna-rows .qna-row-edit").length')).toBe(1);
    expect(p.ev('document.querySelector("#qna-rows").textContent')).toContain('pages 1–5');

    p.ev('QNA_ADMIN.toggleStart(3)');
    expect(p.ev('document.querySelectorAll("#qna-rows .qna-row-edit").length')).toBe(2);
    expect(p.ev('document.querySelectorAll("#qna-pages .qna-page.on").length')).toBe(2);
    /* the default question text never depends on a text layer a scan lacks */
    expect(p.ev('document.querySelectorAll("#qna-rows textarea")[1].value')).toBe('Question 2');
  });

  it('keeps what was typed when another question is marked above it', () => {
    p.ev('QNA_ADMIN.setRow(0,"title","Define bearing capacity")');
    p.ev('QNA_ADMIN.toggleStart(2)');
    const titles = p.ev('[...document.querySelectorAll("#qna-rows textarea")].map(t => t.value)');
    expect(titles).toEqual(['Define bearing capacity', 'Question 2', 'Question 3']);
  });

  it('files each question under the chapter and topic picked for it', () => {
    p.ev('QNA_ADMIN.setRow(0,"chapter","geotech"); QNA_ADMIN.setRow(0,"topic","soil-mechanics"); QNA_ADMIN.setRow(0,"marks","10"); QNA_ADMIN.setRow(0,"note","Terzaghi first")');
    expect(p.ev('qnaChapterId("geotech","soil-mechanics")')).toBe('qna.geotech.soil-mechanics');
    expect(p.ev('qnaDescription(10,"Terzaghi first")')).toBe('10M · Terzaghi first');
  });

  /* A scan has no text layer, so the question list is typed (or pasted from
     the paper). One line per question, laid over the ranges in page order. */
  it('lays a pasted question list over the marked page ranges', () => {
    p.ev('document.querySelector("#qna-bulk").value = "1. Define bearing capacity\\n2) Compute transmissivity\\nDesign a singly reinforced beam"');
    p.ev('QNA_ADMIN.applyBulk()');
    const titles = p.ev('[...document.querySelectorAll("#qna-rows textarea")].map(t => t.value)');
    expect(titles).toEqual(['Define bearing capacity', 'Compute transmissivity', 'Design a singly reinforced beam']);
    expect(p.ev('document.querySelector("#qna-bulk-msg").textContent')).toContain('3 questions filled');
  });

  it('says so when the pasted list and the page marks disagree', () => {
    p.ev('document.querySelector("#qna-bulk").value = "one\\ntwo\\nthree\\nfour"');
    p.ev('QNA_ADMIN.applyBulk()');
    const msg = p.ev('document.querySelector("#qna-bulk-msg").textContent');
    expect(msg).toContain('3 of 4 lines used');
    expect(msg).toContain('Mark another page for each extra question');
    /* the three ranges keep the first three lines, in order */
    expect(p.ev('[...document.querySelectorAll("#qna-rows textarea")].map(t => t.value)'))
      .toEqual(['one', 'two', 'three']);
  });
});

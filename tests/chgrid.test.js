// tests/chgrid.test.js — the chapter grid's mastery states and tap-to-filter.
//
// A student should be able to answer two questions without opening anything:
// how am I doing in this chapter, and what should I practise next. The grid
// answers both with three states — Not started, Practising, Strong — and a
// filter that narrows the list to one of them. The copy teaches rather than
// scores, so no state here says "weak" or "behind".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

/* One chapter in each state, plus a chapter whose sets have not shipped yet. */
const FIXTURE = `window.ChapterData = {
  chapters(lv){
    return lv === 'gk'
      ? { gkonly: 'General Knowledge' }
      : { soil: 'Soil Mechanics', survey: 'Surveying', hyd: 'Hydraulics', future: 'Welding' };
  },
  chapterFileRefs(lv, ch){
    if (lv === 'gk') return [{ fid: 'f_gk', key: 'k_gk', lv: 'gk', ch: ch, book: 'B', subtopic: ch }];
    if (ch === 'future') return [];
    return [{ fid: 'f_' + ch, key: 'k_' + ch, lv: lv, ch: ch, book: 'B', subtopic: ch }];
  },
  chapterName(lv, ch){ return ch; },
  allFileRefs(){ return []; },
  fileCount(){ return 4; }
};`;

/* soil: every question right and a clean wrong bank -> Strong.
   survey: halfway through the chapter -> Practising.
   hyd:   counts downloaded, no answers yet -> Not started.            */
const SEED = `
  S.cov = { f_soil: { p: '1111111111' }, f_survey: { p: '11122' } };
  S.fcount = { f_soil: 10, f_survey: 10, f_hyd: 10, f_gk: 8 };
  S.wr = [];
  S.prog = { sessions: [] };
  CH_GRID.lv = 'level7';
  CH_GRID.mf = 'all';
  CH_GRID.render();
`;

describe('chapter grid mastery states and filter', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply });
    p.ev(FIXTURE);
    p.ev(SEED);
    await tick();
  }, 120000);
  afterAll(() => p && p.close());

  const q = (sel) => [...p.w.document.querySelectorAll(sel)];
  const chips = () => q('#chgrid .chg-card:not([disabled]) .chg-state').map((c) => c.textContent.trim());
  const names = () => q('#chgrid .chg-card:not([disabled]) .chg-name').map((c) => c.textContent.trim());
  const filters = () => q('#chgrid .chg-mf').map((b) => ({
    label: b.childNodes[0].textContent.trim(),
    count: b.querySelector('.n').textContent.trim(),
    active: b.classList.contains('active'),
  }));
  const tapFilter = (label) => {
    const btn = q('#chgrid .chg-mf').find((b) => b.childNodes[0].textContent.trim() === label);
    expect(btn, `no "${label}" filter chip`).toBeTruthy();
    btn.click();
  };

  it('labels every chapter with its state and colours the chip', () => {
    expect(chips()).toEqual(['Strong', 'Practising', 'Not started']);
    expect(names()).toEqual(['Soil Mechanics', 'Surveying', 'Hydraulics']);

    /* The three states must be told apart by more than hue, so the class (and
       the word) differs even for a student who cannot separate the colours. */
    expect(q('#chgrid .chg-state.tg').map((c) => c.textContent.trim())).toEqual(['Strong']);
    expect(q('#chgrid .chg-state.tw').map((c) => c.textContent.trim())).toEqual(['Practising']);
    expect(q('#chgrid .chg-state:not(.tg):not(.tw)').map((c) => c.textContent.trim()))
      .toEqual(['Not started']);
  });

  it('counts each state in the filter row', () => {
    expect(filters()).toEqual([
      { label: 'All', count: '4', active: true },
      { label: 'Not started', count: '1', active: false },
      { label: 'Practising', count: '1', active: false },
      { label: 'Strong', count: '1', active: false },
    ]);
  });

  it('lists a chapter with no shipped sets under All only', () => {
    expect(q('#chgrid .chg-card[disabled] .chg-meta').map((e) => e.textContent.trim()))
      .toEqual(['Coming soon']);
    expect(q('#chgrid .chg-card[disabled] .chg-state')).toEqual([]);
  });

  it('narrows to one state when its chip is tapped, and back to All', async () => {
    tapFilter('Strong');
    await tick();

    expect(names()).toEqual(['Soil Mechanics']);
    expect(q('#chgrid .chg-card[disabled]')).toEqual([]);   // coming soon hides
    expect(filters().find((f) => f.active).label).toBe('Strong');

    tapFilter('Practising');
    await tick();
    expect(names()).toEqual(['Surveying']);

    tapFilter('All');
    await tick();
    expect(names()).toEqual(['Soil Mechanics', 'Surveying', 'Hydraulics']);
  });

  it('explains an empty state and offers a way back', async () => {
    /* gk holds one untouched chapter, so Strong has nothing to show. */
    p.ev(`CH_GRID.lv = 'gk'; CH_GRID.mf = 'all'; CH_GRID.render();`);
    await tick();
    tapFilter('Strong');
    await tick();

    const empty = p.w.document.querySelector('#chgrid .chg-empty');
    expect(empty).toBeTruthy();
    expect(empty.querySelector('p').textContent).toContain('No strong chapters yet');

    empty.querySelector('button').click();
    await tick();

    expect(p.w.document.querySelector('#chgrid .chg-empty')).toBeNull();
    expect(names()).toEqual(['General Knowledge']);
  });

  it('counts the questions actually cached when a set no longer matches its saved count', async () => {
    const questions = Array.from({ length: 7 }, (_, i) => ({
      q: 'Question ' + i,
      options: ['A', 'B', 'C', 'D'],
      correct: 0,
    }));
    await p.ev(`QDB.set('k_soil', ${JSON.stringify(questions)})`);
    /* Stay offline so this case checks cached reconciliation, not the
       background network revalidation. */
    p.ev(`S.online = false; S.fcount.f_soil = 10; S.cov = { f_soil: { p: '1111111111' } };`);

    await p.ev(`CH_GRID.open('level7', 'soil')`);
    await tick(400);

    const row = p.w.document.querySelector('#mbody .ch-parts .row .t-cap');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('7 of 7 seen');
    expect(row.textContent).not.toContain('of 10');

    p.ev('closeMod()');
    /* Restore the seed this test changed so the translation case below still
       sees the original Strong / Practising / Not started mix. */
    p.ev(`S.fcount.f_soil = 10; S.cov = { f_soil: { p: '1111111111' }, f_survey: { p: '11122' } }; CH_GRID.render();`);
    await tick();
  });

  it('revalidates a downloaded count against the published file', async () => {
    const questions = Array.from({ length: 45 }, (_, i) => ({
      q: 'Question ' + i,
      options: ['A', 'B', 'C', 'D'],
      correct: 0,
    }));
    p.ev(`window.__origFetch = QUIZ._fetch; QUIZ._fetch = async () => ${JSON.stringify(questions)};`);
    p.ev(`S.online = true; S.fcount.f_soil = 48; S.cov.f_soil = { p: '1'.repeat(48) };`);

    const changed = await p.ev(`CNT.refreshRemote([{ fid: 'f_soil', key: 'k_soil' }], null)`);
    expect(changed).toBe(true);
    expect(p.ev('S.fcount.f_soil')).toBe(45);

    p.ev('QUIZ._fetch = window.__origFetch; delete window.__origFetch;');
    p.ev(`S.fcount.f_soil = 10; S.cov = { f_soil: { p: '1111111111' }, f_survey: { p: '11122' } }; CH_GRID.render();`);
    await tick();
  });

  it('translates the states and the filter into Nepali at runtime', async () => {
    p.ev(`I18N.setLang('ne', { silent: true }); CH_GRID.lv = 'level7'; CH_GRID.mf = 'all'; CH_GRID.render();`);
    await tick();

    expect(filters().map((f) => f.label)).toEqual(['सबै', 'सुरु नभएको', 'अभ्यास भइरहेको', 'बलियो']);
    expect(chips()).toEqual(['बलियो', 'अभ्यास भइरहेको', 'सुरु नभएको']);

    p.ev(`I18N.setLang('en', { silent: true })`);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const g = loadGlobals(['js/features/sprint-plan.js', 'js/features/sprint-log.js', 'js/features/sprint-report.js'], { localStorage });
const { SPRINT_LOG: LOG, SPRINT_REPORT: R, SPRINT_PLAN: P } = g;

const sess = (o = {}) => Object.assign({ mode: 'flashcard', correct: 8, wrong: 2, skipped: 0, durationSec: 600, chapter: 'Hydrology — Core', chapterKey: 'Hydrology' }, o);
beforeEach(() => { Object.keys(store).forEach((k) => delete store[k]); LOG._resetMemory(); });

describe('daily log', () => {
  it('aggregates sessions into one record per day, beyond the 50-session cap', () => {
    for (let i = 0; i < 120; i++) LOG.recordSession(sess(), '2026-02-10');
    const d = LOG.days()['2026-02-10'];
    expect(d.ses).toBe(120);
    expect(d.q).toBe(1200);
    expect(d.c).toBe(960);
    expect(d.sec).toBe(72000);                       // 120 sessions x 600 s
  });
  it('persists to localStorage and reloads', () => {
    LOG.recordSession(sess(), '2026-02-10');
    LOG._resetMemory();
    expect(LOG.days()['2026-02-10'].q).toBe(10);
  });
  it('classifies sessions: tagged, exam, and label-inferred', () => {
    expect(LOG.kindOf({ sprintKind: 'drill' })).toBe('drill');
    expect(LOG.kindOf({ sessionKind: 'review', chapter: 'Hydrology — Core' })).toBe('review');   // tag written by the review/drill launchers wins over the label
    expect(LOG.kindOf({ sprintKind: 'new', sessionKind: 'drill' })).toBe('new');                 // an explicit sprint tag wins
    expect(LOG.kindOf({ mode: 'exam' })).toBe('mock');
    expect(LOG.kindOf({ chapter: '🔁 Wrong Bank (Due Today)' })).toBe('review');
    expect(LOG.kindOf({ chapter: 'Mixed Practice' })).toBe('drill');
    expect(LOG.kindOf({ chapter: 'Hydrology — Core' })).toBe('new');
  });
  it('mock sessions record their percentage', () => {
    LOG.recordSession(sess({ mode: 'exam', correct: 30, wrong: 20 }), '2026-02-10');
    expect(LOG.days()['2026-02-10'].mocks).toEqual([{ pct: 60, total: 50 }]);
  });
  it('ignores empty sessions and caps absurd durations', () => {
    LOG.recordSession(sess({ correct: 0, wrong: 0, skipped: 0 }), '2026-02-10');
    expect(LOG.days()['2026-02-10']).toBeUndefined();
    LOG.recordSession(sess({ durationSec: 99999999 }), '2026-02-11');
    expect(LOG.days()['2026-02-11'].sec).toBe(3 * 3600);
  });
  it('new-question counts and the planned target are stored; the target is frozen once set', () => {
    LOG.addNew('2026-02-10', 12); LOG.addNew('2026-02-10', 8);
    LOG.setPlanned('2026-02-10', 40); LOG.setPlanned('2026-02-10', 99);
    const d = LOG.days()['2026-02-10'];
    expect(d.newSeen).toBe(20);
    expect(d.planned.new).toBe(40);
  });
  it('merging two devices never double counts and never loses data', () => {
    const a = { days: { '2026-02-10': { q: 40, c: 30, w: 10, sk: 0, sec: 600, ses: 2, newSeen: 20, ts: 5, kinds: { new: 40 }, planned: { new: 30 }, byCh: {}, mocks: [] } } };
    const b = { days: {
      '2026-02-10': { q: 55, c: 40, w: 15, sk: 1, sec: 900, ses: 3, newSeen: 25, ts: 9, kinds: { new: 55 }, planned: { new: 30 }, byCh: {}, mocks: [] },
      '2026-02-11': { q: 10, c: 9, w: 1, sk: 0, sec: 100, ses: 1, newSeen: 0, ts: 9, kinds: {}, planned: {}, byCh: {}, mocks: [] } } };
    const m = LOG.mergeLogs(a, b);
    expect(m.days['2026-02-10'].q).toBe(55);                       // max, not 95
    expect(m.days['2026-02-10'].newSeen).toBe(25);
    expect(m.days['2026-02-11'].q).toBe(10);
    expect(LOG.mergeLogs(m, m).days['2026-02-10'].q).toBe(55);     // idempotent
  });
  it('a reset drops days older than the reset time', () => {
    const a = { days: { '2026-02-10': { q: 10, c: 5, w: 5, ts: 100, kinds: {}, planned: {}, byCh: {}, mocks: [] }, '2026-02-12': { q: 7, c: 7, w: 0, ts: 900, kinds: {}, planned: {}, byCh: {}, mocks: [] } } };
    const m = LOG.mergeLogs(a, null, 500);
    expect(Object.keys(m.days)).toEqual(['2026-02-12']);
  });
  it('clear() empties memory and storage', () => {
    LOG.recordSession(sess(), '2026-02-10'); LOG.clear();
    expect(LOG.days()).toEqual({});
    expect(store[LOG.KEY]).toBeUndefined();
  });
  it('survives corrupt storage', () => {
    store[LOG.KEY] = '{not json'; LOG._resetMemory();
    expect(LOG.days()).toEqual({});
  });
});

describe('daily remark: gentle, specific, never harsh', () => {
  const day = (o) => Object.assign({ q: 50, c: 42, w: 8, sk: 0, sec: 2400, ses: 2, newSeen: 30, planned: { new: 30 }, byCh: {}, kinds: {}, mocks: [] }, o);
  const ctx = { iso: '2026-02-10', today: '2026-02-11' };

  it('rest and off days are celebrated, not penalised', () => {
    expect(R.dayRemark(undefined, { ...ctx, isRest: true }).tone).toBe('rest');
    expect(R.dayRemark(undefined, { ...ctx, isOff: true }).title).toBe('Rest day');
  });
  it('a missed day is met with encouragement', () => {
    const r = R.dayRemark(undefined, ctx);
    expect(r.tone).toBe('low');
    expect(r.lines.join(' ')).toMatch(/No worries/);
    expect(r.lines.join(' ')).not.toMatch(/fail|lazy|bad|poor/i);
  });
  it('today with nothing yet is "not started", not a failure', () => {
    expect(R.dayRemark(undefined, { iso: '2026-02-11', today: '2026-02-11' }).tone).toBe('none');
  });
  it('a target-meeting, accurate day is a strong day', () => {
    const r = R.dayRemark(day(), ctx);
    expect(r.tone).toBe('great');
    expect(r.title).toBe('Strong day');
    expect(r.lines.join(' ')).toMatch(/target met \(30 of 30\)/);
    expect(r.acc).toBe(84);
    expect(r.planPct).toBe(100);
  });
  it('a day short of target explains the plan will absorb it', () => {
    const r = R.dayRemark(day({ newSeen: 10 }), ctx);
    expect(r.lines.join(' ')).toMatch(/absorb the difference/);
  });
  it('low accuracy gives a study tip, and names a weak chapter', () => {
    const r = R.dayRemark(day({ c: 15, w: 35, q: 50, byCh: { Hydrology: { n: 20, c: 5 }, Survey: { n: 30, c: 10 } } }), ctx);
    expect(r.tone).toBe('steady');
    expect(r.lines.join(' ')).toMatch(/Slow down/);
    expect(r.lines.join(' ')).toMatch(/Worth revisiting: Hydrology \(25%\)/);
  });
  it('flags rushing only when accuracy is also low', () => {
    const rushed = R.dayRemark(day({ c: 12, w: 38, sec: 300 }), ctx).lines.join(' ');
    expect(rushed).toMatch(/too quickly/);
    const fastAccurate = R.dayRemark(day({ sec: 300 }), ctx).lines.join(' ');
    expect(fastAccurate).not.toMatch(/too quickly/);
  });
  it('never returns more than five lines', () => {
    expect(R.dayRemark(day({ c: 5, w: 45, byCh: { A: { n: 10, c: 1 } }, sec: 100 }), ctx).lines.length).toBeLessThanOrEqual(5);
  });
});

describe('sprint summary and grade', () => {
  const start = '2026-02-01';
  const mk = (n, acc = 80, q = 40) => {
    const days = {};
    for (let i = 0; i < n; i++) days[P.addDays(start, i)] = { q, c: Math.round(q * acc / 100), w: q - Math.round(q * acc / 100), sk: 0, sec: 1800, ses: 1, newSeen: 30, kinds: {}, planned: { new: 30 }, byCh: { Hydrology: { n: q, c: Math.round(q * acc / 100) } }, mocks: [] };
    return days;
  };
  const plan = (o = {}) => Object.assign({ remaining: 600, totalAll: 3000, behindBy: 0, compressed: false, quotaToday: 40, learnEnd: '2026-03-07', dayNum: 10, N: 60, phase: 'Learn', exam: '2026-03-31', coveragePct: 80, levels: { l7: { pct: 82 }, gk: { pct: 70 } } }, o);

  it('no activity: no grade, an invitation to begin', () => {
    const s = R.summarize({}, { today: '2026-02-05', start, plan: plan(), streak: 0 });
    expect(s.grade).toBe('\u2014');
    expect(s.advice).toMatch(/first practice session/);
  });
  it('a consistent, accurate, on-schedule student earns an A', () => {
    const s = R.summarize(mk(10, 85), { today: '2026-02-10', start, plan: plan(), streak: 10 });
    expect(s.consistencyPct).toBe(100);
    expect(s.activeDays).toBe(10);
    expect(s.grade).toMatch(/^A/);
    expect(s.scores.overall).toBeGreaterThanOrEqual(80);
  });
  it('being far behind schedule lowers the grade and the advice points at coverage', () => {
    const s = R.summarize(mk(10, 85), { today: '2026-02-10', start, plan: plan({ behindBy: 900, status: 'behind' }), streak: 10 });
    expect(s.scores.coverage).toBeLessThan(40);
    expect(s.advice).toMatch(/coverage/);
    expect(s.grade).not.toMatch(/^A/);
  });
  it('rest days do not count against consistency', () => {
    const days = mk(10); delete days['2026-02-04']; delete days['2026-02-05'];
    const s = R.summarize(days, { today: '2026-02-10', start, rest: ['2026-02-04', '2026-02-05'], plan: plan(), streak: 5 });
    expect(s.consistencyPct).toBe(100);
  });
  it('weakest and strongest chapters need enough answers to count', () => {
    const days = mk(5);
    days['2026-02-03'].byCh = { Hydrology: { n: 4, c: 0 }, Survey: { n: 40, c: 38 }, Concrete: { n: 40, c: 20 } };
    const s = R.summarize(days, { today: '2026-02-05', start, plan: plan(), streak: 5 });
    const names = s.weakest.map((w) => w.name);
    expect(names[0]).toBe('Concrete');
    expect(s.strongest[0].name).toBe('Survey');
  });
  it('projects a finish date from recent pace and compares it with the end of Learn', () => {
    const s = R.summarize(mk(10), { today: '2026-02-10', start, plan: plan({ remaining: 300 }), streak: 10 });
    expect(s.finish).toBe('2026-02-19');                       // 300 / 30 per day = 10 days
    expect(s.projection).toMatch(/before the Learn phase ends/);
  });
  it('says so plainly when there is no recent pace to project', () => {
    const s = R.summarize(mk(2), { today: '2026-02-20', start, plan: plan({ remaining: 300 }), streak: 0 });
    expect(s.finish).toBeNull();
    expect(s.projection).toMatch(/cannot be projected/);
  });
  it('syllabus complete gives full coverage credit', () => {
    const s = R.summarize(mk(5), { today: '2026-02-05', start, plan: plan({ remaining: 0 }), streak: 5 });
    expect(s.scores.coverage).toBe(100);
    expect(s.projection).toMatch(/whole Level 7 and GK syllabus/);
  });
  it('the text report is complete and readable', () => {
    const s = R.summarize(mk(10), { today: '2026-02-10', start, plan: plan(), streak: 10 });
    const t = R.reportText(s, { plan: plan() });
    expect(t).toMatch(/Grade: /);
    expect(t).toMatch(/Syllabus covered: 80% · Level 7 82% · GK 70%/);
    expect(t).toMatch(/Active days: 10 of 10 study days/);
    expect(t.split('\n').length).toBeLessThan(20);
  });
});

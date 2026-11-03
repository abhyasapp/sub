import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const { SPRINT_PLAN: P } = loadGlobals(['js/features/sprint-plan.js']);

// Small deterministic PRNG so failures are reproducible.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function syllabus(rand, { chapters = 12, gk = 4 } = {}) {
  const units = [];
  for (let i = 0; i < chapters; i++) units.push({ fid: 'L7-' + i, lv: 'level7', ch: String(i), book: 'Core', name: 'L7 chapter ' + i, n: 20 + Math.floor(rand() * 180), seen: 0 });
  for (let i = 0; i < gk; i++) units.push({ fid: 'GK-' + i, lv: 'gk', ch: String(i), book: 'GK', name: 'GK chapter ' + i, n: 10 + Math.floor(rand() * 120), seen: 0 });
  return units;
}
const sumSlices = (days) => days.reduce((a, d) => a + d.slices.reduce((x, s) => x + s.count, 0), 0);

describe('phase split', () => {
  it('60 days is Learn 35 / Drill 17 / Mock 8, exactly as the sprint was designed', () => {
    expect(P.phaseSplit(60)).toEqual({ learn: 35, drill: 17, mock: 8 });
  });
  it('always adds up and keeps at least one Learn day, for any length', () => {
    for (let n = 1; n <= 200; n++) {
      const s = P.phaseSplit(n);
      expect(s.learn + s.drill + s.mock).toBe(n);
      expect(s.learn).toBeGreaterThanOrEqual(1);
      expect(s.drill).toBeGreaterThanOrEqual(0);
      expect(s.mock).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the whole syllabus is scheduled, nothing twice, nothing late', () => {
  it('100% of unseen questions land on a day on or before the last Learn day (300 random sprints)', () => {
    const rand = rng(20261021);
    for (let t = 0; t < 300; t++) {
      const units = syllabus(rand, { chapters: 3 + Math.floor(rand() * 20), gk: 1 + Math.floor(rand() * 8) });
      units.forEach((u) => { u.seen = Math.floor(rand() * u.n * 0.5); });          // some already seen
      const start = '2026-01-01';
      const dayIdx = Math.floor(rand() * 34);                                       // somewhere inside Learn
      const today = P.addDays(start, dayIdx);
      const rest = [];
      for (let i = 0; i < 60; i++) if (rand() < 0.1) rest.push(P.addDays(start, i));  // ~10% planned rest days
      const plan = P.buildPlan({ units, today, start, exam: P.addDays(start, 59), rest });
      if (plan.noStudyDays || plan.compressed) continue;
      expect(sumSlices(plan.schedule), `trial ${t}`).toBe(plan.remaining);
      expect(plan.schedule.every((d) => d.iso <= plan.learnEnd), `trial ${t} ends by learnEnd`).toBe(true);
      expect(plan.schedule.every((d) => !rest.includes(d.iso)), `trial ${t} skips rest days`).toBe(true);
    }
  });

  it('no question is scheduled more than once (slices never exceed a chapter\'s unseen count)', () => {
    const rand = rng(7);
    for (let t = 0; t < 100; t++) {
      const units = syllabus(rand);
      units.forEach((u) => { u.seen = Math.floor(rand() * u.n); });
      const plan = P.buildPlan({ units, today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31' });
      const used = {};
      plan.schedule.forEach((d) => d.slices.forEach((s) => { used[s.fid] = (used[s.fid] || 0) + s.count; }));
      units.forEach((u) => expect(used[u.fid] || 0, u.fid).toBeLessThanOrEqual(u.n - u.seen));
    }
  });

  it('daily load is even: no day differs from another by more than 1 question', () => {
    const units = syllabus(rng(3));
    const plan = P.buildPlan({ units, today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31' });
    const loads = plan.schedule.map((d) => d.newTarget);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    expect(loads.reduce((a, b) => a + b, 0)).toBe(plan.remaining);
  });

  it('GK is interleaved, not left to the end: both subjects finish in the final days', () => {
    const units = syllabus(rng(11), { chapters: 10, gk: 5 });
    const plan = P.buildPlan({ units, today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31' });
    const firstWeek = plan.schedule.slice(0, 7).flatMap((d) => d.slices);
    expect(firstWeek.some((s) => s.lv === 'gk')).toBe(true);
    expect(firstWeek.some((s) => s.lv === 'level7')).toBe(true);
    const lastDay = plan.schedule[plan.schedule.length - 1].slices;
    expect(lastDay.some((s) => s.lv === 'gk') || plan.schedule[plan.schedule.length - 2].slices.some((s) => s.lv === 'gk')).toBe(true);
  });

  it('a chapter is worked through in order (never revisits an earlier one before finishing it)', () => {
    const units = syllabus(rng(5), { chapters: 6, gk: 0 });
    const plan = P.buildPlan({ units, today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31' });
    const order = [];
    plan.schedule.forEach((d) => d.slices.forEach((s) => { if (order[order.length - 1] !== s.fid) order.push(s.fid); }));
    expect(order).toEqual([...new Set(order)]);         // each chapter appears as ONE contiguous run
  });
});

describe('missing days re-plans instead of failing', () => {
  const units = () => syllabus(rng(42));
  const base = { start: '2026-02-01', exam: '2026-03-31' };

  it('on a normal day the plan is on-track and today has a task', () => {
    const plan = P.buildPlan({ ...base, units: units(), today: '2026-02-01' });
    expect(plan.status).toBe('on-track');
    expect(plan.quotaToday).toBeGreaterThan(0);
    expect(plan.todaySlices.length).toBeGreaterThan(0);
  });

  it('after skipping a week the daily quota rises and the plan still ends on the same day', () => {
    const fresh = P.buildPlan({ ...base, units: units(), today: '2026-02-01' });
    const late = P.buildPlan({ ...base, units: units(), today: '2026-02-08' });      // nothing studied for 7 days
    expect(late.requiredPerDay).toBeGreaterThan(fresh.requiredPerDay);
    expect(late.finishesOn).toBe(fresh.finishesOn);
    expect(late.status).toBe('behind');
    expect(late.behindBy).toBeGreaterThan(0);
  });

  it('studying ahead of schedule is recognised', () => {
    const u = units();
    u.forEach((x) => { x.seen = Math.floor(x.n * 0.5); });
    const plan = P.buildPlan({ ...base, units: u, today: '2026-02-08' });
    expect(plan.status).toBe('ahead');
  });

  it("today's target stays fixed while the student works through it", () => {
    const u0 = units();
    const before = P.buildPlan({ ...base, units: u0, today: '2026-02-10' });
    // student covers 12 new questions of chapter 0 today
    const u1 = units(); u1[0].seen += 12;
    const during = P.buildPlan({ ...base, units: u1, today: '2026-02-10', newDoneToday: 12 });
    expect(during.quotaToday).toBe(before.quotaToday);
    expect(during.todayRemaining).toBe(Math.max(0, before.quotaToday - 12));
  });

  it('a rest day has no new-question target and the others absorb it', () => {
    const plan = P.buildPlan({ ...base, units: units(), today: '2026-02-10', rest: ['2026-02-10'] });
    expect(plan.quotaToday).toBe(0);
    expect(plan.todaySlices).toEqual([]);
    expect(plan.schedule[0].iso).toBe('2026-02-11');
    expect(sumSlices(plan.schedule)).toBe(plan.remaining);
  });

  it('past the last Learn day with questions left: compressed, still finishes before exam day', () => {
    const plan = P.buildPlan({ ...base, units: units(), today: '2026-03-10' });      // day 38 = Drill
    expect(plan.status).toBe('compressed');
    expect(plan.compressed).toBe(true);
    expect(sumSlices(plan.schedule)).toBe(plan.remaining);
    expect(plan.schedule.every((d) => d.iso < plan.exam)).toBe(true);
  });

  it('syllabus complete: nothing scheduled, status complete', () => {
    const u = units(); u.forEach((x) => { x.seen = x.n; });
    const plan = P.buildPlan({ ...base, units: u, today: '2026-02-20' });
    expect(plan.remaining).toBe(0);
    expect(plan.status).toBe('complete');
    expect(plan.schedule.every((d) => d.slices.length === 0)).toBe(true);
    expect(plan.coveragePct).toBe(100);
  });
});

describe('edge cases never throw or produce nonsense', () => {
  it('empty syllabus', () => {
    const plan = P.buildPlan({ units: [], today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31' });
    expect(plan.totalAll).toBe(0);
    expect(plan.coveragePct).toBe(100);
    expect(plan.status).toBe('complete');
  });
  it('exam tomorrow', () => {
    const plan = P.buildPlan({ units: syllabus(rng(1)), today: '2026-02-01', start: '2026-02-01', exam: '2026-02-02' });
    expect(plan.N).toBe(2);
    expect(Number.isFinite(plan.requiredPerDay)).toBe(true);
  });
  it('exam date before start falls back to a 60-day window', () => {
    const plan = P.buildPlan({ units: syllabus(rng(1)), today: '2026-02-01', start: '2026-02-01', exam: '2025-01-01' });
    expect(plan.N).toBe(60);
  });
  it('every day marked rest: still returns a (forced) plan rather than dividing by zero', () => {
    const rest = []; for (let i = 0; i < 70; i++) rest.push(P.addDays('2026-02-01', i));
    const plan = P.buildPlan({ units: syllabus(rng(1)), today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31', rest });
    expect(plan.noStudyDays).toBe(true);
    expect(Number.isFinite(plan.requiredPerDay)).toBe(true);
  });
  it('dirty counts (seen > n, negatives, strings) are clamped', () => {
    const plan = P.buildPlan({ units: [{ fid: 'a', lv: 'level7', n: '40', seen: 90 }, { fid: 'b', lv: 'gk', n: -5, seen: 'x' }], today: '2026-02-01', start: '2026-02-01', exam: '2026-03-31' });
    expect(plan.totalAll).toBe(40);
    expect(plan.remaining).toBe(0);
  });
  it('start in the future: day 1 is the start day', () => {
    const plan = P.buildPlan({ units: syllabus(rng(1)), today: '2026-01-20', start: '2026-02-01', exam: '2026-03-31' });
    expect(plan.dayNum).toBe(1);
    expect(plan.today).toBe('2026-02-01');
  });
  it('DST-safe date arithmetic across a year boundary and leap day', () => {
    expect(P.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(P.addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(P.diffDays('2026-03-01', '2026-03-31')).toBe(30);
  });
});

describe('pace and projection', () => {
  it('recentRate counts missed study days as zero and ignores rest days', () => {
    const days = { '2026-02-10': { newSeen: 30 }, '2026-02-09': { newSeen: 10 } };
    expect(P.recentRate(days, '2026-02-10', [], [], 4)).toBe(10);                        // 40 over 4 days
    expect(P.recentRate(days, '2026-02-10', ['2026-02-08', '2026-02-07'], [], 4)).toBe(20); // 2 rest days dropped
  });
  it('projectFinish skips rest days and returns null when there is no pace', () => {
    expect(P.projectFinish(100, 50, '2026-02-01', [], [])).toBe('2026-02-02');
    expect(P.projectFinish(100, 50, '2026-02-01', ['2026-02-02'], [])).toBe('2026-02-03');
    expect(P.projectFinish(100, 0, '2026-02-01', [], [])).toBeNull();
    expect(P.projectFinish(0, 0, '2026-02-01', [], [])).toBe('2026-02-01');
  });
});

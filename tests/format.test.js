import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/format.js']);

describe('timers', () => {
  it('fmt mm:ss, clamps negatives', () => {
    expect(g.fmt(65)).toBe('01:05');
    expect(g.fmt(0)).toBe('00:00');
    expect(g.fmt(-5)).toBe('00:00');
  });
  it('fmtHMS', () => {
    expect(g.fmtHMS(3661)).toBe('01:01:01');
    expect(g.fmtHMS(-1)).toBe('00:00:00');
  });
});

describe('isOk (answer checking)', () => {
  it('compares numbers numerically', () => {
    expect(g.isOk('2', 2)).toBe(true);
    expect(g.isOk('2.0', '2')).toBe(true);
    expect(g.isOk('3', '2')).toBe(false);
  });
  it('compares text case-insensitively and trims', () => {
    expect(g.isOk(' A ', 'a')).toBe(true);
    expect(g.isOk('a', 'b')).toBe(false);
  });
  it('null/undefined/empty are never correct', () => {
    expect(g.isOk(null, 'a')).toBe(false);
    expect(g.isOk('a', undefined)).toBe(false);
    expect(g.isOk('', '')).toBe(true); // both empty strings fall to the text branch and match
  });
});

describe('dates', () => {
  it('today() is YYYY-MM-DD', () => expect(g.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  it('localDateOffset crosses month boundaries', () => {
    expect(g.localDateOffset(new Date(2026, 0, 31), 1)).toBe('2026-02-01');
    expect(g.localDateOffset(new Date(2026, 2, 1), -1)).toBe('2026-02-28');
  });
});

describe('shuf', () => {
  it('returns a permutation and does not mutate the input', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...a];
    const b = g.shuf(a);
    expect(a).toEqual(copy);
    expect([...b].sort()).toEqual(copy);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { countQuestions, buildIndex, render } from '../tools/build-content-index.mjs';

const q = (n) => Array.from({ length: n }, (_, i) => ({ q: 'Q' + i, options: ['a', 'b', 'c', 'd'], correct: 1 }));

describe('content index generator', () => {
  it('counts exactly like the app parser: needs text and 2+ options', () => {
    expect(countQuestions(q(7))).toBe(7);
    expect(countQuestions({ questions: q(3) })).toBe(3);
    expect(countQuestions([{ q: 'x', options: ['only one'] }, { options: ['a', 'b'] }, { q: 'ok', a: 'x', b: 'y' }, null, 'str'])).toBe(1);
    expect(countQuestions({ success: false, error: 'x' })).toBe(0);
    expect(countQuestions('nonsense')).toBeNull();
  });
  it('walks nested folders, ignores .git, and reports files it cannot count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-'));
    fs.mkdirSync(path.join(dir, 'level7', 'ch1'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, 'level7', 'ch1', 'a.json'), JSON.stringify(q(12)));
    fs.writeFileSync(path.join(dir, 'gk.json'), JSON.stringify({ questions: q(5) }));
    fs.writeFileSync(path.join(dir, '.git', 'x.json'), JSON.stringify(q(99)));
    fs.writeFileSync(path.join(dir, 'broken.json'), '{nope');
    fs.writeFileSync(path.join(dir, 'locked.json'), JSON.stringify({ enc: 1, iv: 'x', ct: 'y' }));
    fs.writeFileSync(path.join(dir, 'locked2.json'), JSON.stringify({ enc: 1, count: 40 }));
    const { index, skipped } = buildIndex(dir);
    expect(index).toEqual({ 'level7/ch1/a': 12, gk: 5, locked2: 40 });
    expect(skipped.some((s) => s.startsWith('broken'))).toBe(true);
    expect(skipped.some((s) => s.startsWith('locked ') && s.includes('encrypted'))).toBe(true);
  });
  it('renders a browser script that merges into window.CONTENT_INDEX, sorted and stable', () => {
    const t = render({ b: 2, a: 1 });
    expect(t).toMatch(/window\.CONTENT_INDEX = Object\.assign\(window\.CONTENT_INDEX \|\| \{\}, \{\n {2}"a": 1,\n {2}"b": 2\n\}\);/);
    expect(t).toBe(render({ a: 1, b: 2 }));
  });
});

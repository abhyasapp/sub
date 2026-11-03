// tests/pages.test.js — boot each page for real and fail on a fatal script error.
//
// jsdom's error log is the only place a classic-script SyntaxError shows up
// (e.g. two files both declaring `const ADMIN`): the offending file is skipped
// silently and its feature disappears. Booting the pages catches that class of
// breakage, which the per-file syntax check cannot see.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

// chapters-loader.js executes the fetched body as a script. The default stub
// returns JSON, which would be a bogus SyntaxError; hand it valid JS instead.
const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';

const isSyntaxError = (m) => /SyntaxError/.test(m);

describe.each(['index.html', 'user.html', 'admin.html'])('%s', (page) => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, page, { fetchReply, waitMs: 1200 });
  }, 120000);
  afterAll(() => p && p.close());

  it('loads every script without a SyntaxError', () => {
    const fatal = p.log.errors.filter(isSyntaxError);
    expect(fatal, `fatal script errors:\n${fatal.join('\n')}`).toEqual([]);
  });
});

describe('admin.html grading module', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { fetchReply, waitMs: 1200 });
  }, 120000);
  afterAll(() => p && p.close());

  it('exposes the helpers the subjective screens call', () => {
    for (const name of ['gradeCard', 'saveGrade', 'regradeSheet', '_regradeCommit']) {
      expect(p.ev(`typeof ${name}`), `${name} is missing from admin.html`).toBe('function');
    }
  });
});

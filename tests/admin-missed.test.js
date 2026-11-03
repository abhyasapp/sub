// tests/admin-missed.test.js — the "Most missed questions" panel.
//
// The panel loads question text for every result. It tries one batch
// getFiles call first and must fall back to per-file getFile calls when the
// server does not support the batch action — otherwise the panel silently
// loses all question text.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 400) => new Promise((r) => setTimeout(r, ms));

describe('admin: most missed questions', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'admin.html', { waitMs: 800 });
  }, 120000);
  afterAll(() => p && p.close());

  const stub = (batchReply) => p.ev(`(() => {
    window.__calls = [];
    ADMIN.post = async (action, params) => {
      window.__calls.push(action);
      if (action === 'adminMostMissedQuestions') {
        return { success: true, results: [
          { fileId: 'f1', index: 0, uid: 'f1_0', wrongRate: 80, total: 10, wrong: 8, accuracy: 20 },
          { fileId: 'f2', index: 0, uid: 'f2_0', wrongRate: 60, total: 10, wrong: 6, accuracy: 40 }
        ] };
      }
      if (action === 'getFiles') { ${batchReply} }
      if (action === 'getFile') {
        return { success: true, result: [{ q: 'Fallback question for ' + params.fileId }] };
      }
      return { success: true };
    };
  })()`);

  const rendered = () => p.ev(`[...document.querySelectorAll('#missed-list .miss-q')].map(e => e.textContent.trim())`);
  const calls = (action) => p.ev(`window.__calls.filter(a => a === '${action}').length`);

  it('uses one batch getFiles call when the server supports it', async () => {
    stub(`return { success: true, files: {
      f1: { success: true, content: JSON.stringify([{ q: 'Question from file one' }]) },
      f2: { success: true, content: JSON.stringify([{ q: 'Question from file two' }]) }
    } };`);
    p.ev('MISSED.load()');
    await tick();

    expect(rendered()).toEqual(['Question from file one', 'Question from file two']);
    expect(calls('getFiles')).toBe(1);
    expect(calls('getFile')).toBe(0);
  });

  it('unwraps the real backend shape and falls back for a file the batch could not resolve', async () => {
    stub(`return { success: true, files: {
      f1: { success: true, content: JSON.stringify([{ q: 'Question from file one' }]) },
      f2: { success: false, error: 'File not found in Storage.' }
    } };`);
    p.ev('MISSED.load()');
    await tick();

    expect(rendered()).toEqual(['Question from file one', 'Fallback question for f2']);
    expect(calls('getFiles')).toBe(1);
    expect(calls('getFile')).toBe(1);
  });

  it('falls back to per-file getFile when the batch action is unsupported', async () => {
    stub(`return { success: false, error: 'unknown action' };`);
    p.ev('MISSED.load()');
    await tick();

    const text = rendered();
    expect(text).toContain('Fallback question for f1');
    expect(text).toContain('Fallback question for f2');
    expect(calls('getFile')).toBe(2);
  });
});

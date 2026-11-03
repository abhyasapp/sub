// tests/qnote.test.js — personal notes must survive being pasted from
// anywhere and must show their maths.
//
// Notes are copied out of PDFs, Word, HTML source and code blocks, so they
// arrive carrying the damage those sources do. Two things hold here: the
// damaged text is repaired on save and on read (so a note saved before the
// repair exists heals too), and a note renders its own maths rather than
// depending on the caller having run renderMath() after it was written — the
// flashcard runs renderMath(fc-wrap) BEFORE it inserts the note.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { loadGlobals, ROOT } from './helpers/load-globals.js';

const fetchReply = () => 'window.ChapterData = window.ChapterData || [];';

describe('repairPasted', () => {
  const ctx = loadGlobals(['js/core/text.js']);
  const repair = (s) => ctx.repairPasted(s);

  it('collapses a backslash escaped by JSON or a code block', () => {
    expect(repair(String.raw`\\frac{a}{b}`)).toBe(String.raw`\frac{a}{b}`);
    expect(repair(String.raw`\\\\alpha`)).toBe(String.raw`\alpha`);
  });

  it('leaves a real LaTeX line break and spacing command alone', () => {
    expect(repair(String.raw`a \\ b`)).toBe(String.raw`a \\ b`);
    expect(repair(String.raw`v \\[2pt] u`)).toBe(String.raw`v \\[2pt] u`);
  });

  it('never touches an already-correct single backslash', () => {
    const good = String.raw`\frac{a}{b} \(\alpha\) \[E=mc^2\]`;
    expect(repair(good)).toBe(good);
  });

  it('decodes HTML entities exactly once', () => {
    expect(repair('a&nbsp;b')).toBe('a b');
    expect(repair('&amp; &lt; &quot; &#39;')).toBe("& < \" '");
    /* A single pass, so an escaped entity stays half-escaped rather than
       being decoded into a real bracket. */
    expect(repair('&amp;lt;')).toBe('&lt;');
  });

  it('strips characters that render as nothing', () => {
    expect(repair('a\u00ADb\u200Bc\u2060d\uFEFF')).toBe('abcd');
  });

  it('keeps the joiners Devanagari needs, so Nepali notes are not corrupted', () => {
    /* ZWNJ (U+200C) and ZWJ (U+200D) shape matras — stripping them would
       visibly break the words rather than clean them up. */
    expect(repair('का\u200Cम')).toBe('का\u200Cम');
    expect(repair('पुर\u200D्याउँ')).toBe('पुर\u200D्याउँ');
  });

  it('normalises line endings and tolerates corrupt storage', () => {
    expect(repair('a\r\nb\rc')).toBe('a\nb\nc');
    expect(repair(null)).toBe('');
    expect(repair(undefined)).toBe('');
    expect(repair(42)).toBe('42');
  });
});

describe('personal notes (user.html)', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html', { fetchReply });
    /* KaTeX is loaded on demand in the browser (js/core/format.js, only when a note or question has a
       formula). jsdom does not run dynamically inserted scripts, so evaluate the vendored files directly:
       these tests are about what the note renders once the library is there. */
    for (const f of ['katex.min.js', 'auto-render.min.js']) {
      p.ev(fs.readFileSync(path.join(ROOT, 'tools/vendor/katex', f), 'utf8'));
    }
    p.ev(`document.body.insertAdjacentHTML('beforeend', '<div id="qn-test"></div>')`);
  }, 120000);
  afterAll(() => p && p.close());

  const setNote = (uid, text) =>
    p.ev(`QNOTE.set(${JSON.stringify(uid)}, ${JSON.stringify(text)})`);
  const show = (uid) => p.ev(`QNOTE.render('qn-test', ${JSON.stringify(uid)})`);
  const stored = (uid) => p.ev(
    `JSON.parse(localStorage.getItem('abhyas_qnotes') || '{}')[${JSON.stringify(uid)}] || ''`
  );
  const has = (sel) => p.ev(`!!document.querySelector('#qn-test ${sel}')`);

  it('repairs a mangled paste on save', () => {
    const damaged = 'Seepage: \\\\frac{dh}{dt} &nbsp;\u200B and \\( k = 20 \\frac{m}{d} \\)';
    setNote('uidFix', damaged);

    const saved = stored('uidFix');
    expect(saved).toContain(String.raw`\frac{dh}{dt}`);
    expect(saved).not.toContain(String.raw`\\frac`);
    expect(saved).not.toContain('&nbsp;');
    expect(saved).not.toContain('\u200B');
    /* The correctly-typed maths around it must survive untouched. */
    expect(saved).toContain(String.raw`\( k = 20 \frac{m}{d} \)`);
  });

  it('renders inline $…$ maths inside the note', () => {
    setNote('uidD', 'Factor $\\frac{a}{b}$ before integrating.');
    show('uidD');

    expect(has('.qnote-text .katex-html')).toBe(true);
    expect(p.ev(`document.querySelector('#qn-test .qnote-text').textContent`))
      .toContain('Factor');
  });

  it('renders \\(…\\) — the delimiter a LaTeX source actually copies', () => {
    setNote('uidP', 'Manning \\( Q = \\frac{1}{n} A R^{2/3} S^{1/2} \\)');
    show('uidP');

    expect(has('.qnote-text .katex-html')).toBe(true);
    expect(p.ev(`!!document.querySelector('#qn-test .qnote-text .katex')`)).toBe(true);
  });

  it('renders \\[…\\] as display maths', () => {
    setNote('uidB', 'Storage \\[ S = \\frac{V}{A} \\]');
    show('uidB');

    expect(has('.qnote-text .katex-display')).toBe(true);
  });

  it('falls back to the plain text when a note has no maths', () => {
    setNote('uidT', 'Compare with the previous chapter.');
    show('uidT');

    expect(p.ev(`document.querySelector('#qn-test .qnote-text').textContent`))
      .toBe('Compare with the previous chapter.');
    expect(has('.qnote-text .katex')).toBe(false);
  });

  it('renders maths added before a note box has ever been shown', () => {
    /* Regression: QNOTE.render is what writes the box, so it must call
       renderMath itself — the flashcard's own renderMath already ran. */
    setNote('uidLate', '\\( \\tau = F \\times r \\)');
    show('uidLate');

    expect(has('.qnote-text .katex-html')).toBe(true);
  });
});

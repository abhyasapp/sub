// Regression tests for "button does nothing" bugs. These boot the REAL pages
// (all their scripts) in jsdom — see tools/lib/boot-page.mjs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('student app (user.html)', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html');
    p.ev(`S.user = { username: 'tester', token: 'tok' }; S.online = true; S.forcedOffline = false;`);
  }, 120000);
  afterAll(() => p && p.close());

  const openReport = () =>
    p.ev(`USER_REPORT.openSheet({ uid: 'abcdefghijklmnopqrstuvwxyz1_1', q: 'What is 2+2?', options: ['3', '4'], correct: 1,
                                 fileId: 'abcdefghijklmnopqrstuvwxyz1' }, { section: 'practice' })`);
  const modalShown = () => p.w.document.getElementById('mbg').classList.contains('show');

  it('"Send Report" sends the report and closes the sheet', async () => {
    openReport();
    expect(modalShown()).toBe(true);
    p.log.fetches.length = 0;
    p.w.document.getElementById('qr-send-btn').click();
    await tick();
    const sent = p.log.fetches.map((f) => JSON.parse(f.body || '{}'));
    expect(sent.some((b) => b.action === 'reportQuestion' && b.reason)).toBe(true);
    expect(modalShown()).toBe(false);
  });

  it('clicking plain text inside the sheet does NOT close it, clicking the backdrop does', () => {
    openReport();
    p.w.document.getElementById('qr-note').click();      // inside .mbox
    expect(modalShown()).toBe(true);
    p.w.document.getElementById('mbg').click();          // backdrop
    expect(modalShown()).toBe(false);
  });

  it('the ✕ close button still closes the sheet', () => {
    openReport();
    p.w.document.querySelector('#mbg .mcl').click();
    expect(modalShown()).toBe(false);
  });

  it('buttons wired with element.onclick work anywhere inside a data-on-click container', () => {
    let hit = 0;
    const box = p.w.document.createElement('div');
    box.setAttribute('data-on-click', 'event.stopPropagation()');
    const b = p.w.document.createElement('button');
    b.onclick = () => { hit++; };
    box.appendChild(b); p.w.document.body.appendChild(box);
    b.click();
    expect(hit).toBe(1);
    box.remove();
  });

  it('a handler\'s stopPropagation still shields ancestors\' data-on-click', () => {
    let outer = 0, inner = 0;
    p.w.__o = () => { outer++; }; p.w.__i = () => { inner++; };
    const d = p.w.document;
    const o = d.createElement('div'); o.setAttribute('data-on-click', '__o()');
    const i = d.createElement('div'); i.setAttribute('data-on-click', '__i();event.stopPropagation()');
    o.appendChild(i); d.body.appendChild(o);
    i.click();
    expect([inner, outer]).toEqual([1, 0]);
    o.remove();
  });

  it('ACT.later (used by the "Admin console" shortcut) runs its target', async () => {
    let got = null;
    p.w.__t = { go(x) { got = x; } };
    p.ev(`ACT.later(10, __t, 'go', 42)`);
    await tick(60);
    expect(got).toBe(42);
  });

  it('TODAY_PLAN.resume exists (Home "Continue" chip)', () => {
    expect(p.ev('typeof TODAY_PLAN.resume')).toBe('function');
    expect(() => p.ev('TODAY_PLAN.resume()')).not.toThrow();   // no history yet → friendly toast, no crash
  });
});

describe('sign-in page (index.html)', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'index.html'); }, 120000);
  afterAll(() => p && p.close());

  it('every "Show password" eye button toggles its field', () => {
    const btns = [...p.w.document.querySelectorAll('.pw-field button')];
    expect(btns.length).toBeGreaterThanOrEqual(4);
    for (const b of btns) {
      const input = b.closest('.pw-field').querySelector('input');
      expect(input.type).toBe('password');
      b.click();
      expect(input.type).toBe('text');
      expect(b.getAttribute('aria-pressed')).toBe('true');
      b.click();
      expect(input.type).toBe('password');
    }
  });
});

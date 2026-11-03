// tests/settings.test.js — the "Display and accessibility" and "Storage" cards on Data & backup.
// Both used to be empty containers with no code behind them, so they opened to a blank card.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';

const tick = (ms = 250) => new Promise((r) => setTimeout(r, ms));

describe('settings cards (user.html)', () => {
  let p;
  beforeAll(async () => { p = await bootPage(ROOT, 'user.html'); }, 120000);
  afterAll(() => p && p.close());
  const text = (sel) => p.ev(`(document.querySelector('${sel}') || { textContent: '' }).textContent.replace(/\\s+/g, ' ').trim()`);

  it('fills the display card with every control', async () => {
    p.ev('SETTINGS.refresh()'); await tick();
    const t = await text('#display-card-body');
    for (const w of ['Theme', 'Text size', 'Language', 'Reduce motion', 'Focus mode']) expect(t).toContain(w);
  });

  it('theme: dark is stored, automatic clears the stored choice', () => {
    p.ev("SETTINGS.theme('dark')");
    expect(p.ev("document.documentElement.classList.contains('dark')")).toBe(true);
    expect(p.ev("JSON.parse(localStorage.getItem('abhyas_theme'))")).toBe('dark');
    p.ev("SETTINGS.theme('auto')");
    expect(p.ev("localStorage.getItem('abhyas_theme')")).toBe(null);
    p.ev("SETTINGS.theme('light')");
    expect(p.ev("document.documentElement.classList.contains('dark')")).toBe(false);
  });

  it('text size: a step is applied and stored, Normal restores the default', () => {
    p.ev("SETTINGS.textSize('112')");
    expect(p.ev('document.documentElement.style.fontSize')).toBe('112%');
    expect(p.ev("JSON.parse(localStorage.getItem('abhyas_fs'))")).toBe(112);
    p.ev("SETTINGS.textSize('100')");
    expect(p.ev('document.documentElement.style.fontSize')).toBe('');
    p.ev("SETTINGS.textSize('999')");                       // not a real step: ignored
    expect(p.ev('document.documentElement.style.fontSize')).toBe('');
  });

  it('reduce motion toggles the class and the stored flag', () => {
    p.ev('SETTINGS.toggleMotion()');
    expect(p.ev("document.documentElement.classList.contains('reduce-motion')")).toBe(true);
    expect(p.ev("localStorage.getItem('abhyas_reduce_motion')")).toBe('1');
    p.ev('SETTINGS.toggleMotion()');
    expect(p.ev("document.documentElement.classList.contains('reduce-motion')")).toBe(false);
  });

  it('the switches use aria-checked, not aria-pressed (a switch role allows only the former)', async () => {
    p.ev('SETTINGS.renderDisplay()');
    expect(p.ev("document.querySelectorAll('#display-card-body [role=switch][aria-pressed]').length")).toBe(0);
    expect(p.ev("document.querySelectorAll('#display-card-body [role=switch][aria-checked]').length")).toBe(2);
  });

  it('storage card: meter, counts, backup, and removal disabled while nothing is saved', async () => {
    p.ev('QDB.clear()'); await tick(200);
    p.ev('SETTINGS.renderStorage()'); await tick();
    const t = await text('#storage-card-body');
    expect(t).not.toContain('Checking');
    for (const w of ['Progress, notes and settings', 'Downloaded question sets', 'Download backup', 'Remove downloaded sets']) expect(t).toContain(w);
    expect(p.ev("document.querySelector('#storage-card-body [role=progressbar]').getAttribute('aria-valuenow') !== null")).toBe(true);
    expect(p.ev("document.querySelector(\"#storage-card-body [data-on-click='SETTINGS.removeDownloads()']\").disabled")).toBe(true);
  });

  it('near full: warns, promises nothing is deleted automatically, meter changes style', async () => {
    p.ev("localStorage.setItem('zz_filler', 'x'.repeat(Math.floor(STORE_GUARD.LIMIT * 0.85 / 2)))");
    p.ev('SETTINGS.renderStorage()'); await tick();
    expect(await text('#storage-card-body')).toContain('Nothing is ever deleted automatically');
    expect(p.ev("!!document.querySelector('#storage-card-body .meter.warn')")).toBe(true);
    p.ev("localStorage.removeItem('zz_filler')");
  });

  it('language: the card translates itself', async () => {
    p.ev("SETTINGS.language('ne')"); await tick();
    expect(await text('#display-card-body')).toContain('भाषा');
    p.ev("SETTINGS.language('en')"); await tick();
    expect(await text('#display-card-body')).toContain('Language');
  });
});

// tests/i18n.test.js — the Nepali layer.
//
// Two things must hold: every bound string has a translation (otherwise a
// control silently stays English), and switching language rewrites the DOM,
// persists, and switches back cleanly.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootPage } from '../tools/lib/boot-page.mjs';
import { ROOT } from './helpers/load-globals.js';
import { dictionaryKeys, missingKeys } from '../tools/check-i18n.mjs';

describe('i18n dictionary', () => {
  it('has Nepali entries', () => {
    expect(dictionaryKeys().size).toBeGreaterThan(50);
  });

  it('covers every data-i18n node and literal I18N.t() key', () => {
    expect(missingKeys()).toEqual([]);
  });
});

describe('language switch (index.html)', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'index.html');
  }, 120000);
  afterAll(() => p && p.close());

  const firstTab = () => p.ev(`document.querySelector('#auth-tabs .tab').textContent.trim()`);
  const loginLabel = () => p.ev(`document.querySelector('label[for="in-user"]').textContent.trim()`);

  it('starts in English', () => {
    expect(firstTab()).toBe('Sign in');
    expect(p.ev('document.documentElement.lang')).toBe('en-NP');
  });

  it('translates the bound controls and persists the choice', () => {
    p.ev(`I18N.setLang('ne', { silent: true })`);

    expect(firstTab()).toBe('साइन इन');
    expect(loginLabel()).toBe('प्रयोगकर्ता नाम, इमेल वा मोबाइल');
    expect(p.ev('document.documentElement.lang')).toBe('ne-NP');
    expect(p.ev(`localStorage.getItem('abhyas_lang')`)).toBe('ne');
    /* The switcher names the language you would switch to, not the current one. */
    expect(p.ev(`document.querySelector('[data-lang-label]').textContent.trim()`)).toBe('English');
  });

  it('switches back and restores the original English text', () => {
    p.ev(`I18N.toggleLang()`);

    expect(firstTab()).toBe('Sign in');
    expect(loginLabel()).toBe('Username, email or mobile');
    expect(p.ev(`localStorage.getItem('abhyas_lang')`)).toBe('en');
    expect(p.ev(`document.querySelector('[data-lang-label]').textContent.trim()`)).toBe('नेपाली');
  });

  it('interpolates numbers into a translated sentence', () => {
    p.ev(`I18N.setLang('ne', { silent: true })`);
    expect(p.ev(`I18N.t('{n} to go · about {m}', { n: 10, m: '9m' })`)).toBe('10 बाँकी · करिब 9m');
    expect(p.ev(`I18N.t('{n} from your weak chapters', { n: 35 })`)).toBe('कमजोर अध्यायबाट 35');
    p.ev(`I18N.setLang('en', { silent: true })`);
  });

  it('falls back to the English key when a translation is absent', () => {
    expect(p.ev(`I18N.t('A string nobody translated')`)).toBe('A string nobody translated');
  });
});

describe('language switch (user.html)', () => {
  let p;
  beforeAll(async () => {
    p = await bootPage(ROOT, 'user.html');
  }, 120000);
  afterAll(() => p && p.close());

  it('re-renders the sidebar and the generated sprint rows', async () => {
    p.ev(`I18N.setLang('ne', { silent: true })`);

    expect(p.ev(`document.querySelector('#nav-online').textContent.trim()`)).toBe('अध्याय');
    expect(p.ev(`document.querySelector('#nav-home').textContent.trim()`)).toBe('गृहपृष्ठ');

    p.ev(`S.wr = []; S.prog = S.prog || {};
          S.prog.sessions = [{ chapter: 'Chapter one', at: Date.now(), total: 4, durationSec: 120 }];
          SPRINT_PAGE.render();`);
    await new Promise((r) => setTimeout(r, 160));

    const rows = p.ev(`[...document.querySelectorAll('#sprint-today-list .list-row')].map(r => r.textContent.replace(/\\s+/g,' ').trim())`);
    // With no content downloaded the sprint shows its "syllabus complete" row: title and badge are translated.
    expect(rows.find((t) => t.includes('पाठ्यक्रम पूरा'))).toBeTruthy();
    expect(rows.find((t) => t.includes('सकियो'))).toBeTruthy();
  });
});

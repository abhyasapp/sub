#!/usr/bin/env node
/* tools/check-i18n.mjs — every translatable string must have a Nepali entry.
 *
 *   node tools/check-i18n.mjs    exit 1 and list the missing keys
 *
 * Why: data-i18n falls back to English when a key is absent, so a typo in an
 * attribute ships a silently untranslated control. The strings are English
 * text, so an apostrophe that is curly in the dictionary and straight in the
 * HTML is exactly the kind of mistake this catches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'user.html'];
const SCRIPTS = ['js/features/sprint.js', 'js/core/nav.js', 'js/features/chapter-nav.js'];

export function dictionaryKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'js/core/i18n.js'), 'utf8');
  const start = src.indexOf('const NE = {');
  const end = src.indexOf('const DICTS');
  if (start < 0 || end < 0) return new Set();
  const block = src.slice(start, end);
  const keys = new Set();
  const re = /^\s{4}(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*:/gm;
  let m;
  while ((m = re.exec(block))) {
    keys.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  return keys;
}

export function missingKeys() {
  const have = dictionaryKeys();
  const missing = [];

  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    /* <tag ... data-i18n>English</tag> or <tag data-i18n="English"> */
    const re = /data-i18n(?:\s*=\s*"([^"]*)")?[^>]*>([^<]*)</g;
    let m;
    while ((m = re.exec(html))) {
      const key = (m[1] || m[2] || '').trim().replace(/\s+/g, ' ');
      if (key && !have.has(key)) missing.push(`${page} :: ${JSON.stringify(key)}`);
    }
  }

  for (const file of SCRIPTS) {
    const js = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const re = /\b(?:I18N\.t|T)\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
    let m;
    while ((m = re.exec(js))) {
      const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
      /* Only literal keys — T(someVariable) has no m[2] and is skipped. */
      if (key && !have.has(key)) missing.push(`${file} :: ${JSON.stringify(key)}`);
    }
  }

  return [...new Set(missing)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = missingKeys();
  if (missing.length) {
    console.error('Missing Nepali translations:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  console.log('i18n: every bound string has a Nepali translation');
}

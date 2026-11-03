#!/usr/bin/env node
/* tools/sync-shell.mjs — keep the service worker's SHELL precache list in step with the pages.
 *
 *   node tools/sync-shell.mjs          rewrite the SHELL array in sw.js (appends what is missing)
 *   node tools/sync-shell.mjs --check  exit 1 if sw.js is missing anything (used by the tests)
 *
 * Why: sw.js only precached ~13 of the ~90 scripts user.html loads. The rest were cached lazily on
 * the *second* page load, so installing the PWA and going offline straight away left features broken.
 * Every local <script src> / <link href> of index.html and user.html must be in SHELL.
 * admin.html is intentionally never cached.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'user.html'];
const swPath = path.join(ROOT, 'sw.js');

export function referencedFiles() {
  const out = new Set();
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      const tag = m[0];
      const url = m[1];
      if (/^([a-z]+:|\/\/|#|data:|mailto:)/i.test(url) || url.startsWith('/')) continue;
      if (/rel\s*=\s*["']?(canonical|alternate|manifest)/i.test(tag)) continue;
      const clean = url.split(/[?#]/)[0];
      if (/\.(js|css|woff2?|png|ico|json|svg)$/i.test(clean) && fs.existsSync(path.join(ROOT, clean)))
        out.add('./' + clean.replace(/^\.\//, ''));
    }
  }
  return out;
}

export function currentShell(src = fs.readFileSync(swPath, 'utf8')) {
  const body = /const SHELL = \[([\s\S]*?)\];/.exec(src)[1];
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

export function missingFromShell() {
  const have = new Set(currentShell());
  return [...referencedFiles()].filter((f) => !have.has(f)).sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = missingFromShell();
  if (process.argv.includes('--check')) {
    if (missing.length) { console.error('sw.js SHELL is missing:\n  ' + missing.join('\n  ')); process.exit(1); }
    console.log('sw.js SHELL covers every local script/style of index.html + user.html');
  } else if (!missing.length) {
    console.log('SHELL already complete');
  } else {
    const src = fs.readFileSync(swPath, 'utf8');
    const add = missing.map((f) => `  '${f}'`).join(',\n');
    const next = src.replace(/(const SHELL = \[[\s\S]*?)(\n\];)/, (_, a, b) => `${a},\n${add}${b}`);
    fs.writeFileSync(swPath, next);
    console.log(`Added ${missing.length} files to SHELL`);
  }
}

// The GitHub Pages workflow ships only: js/, tools/vendor/, root *.html, css/, manifest, sw.js, robots, sitemap, *.png.
// If any page or the service worker references a runtime file outside that set, production would 404.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT } from './helpers/load-globals.js';

const SHIPPED = (rel) =>
  rel.startsWith('js/') || rel.startsWith('css/') || rel.startsWith('tools/vendor/') ||
  /^[^/]+\.(html|png)$/.test(rel) || ['manifest.json', 'sw.js', 'robots.txt', 'sitemap.xml'].includes(rel);

function refs(file, re) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...s.matchAll(re)].map((m) => m[1].split('?')[0].split('#')[0].replace(/^\.\//, ''))
    .filter((r) => r && !/^(https?:|data:|mailto:|tel:|\/\/|\/)/.test(r));
}

describe('production bundle (what GitHub Pages deploys)', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const wanted = new Set();
  for (const p of pages) refs(p, /(?:src|href)="([^"]+)"/g).forEach((r) => wanted.add(r));
  refs('sw.js', /'(\.\/[^']+)'/g).forEach((r) => wanted.add(r));

  it('every file referenced by a page or the service worker exists', () => {
    const gone = [...wanted].filter((r) => !fs.existsSync(path.join(ROOT, r)));
    expect(gone).toEqual([]);
  });
  it('every referenced runtime file is inside the shipped set', () => {
    const notShipped = [...wanted].filter((r) => fs.existsSync(path.join(ROOT, r)) && !SHIPPED(r));
    expect(notShipped).toEqual([]);
  });
  it('the Pages workflow copies tools/vendor', () => {
    const wf = path.join(ROOT, '..', '.github', 'workflows', 'pages.yml');
    if (!fs.existsSync(wf)) return;                      // frontend checked out on its own
    expect(fs.readFileSync(wf, 'utf8')).toContain('tools/vendor');
  });
});

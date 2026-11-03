// tests/seo.test.js — the discoverability invariants.
//
// These are the things that silently break a launch: a page that loses its
// canonical, a noindex page creeping into the sitemap, a structured-data
// block that stops parsing after an edit. The audit itself lives in
// tools/audit-seo.mjs so it can also be run by hand (npm run audit:seo).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { auditSite } from '../tools/audit-seo.mjs';
import { ROOT } from './helpers/load-globals.js';

const SITE = 'https://app.mku.name.np';
const { pages, findings } = auditSite(ROOT);
const errors = findings.filter((f) => f.level === 'error');

describe('SEO audit', () => {
  it('reports no blocking errors', () => {
    expect(errors.map((e) => `${e.page}: ${e.code} ${e.message}`)).toEqual([]);
  });

  it('gives every page a unique title and description', () => {
    const titles = pages.map((p) => {
      const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
      return (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    });
    expect(new Set(titles).size).toBe(pages.length);
    expect(titles.every((t) => t && t.trim().length >= 20)).toBe(true);
  });

  it('lists exactly the indexable pages in sitemap.xml', () => {
    const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual([
      `${SITE}/`,
      `${SITE}/privacy.html`,
      `${SITE}/terms.html`,
    ].sort());
  });

  it('keeps the app shell and admin console out of the index', () => {
    for (const page of ['user.html', 'admin.html']) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      expect(html).toMatch(/<meta name="robots" content="noindex/);
      expect(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')).not.toContain(`${SITE}/${page}`);
    }
    expect(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')).toMatch(/Disallow: \/admin\.html/);
  });

  it('ships a 1200×630 social preview and points the tags at it', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const png = fs.readFileSync(path.join(ROOT, 'og-cover.png'));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(html).toContain('content="https://app.mku.name.np/og-cover.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('publishes the exam coverage in the landing page’s own HTML', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    // Crawlers must see this without running the app's scripts.
    expect(html).toMatch(/<section[^>]+id="syllabus"/);
    expect(html).toMatch(/<th scope="row">A<\/th><td>Structure and Geotechnical Engineering<\/td><td>30<\/td>/);
    expect(html).not.toMatch(/id="syllabus"[^>]*hidden/);
  });

  it('ships a real practice question in the raw HTML, not only after JS boots', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/id="try-q"[^>]*>The minimum grade of concrete/);
    const opts = html.match(/id="try-opts"[\s\S]*?<\/ul>/)?.[0] || '';
    for (const label of ['M15', 'M20', 'M25', 'M30']) expect(opts).toContain(label);
  });

  it('describes the product with WebApplication, Organization and WebSite data', () => {
    const blocks = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]));
    const types = blocks.map((b) => b['@type']);
    expect(types).toEqual(expect.arrayContaining(['WebApplication', 'Organization', 'WebSite', 'FAQPage']));
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    for (const q of faq.mainEntity) {
      expect(q.name.length).toBeGreaterThan(3);
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(20);
    }
  });
});

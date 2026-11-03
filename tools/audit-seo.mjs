// tools/audit-seo.mjs — static SEO / discoverability audit for the five pages.
//
//   node tools/audit-seo.mjs          human report, exits 1 on any error
//   node tools/audit-seo.mjs --json   machine-readable {pages, findings}
//
// It checks the things a search engine needs before a page can rank at all:
// crawlability, one clear title and description per page, canonical URLs that
// match the file, structured data that parses, a sitemap that agrees with the
// pages' own robots rules, heading structure, image alt text, and the files
// every reference points at. It cannot measure rankings; it removes the
// mechanical reasons a page is ignored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SITE = 'https://app.mku.name.np';
const SITEMAP = 'sitemap.xml';
const ROBOTS = 'robots.txt';
const MANIFEST = 'manifest.json';

/* ── tiny parsing helpers ───────────────────────────────────────────── */

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];

function metas(html) {
  const out = new Map();
  for (const tag of tags(html, 'meta')) {
    const key = attr(tag, 'name') || attr(tag, 'property');
    if (key) out.set(key.toLowerCase(), attr(tag, 'content') ?? '');
  }
  return out;
}

function links(html) {
  return tags(html, 'link').map((tag) => ({
    rel: (attr(tag, 'rel') || '').toLowerCase(),
    href: attr(tag, 'href') || '',
    hreflang: attr(tag, 'hreflang') || '',
  }));
}

function jsonLd(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1].trim());
  return out;
}

function headings(html) {
  const out = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    out.push({ level: Number(m[1]), text });
  }
  return out;
}

const images = (html) => tags(html, 'img');
const ids = (html) => [...html.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|#x27|rarr|larr|middot|mdash|ndash);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (text) => (text ? text.split(/\s+/).length : 0);
const isAbsolute = (url) => /^https:\/\/[^/\s]+/i.test(url || '');

function pngSize(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function canonicalFor(file) {
  return file === 'index.html' ? `${SITE}/` : `${SITE}/${file}`;
}

/* ── the audit ──────────────────────────────────────────────────────── */

export function auditSite(root = ROOT) {
  const findings = [];
  const add = (level, page, code, message) => findings.push({ level, page, code, message });

  const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort();
  if (!pages.includes('index.html')) add('error', 'site', 'no-index', 'index.html is missing');

  const docs = {};
  for (const file of pages) docs[file] = read(root, file);

  /* sitemap + robots + manifest -------------------------------------- */
  const sitemapFile = path.join(root, SITEMAP);
  const sitemap = fs.existsSync(sitemapFile) ? fs.readFileSync(sitemapFile, 'utf8') : '';
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (m[1].match(/<loc>([\s\S]*?)<\/loc>/) || [])[1]?.trim() || '',
    lastmod: (m[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/) || [])[1]?.trim() || '',
  }));
  if (!sitemap) add('error', SITEMAP, 'missing', 'No sitemap.xml — crawlers have no list of pages');
  if (sitemap && !/^<\?xml/i.test(sitemap.trim())) add('error', SITEMAP, 'xml', 'sitemap.xml does not start with an XML declaration');

  const sitemapPaths = new Set();
  for (const e of entries) {
    if (!e.loc.startsWith(`${SITE}/`)) {
      add('error', SITEMAP, 'loc-host', `${e.loc || '(empty loc)'} is not on ${SITE}`);
      continue;
    }
    const rel = e.loc.slice(SITE.length + 1) || 'index.html';
    const file = rel || 'index.html';
    sitemapPaths.add(file === '' ? 'index.html' : file);
    if (!pages.includes(file === '' ? 'index.html' : file)) {
      add('error', SITEMAP, 'loc-missing', `${e.loc} does not match a file in the repo`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod)) {
      add('error', SITEMAP, 'lastmod', `${e.loc} needs a YYYY-MM-DD <lastmod>`);
    } else if (Date.parse(e.lastmod) > Date.now() + 864e5) {
      add('warn', SITEMAP, 'lastmod-future', `${e.loc} is dated in the future (${e.lastmod})`);
    }
    if (/^http:\/\//i.test(e.loc)) add('error', SITEMAP, 'loc-http', `${e.loc} must use https`);
  }

  const robotsFile = path.join(root, ROBOTS);
  const robots = fs.existsSync(robotsFile) ? fs.readFileSync(robotsFile, 'utf8') : '';
  if (!robots) add('error', ROBOTS, 'missing', 'No robots.txt');
  if (!/^Sitemap:\s*https:\/\/\S+/im.test(robots)) {
    add('error', ROBOTS, 'sitemap', 'robots.txt must point at the sitemap with an absolute https URL');
  } else {
    const declared = (robots.match(/^Sitemap:\s*(\S+)/im) || [])[1];
    if (declared !== `${SITE}/${SITEMAP}`) add('warn', ROBOTS, 'sitemap-url', `Sitemap points at ${declared}, expected ${SITE}/${SITEMAP}`);
  }
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) add('error', ROBOTS, 'block-all', 'robots.txt blocks the whole site');
  if (/^\s*User-agent:\s*\*/im.test(robots) === false) add('warn', ROBOTS, 'user-agent', 'robots.txt has no User-agent: * block');

  const manifestFile = path.join(root, MANIFEST);
  if (!fs.existsSync(manifestFile)) {
    add('warn', MANIFEST, 'missing', 'No web app manifest');
  } else {
    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (e) {
      add('error', MANIFEST, 'json', `manifest.json does not parse: ${e.message}`);
    }
    if (manifest) {
      for (const key of ['name', 'short_name', 'start_url', 'display', 'theme_color']) {
        if (!manifest[key]) add('error', MANIFEST, 'field', `manifest.json is missing ${key}`);
      }
      const sizes = (manifest.icons || []).map((i) => i.sizes || '');
      if (!sizes.includes('192x192') || !sizes.includes('512x512')) {
        add('warn', MANIFEST, 'icons', 'manifest.json should carry 192 and 512 px icons');
      }
      if (manifest.lang && docs['index.html']) {
        const lang = attr((docs['index.html'].match(/<html\b[^>]*>/i) || [''])[0], 'lang');
        if (lang && manifest.lang !== lang) add('warn', MANIFEST, 'lang', `manifest.lang ${manifest.lang} differs from <html lang="${lang}">`);
      }
      if (!manifest.screenshots) add('info', MANIFEST, 'screenshots', 'No screenshots in the manifest (nicer install prompt)');
    }
  }

  /* per page ---------------------------------------------------------- */
  const titles = new Map();
  const descriptions = new Map();

  for (const file of pages) {
    const html = docs[file];
    const meta = metas(html);
    const pageLinks = links(html);
    const robotsMeta = (meta.get('robots') || '').toLowerCase();
    const noindex = /\bnoindex\b/.test(robotsMeta);
    const canonical = pageLinks.find((l) => l.rel === 'canonical')?.href || '';
    const expected = canonicalFor(file);
    const indexable = !noindex && !['user.html', 'admin.html'].includes(file);

    if (!/^<!doctype\s+html>/i.test(html.trim())) add('error', file, 'doctype', 'Missing <!doctype html>');

    const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
    const lang = attr(htmlTag, 'lang') || '';
    if (!lang) add('error', file, 'lang', '<html> has no lang attribute');
    else if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) add('warn', file, 'lang-format', `lang="${lang}" is not a valid language tag`);

    if (!meta.get('viewport')) add('error', file, 'viewport', 'Missing responsive viewport meta');
    if (!meta.get('theme-color')) add('warn', file, 'theme-color', 'Missing theme-color (browser chrome colour)');

    /* title + description */
    const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
    if (!title) add('error', file, 'title', 'Missing <title>');
    else {
      const len = [...title].length;
      if (len < 20) add('warn', file, 'title-short', `Title is only ${len} characters (${JSON.stringify(title)})`);
      if (len > 65) add('warn', file, 'title-long', `Title is ${len} characters; Google truncates around 60`);
      if (titles.has(title)) add('error', file, 'title-dupe', `Same <title> as ${titles.get(title)}`);
      else titles.set(title, file);
    }

    const desc = meta.get('description') || '';
    if (!desc && indexable) add('error', file, 'description', 'Indexable page has no meta description');
    else if (desc) {
      const len = [...desc].length;
      if (len < 70) add('warn', file, 'description-short', `Description is only ${len} characters`);
      if (len > 165) add('warn', file, 'description-long', `Description is ${len} characters; Google truncates around 155`);
      if (descriptions.has(desc)) add('error', file, 'description-dupe', `Same description as ${descriptions.get(desc)}`);
      else descriptions.set(desc, file);
    }

    if (meta.get('keywords')) add('info', file, 'keywords', 'meta keywords is ignored by Google (harmless)');

    /* indexing rules */
    if (indexable) {
      if (!robotsMeta) add('warn', file, 'robots-missing', 'Indexable page does not declare meta robots explicitly');
      if (!sitemapPaths.has(file)) add('error', file, 'not-in-sitemap', 'Indexable page is missing from sitemap.xml');
      if (!canonical) add('error', file, 'canonical', 'Indexable page has no canonical URL');
      else if (canonical !== expected) add('error', file, 'canonical-value', `canonical is ${canonical}, expected ${expected}`);
      if (!isAbsolute(canonical) && canonical) add('error', file, 'canonical-absolute', 'canonical must be an absolute https URL');
    } else {
      if (sitemapPaths.has(file)) add('error', file, 'noindex-in-sitemap', 'Page is noindex but listed in sitemap.xml');
      if (!/\bnoindex\b/.test(robotsMeta)) add('error', file, 'noindex-missing', 'Private/app page is not marked noindex');
    }

    /* social preview */
    for (const key of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) {
      if (indexable && !meta.get(key)) add('error', file, 'og-missing', `Missing ${key}`);
    }
    if (meta.get('og:url') && canonical && meta.get('og:url') !== canonical) {
      add('warn', file, 'og-url', `og:url ${meta.get('og:url')} differs from canonical ${canonical}`);
    }
    if (indexable) {
      if (!meta.get('og:site_name')) add('warn', file, 'og-site', 'Missing og:site_name');
      if (!meta.get('og:image:alt')) add('warn', file, 'og-alt', 'Missing og:image:alt');
      const card = meta.get('twitter:card') || '';
      if (!card) add('warn', file, 'twitter', 'Missing twitter:card');
      const ogImage = meta.get('og:image') || '';
      if (ogImage.startsWith(SITE)) {
        const rel = ogImage.slice(SITE.length + 1);
        const abs = path.join(root, rel);
        if (!fs.existsSync(abs)) add('error', file, 'og-image-missing', `og:image ${rel} does not exist`);
        else {
          const size = pngSize(abs);
          if (size) {
            if (size.width < 600 || size.height < 315) add('warn', file, 'og-image-small', `og:image is ${size.width}x${size.height}; use at least 1200x630`);
            if (meta.get('og:image:width') && Number(meta.get('og:image:width')) !== size.width) add('error', file, 'og-width', 'Declared og:image:width does not match the file');
            if (meta.get('og:image:height') && Number(meta.get('og:image:height')) !== size.height) add('error', file, 'og-height', 'Declared og:image:height does not match the file');
          }
        }
      }
    }

    /* structured data */
    for (const block of jsonLd(html)) {
      let data;
      try { data = JSON.parse(block); } catch (e) {
        add('error', file, 'jsonld', `JSON-LD does not parse: ${e.message}`);
        continue;
      }
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node['@context']) add('error', file, 'jsonld-context', 'JSON-LD block has no @context');
        if (!node['@type']) add('error', file, 'jsonld-type', 'JSON-LD block has no @type');
        if (node.url && !isAbsolute(node.url)) add('warn', file, 'jsonld-url', `JSON-LD url ${node.url} is not absolute`);
        if (node['@type'] === 'FAQPage') {
          const list = node.mainEntity || [];
          if (!Array.isArray(list) || list.length === 0) add('error', file, 'faq-empty', 'FAQPage has no questions');
          else {
            const bad = list.filter((q) => !q.name || !q.acceptedAnswer?.text);
            if (bad.length) add('error', file, 'faq-incomplete', `${bad.length} FAQ entries lack a name or answer`);
          }
        }
      }
    }

    /* headings, images, ids */
    const hs = headings(html);
    const h1 = hs.filter((h) => h.level === 1);
    if (indexable && h1.length !== 1) add('error', file, 'h1-count', `Expected exactly one <h1>, found ${h1.length}`);
    if (!indexable && h1.length > 1) add('warn', file, 'h1-count', `Found ${h1.length} <h1> elements`);
    let prev = 0;
    for (const h of hs) {
      if (h.level > prev + 1 && prev !== 0) {
        add('warn', file, 'heading-skip', `Heading jumps H${prev} → H${h.level} at ${JSON.stringify(h.text.slice(0, 60))}`);
      }
      prev = h.level;
    }

    for (const img of images(html)) {
      if (attr(img, 'alt') === null) add('error', file, 'img-alt', `Image without alt: ${img.slice(0, 90)}`);
      if (indexable && !attr(img, 'width') && !attr(img, 'height')) add('warn', file, 'img-dims', `Image without width/height: ${attr(img, 'src')}`);
      const src = attr(img, 'src') || '';
      if (src && !/^(https?:|data:)/i.test(src)) {
        const clean = src.split('?')[0].replace(/^\.\//, '');
        if (!fs.existsSync(path.join(root, clean))) add('error', file, 'img-missing', `Image not found: ${src}`);
      }
    }

    const seen = new Set();
    for (const id of ids(html)) {
      if (seen.has(id)) add('error', file, 'dupe-id', `Duplicate id="${id}"`);
      seen.add(id);
    }

    /* links */
    for (const a of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attr(a[0], 'href');
      if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
      if (/^https?:/i.test(href)) {
        if (attr(a[0], 'target') === '_blank' && !/noopener/.test(attr(a[0], 'rel') || '')) {
          add('warn', file, 'target-blank', `target=_blank without rel=noopener: ${href}`);
        }
        continue;
      }
      const clean = href.split('#')[0].split('?')[0].replace(/^\.\//, '');
      if (!clean) continue;
      if (!fs.existsSync(path.join(root, clean))) add('error', file, 'link-missing', `Internal link not found: ${href}`);
    }

    /* render path */
    const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
    const blocking = tags(head, 'script').filter((s) => attr(s, 'src') && !/\b(defer|async)\b/i.test(s) && !/type\s*=\s*["']module/i.test(s));
    if (blocking.length) add('warn', file, 'blocking-js', `${blocking.length} render-blocking script(s) in <head>`);
    const styles = links(head).filter((l) => l.rel === 'stylesheet');
    if (styles.length > 5) add('warn', file, 'css-count', `${styles.length} stylesheets in <head>`);
    const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].reduce((n, m) => n + m[1].length, 0);
    if (inlineCss > 60000) add('warn', file, 'inline-css', `${Math.round(inlineCss / 1024)} KB of inline CSS delays first paint`);

    /* content depth */
    const text = visibleText(html);
    const count = words(text);
    const floor = file === 'index.html' ? 450 : 250;
    if (indexable && count < floor) {
      add('warn', file, 'thin', `Only ~${count} words of visible text; ranking pages usually need more`);
    }
    findings.push({ level: 'info', page: file, code: 'words', message: `~${count} words of visible text` });
  }

  /* hreflang sanity: alternates must point at real files */
  for (const file of pages) {
    for (const l of links(docs[file]).filter((x) => x.hreflang)) {
      if (!isAbsolute(l.href)) add('warn', file, 'hreflang', `hreflang ${l.hreflang} URL is not absolute`);
      if (l.href === canonicalFor(file) && l.hreflang) {
        add('info', file, 'hreflang-self', `hreflang=${l.hreflang} points at the page itself (only useful with a separate URL)`);
      }
    }
  }

  return { pages, findings };
}

/* ── CLI ────────────────────────────────────────────────────────────── */

const ICON = { error: '✖', warn: '!', info: '·' };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const json = process.argv.includes('--json');
  const { pages, findings } = auditSite();
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');

  if (json) {
    console.log(JSON.stringify({ pages, findings }, null, 2));
  } else {
    let page = '';
    for (const f of findings) {
      if (f.level === 'info' && f.code === 'words') continue;
      if (f.page !== page) { page = f.page; console.log(`\n${page}`); }
      console.log(`  ${ICON[f.level]} ${f.code.padEnd(20)} ${f.message}`);
    }
    console.log('\nWords per page:');
    for (const f of findings.filter((x) => x.code === 'words')) console.log(`  ${f.page.padEnd(14)} ${f.message}`);
    console.log(`\n${errors.length} error(s), ${warns.length} warning(s), ${pages.length} pages checked.`);
    if (errors.length) {
      console.log('\nErrors block indexing or rich results. Fix them first.');
    }
  }
  process.exit(errors.length ? 1 : 0);
}

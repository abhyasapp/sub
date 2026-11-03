// tools/audit.mjs — node tools/audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', 'coverage', 'dist']);
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, out) : out.push(path.relative(ROOT, p).replaceAll('\\', '/'));
  }
  return out;
};
const files = walk(ROOT);
const fileSet = new Set(files);
const isVendor = f => f.includes('/vendor/');
const scan = files.filter(f => (f.startsWith('js/') || f.startsWith('tools/')) && f.endsWith('.js') && !isVendor(f));
const html = files.filter(f => f.endsWith('.html'));

const RE_IMP = /(?:^|[^\w$.])(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
const RE_DYN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const RE_ATTR = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;

function resolve(fromFile, spec) {
  if (/^[a-z]+:/i.test(spec) || spec.startsWith('//') || spec.startsWith('#') || spec.startsWith('data:')) return null;
  let base = spec.startsWith('/') ? spec.slice(1) : path.posix.join(path.posix.dirname(fromFile), spec);
  base = path.posix.normalize(base);
  for (const c of [base, base + '.js', base + '.mjs', base + '/index.js']) if (fileSet.has(c)) return c;
  return { missing: base };
}

const missing = [], edges = new Map(), imported = new Set();
for (const f of scan) {
  const src = fs.readFileSync(f, 'utf8');
  edges.set(f, []);
  for (const re of [RE_IMP, RE_DYN]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const r = resolve(f, m[1]);
      if (r && typeof r === 'object') missing.push(`${f}  ->  ${m[1]}   (looked for ${r.missing})`);
      else if (r) { edges.get(f).push(r); imported.add(r); }
    }
  }
}
for (const f of html) {
  const src = fs.readFileSync(f, 'utf8');
  RE_ATTR.lastIndex = 0;
  let m;
  while ((m = RE_ATTR.exec(src))) {
    const spec = m[1];
    if (/^(https?:)?\/\//i.test(spec) || /^(#|data:|mailto:|javascript:)/i.test(spec)) continue;
    const clean = spec.split('?')[0].split('#')[0].replace(/^\.\//, '');
    if (!clean) continue;
    // Resolve relative to the HTML file that contains the reference, not the
    // repository root. tools/og-card.html legitimately points at
    // tools/vendor/… and ../icon-192.png.
    const base = clean.startsWith('/') ? clean.slice(1) : path.posix.join(path.posix.dirname(f), clean);
    const resolved = path.posix.normalize(base);
    if (!fileSet.has(resolved)) missing.push(`${f}  ->  ${spec}   (FILE NOT FOUND)`);
  }
}

const RE_FN = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g;
const RE_CL = /(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g;
const RE_AR = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
const RE_GL = /(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
const names = new Map();
const bump = (n, f, kind) => {
  if (!names.has(n)) names.set(n, []);
  names.get(n).push(`${f} [${kind}]`);
};
const hashes = new Map();
for (const f of scan) {
  const raw = fs.readFileSync(f, 'utf8');
  const norm = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\s+/g, ' ').trim();
  const h = crypto.createHash('sha256').update(norm).digest('hex');
  (hashes.get(h) ?? hashes.set(h, []).get(h)).push(f);
  for (const [re, kind] of [[RE_FN, 'fn'], [RE_CL, 'class'], [RE_AR, 'arrow'], [RE_GL, 'global']]) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(raw))) bump(m[1], f, kind);
  }
}

const out = [];
out.push(`\n=== 1. UNRESOLVED IMPORTS / BROKEN HTML REFS (${missing.length}) ===`);
out.push(missing.length ? missing.join('\n') : '  none');
out.push(`\n=== 2. DUPLICATE SYMBOL NAMES (same name in >1 file) ===`);
/* expose.js is generated and mirrors every global by design, so counting it
   as a second declaration would flag almost every symbol. */
let d = 0;
for (const [n, where] of [...names].sort()) {
  const real = where.filter(w => !w.startsWith('js/core/expose.js'));
  const fs_ = [...new Set(real.map(w => w.split(' ')[0]))];
  if (fs_.length > 1) { d++; out.push(`  ${n}\n    ${real.join('\n    ')}`); }
}
if (!d) out.push('  none');
out.push(`\n=== 3. IDENTICAL FILE CONTENT (copy-paste duplicates) ===`);
let c = 0;
for (const [, group] of hashes) if (group.length > 1) { c++; out.push('  ' + group.join('\n  ') + '\n'); }
if (!c) out.push('  none');
/* Entry points that are not import edges: the service worker's
   importScripts()/SHELL list and tools named by npm scripts. Without this,
   version.js and audit-handlers.js look like orphans every run. */
const entry = new Set();
if (fileSet.has('sw.js')) {
  const sw = fs.readFileSync('sw.js', 'utf8');
  for (const m of sw.matchAll(/['"](\.?\/?(?:js|tools)\/[^'"]+)['"]/g)) entry.add(m[1].replace(/^\.\//, ''));
}
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const cmd of Object.values(pkg.scripts || {})) {
    for (const m of cmd.matchAll(/\bnode\s+([\w./-]+\.[cm]?js\b)/g)) entry.add(m[1].replace(/^\.\//, ''));
  }
} catch { /* no package.json — nothing to learn */ }
out.push(`\n=== 4. ORPHANS (never imported, not referenced by HTML, sw.js or npm scripts) ===`);
const orphan = scan.filter(f => !imported.has(f) && !entry.has(f) && !html.some(h => fs.readFileSync(h, 'utf8').includes(path.basename(f))));
out.push(orphan.length ? orphan.join('\n') : '  none');
out.push(`\n=== 5. UNUSED VENDOR FILES ===`);
out.push(files.filter(f => isVendor(f) && !files.some(g => g !== f && !isVendor(g) && fs.readFileSync(g, 'utf8').includes(path.basename(f)))).join('\n') || '  none');
console.log(out.join('\n'));
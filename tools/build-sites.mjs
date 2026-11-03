// Package the static app for Freebuff Sites without touching the existing
// GitHub Pages artifact. The copied config uses same-origin proxy routes so
// the app works from a host the Supabase function does not allowlist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'sites');
const PUBLIC = path.join(OUT, 'public');

const FILES = [
  'index.html', 'user.html', 'admin.html', 'privacy.html', 'terms.html',
  'manifest.json', 'sw.js', 'robots.txt', 'sitemap.xml',
  'favicon.png', 'icon-192.png', 'icon-512.png', 'og-cover.png'
];
const DIRS = ['css', 'js', 'tools/vendor'];

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(PUBLIC, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(PUBLIC, rel);
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (file) => !/\.(map|bak|tmp|log)$/i.test(file)
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(PUBLIC, { recursive: true });

FILES.forEach(copyFile);
DIRS.forEach(copyDir);

const configPath = path.join(PUBLIC, 'js', 'core', 'config.js');
let config = fs.readFileSync(configPath, 'utf8');
const before = config;
config = config
  .replace(/SUPABASE_URL:\s*'[^']*'/, "SUPABASE_URL: '/api'")
  .replace(/GAS_URL:\s*'[^']*'/, "GAS_URL: '/gas'");
if (config === before ||
    !config.includes("SUPABASE_URL: '/api'") ||
    !config.includes("GAS_URL: '/gas'")) {
  throw new Error('Could not rewrite the deployment API endpoints.');
}
fs.writeFileSync(configPath, config);

const worker = fs.readFileSync(path.join(ROOT, 'tools', 'sites-worker.mjs'), 'utf8');
fs.writeFileSync(path.join(OUT, 'worker.js'), worker);

const manifest = {
  entrypoint: 'worker.js',
  compatibilityDate: '2026-11-02',
  modules: [{ name: 'worker.js', type: 'esm', path: './worker.js' }],
  assetsDirectory: './public'
};
fs.writeFileSync(path.join(OUT, 'deploy.json'), JSON.stringify(manifest, null, 2) + '\n');

let files = 0;
let bytes = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      files++;
      bytes += fs.statSync(full).size;
    }
  }
}
walk(OUT);
console.log(`Sites package ready: ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(path.relative(ROOT, path.join(OUT, 'deploy.json')));

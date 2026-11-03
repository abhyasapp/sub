import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers/load-globals.js';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
const exists = (f) => fs.existsSync(path.join(ROOT, f.replace(/^\.\//, '').split(/[?#]/)[0]));
const PAGES = ['index.html', 'user.html', 'admin.html', 'privacy.html', 'terms.html'];

describe('versions stay in sync (a mismatch breaks cache busting)', () => {
  const pkg = JSON.parse(read('package.json')).version;
  it('config.js, version.js and package.json agree', () => {
    const cfg = /APP_VERSION\s*=\s*'([^']+)'/.exec(read('js/core/config.js'))[1];
    const ver = /APP_VERSION\s*=\s*'([^']+)'/.exec(read('js/core/version.js'))[1];
    expect([cfg, ver]).toEqual([pkg, pkg]);
  });
});

describe('service worker precache list', () => {
  const src = read('sw.js');
  const shell = /const SHELL = \[([\s\S]*?)\];/.exec(src)[1];
  const entries = [...shell.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  it('has entries', () => expect(entries.length).toBeGreaterThan(10));
  it('every precached file exists on disk', () => {
    const missing = entries.filter((e) => e !== './' && !exists(e));
    expect(missing).toEqual([]);
  });
  it('covers every local script/style of index.html and user.html (run `npm run sync-shell`)', async () => {
    const { missingFromShell } = await import('../tools/sync-shell.mjs');
    expect(missingFromShell()).toEqual([]);
  });
  it('never precaches admin.html (it must not be served from cache)', () => {
    expect(entries.some((e) => e.includes('admin.html'))).toBe(false);
  });
});

describe('manifest', () => {
  const m = JSON.parse(read('manifest.json'));
  it('has the fields installability needs', () => {
    for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) expect(m[k]).toBeTruthy();
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });
  it('every icon, shortcut and start_url target exists', () => {
    for (const i of m.icons) expect(exists(i.src), i.src).toBe(true);
    expect(exists(m.start_url)).toBe(true);
    for (const s of m.shortcuts || []) expect(exists(s.url), s.url).toBe(true);
  });
});

describe('HTML pages reference only files that exist', () => {
  for (const page of PAGES) {
    it(page, () => {
      const html = read(page);
      const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
        .map((m) => m[1])
        .filter((u) => !/^([a-z]+:|\/\/|#|data:|mailto:)/i.test(u) && !u.startsWith('/'));
      expect(refs.filter((r) => !exists(r))).toEqual([]);
    });
  }
});

describe('every data-on-* handler resolves to a real global', () => {
  // tools/audit-handlers.js can't see these: the first four are stubbed inline in
  // user.html (window.X = ...), and "index" is a false hit from ACT.go('index.html').
  const KNOWN_FALSE_POSITIVES = new Set(['CLOUD_UI', 'HEADERMENU', 'HOMEFOCUS', 'PUSH', 'index']);
  it('no NEW unresolved handler names', () => {
    const r = spawnSync(process.execPath, ['tools/audit-handlers.js'], { cwd: ROOT, encoding: 'utf8' });
    const missing = [...(r.stdout + r.stderr).matchAll(/✗\s+(\S+)\s+used at/g)].map((m) => m[1]);
    expect(missing.filter((n) => !KNOWN_FALSE_POSITIVES.has(n))).toEqual([]);
  });
});

describe('security guard-rails', () => {
  it('no real secrets committed (service-role keys, private keys, AWS keys)', () => {
    const bad = /(service_role|BEGIN (RSA |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]+)/;
    const walk = (d, out = []) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (['node_modules', '.git', 'vendor'].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(js|mjs|html|json|css|xml|txt|yml)$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const hits = walk(ROOT)
      .filter((f) => !f.endsWith('integrity.test.js'))
      .filter((f) => bad.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
  it('every HTML page keeps its Content-Security-Policy', () => {
    for (const p of ['index.html', 'user.html', 'admin.html'])
      expect(read(p)).toMatch(/http-equiv="Content-Security-Policy"/);
  });
  it('CSP keeps object-src none and base-uri self', () => {
    for (const p of ['index.html', 'user.html', 'admin.html']) {
      const csp = /Content-Security-Policy" content="([^"]+)"/.exec(read(p))[1];
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
    }
  });
});

// Regression tests for the accessibility / UX fixes shipped in 1.50.0.
// Contrast is computed from the real design tokens in user.html, so a future
// palette tweak that drops below WCAG AA (4.5:1) fails here instead of in review.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT, loadGlobals } from './helpers/load-globals.js';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// The page's styles live in css/app.css; HTML assertions and CSS-rule assertions both read this combined text.
const userHtml = read('user.html') + '\n' + read('css/app.css');
// Design tokens live in css/tokens.css when it exists (shared by both student pages), else inline in user.html.
const tokenSrc = fs.existsSync(path.join(ROOT, 'css/tokens.css')) ? read('css/tokens.css') : userHtml;

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// Pull a token's value out of the :root block (light) or the .dark block.
function tokens(blockStart) {
  const i = tokenSrc.indexOf(blockStart);
  const block = tokenSrc.slice(i, tokenSrc.indexOf('}', i));
  return Object.fromEntries([...block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

describe('colour contrast (WCAG AA 4.5:1 for body text)', () => {
  const light = tokens(':root{\n  color-scheme: light');
  const dark = tokens('.dark{\n  color-scheme: dark');
  const surfaces = ['bg', 'bg-sunken', 'surface', 'surface-alt'];

  it.each(surfaces)('light: ink-2 and ink-3 read on %s', (s) => {
    expect(ratio(light['ink-2'], light[s])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light['ink-3'], light[s])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['bg', 'bg-sunken', 'surface', 'surface-2', 'surface-alt'])('dark: ink-2 and ink-3 read on %s', (s) => {
    expect(ratio(dark['ink-2'], dark[s])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark['ink-3'], dark[s])).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps a visible hierarchy: ink > ink-2 > ink-3 (lighter = quieter)', () => {
    expect(lum(light.ink)).toBeLessThan(lum(light['ink-2']));
    expect(lum(light['ink-2'])).toBeLessThan(lum(light['ink-3']));
  });
  it('placeholders and text labels do not use the decorative ink-4 tone', () => {
    expect(userHtml).not.toMatch(/::placeholder\s*\{[^}]*var\(--ink-4\)/);
    for (const sel of ['.sb-lbl', '#sb-version', '.kbd-hint', '.ch-cnt', '.sb-filter-head']) {
      const rule = userHtml.match(new RegExp(sel.replace(/[.#]/g, '\\$&') + '\\{[^}]*\\}'));
      expect(rule, sel).not.toBeNull();
      expect(rule[0], sel).not.toContain('var(--ink-4)');
    }
  });
});

describe('accessible names and semantics', () => {
  it('home brand button has no aria-label that hides its visible text', () => {
    const brand = userHtml.match(/<button class="tb-brand"[^>]*>/)[0];
    expect(brand).not.toContain('aria-label');
  });
  it('sprint card is named by its visible content, not a differing aria-label', () => {
    expect(read('js/features/sprint.js')).not.toMatch(/setAttribute\('aria-label',\s*'Open 60-day sprint/);
  });
  it('welcome tutorial is a labelled modal dialog that closes on Escape', () => {
    const src = read('js/features/tutorial.js');
    expect(src).toContain("setAttribute('role', 'dialog')");
    expect(src).toContain("setAttribute('aria-modal', 'true')");
    expect(src).toMatch(/key === 'Escape'/);
  });
  it('landing footer is a footer landmark', () => {
    expect(read('index.html')).toMatch(/<footer class="foot">/);
  });
});

describe('weekly pace message', () => {
  const sandbox = { S: { prog: { sessions: [] } }, $: () => null };
  const g = loadGlobals(['js/features/insights.js'], sandbox);

  it('says nothing to an account that has never studied', () => {
    expect(g.PACE._compute()).toBeNull();
  });
  it('still reports pace once there is study history', () => {
    sandbox.S.prog.sessions = [{ at: Date.now() - 3600_000, durationSec: 600 }];
    const p = g.PACE._compute();
    expect(p).not.toBeNull();
    expect(p.onTrack).toBe(false);
  });
});

describe('content CDN has one source of truth', () => {
  it('only config.js hard-codes the jsDelivr content URL', () => {
    const hits = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!/vendor|node_modules|\.git/.test(e.name)) walk(p); continue; }
        if (!/\.(js|html)$/.test(e.name)) continue;
        if (/cdn\.jsdelivr\.net\/gh\/abhyasapp/.test(read(p))) hits.push(p.replace(/\\/g, '/'));
      }
    };
    walk('js');
    // chapters-loader keeps the literal only as a last-resort fallback behind ABHYAS_CONFIG.
    expect(hits.sort()).toEqual(['js/core/config.js', 'js/data/chapters-loader.js']);
    expect(read('js/data/chapters-loader.js')).toContain('ABHYAS_CONFIG.CONTENT_CDN_BASE');
  });
});

describe('layout and theming regressions found by the end-to-end run', () => {
  it('dark mode re-declares the legacy colour aliases (they freeze to light values otherwise)', () => {
    const rule = userHtml.match(/\.dark\{\s*--amb:[^}]*\}/);
    expect(rule, 'alias block under .dark').not.toBeNull();
    for (const a of ['--t1:var(--ink)', '--t2:var(--ink-2)', '--t3:var(--ink-3)', '--c2:var(--surface)', '--b1:var(--sep)']) {
      expect(rule[0]).toContain(a);
    }
  });
  it('two-column grid children may shrink, so inner scrollers cannot widen the page (timetable overflow)', () => {
    expect(userHtml).toMatch(/\.g2-grid>\*\{min-width:0\}/);
  });
  it('timetable week scroller is a focusable, labelled region', () => {
    expect(read('js/features/timetable.js')).toMatch(/class="tt-week-scroll" role="region" aria-label="[^"]+" tabindex="0"/);
  });
  it('sprint progress bars all carry an accessible name', () => {
    const bars = userHtml.match(/<div class="bar"[^>]*role="progressbar"[^>]*>/g) || [];
    expect(bars.length).toBeGreaterThanOrEqual(4);
    for (const b of bars) expect(b).toContain('aria-label=');
  });
  it('landing page reserves height for the JS-filled sample question (prevents layout shift)', () => {
    expect(read('index.html')).toMatch(/#try-card\{min-height:\d+px\}/);
  });
});

describe('push notifications are inert until Firebase is really configured', () => {
  const src = read('js/features/push.js');
  it('does not load Firebase while credentials are YOUR_* placeholders', () => {
    expect(src).toMatch(/PUSH_CONFIGURED/);
    expect(src).toMatch(/if \(!PUSH_CONFIGURED\)\s*\{\s*this\._hideCard\(\);\s*return;\s*\}/);
  });
  it('survives a failed or empty Firebase download', () => {
    expect(src).toContain('s.onerror');
    expect(src).toMatch(/typeof firebase === 'undefined'/);
  });
});

describe('question search button (Dual Search extension with Google fallback)', () => {
  const src = read('js/core/question.js');
  it('escapes the extension query with esc(), not a quotes-only replace', () => {
    expect(src).toContain('esc(_plainSearchText(q))');
    expect(src).not.toMatch(/replace\(\/"\/g, '&quot;'\)/);
  });
  it('only plain left-clicks are handed to the extension (new-tab clicks stay native)', () => {
    expect(src).toMatch(/e\.button === 0 && !e\.ctrlKey && !e\.metaKey && !e\.shiftKey/);
  });
  it('posts to the page origin, not "*"', () => {
    expect(src).toContain('window.location.origin');
    expect(src).not.toMatch(/postMessage\([^)]*'\*'\)/);
  });
  it('always keeps a working Google fallback href', () => {
    expect(src).toContain('https://www.google.com/search?q=${encodeURIComponent(_buildRichQuery(q))}');
  });
});

describe('question search: extension detection survives a startup race', () => {
  const src = read('js/core/question.js');
  it('listens for a PONG and pings once on load', () => {
    expect(src).toContain("'DUAL_SEARCH_PONG'");
    expect(src).toContain("type: 'DUAL_SEARCH_PING'");
  });
  it('only trusts PONGs that come from this window', () => {
    expect(src).toMatch(/e\.source === window && e\.data && e\.data\.type === 'DUAL_SEARCH_PONG'/);
  });
});

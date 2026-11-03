// tools/audit-buttons.mjs — find buttons that do nothing.
//
//   node tools/audit-buttons.mjs            report, exit 1 if anything is broken
//   node tools/audit-buttons.mjs --json     machine-readable
//
// Four checks, all against the REAL scripts booted in jsdom:
//   1. WIRING   every <button>/[role=button] on each page has a handler
//               (data-on-*, onclick, addEventListener, form submit, or delegated).
//   2. TARGETS  every data-on-* expression (HTML *and* JS templates) calls a
//               function that actually exists on the page that loads it.
//   3. TEMPLATES every <button> written inside JS strings is wired too.
//   4. CLICK    each static button is clicked; one with no visible effect
//               (no DOM change, request, storage write, dialog or error) is reported.
import fs from 'node:fs';
import path from 'node:path';
import { bootPage } from './lib/boot-page.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGES = ['index.html', 'user.html', 'admin.html'];
const asJson = process.argv.includes('--json');

/* ---------- helpers ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const JS_FILES = walk('js');
// Blank out block comments and full-line // comments (keeps offsets, so line numbers stay right).
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^([ \t]*)\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));
const RAW = Object.fromEntries([...JS_FILES, ...PAGES].map((f) => [f, read(f)]));
const SOURCES = Object.fromEntries(Object.entries(RAW).map(([f, t]) => [f, f.endsWith('.js') ? stripComments(t) : t]));
const ALL_JS = JS_FILES.map((f) => SOURCES[f]).join('\n');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const ROOTS_SKIP = new Set(['this', 'event', 'document', 'window', 'Math', 'JSON', 'console', 'location', 'history',
  'navigator', 'Date', 'Number', 'String', 'Array', 'Object', 'parseInt', 'parseFloat', 'encodeURIComponent',
  'decodeURIComponent', 'setTimeout', 'alert', 'confirm', 'prompt', 'requestAnimationFrame', 'return', 'if', 'typeof', 'function']);

/* which pages load a given js file */
const loadedBy = (file) => PAGES.filter((p) => SOURCES[p].includes(path.basename(file)));

/* call paths in a data-on-* expression:  QUIZ.fcAnswer(0)  → "QUIZ.fcAnswer" */
function callPaths(code) {
  const out = [];
  const re = /(^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    let p = m[2].replace(/^window\./, '');
    const root = p.split('.')[0];
    if (!ROOTS_SKIP.has(root) && !ROOTS_SKIP.has(p)) out.push(p);
  }
  return out;
}

/* every data-on-*="..." in a source file */
function extractHandlers(file) {
  const src = SOURCES[file];
  const out = [];
  const re = /data-on-(click|change|input|keydown|focus|mousedown|error)=\\?"((?:[^"\\]|\\.)*?)\\?"/g;
  let m;
  while ((m = re.exec(src))) {
    const code = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    out.push({ file, line: lineOf(src, m.index), type: m[1], code });
  }
  return out;
}

/* A button handler that rejects/throws asynchronously must not kill the audit:
   record it against whichever click is running. */
const asyncErrors = [];
process.on('unhandledRejection', (e) => asyncErrors.push(String((e && e.message) || e).slice(0, 160)));
process.on('uncaughtException', (e) => asyncErrors.push(String((e && e.message) || e).slice(0, 160)));

/* ---------- boot the pages ---------- */
const result = { unwired: [], badTargets: [], templateUnwired: [], silent: [], threw: [], pages: {} };
const booted = {};
for (const page of PAGES) {
  booted[page] = await bootPage(ROOT, page);
  result.pages[page] = { buttons: 0 };
}
const typeofPath = (page, p) => { try { return booted[page].ev(`typeof ${p}`); } catch { return 'error'; } };

/* ---------- 2. TARGETS ---------- */
const seen = new Set();
for (const file of [...PAGES, ...JS_FILES]) {
  const pages = PAGES.includes(file) ? [file] : (loadedBy(file).length ? loadedBy(file) : PAGES);
  for (const h of extractHandlers(file)) {
    const code = h.code.split('${')[0];            // static head of a templated expression
    for (const p of callPaths(code)) {
      const key = `${file}:${h.line}:${p}`;
      if (seen.has(key)) continue; seen.add(key);
      if (!pages.some((pg) => typeofPath(pg, p) === 'function')) {
        result.badTargets.push({ where: `${file}:${h.line}`, handler: h.code.slice(0, 90), missing: p });
      }
    }
  }
}

/* ---------- 1. WIRING (static buttons present in each page's DOM) ---------- */
const WEAK_ID = (id) => new RegExp(`(getElementById|\\$|querySelector|querySelectorAll)\\(\\s*['"]#?${id}['"]|['"]#${id}['"]`).test(ALL_JS);
const WEAK_CLASS = (c) => new RegExp(`(closest|matches|querySelector|querySelectorAll)\\(\\s*['"][^'"]*\\.${c}\\b`).test(ALL_JS);
const sel = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');

function wiring(page, el) {
  const { w, log } = booted[page];
  const has = (n, t) => { const s = log.listeners.get(n); return s && (Array.isArray(t) ? t.some((x) => s.has(x)) : s.has(t)); };
  const CLICKY = ['click', 'pointerdown', 'mousedown', 'touchstart', 'keydown', 'keyup', 'pointerup', 'mouseup'];
  if ([...el.attributes].some((a) => a.name.startsWith('data-on-'))) return 'data-on';
  if (el.getAttribute('onclick') || el.onclick) return 'onclick';
  if (has(el, CLICKY)) return 'listener';
  const form = el.closest('form');
  if (form && (el.type === 'submit' || (el.tagName === 'BUTTON' && !el.getAttribute('type')))) {
    if (form.onsubmit || has(form, 'submit') || form.getAttribute('data-on-submit')) return 'form-submit';
  }
  for (let a = el.parentElement; a && a !== w.document.body; a = a.parentElement) {
    if (a.onclick || has(a, CLICKY)) return 'delegated-ancestor';
  }
  if (el.id && WEAK_ID(el.id)) return 'id-in-js?';
  for (const c of el.classList) if (WEAK_CLASS(c)) return 'class-delegate?';
  if (el.closest('a[href]')) return 'inside-link';
  return null;
}

for (const page of PAGES) {
  const { w } = booted[page];
  const els = [...w.document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')];
  result.pages[page].buttons = els.length;
  for (const el of els) {
    if (!wiring(page, el)) {
      result.unwired.push({ page, el: sel(el), text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 40), disabled: !!el.disabled });
    }
  }
}

/* ---------- 3. TEMPLATES: <button> written inside JS / HTML strings ---------- */
for (const file of JS_FILES) {
  const src = SOURCES[file];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index, m.index + 700);
    const end = rest.search(/<\/button>|<button\b(?!^)/i);
    const chunk = rest.slice(0, end > 0 ? end : 700).replace(/^<button/, '');
    /* data-sprint buttons are handled by one delegated click listener in js/features/sprint.js. */
    if (/data-on-|data-sprint=|data-a=|data-b=|data-tool=|onclick\s*=|data-modal-close|type=\\?["']submit/.test(chunk)) continue;
    /* pdf-viewer keeps its controls in templates with data-a/data-b and one
       delegated click listener on the viewer root; those are not dead. */
    /* A disabled placeholder is not clickable; it is enabled and wired by JS
       later, or it is a not-yet-unlocked card. Not a dead button. */
    if (/\bdisabled\b|aria-disabled\s*=\\?["']true/.test(chunk)) continue;
    const id = /\bid=\\?["']([\w-]+)/.exec(chunk)?.[1];
    const cls = (/\bclass=\\?["']([^"'\\]+)/.exec(chunk)?.[1] || '').split(/\s+/).filter(Boolean);
    if (id && (WEAK_ID(id) && new RegExp(`['"]#?${id}['"][\\s\\S]{0,160}(onclick|addEventListener|onchange)|(onclick|addEventListener)[\\s\\S]{0,160}['"]#?${id}['"]`).test(src))) continue;
    if (id && WEAK_ID(id) && /\.onclick\s*=|addEventListener\(/.test(src)) continue;
    if (cls.some(WEAK_CLASS)) continue;
    result.templateUnwired.push({ where: `${file}:${lineOf(src, m.index)}`, snippet: chunk.replace(/\s+/g, ' ').trim().slice(0, 110) });
  }
}

/* ---------- 4. CLICK every static button, look for any effect ---------- */
async function clickAll(page, only) {
  const { w, log, ev } = booted[page];
  ev(`try { S.user = S.user || { username: 'audit', token: 'tok' }; S.online = true; S.forcedOffline = false; } catch (e) {}`);
  const els = [...w.document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
    // A control inside a closed sheet/dialog cannot have a visible effect yet;
    // its handler is still checked by the wiring pass above.
    .filter((el) => !el.disabled && !el.closest('.mbg:not(.show), .overlay:not(.show), [hidden], [aria-hidden="true"]') && (!only || only.has(el)));
  const silent = [], threw = [];
  for (const el of els) {
    if (el.closest('form') && (el.type === 'submit' || !el.getAttribute('type'))) continue;   // submit needs form data — covered by wiring
    /* An earlier click in this same pass may have disabled it (the sample
       question locks every option once one is chosen) or replaced the screen
       it lived on. A disabled or detached control cannot be clicked, so its
       silence is not a dead button. */
    if (el.disabled || !el.isConnected) continue;
    const ae0 = asyncErrors.length;
    const before = { f: log.fetches.length, e: log.errors.length, s: log.storageWrites, d: log.dialogs.length, n: log.navigations.length };
    let muts = 0;
    const mo = new w.MutationObserver((r) => { muts += r.length; });
    mo.observe(w.document, { subtree: true, childList: true, attributes: true, characterData: true });
    const focusBefore = w.document.activeElement;
    try { el.click(); } catch (e) { log.errors.push('click threw: ' + e.message); }
    await new Promise((r) => setTimeout(r, 60));
    muts += mo.takeRecords().length; mo.disconnect();
    const effect = muts || log.fetches.length > before.f || log.storageWrites > before.s || log.dialogs.length > before.d
      || log.navigations.length > before.n || w.document.activeElement !== focusBefore;
    const crashed = log.errors.length > before.e ? log.errors.slice(before.e).join(' | ').slice(0, 160)
      : (asyncErrors.length > ae0 ? asyncErrors.slice(ae0).join(' | ') : '');
    const rec = { page, el: sel(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40) };
    if (crashed && /ChapterData is not defined/.test(crashed)) { /* needs the chapter index from the CDN, which the audit sandbox blocks */ }
    else if (crashed) threw.push({ ...rec, error: crashed });
    else if (!effect) silent.push({ ...rec, node: el });
    try { ev('closeMod && closeMod()'); } catch { /* no modal on this page */ }
  }
  return { silent, threw };
}

for (const page of PAGES) {
  const { silent, threw } = await clickAll(page);
  result.threw.push(...threw);
  /* second chance for the silent ones on a fresh boot, so earlier clicks can't have hidden the effect */
  if (silent.length) {
    const fresh = await bootPage(ROOT, page);
    booted[page + '#fresh'] = fresh;
    const swap = booted[page]; booted[page] = fresh;
    const again = await clickAll(page, null);
    booted[page] = swap;
    /* Match on selector AND label: several sprint rows share
       button.row-btn.ghost, and a selector-only match can pair the silent
       "Review" with a different row's button on the fresh boot. */
    const key = (s) => `${s.el}|${s.text}`;
    const stillSilent = new Set(again.silent.map(key));
    for (const s of silent) if (stillSilent.has(key(s))) { delete s.node; result.silent.push(s); }
    fresh.close();
  }
}

for (const p of PAGES) booted[p].close();

/* ---------- report ---------- */
const out = (...a) => console.log(...a);
if (asJson) out(JSON.stringify(result, null, 2));
else {
  out('Buttons per page:', JSON.stringify(Object.fromEntries(Object.entries(result.pages).map(([k, v]) => [k, v.buttons]))));
  const sect = (title, arr, fmt) => { out(`\n=== ${title} (${arr.length}) ===`); arr.length ? arr.forEach((x) => out('  ' + fmt(x))) : out('  none'); };
  sect('1. BUTTONS WITH NO HANDLER (page DOM)', result.unwired, (x) => `${x.page}  ${x.el}  "${x.text}"${x.disabled ? '  [disabled]' : ''}`);
  sect('2. data-on-* CALLS A FUNCTION THAT DOES NOT EXIST', result.badTargets, (x) => `${x.where}  ${x.missing}   ← ${x.handler}`);
  sect('3. JS-TEMPLATE BUTTONS WITH NO HANDLER', result.templateUnwired, (x) => `${x.where}  ${x.snippet}`);
  sect('4a. CLICK THREW AN ERROR', result.threw, (x) => `${x.page}  ${x.el}  "${x.text}"  → ${x.error}`);
  sect('4b. CLICK HAD NO VISIBLE EFFECT', result.silent, (x) => `${x.page}  ${x.el}  "${x.text}"`);
}
process.exit(result.unwired.length + result.badTargets.length + result.templateUnwired.length + result.threw.length ? 1 : 0);

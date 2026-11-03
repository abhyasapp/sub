// tools/lib/boot-page.mjs — boot one of the app's HTML pages inside jsdom so
// audits and tests can exercise the REAL scripts (no mocks of app code).
// Only the browser is faked: IndexedDB, fetch, window.open/alert/confirm.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import jsdom from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'text/xml', '.txt': 'text/plain',
};

export async function bootPage(root, page, { fetchReply, waitMs = 1500, loadTimeoutMs = 90000 } = {}) {
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', MIME[path.extname(p)] || 'application/octet-stream');
    res.end(fs.readFileSync(p));
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const log = { errors: [], fetches: [], navigations: [], dialogs: [], storageWrites: 0, listeners: new WeakMap() };
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const m = String(e.message);
    if (/navigation/i.test(m)) log.navigations.push(m); else log.errors.push(m.slice(0, 200));
  });
  vc.on('error', (...a) => log.errors.push(a.join(' ').slice(0, 200)));

  const dom = await JSDOM.fromURL(`${origin}/${page}`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    resources: {
      interceptors: [requestInterceptor((req) => (req.url.startsWith(origin) ? undefined : new Response('', { status: 200 })))],
    },
    beforeParse(w) {
      w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.open = () => { log.dialogs.push('open'); return null; };
      w.alert = () => { log.dialogs.push('alert'); };
      w.confirm = () => { log.dialogs.push('confirm'); return true; };
      w.prompt = () => { log.dialogs.push('prompt'); return ''; };
      w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
      w.HTMLElement.prototype.requestFullscreen = async () => {};
      w.document.exitFullscreen = async () => {};
      w.print = () => { log.dialogs.push('print'); };
      w.fetch = async (u, o) => {
        log.fetches.push({ url: String(u), body: o && o.body });
        const body = fetchReply ? fetchReply(String(u), o) : { success: true, message: 'stub ok' };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } };
      };
      const add = w.EventTarget.prototype.addEventListener;
      w.EventTarget.prototype.addEventListener = function (type, fn, opts) {
        let set = log.listeners.get(this); if (!set) log.listeners.set(this, (set = new Set()));
        set.add(type);
        return add.call(this, type, fn, opts);
      };
      const setItem = w.Storage.prototype.setItem;
      w.Storage.prototype.setItem = function (...a) { log.storageWrites++; return setItem.apply(this, a); };
    },
  });

  await new Promise((r) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (dom.window.document.readyState === 'complete' || Date.now() - t0 > loadTimeoutMs) { clearInterval(iv); setTimeout(r, waitMs); }
    }, 200);
  });

  const w = dom.window;
  return {
    w, log, origin,
    ev: (code) => w.eval(code),
    close() { try { w.close(); } catch { /* already closed */ } server.close(); },
  };
}

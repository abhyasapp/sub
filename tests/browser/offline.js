/* Offline check: install the service worker, then take the server away and reload.
   The student app must still start with every script loaded.
       node tests/browser/offline.js
   Exits 1 on failure. (Stopping the server matters: the browser's "offline" switch does not
   stop the service worker's own fetches, so it would hide missing precache entries.) */
const { serve, launch, STUDENT, seedStudent, sleep } = require('./common');
(async () => {
  const { server, port } = await serve(); const browser = await launch();
  const pg = await browser.newPage(); await pg.setViewport({ width: 420, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await pg.evaluateOnNewDocument(seedStudent, STUDENT);
  await pg.goto(`http://localhost:${port}/user.html`, { waitUntil: 'load' });
  await pg.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; await new Promise(r => setTimeout(r, 6000)); });
  server.closeAllConnections(); await new Promise(r => server.close(r));
  errs.length = 0;
  await pg.reload({ waitUntil: 'load' }).catch(() => {}); await sleep(2500);
  const st = await pg.evaluate(() => ({ app: !!document.getElementById('app').classList.contains('on'), sidebar: document.querySelectorAll('#sb-nav .sb-item').length,
    allScripts: ['UI', 'HOME', 'QUIZ', 'SPRINT', 'INSIGHTS', 'STUDYDOCS', 'NAV', 'PDFVIEW'].filter(n => typeof window[n] === 'undefined') }));
  await browser.close();
  const ok = st.app && st.sidebar > 10 && st.allScripts.length === 0 && errs.length === 0;
  console.log(JSON.stringify(st), 'errors:', JSON.stringify(errs));
  console.log(ok ? 'offline start OK' : 'offline start FAILED' + (st.allScripts.length ? ' (not loaded: ' + st.allScripts.join(', ') + ')' : ''));
  process.exit(ok ? 0 : 1);
})();

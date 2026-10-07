/* Accessibility audit (axe-core, WCAG 2.0/2.1 A and AA) of the sign-in page, the main student
   screens and the main admin screens, in a real headless Chromium.
       node tests/browser/a11y.js
   Exits 1 if any violation is found. */
const fs = require('fs');
const { serve, launch, STUDENT, seedStudent, enterAdmin, sleep } = require('./common');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function audit(pg, label, found) {
  await pg.evaluate(axeSrc);
  for (const dark of [false, true]) {
    const v = await pg.evaluate(async dark => {
      /* Switching theme starts colour transitions; scanning mid-way reads blended colours and reports
         contrast failures that are not real. Turn transitions off, switch, and wait two frames. */
      if (!document.getElementById('a11y-still')) { const st = document.createElement('style'); st.id = 'a11y-still'; st.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(st); }
      document.documentElement.classList.toggle('dark', dark);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 100));
      const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] });
      return res.violations.map(x => ({ id: x.id, impact: x.impact, n: x.nodes.length, ex: x.nodes[0].target.join(' ') }));
    }, dark);
    v.forEach(x => found.push(`${label}${dark ? ' [dark]' : ''}: [${x.impact}] ${x.id} x${x.n} e.g. ${x.ex}`));
  }
}

(async () => {
  const { server, port } = await serve(); const browser = await launch(); const found = []; let pages = 0;
  const open = async (w, h, url, seed) => {
    const pg = await browser.newPage(); await pg.setViewport({ width: w, height: h });
    await pg.setRequestInterception(true); pg.on('request', rq => rq.url().startsWith('http://localhost') ? rq.continue() : rq.abort());
    if (seed) await pg.evaluateOnNewDocument(seed, STUDENT);
    await pg.goto(`http://localhost:${port}/${url}`, { waitUntil: 'load' }); await sleep(1800); return pg;
  };
  let pg = await open(420, 900, 'index.html'); await audit(pg, 'index:login', found); pages++;
  await pg.evaluate(() => APP.setMode('signup')); await sleep(300); await audit(pg, 'index:signup', found); pages++; await pg.close();

  pg = await open(420, 900, 'user.html', seedStudent);
  for (const v of ['home', 'online', 'progress', 'studydocs', 'weekly', 'subj-qotd', 'wrong', 'heatmap']) { await pg.evaluate(`UI.go('${v}')`); await sleep(450); await audit(pg, 'user:' + v, found); pages++; }
  await pg.close();

  pg = await open(1100, 800, 'admin.html'); await enterAdmin(pg);
  for (const v of ['today', 'users', 'payments', 'studydocs', 'settings']) { await pg.evaluate(`UI.nav('${v}')`); await sleep(400); await audit(pg, 'admin:' + v, found); pages++; }
  await browser.close(); server.close();

  console.log(`audited ${pages} screens (light and dark)`);
  if (found.length) { found.forEach(f => console.log('  ' + f)); process.exit(1); }
  console.log('no accessibility violations');
})();

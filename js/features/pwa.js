// js/features/pwa.js — install banner, fullscreen, service-worker registration.

const PWA = {
  init() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      S.dpi = e;
      const btn = document.getElementById('installBtn');
      if (btn) { btn.style.display = ''; btn.title = 'Install App'; }
      PWA._showInstallBanner();
    });
    window.addEventListener('appinstalled', () => {
      S.dpi = null;
      toast('📲 App installed!');
      const btn = document.getElementById('installBtn');
      if (btn) btn.style.display = 'none';
      PWA._hideInstallBanner();
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SW_ACTIVATED' && e.data.version !== (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '')) {
          if (!S.quiz.active) toast('🔄 Update ready — reload to get the latest version.', 8000);
        }
      });
    }
  },
  _showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-install-banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Install Abhyas');
    bar.style.cssText = 'position:fixed;left:.75rem;right:.75rem;bottom:calc(var(--bn-h,0px) + .75rem + var(--safe-b,0px));background:var(--c2);border:1px solid var(--bd);border-radius:var(--r2);padding:.7rem .9rem;display:flex;align-items:center;gap:.6rem;z-index:9997;box-shadow:var(--sh3)';
    bar.innerHTML = `
      <div style="font-size:1.3rem"><i class="ph ph-device-mobile"></i></div>
      <div style="flex:1;font-size:.76rem;color:var(--t2);line-height:1.3">Install this app for faster, offline access</div>
      <button id="pwa-install-go" style="padding:.4rem .75rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r1);color:var(--on-accent,#0F0A00);font-weight:700;font-size:.76rem;cursor:pointer;font-family:var(--ff)">Install</button>
      <button id="pwa-install-x" aria-label="Dismiss install prompt" style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;min-height:24px;background:none;border:none;color:var(--t3);font-size:.9rem;cursor:pointer;padding:.2rem"><i class="ph ph-x"></i></button>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(() => { try { FLOATSPACE.sync('pwa-banner', bar); } catch (e) {} });
    document.getElementById('pwa-install-go').onclick = () => { PWA.install(); PWA._hideInstallBanner(); };
    document.getElementById('pwa-install-x').onclick = () => PWA._hideInstallBanner();
  },
  _hideInstallBanner() {
    const bar = document.getElementById('pwa-install-banner');
    if (bar) bar.remove();
    try { FLOATSPACE.sync('pwa-banner', null); } catch (e) {}
  },
  install() {
    if (S.dpi) {
      S.dpi.prompt();
      S.dpi.userChoice.then(() => { S.dpi = null; });
      const b = document.getElementById('installBtn');
      if (b) b.style.display = 'none';
    } else toast('Install option not available — try your browser\'s "Add to Home Screen" menu.');
  },
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      /* Optional chaining alone made this a silent no-op in browsers that
         do not expose the Fullscreen API (older iOS, embedded webviews).
         Tell the student instead of pretending the tap did something. */
      if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== 'function') {
        toast('Fullscreen is not available in this browser');
        return;
      }
      document.documentElement.requestFullscreen().catch(() => toast('Fullscreen could not start'));
    } else if (typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch?.(() => {});
    }
  }
};

window.PWA = PWA;
// js/features/net-toggle.js — forced-offline toggle, the two paint helpers,
// and the online/offline listeners that used to sit at file scope.

function _updateOfflineWarn() {
  const modern = document.getElementById('on-offline-warn');
  if (modern) modern.style.display = (S.online && !S.forcedOffline) ? 'none' : 'flex';
  const bar = document.getElementById('offbar');
  if (bar) {
    if (!S.online) { bar.textContent = '📡 Network offline — serving from local cache'; bar.classList.add('show'); }
    else if (S.forcedOffline) { bar.textContent = '🔴 Offline mode forced — network blocked by you'; bar.classList.add('show'); }
    else bar.classList.remove('show');
  }
}

function _updateNetBtn() {
  const effectivelyOnline = S.online && !S.forcedOffline;
  const btn = document.getElementById('net-mode-btn');
  if (btn) {
    btn.innerHTML = `<i class="ph ${effectivelyOnline ? 'ph-wifi-high' : 'ph-wifi-slash'}"></i>`;
    btn.title = effectivelyOnline ? 'Online mode — click to force offline'
              : S.forcedOffline ? 'Forced offline mode — click to go online'
              : 'Network offline — no connection';
    btn.setAttribute('aria-label', btn.title);
    btn.style.color = effectivelyOnline ? 'var(--grn)' : 'var(--ros)';
    btn.style.borderColor = effectivelyOnline ? 'rgba(34,197,94,.35)' : 'var(--bad-bd)';
    btn.style.background = effectivelyOnline ? 'rgba(34,197,94,.08)' : 'var(--bad-bg)';
    btn.classList.toggle('forced', S.forcedOffline);
    btn.setAttribute('aria-pressed', String(!!S.forcedOffline));
  }
  const dot = document.getElementById('net-dot');
  const txt = document.getElementById('net-txt');
  if (dot) dot.className = 'net-dot' + (effectivelyOnline ? '' : ' off');
  if (txt) txt.textContent = S.forcedOffline ? 'Offline (manual)' : (S.online ? 'Online' : 'Offline');
}

const NET = {
  toggle() {
    if (!S.online && !S.forcedOffline) { toast('📡 No network connection — connect to the internet first'); return; }
    S.forcedOffline = !S.forcedOffline;
    _save(LS.FORCED_OFFLINE, S.forcedOffline);
    if (S.forcedOffline) toast('🔴 Offline mode on — all network requests blocked');
    else {
      toast('🟢 Online mode restored — network requests allowed');
      if (PSYNC._timer) PSYNC.pushNow();
      if (typeof WEEKLY !== 'undefined') WEEKLY.retryUnsynced();
    }
    _updateNetBtn();
    _updateOfflineWarn();
  }
};

window.NET = NET;

window.addEventListener('online', async () => {
  if (typeof NETCHECK !== 'undefined' && NETCHECK.reset) NETCHECK.reset();
  const reallyOnline = await NETCHECK.ping();
  if (!reallyOnline) return;
  if (!S.forcedOffline) {
    toast('🌐 Back online');
    if (PSYNC._timer) PSYNC.pushNow();
    if (typeof WEEKLY !== 'undefined') WEEKLY.retryUnsynced();
    try { if (typeof USER_REPORT !== 'undefined' && USER_REPORT.flush) USER_REPORT.flush(); } catch (e) {}
    }
     else {
    toast('🌐 Network restored — still in forced offline mode');
  }
});

setTimeout(() => { try { if (typeof USER_REPORT !== 'undefined' && USER_REPORT.flush) USER_REPORT.flush(); } catch (e) {} }, 8000);

window.addEventListener('offline', () => {
  const wasForcedOff = S.forcedOffline;
  S.online = false;
  if (!wasForcedOff) toast('📡 Network lost — switched to offline mode automatically');
  _updateNetBtn();
  _updateOfflineWarn();
});
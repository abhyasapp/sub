// js/core/net.js — the shared transport layer: reachability probe, Google
// Sign-In lazy loader, and the ONE request function every module uses.
//
// Transport guarantees every caller can rely on:
//   • Timeout with AbortController (default from RETRY_CONFIG, per-call override).
//   • Fallback to the OTHER backend when the primary:
//       – times out
//       – throws a network error
//       – returns HTTP 5xx
//       – returns success:false with "unknown action" (POST only, safe to retry
//         because the handler never ran)
//   • Falls back only once, and only to a host different from the primary.
//   • Marks the returned Response with _fallbackUsed='gas' | 'supabase' and
//     dispatches window 'abhyas:fallback' so a UI banner can pick it up.
//   • Circuit breaker: N failures in W ms to a host opens it for C ms.
//
// Deliberately NOT retried:
//   • success:false with an app-level error ("wrong password", "username taken",
//     "file not found", "already attempted"). Retrying doubles the failure and
//     changes the error the caller sees.
//   • Client-side failures (S.offline, OFFLINE, bad URL).
// ───────────────────────────────────────────────────────────────────────────

async function pingSupabase(timeoutMs = 5000) {
  if (typeof ABHYAS_CONFIG === 'undefined' || !ABHYAS_CONFIG.SUPABASE_URL) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    await fetch(ABHYAS_CONFIG.SUPABASE_URL, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store'
    });
    clearTimeout(to);
    return true;
  } catch (e) {
    return false;
  }
}

async function pingBackend(gasUrl, timeoutMs = 12000) {
  if (!gasUrl) return false;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${gasUrl}?action=ping&_=${Date.now()}`, {
      signal: ctrl.signal, cache: 'no-store'
    });
    clearTimeout(to);
    if (!r.ok) return false;
    const data = await r.json();
    return !!(data.pong || data.success);
  } catch (e) { return false; }
}

const GSI = {
  SRC: 'https://accounts.google.com/gsi/client',
  _p: null,
  _inject() {
    if (window.google && window.google.accounts) return;
    if (document.querySelector('script[src="' + GSI.SRC + '"]')) return;
    const s = document.createElement('script');
    s.src = GSI.SRC; s.async = true; s.defer = true;
    document.head.appendChild(s);
  },
  whenNeeded() {
    if (GSI._p) return GSI._p;
    GSI._p = new Promise(resolve => {
      const go = () => GSI._inject();
      if (document.readyState === 'complete') { setTimeout(go, 0); return; }
      window.addEventListener('load', () => setTimeout(go, 0), { once: true });
      setTimeout(go, 2500);
    });
    return GSI._p;
  }
};

function qs(params) {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/* Rate gate for getFile/getFiles — unchanged in spirit from the original. */
const GETFILE_GATE = {
  MAX: 45, BG_MAX: 15, WINDOW: 60000,
  _hits: [], _penaltyUntil: 0,
  async take(kind) {
    const ceiling = kind === 'bg' ? this.BG_MAX : this.MAX;
    for (;;) {
      const now = Date.now();
      if (now < this._penaltyUntil) {
        await new Promise(r => setTimeout(r, Math.min(this._penaltyUntil - now, 15000)));
        continue;
      }
      this._hits = this._hits.filter(t => now - t < this.WINDOW);
      if (this._hits.length < ceiling) { this._hits.push(now); return; }
      const oldest = this._hits[0] || now;
      const waitMs = Math.min(this.WINDOW, Math.max(250, this.WINDOW - (now - oldest) + 100));
      await new Promise(r => setTimeout(r, waitMs));
    }
  },
  backoff(ms = 10000) { this._penaltyUntil = Date.now() + ms; this._hits = []; },
  etaSeconds(n) {
    const perMin = this.MAX;
    return n <= perMin ? 0 : Math.round(((n - perMin) / perMin) * 60);
  }
};

/* ═══════════════ Circuit breaker ══════════════════════════════════════════
   Per-host. Opens after N failures in W ms and stays open for C ms. Any
   success resets the counter. Read by netFetch, so a dead backend is not
   hammered while the fallback is working fine.
   ─────────────────────────────────────────────────────────────────────── */
const _CIRCUIT = {
  _state: {},                          /* host → { count, firstFailAt, openUntil } */
  _cfg() {
    const c = (typeof RETRY_CONFIG !== 'undefined' && RETRY_CONFIG.circuitBreaker) || {};
    return {
      threshold:  c.failureThreshold || 3,
      windowMs:   c.windowMs         || 30000,
      cooldownMs: c.cooldownMs       || 60000
    };
  },
  isOpen(host) {
    const s = this._state[host];
    if (!s) return false;
    if (Date.now() > s.openUntil) { delete this._state[host]; return false; }
    return true;
  },
  fail(host) {
    const cfg = this._cfg();
    const s = this._state[host] || (this._state[host] = { count: 0, firstFailAt: Date.now(), openUntil: 0 });
    if (Date.now() - s.firstFailAt > cfg.windowMs) {
      s.count = 0;
      s.firstFailAt = Date.now();
    }
    s.count++;
    if (s.count >= cfg.threshold) s.openUntil = Date.now() + cfg.cooldownMs;
  },
  success(host) { if (this._state[host]) delete this._state[host]; },
  reset() { this._state = {}; }
};

/* ═══════════════ Routing ══════════════════════════════════════════════════
   Work out where a request actually goes and where its fallback goes.
   Returns { action, bodyObj, primaryUrl, fallbackUrl, rewroteToSupabase }.
   ─────────────────────────────────────────────────────────────────────── */
function _resolveRouting(url, opts) {
  let action = null;
  let bodyObj = null;

  if (opts && opts.body) {
    try {
      bodyObj = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
      if (bodyObj && bodyObj.action) action = bodyObj.action;
    } catch (e) { /* not JSON — treat as no body */ }
  }

  if (!action && url.indexOf('action=') !== -1) {
    try {
      const urlObj = new URL(url, window.location.origin);
      action = urlObj.searchParams.get('action');
      if (!bodyObj) {
        bodyObj = {};
        for (const [k, v] of urlObj.searchParams.entries()) bodyObj[k] = v;
      }
    } catch (e) {}
  }

  let primaryUrl = url;
  let rewroteToSupabase = false;

  if (typeof ABHYAS_CONFIG !== 'undefined' && typeof abhyasEndpointFor === 'function') {
    if (action && abhyasEndpointFor(action, bodyObj) === 'supabase') {
      const qIdx = url.indexOf('?');
      primaryUrl = qIdx === -1
        ? ABHYAS_CONFIG.SUPABASE_URL
        : ABHYAS_CONFIG.SUPABASE_URL + url.slice(qIdx);
      rewroteToSupabase = primaryUrl !== url;
    }
  }

  /* The fallback is the other host, with the same suffix (query string for
     GET, empty for POST). */
  let fallbackUrl = null;
  if (typeof ABHYAS_CONFIG !== 'undefined') {
    if (rewroteToSupabase) {
      const qIdx = url.indexOf('?');
      const suffix = qIdx === -1 ? '' : url.slice(qIdx);
      fallbackUrl = ABHYAS_CONFIG.GAS_URL + suffix;
    } else if (url.indexOf(ABHYAS_CONFIG.GAS_URL) === 0) {
      const suffix = url.slice(ABHYAS_CONFIG.GAS_URL.length);
      fallbackUrl = ABHYAS_CONFIG.SUPABASE_URL + suffix;
    }
  }

  return { action, bodyObj, primaryUrl, fallbackUrl, rewroteToSupabase };
}

/* ═══════════════ One fetch attempt with timeout ═══════════════════════════
   Returns a Response. Throws on network error, timeout, or non-2xx that the
   caller should consider fatal. 5xx is thrown so netFetch can fall back.
   ─────────────────────────────────────────────────────────────────────── */
async function _attemptFetch(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...(opts || {}), signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new Error('Request timed out — the server is taking too long. Try again or check your connection.', { cause: err });
    }
    throw err;
  }
}

/* Best-effort: parse a cloned body and check for the exact "unknown action"
   shape (POST only). Returns true when the request should be retried on the
   other backend — the handler was never reached so retrying is safe. */
async function _isUnknownActionResponse(res) {
  try {
    const probe = res.clone();
    const ct = (probe.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('json') === -1) return false;
    const j = await probe.json();
    if (j && j.success === false && /^unknown action/i.test(String(j.error || ''))) return true;
  } catch (e) { /* unparseable — treat as success */ }
  return false;
}

/* ═══════════════ netFetch — the ONE request function ══════════════════════
   Signature is the same as the original so existing callers keep working.
   Callers still call `.json()` or `.text()` on the Response.
   ─────────────────────────────────────────────────────────────────────── */
async function netFetch(url, opts, timeoutMs) {
  if (typeof S !== 'undefined' && S.forcedOffline) throw new Error('OFFLINE');
  if (typeof S !== 'undefined' && !S.online) throw new Error('OFFLINE');

  const defaultTimeout = (typeof RETRY_CONFIG !== 'undefined' && RETRY_CONFIG.timeouts && RETRY_CONFIG.timeouts.normal) || 20000;
  const to = Number(timeoutMs) > 0 ? Number(timeoutMs) : defaultTimeout;

  const routing = _resolveRouting(url, opts);
  const isPost = !!(opts && opts.method && String(opts.method).toUpperCase() === 'POST');

  /* ── Primary attempt ── */
  let primaryRes = null;
  let primaryErr = null;

  if (_CIRCUIT.isOpen(routing.primaryUrl)) {
    primaryErr = new Error('Primary backend is temporarily unavailable (circuit open).');
  } else {
    try {
      primaryRes = await _attemptFetch(routing.primaryUrl, opts, to);
    } catch (err) {
      primaryErr = err;
      _CIRCUIT.fail(routing.primaryUrl);
    }

    if (primaryRes && primaryRes.status >= 500) {
      primaryErr = new Error('HTTP ' + primaryRes.status);
      _CIRCUIT.fail(routing.primaryUrl);
      primaryRes = null;
    }

    if (primaryRes && isPost && primaryRes.ok) {
      /* Only peek at POST bodies, and only to detect the exact
         "unknown action" shape. Everything else is returned untouched. */
      if (await _isUnknownActionResponse(primaryRes)) {
        primaryErr = new Error('Unknown action on primary.');
        primaryRes = null;
      }
    }

    if (primaryRes) {
      _CIRCUIT.success(routing.primaryUrl);
      return primaryRes;
    }
  }

  /* ── Fallback attempt ── */
  if (routing.fallbackUrl && routing.fallbackUrl !== routing.primaryUrl &&
      !_CIRCUIT.isOpen(routing.fallbackUrl)) {
    try {
      const fbRes = await _attemptFetch(routing.fallbackUrl, opts, to);
      if (fbRes.status >= 500) throw new Error('HTTP ' + fbRes.status);
      _CIRCUIT.success(routing.fallbackUrl);

      /* If the fallback ALSO doesn't know the action, it's a genuine
         "not implemented anywhere" case — throw so the caller sees it. */
      if (isPost && await _isUnknownActionResponse(fbRes)) {
        throw new Error('Unknown action on both backends.');
      }

      try { fbRes._fallbackUsed = routing.rewroteToSupabase ? 'gas' : 'supabase'; } catch (e) {}
      try {
        window.dispatchEvent(new CustomEvent('abhyas:fallback', {
          detail: { action: routing.action || '', primary: routing.primaryUrl, fallback: routing.fallbackUrl }
        }));
      } catch (e) {}
      console.warn('[net] fallback used for', routing.action || 'request');
      return fbRes;
    } catch (fbErr) {
      _CIRCUIT.fail(routing.fallbackUrl);
    }
  }

  throw primaryErr || new Error('Could not reach the server — both backends are unavailable.');
}

/* A convenience helper that returns the parsed JSON with _fallbackUsed
   propagated. Use this in new code; existing callers stay on netFetch. */
async function netFetchJson(url, opts, timeoutMs) {
  const res = await netFetch(url, opts, timeoutMs);
  const json = await res.json();
  if (res._fallbackUsed) {
    try { json._fallbackUsed = res._fallbackUsed; } catch (e) {}
  }
  return json;
}

/* ═══════════════ Reachability probe ═══════════════════════════════════════
   Ping Supabase first, then GAS. Track consecutive failures; only flip
   S.online to false after several, so a single flaky probe doesn't take the
   app offline.
   ─────────────────────────────────────────────────────────────────────── */
const NETCHECK = {
  _timer: null, _failCount: 0, FAILS_BEFORE_OFFLINE: 3,
  async ping() {
    if (S.forcedOffline) return S.online;
    const wasOnline = S.online;
    let ok;

    try {
      ok = await pingSupabase();
      if (!ok && typeof APPS !== 'undefined') {
        ok = await pingBackend(APPS);
      }
    } catch (e) { ok = false; }

    if (ok) {
      this._failCount = 0;
      S.online = true;
    } else {
      this._failCount++;
      if (!navigator.onLine || this._failCount >= this.FAILS_BEFORE_OFFLINE) S.online = false;
    }

    if (S.online !== wasOnline) {
      if (typeof _updateNetBtn === 'function') _updateNetBtn();
      if (typeof _updateOfflineWarn === 'function') _updateOfflineWarn();
    }
    return S.online;
  },
  start() {
    if (NETCHECK._timer) return;
    NETCHECK._timer = setInterval(() => NETCHECK.ping(), 30000);
    /* Kick off the first ping immediately so the first 30s doesn't
       needlessly serve from a stale `S.online = navigator.onLine`. */
    setTimeout(() => { try { NETCHECK.ping(); } catch (e) {} }, 200);
  },
  reset() { this._failCount = 0; _CIRCUIT.reset(); }
};
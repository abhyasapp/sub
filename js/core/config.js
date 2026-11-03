/* ═══════════════════════════════════════════════════════════════════════
   js/core/config.js — backend endpoints, version, feature flags, retry
   policy. MUST load FIRST — before constants.js, before any shim.
   MUST load EXACTLY ONCE (do not reference from any shim or app.js).
   ═══════════════════════════════════════════════════════════════════════ */

const APP_VERSION = '2.14';
window.APP_VERSION = APP_VERSION;

/* ═══════════════ Retry policy (read by js/core/net.js) ═══════════════════
   Tune these if a deployment gets flakier. Nothing else needs to change.
   ─────────────────────────────────────────────────────────────────────── */
const RETRY_CONFIG = Object.freeze({
  circuitBreaker: {
    failureThreshold: 3,
    windowMs: 30000,
    cooldownMs: 60000
  },
  timeouts: {
    fast:   10000,
    normal: 20000,
    slow:   45000,
    upload: 120000
  }
});
window.RETRY_CONFIG = RETRY_CONFIG;

const ABHYAS_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec',
  GOOGLE_CLIENT_ID: '242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com',
  CONTENT_CDN_BASE: 'https://cdn.jsdelivr.net/gh/abhyasapp/content@main',

  SUPABASE_BUCKET_PREFIXES: [
    'weekly-sets/',
    'subjective-content/',
    'study-docs/',
    'subjective/'
  ],

  DRIVE_ACTIONS: [
    'resendverification',
    'verifyemail',
    'requestpasswordreset',
    'resetpassword',

    /* Only the two actions that physically read or write a Drive JSON file
       belong on Apps Script. Every report and correction read is a Postgres
       query and belongs on Supabase, where it is fast. The GAS edit mirrors
       its snapshot into Supabase before returning (see gas/report.gs), so the
       console and the correction pipeline see the fix immediately. */
    'admingetquestion',
    'adminupdatequestion'
  ]
});
window.ABHYAS_CONFIG = ABHYAS_CONFIG;

function abhyasIsSupabasePath(fileId) {
  const fid = String(fileId || '');
  if (!fid) return false;
  if (ABHYAS_CONFIG.SUPABASE_BUCKET_PREFIXES.some(p => fid.indexOf(p) === 0)) return true;
  if (fid.indexOf('/') !== -1) return true;
  return false;
}
window.abhyasIsSupabasePath = abhyasIsSupabasePath;

function abhyasEndpointFor(action, params) {
  const a = String(action || '').toLowerCase();
  if (a === 'getfile') {
    const fid = params && (params.fileId || params.file_id || params.id || params.path);
    return abhyasIsSupabasePath(fid) ? 'supabase' : 'gas';
  }
  if (ABHYAS_CONFIG.DRIVE_ACTIONS.indexOf(a) !== -1) return 'gas';
  return 'supabase';
}
window.abhyasEndpointFor = abhyasEndpointFor;

function abhyasTimeoutFor(kind) {
  return RETRY_CONFIG.timeouts[kind] || RETRY_CONFIG.timeouts.normal;
}
window.abhyasTimeoutFor = abhyasTimeoutFor;
// js/core/constants.js — every literal that other modules share.
// Loads first. Nothing here depends on another file.

const APP_CONFIG = { APPS_URL: ABHYAS_CONFIG.GAS_URL };
const APPS = APP_CONFIG.APPS_URL;

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const BK_TAGS = ['Need Check','Interesting','Debating','Confusing','Formulae'];
const SR_INTERVALS = [1, 3, 7, 14];
const WEEKLY_EXAM_WINDOW_HOURS = 12;
const APP_NAME = 'Abhyas V1';

const LS = {
  USER:'abhyas_session',
  PROG:'abhyas_prog', BK:'abhyas_bk', FL:'abhyas_fl', WR:'abhyas_wr',
  QC:'abhyas_qc_', TT:'abhyas_tt', TT_NOTIFIED:'abhyas_tt_notified', STK:'abhyas_stk',
  FORCED_OFFLINE:'abhyas_forced_off',
  EXAM_SNAP:'abhyas_exam_snap',
  FCOUNT:'abhyas_fcount',
  CLOUD:'abhyas_cloud',
  PROFILE:'abhyas_profile',
  CHAPSTATS:'abhyas_chapstats',
  LAST_USER:'abhyas_last_user',
  WK_ATTEMPTS:'abhyas_weekly_attempts',
  COV:'abhyas_cov'
};

const PSYNC_KEYS = new Set([LS.BK, LS.FL, LS.WR, LS.PROG, LS.STK, LS.CHAPSTATS, LS.COV]);

/* Quiet the chatty modules unless debugging is on. Must run before anything
   else can log, so it goes here at the top of the very first file. */
(function () {
  let debug = false;
  try {
    debug = localStorage.getItem('abhyas_debug') === '1'
         || (typeof window.ABHYAS_DEBUG === 'boolean' && window.ABHYAS_DEBUG === true);
  } catch (e) {}
  window.ABHYAS_DEBUG = debug;
  if (debug) return;
  const _warn = console.warn.bind(console);
  const _info = console.info.bind(console);
  const QUIET_WARN = /^\[(normQ|SUBJ|HOURLY|adaptive|daily|retake|chapters-loader|cross-tab|AUTH|PAY_QUEUE|reset-snapshot|PDFVIEW|marking)\]/;
  const QUIET_INFO = /^\[(HOURLY|Session bridge|PDFVIEW|PAY_QUEUE)\]/;
  console.warn = function () {
    const first = String((arguments[0] == null ? '' : arguments[0]));
    if (QUIET_WARN.test(first)) return;
    _warn.apply(null, arguments);
  };
  console.info = function () {
    const first = String((arguments[0] == null ? '' : arguments[0]));
    if (QUIET_INFO.test(first)) return;
    _info.apply(null, arguments);
  };
})();
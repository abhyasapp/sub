/* ═══════════════════════════════════════════════════════════════════════
   Abhyas V1 — Apps Script backend
   Flow: Signup → Auto-Trial (24h) → Payment → Admin Verify → Permanent
          Admin login shares one endpoint, opens a separate admin world.
          Offline-first: once paid, access is never removed.

   VERSION: 1.07
   ─────────────────────────────────────────────────────────────────────
   v1.07 — Fixes + cleanup
     • adminCommitSubjectiveImport — the Smart Paste write endpoint. The
       client parses locally (SUBJ_SMART in subjective.js) and posts the
       approved items; this appends them to the target Drive JSON file
       with a normalized-text dedupe pass.
     • adminReviewPayment now handles status="pending" (revert queue).
     • adminSwitchFromUser wrapped in withLock_ + 10/min rate limit.
     • Sheet-object cache added (per-request) so repeated calls to
       getAdminsSheet_() don't re-run the role-column migration.
     • Removed server-side Smart Paste parser — the client already has
       it, duplicating the keyword tables was a maintenance hazard.
   v1.06 — Subjective module, admin roles, dual-role switch.
   v1.05 — config consolidation, admin password enforcement.
   v1.04 — security + correctness + Weekly Attempts.
   v1.03 — formatting only.
   v1.02 — sliding admin tokens, private screenshots.
   v1.01 — login enumeration fix, cleanup actions.
   v1.00 — initial release.
   ═══════════════════════════════════════════════════════════════════════ */

const APP_VERSION = "1.07";

/* ── SPREADSHEET ───────────────────────────────────────────────────── */
const DEFAULT_SPREADSHEET_ID = "1yJF3kIGcwKHHdlcmw7ZUWBoUBMDeRWP7eaGBdDtUD_o";

/* ── SEED ADMIN — used ONLY the first time the Admins sheet is created. */
const ADMIN_SEED_USERNAME = "admin";
const ADMIN_SEED_PASSWORD = "ChangeMe123!";   // ⚠️ change on first login

/* ── SHEET NAMES ───────────────────────────────────────────────────── */
const USERS_SHEET            = "Users";
const PAYMENTS_SHEET         = "Payments";
const SETTINGS_SHEET         = "Settings";
const LOGS_SHEET             = "Logs";
const ADMINS_SHEET           = "Admins";
const PROGRESS_SHEET         = "Progress";
const PROGRESS_IMPORTS_SHEET = "ProgressImports";
const PROGRESS_BACKUPS_SHEET = "ProgressBackups";
const PUSHTOKENS_SHEET       = "PushTokens";
const WEEKLYSETS_SHEET       = "WeeklySets";
const WEEKLYATTEMPTS_SHEET   = "WeeklyAttempts";
const QREPORTS_SHEET         = "QuestionReports";
const SUBJ_SUBMISSIONS_SHEET = "SubjectiveSubmissions";
const ADMIN_PERMS_SHEET      = "AdminPermissions";

/* ── HEADERS ───────────────────────────────────────────────────────── */
const USER_HEADERS = [
  "username","passHash","name","email","mobile",
  "contact","contactType","status","createdAt","approvedAt",
  "role","trialExpiresAt","paymentStatus","permanentAccess",
  "accessType","accessExpiresAt","sessionToken","sessionTokenExpiresAt"
];
const PAYMENT_HEADERS = [
  "username","name","email","mobile","txId","remarks",
  "status","rejectionReason","screenshotUrl","submittedAt","reviewedAt"
];
const SETTINGS_HEADERS = ["key","value"];
const LOG_HEADERS = ["timestamp","admin","action","target","details"];
const ADMIN_HEADERS = [
  "username","passHash","createdAt","createdBy","token","tokenExpires","role"
];
const PROGRESS_HEADERS = ["username","data","updatedAt"];
const PUSHTOKENS_HEADERS = ["username","fcmToken","updatedAt"];
const WEEKLYSET_HEADERS = [
  "id","title","fileId","chapterLabel","status","uploadedBy","uploadedAt","releaseAt"
];
const WEEKLYATTEMPT_HEADERS = [
  "username","weeklyId","answersJson","totalQuestions",
  "correctClaimed","skippedCount","startedAt","submittedAt","durationSec"
];
const QREPORT_HEADERS = [
  "id","uid","fileId","questionSnapshot","reason","note","reportedBy","reportedAt","status"
];
const SUBJ_SUBMISSION_HEADERS = [
  "id","username","kind","questionId","questionText","questionMarks",
  "chapterId","solveSec","startedAt","submittedAt",
  "pdfFileId","pdfUrl","status","score","feedback","gradedBy","gradedAt"
];
const ADMIN_PERM_HEADERS = ["username","featureKey","enabled","updatedAt","updatedBy"];
const PROGRESS_IMPORT_HEADERS = [
  "importId","admin","mode","status","recordsReceived",
  "recordsAccepted","recordsSkipped","errorCount","createdAt",
  "completedAt","details"
];
const PROGRESS_BACKUP_HEADERS = [
  "backupId","importId","username","data","createdAt","createdBy"
];

/* ── TUNING ────────────────────────────────────────────────────────── */
const TRIAL_HOURS = 24;
const ADMIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const USER_TOKEN_TTL_MS  = 30 * 24 * 60 * 60 * 1000;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const GETFILE_RATE_LIMIT_PER_MINUTE = 120;
const SIGNUP_RATE_LIMIT_PER_MINUTE = 15;

const MAX_LIST_USERS = 3000;
const MAX_LIST_PAYMENTS = 3000;
const MAX_LIST_QREPORTS = 2000;
const MAX_LIST_WEEKLYSETS = 500;
const MAX_MISSED_SCAN_ROWS = 5000;
const MAX_SUBJ_SUBMISSIONS = 500;
const LOGS_MAX_ROWS_READ = 1000;

const MAX_IMPORT_BODY_CHARS = 450000;
const MAX_IMPORT_RECORDS = 500;
const MAX_IMPORT_DATA_CHARS_PER_USER = 45000;
const MAX_REPORT_LIMIT = 500;
const MAX_REPORT_MIN_ATTEMPTS = 1000000;

const TRIAL_WARNING_WINDOW_MS = 2 * 60 * 60 * 1000;

/* ── ADMIN ROLES ───────────────────────────────────────────────────── */
const ADMIN_ROLE_OWNER = "owner";
const ADMIN_ROLE_ADMIN = "admin";

const FEATURES = {
  dashboard:          "Dashboard overview",
  users_view:         "View users list",
  users_manage:       "Edit / delete users, grant access",
  users_bulk:         "Bulk operations on users",
  payments_view:      "View payments list",
  payments_review:    "Verify / reject payments",
  payments_bulk:      "Bulk payment review",
  screenshots:        "Download payment screenshots",
  weeklysets_view:    "View weekly sets",
  weeklysets_manage:  "Create / edit / delete weekly sets",
  qreports_view:      "View question reports",
  qreports_manage:    "Update / dismiss question reports",
  subjective_view:    "View subjective submissions",
  subjective_grade:   "Grade subjective submissions",
  subjective_import:  "Upload subjective JSON / import questions",
  logs_view:          "View activity logs",
  settings_view:      "View settings",
  settings_manage:    "Edit settings",
  admins_view:        "View other admin accounts",
  admins_manage:      "Create / delete admins, change permissions",
  maintenance:        "Data maintenance (prune / clear backups)",
  exports:            "Export CSV data",
  imports:            "Import progress data"
};

/* ── GOOGLE SIGN-IN ────────────────────────────────────────────────── */
const GOOGLE_CLIENT_ID = "242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com";

/* ═══════════════════════════════════════════════════════════════════════
   REQUEST-SCOPED CACHES
   ─────────────────────────────────────────────────────────────────────
   Every doGet execution starts with empty caches (Apps Script
   re-evaluates the module on each invocation). Writes call
   _invalidateSheet_ to drop the affected sheet's data.
   ═══════════════════════════════════════════════════════════════════════ */
const _sheetRefCache = {};   // name → Sheet object
const _sheetDataCache = {};  // name → { sheet, data }

function _invalidateSheet_(name) {
  delete _sheetDataCache[name];
}

function _cachedSheetData_(name, getter) {
  if (_sheetDataCache[name]) return _sheetDataCache[name];
  const sheet = getter ? getter() : getSpreadsheet_().getSheetByName(name);
  const data = sheet.getDataRange().getValues();
  _sheetDataCache[name] = { sheet, data };
  return _sheetDataCache[name];
}

/* ═══════════════════════════════════════════════════════════════════════
   ENTRY POINTS
   ═══════════════════════════════════════════════════════════════════════ */

function doGet(e) {
  if (!e || typeof e !== 'object') {
    return jsonResponse({ success: false, error: "Invalid request: no event object. Use the deployed Web App URL (/exec)." });
  }
  if (!e.parameter) e.parameter = {};

  const action = String(e.parameter.action || "").trim().toLowerCase();
  let result;

  try {
    switch (action) {
      case "ping": return jsonResponse({ success: true, pong: true, version: APP_VERSION });

      /* ── AUTH ── */
      case "login":                result = handleLogin(e.parameter); break;
      case "googlelogin":          result = handleGoogleLogin(e.parameter); break;
      case "signup":               result = handleSignup(e.parameter); break;
      case "checksession":         result = checkSession(e.parameter); break;
      case "requestpasswordreset": result = requestPasswordReset(e.parameter); break;
      case "resetpassword":        result = resetPassword(e.parameter); break;
      case "updateownmobile":      result = updateOwnMobile(e.parameter); break;
      case "checkadmincapable":    result = checkAdminCapable(e.parameter); break;
      case "adminswitchfromuser":  result = adminSwitchFromUser(e.parameter); break;

      /* ── USER CONTENT ── */
      case "saveprogress":         result = saveProgress(e.parameter); break;
      case "getprogress":          result = getProgress(e.parameter); break;
      case "savepushtoken":        result = savePushToken(e.parameter); break;
      case "listweeklysets":       result = listWeeklySets(e.parameter); break;
      case "getweeklyattempt":     result = getWeeklyAttempt(e.parameter); break;
      case "getmyweeklyattempts":  result = getMyWeeklyAttempts(e.parameter); break;
      case "submitweeklyattempt":  result = submitWeeklyAttempt(e.parameter); break;
      case "reportquestion":       result = reportQuestion(e.parameter); break;

      /* ── SUBJECTIVE (user) ── */
      case "submitsubjectiveanswer":     result = submitSubjectiveAnswer(e.parameter); break;
      case "getmysubjectivesubmissions": result = getMySubjectiveSubmissions(e.parameter); break;

      /* ── PAYMENT (user) ── */
      case "submitpayment":        result = submitPayment(e.parameter); break;
      case "getpaymentstatus":     result = getPaymentStatus(e.parameter); break;

      /* ── PUBLIC ── */
      case "getsettings":          result = getSettings(); break;
      case "getfile":              result = handleGetFile(e.parameter); break;

      /* ── ADMIN — AUTH + ACCOUNTS ── */
      case "adminlogin":           result = adminLogin(e.parameter); break;
      case "adminchangepassword":  result = adminChangePassword(e.parameter); break;
      case "adminlistadmins":      result = adminListAdmins(e.parameter); break;
      case "admincreateadmin":     result = adminCreateAdmin(e.parameter); break;
      case "admindeleteadmin":     result = adminDeleteAdmin(e.parameter); break;
      case "adminlistadminpermissions": result = adminListAdminPermissions(e.parameter); break;
      case "adminsetadminpermissions":  result = adminSetAdminPermissions(e.parameter); break;
      case "adminpromoteowner":         result = adminPromoteOwner(e.parameter); break;

      /* ── ADMIN — USERS ── */
      case "adminstats":           result = adminStats(e.parameter); break;
      case "adminlistusers":       result = adminListUsers(e.parameter); break;
      case "adminupdateuser":      result = adminUpdateUser(e.parameter); break;
      case "admindeleteuser":      result = adminDeleteUser(e.parameter); break;
      case "admindeleteusersbatch": result = adminDeleteUsersBatch(e.parameter); break;
      case "admingrantaccess":     result = adminGrantAccess(e.parameter); break;
      case "admingrantaccessbatch": result = adminGrantAccessBatch(e.parameter); break;

      /* ── ADMIN — PAYMENTS ── */
      case "adminlistpayments":    result = adminListPayments(e.parameter); break;
      case "adminreviewpayment":   result = adminReviewPayment(e.parameter); break;
      case "adminreviewpaymentsbatch": result = adminReviewPaymentsBatch(e.parameter); break;
      case "admindownloadscreenshot":  result = adminDownloadScreenshot(e.parameter); break;
      case "admindeletepayment":   result = adminDeletePayment(e.parameter); break;
      case "adminrevokescreenshotsharing": result = adminRevokeScreenshotSharing(e.parameter); break;
      case "adminexpiringtrials":  result = adminExpiringTrials(e.parameter); break;

      /* ── ADMIN — WEEKLY SETS ── */
      case "admincreateweeklyset":     result = adminCreateWeeklySet(e.parameter); break;
      case "adminuploadweeklysetfile": result = adminUploadWeeklySetFile(e.parameter); break;
      case "adminupdateweeklyset":     result = adminUpdateWeeklySet(e.parameter); break;
      case "admindeleteweeklyset":     result = adminDeleteWeeklySet(e.parameter); break;
      case "adminlistweeklysets":      result = adminListWeeklySets(e.parameter); break;
      case "adminweeklysetresults":    result = adminWeeklySetResults(e.parameter); break;

      /* ── ADMIN — QUESTION REPORTS ── */
      case "adminlistquestionreports":         result = adminListQuestionReports(e.parameter); break;
      case "adminupdatequestionreportstatus":  result = adminUpdateQuestionReportStatus(e.parameter); break;
      case "admindeletequestionreport":        result = adminDeleteQuestionReport(e.parameter); break;

      /* ── ADMIN — SUBJECTIVE ── */
      case "adminlistsubjectivesubmissions":   result = adminListSubjectiveSubmissions(e.parameter); break;
      case "admingradesubjectivesubmission":   result = adminGradeSubjectiveSubmission(e.parameter); break;
      case "adminuploadsubjectivefile":        result = adminUploadSubjectiveFile(e.parameter); break;
      case "admincommitsubjectiveimport":      result = adminCommitSubjectiveImport(e.parameter); break;

      /* ── ADMIN — SETTINGS / LOGS / ANALYTICS ── */
      case "adminupdatesettings":      result = adminUpdateSettings(e.parameter); break;
      case "adminupdatesettingsbatch": result = adminUpdateSettingsBatch(e.parameter); break;
      case "adminlistlogs":            result = adminListLogs(e.parameter); break;
      case "adminmostmissedquestions": result = adminMostMissedQuestions(e.parameter); break;

      /* ── ADMIN — PROGRESS IMPORT + MAINTENANCE ── */
      case "adminimportprogress":       result = adminImportProgress(e.parameter); break;
      case "adminimportstatus":         result = adminImportStatus(e.parameter); break;
      case "adminclearprogressbackups": result = adminClearProgressBackups(e.parameter); break;
      case "adminpruneoldbackups":      result = adminPruneOldBackups(e.parameter); break;
      case "admintrimlogs":             result = adminTrimLogs(e.parameter); break;

      default:
        result = { success: false, error: "Unknown action: '" + action + "'." };
    }
  } catch (err) {
    console.error("doGet ERROR [" + action + "]:", err);
    result = { success: false, error: "Server error: " + (err && err.message ? err.message : String(err)) };
  }

  return jsonResponse(result);
}

function doPost(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      const payload = JSON.parse(e.postData.contents);
      e.parameter = e.parameter || {};
      for (const key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) e.parameter[key] = payload[key];
      }
    } catch (parseErr) {
      console.log("doPost: JSON parse failed, using raw parameters");
    }
  }
  return doGet(e);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════════════════
   LOCK / RATE LIMIT / SANITIZE
   ═══════════════════════════════════════════════════════════════════════ */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, error: "Server is busy, please try again in a moment." }; }
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function checkRateLimit_(bucket, maxCount, windowMs, logLabel) {
  const props = PropertiesService.getScriptProperties();
  const key = "ratelimit_" + bucket;
  const windowBucket = Math.floor(Date.now() / windowMs);
  let state = { windowBucket, count: 0, logged: false };
  const raw = props.getProperty(key);
  if (raw) {
    try { state = JSON.parse(raw); } catch (e) {}
    if (state.windowBucket !== windowBucket) state = { windowBucket, count: 0, logged: false };
  }
  state.count = (state.count || 0) + 1;
  const withinLimit = state.count <= maxCount;
  if (!withinLimit && logLabel && !state.logged) {
    state.logged = true;
    logAction_("system", logLabel, "",
      "Exceeded " + maxCount + " per " + Math.round(windowMs / 1000) + "s (bucket: " + bucket + ").");
  }
  props.setProperty(key, JSON.stringify(state));
  return withinLimit;
}

function checkGetFileRateLimit_() {
  return checkRateLimit_("getfile", GETFILE_RATE_LIMIT_PER_MINUTE, 60000, "GetFile Rate Limited");
}
function checkSignupRateLimit_() {
  return checkRateLimit_("signup", SIGNUP_RATE_LIMIT_PER_MINUTE, 60000, "Signup Rate Limited");
}
function checkLoginRateLimit_(kind, username) {
  const raw = PropertiesService.getScriptProperties().getProperty("loginlock_" + kind + "_" + String(username).toLowerCase().trim());
  if (!raw) return { locked: false };
  let state;
  try { state = JSON.parse(raw); } catch (e) { return { locked: false }; }
  if (state.lockUntil && Date.now() < state.lockUntil) {
    return { locked: true, minutesLeft: Math.ceil((state.lockUntil - Date.now()) / 60000) };
  }
  return { locked: false };
}
function recordLoginFailure_(kind, username) {
  const props = PropertiesService.getScriptProperties();
  const key = "loginlock_" + kind + "_" + String(username).toLowerCase().trim();
  let state = { count: 0 };
  const raw = props.getProperty(key);
  if (raw) { try { state = JSON.parse(raw); } catch (e) {} }
  if (state.lockUntil && Date.now() >= state.lockUntil) state = { count: 0 };
  state.count = (state.count || 0) + 1;
  if (state.count >= MAX_LOGIN_ATTEMPTS) state.lockUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  props.setProperty(key, JSON.stringify(state));
}
function clearLoginLock_(kind, username) {
  PropertiesService.getScriptProperties().deleteProperty("loginlock_" + kind + "_" + String(username).toLowerCase().trim());
}

function sanitizeSheetField_(value) {
  const s = String(value == null ? "" : value);
  return /^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/* ═══════════════════════════════════════════════════════════════════════
   HASHING + TOKENS
   ═══════════════════════════════════════════════════════════════════════ */

function hashPass_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, "0")).join("");
}
function makeSalt_() { return Utilities.getUuid().replace(/-/g, ""); }
function hashPassSalted_(password, salt) { return hashPass_(salt + password); }

function verifyPassword_(password, storedHash) {
  const s = String(storedHash || "");
  const sep = s.indexOf(":");
  if (sep === -1) {
    if (s !== hashPass_(password)) return { ok: false };
    const salt = makeSalt_();
    return { ok: true, upgradedHash: salt + ":" + hashPassSalted_(password, salt) };
  }
  const salt = s.slice(0, sep);
  const hash = s.slice(sep + 1);
  return { ok: hash === hashPassSalted_(password, salt) };
}

function issueUserToken_(sheet, rowIndex) {
  const token = Utilities.getUuid();
  const expires = Date.now() + USER_TOKEN_TTL_MS;
  sheet.getRange(rowIndex, 17, 1, 2).setValues([[token, String(expires)]]);
  return token;
}
function issueAdminToken_(sheet, rowIndex) {
  const token = Utilities.getUuid();
  const expires = Date.now() + ADMIN_TOKEN_TTL_MS;
  sheet.getRange(rowIndex, 5, 1, 2).setValues([[token, String(expires)]]);
  return token;
}
function verifyUserToken_(found, token) {
  if (!token) return false;
  const stored = found.row[16];
  const expires = Number(found.row[17] || 0);
  if (!stored || stored !== token) return false;
  if (!expires || Date.now() > expires) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════
   SPREADSHEET + SHEET GETTERS
   ═══════════════════════════════════════════════════════════════════════ */

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty("SHEET_ID") || DEFAULT_SPREADSHEET_ID;
  let ss = null;
  try { ss = SpreadsheetApp.openById(ssId); } catch (e) { /* fall through */ }
  if (!ss) {
    ss = SpreadsheetApp.create("Abhyas V1");
    props.setProperty("SHEET_ID", ss.getId());
    console.log("⚠️ Created a NEW spreadsheet: " + ss.getUrl());
  } else if (props.getProperty("SHEET_ID") !== ssId) {
    props.setProperty("SHEET_ID", ssId);
  }
  return ss;
}

/* Generic sheet getter with per-request object cache. Creation with
   headers, text number-formatting, one-time banding (suppressed during
   setup()). */
function _getOrCreateSheet_(name, headers, formatAsText, headerColor, bandTheme, maxWidthPx) {
  if (_sheetRefCache[name]) return _sheetRefCache[name];

  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    if (formatAsText && formatAsText.length) {
      const maxRows = sheet.getMaxRows() - 1;
      formatAsText.forEach(col => sheet.getRange(2, col, maxRows, 1).setNumberFormat("@"));
    }
    if (!SKIP_CREATION_FORMATTING) {
      applyTableFormat_(sheet, headers, headerColor, bandTheme, maxWidthPx);
    }
  }
  _sheetRefCache[name] = sheet;
  return sheet;
}

function getUsersSheet_()      { return _getOrCreateSheet_(USERS_SHEET, USER_HEADERS, [1,5,6], "#4285f4", SpreadsheetApp.BandingTheme.BLUE, 300); }
function getPaymentsSheet_()   { return _getOrCreateSheet_(PAYMENTS_SHEET, PAYMENT_HEADERS, [4,5], "#34a853", SpreadsheetApp.BandingTheme.GREEN, 300); }
function getSettingsSheet_()   { return _getOrCreateSheet_(SETTINGS_SHEET, SETTINGS_HEADERS, [2], "#fbbc04", SpreadsheetApp.BandingTheme.YELLOW, 400); }
function getLogsSheet_()       { return _getOrCreateSheet_(LOGS_SHEET, LOG_HEADERS, [], "#9c27b0", SpreadsheetApp.BandingTheme.PURPLE, 320); }
function getProgressSheet_()   { return _getOrCreateSheet_(PROGRESS_SHEET, PROGRESS_HEADERS, [1], "#0f9d58", SpreadsheetApp.BandingTheme.GREEN, 300); }
function getPushTokensSheet_() { return _getOrCreateSheet_(PUSHTOKENS_SHEET, PUSHTOKENS_HEADERS, [1], "#e67c00", SpreadsheetApp.BandingTheme.ORANGE, 300); }
function getWeeklySetsSheet_() { return _getOrCreateSheet_(WEEKLYSETS_SHEET, WEEKLYSET_HEADERS, [1,3], "#00acc1", SpreadsheetApp.BandingTheme.CYAN, 320); }
function getWeeklyAttemptsSheet_()  { return _getOrCreateSheet_(WEEKLYATTEMPTS_SHEET, WEEKLYATTEMPT_HEADERS, [1,2], "#00897b", SpreadsheetApp.BandingTheme.TEAL, 300); }
function getQReportsSheet_()        { return _getOrCreateSheet_(QREPORTS_SHEET, QREPORT_HEADERS, [1,2,3], "#d81b60", SpreadsheetApp.BandingTheme.PINK, 340); }
function getSubjSubmissionsSheet_() { return _getOrCreateSheet_(SUBJ_SUBMISSIONS_SHEET, SUBJ_SUBMISSION_HEADERS, [1,2,4,11], "#0891b2", SpreadsheetApp.BandingTheme.CYAN, 400); }
function getAdminPermsSheet_()      { return _getOrCreateSheet_(ADMIN_PERMS_SHEET, ADMIN_PERM_HEADERS, [1,2], "#7c3aed", SpreadsheetApp.BandingTheme.PURPLE, 320); }
function getProgressImportsSheet_() { return _getOrCreateSheet_(PROGRESS_IMPORTS_SHEET, PROGRESS_IMPORT_HEADERS, [], "#5e35b1", SpreadsheetApp.BandingTheme.PURPLE, 320); }
function getProgressBackupsSheet_() { return _getOrCreateSheet_(PROGRESS_BACKUPS_SHEET, PROGRESS_BACKUP_HEADERS, [], "#455a64", SpreadsheetApp.BandingTheme.GREY, 320); }

/* Admins needs its own getter because it does schema migration. */
function getAdminsSheet_() {
  if (_sheetRefCache[ADMINS_SHEET]) return _sheetRefCache[ADMINS_SHEET];

  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(ADMINS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ADMINS_SHEET);
    sheet.appendRow(ADMIN_HEADERS);
    const maxRows = sheet.getMaxRows() - 1;
    sheet.getRange(2, 1, maxRows, 1).setNumberFormat("@");
    if (!SKIP_CREATION_FORMATTING) {
      applyTableFormat_(sheet, ADMIN_HEADERS, "#ea4335", SpreadsheetApp.BandingTheme.RED, 300);
    }
    const salt = makeSalt_();
    sheet.appendRow([
      ADMIN_SEED_USERNAME,
      salt + ":" + hashPassSalted_(ADMIN_SEED_PASSWORD, salt),
      new Date().toISOString(),
      "system",
      "", "",
      ADMIN_ROLE_OWNER
    ]);
    _sheetRefCache[ADMINS_SHEET] = sheet;
    return sheet;
  }

  // v1.06 — ensure the 'role' column exists; backfill on first read.
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headerRow.includes("role")) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue("role");
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const usernames = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const roles = usernames.map(r => [
        String(r[0] || "").toLowerCase() === ADMIN_SEED_USERNAME.toLowerCase()
          ? ADMIN_ROLE_OWNER : ADMIN_ROLE_ADMIN
      ]);
      sheet.getRange(2, newCol, roles.length, 1).setValues(roles);
    }
  }
  _sheetRefCache[ADMINS_SHEET] = sheet;
  return sheet;
}

/* ═══════════════════════════════════════════════════════════════════════
   ROW LOOKUP — TextFinder for single-row, cached scan for multi-row
   ═══════════════════════════════════════════════════════════════════════ */

function _findRowFast_(sheet, col, value) {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value);
  const finder = sheet.createTextFinder(str)
    .matchCase(false)
    .matchEntireCell(true)
    .findNext();
  if (!finder) return null;
  const rowIndex = finder.getRow();
  if (rowIndex < 2) return null;
  const cellVal = sheet.getRange(rowIndex, col).getValue();
  if (String(cellVal).toLowerCase().trim() !== str.toLowerCase().trim()) return null;
  const row = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  return { rowIndex, row };
}

function findUserRow_(sheet, username)       { return username ? _findRowFast_(sheet, 1, username) : null; }
function findAdminRow_(sheet, username)      { return username ? _findRowFast_(sheet, 1, username) : null; }
function findProgressRow_(sheet, username)   { return username ? _findRowFast_(sheet, 1, username) : null; }
function findPushTokenRow_(sheet, username)  { return username ? _findRowFast_(sheet, 1, username) : null; }
function findWeeklySetRow_(sheet, id)        { return id ? _findRowFast_(sheet, 1, id) : null; }
function findQReportRow_(sheet, id)          { return id ? _findRowFast_(sheet, 1, id) : null; }
function findUserByField_(sheet, colIndex, value) { return value ? _findRowFast_(sheet, colIndex + 1, value) : null; }

function findWeeklyAttemptRow_(sheet, username, weeklyId) {
  if (!username || !weeklyId) return null;
  const target = String(username).toLowerCase().trim();
  const wid = String(weeklyId).trim();
  const data = _cachedSheetData_(WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_).data;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === target && String(data[i][1]).trim() === wid) {
      return { rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

function findAdminByToken_(sheet, token) {
  if (!token) return null;
  const data = _cachedSheetData_(ADMINS_SHEET, getAdminsSheet_).data;
  const now = Date.now();
  const SLIDE_THRESHOLD_MS = 60 * 60 * 1000;
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] && data[i][4] === token) {
      const expires = Number(data[i][5] || 0);
      if (expires && now <= expires) {
        if (expires - now < ADMIN_TOKEN_TTL_MS - SLIDE_THRESHOLD_MS) {
          try {
            sheet.getRange(i + 1, 6).setValue(String(now + ADMIN_TOKEN_TTL_MS));
            _invalidateSheet_(ADMINS_SHEET);
          } catch (e) {}
        }
        return { rowIndex: i + 1, row: data[i] };
      }
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   ROW → OBJECT MAPPERS
   ═══════════════════════════════════════════════════════════════════════ */

function rowToUser_(row) {
  return {
    username: row[0] || "",
    name: row[2] || "",
    email: row[3] || "",
    mobile: String(row[4] || ""),
    contact: row[5] || "",
    contactType: row[6] || "",
    status: row[7] || "trial",
    createdAt: row[8] || "",
    approvedAt: row[9] || "",
    role: row[10] || "user",
    trialExpiresAt: row[11] || "",
    paymentStatus: row[12] || "none",
    permanentAccess: row[13] === "true" || row[13] === true,
    accessType: row[14] || "",
    accessExpiresAt: row[15] || ""
  };
}
function rowToWeeklySet_(row) {
  return {
    id: row[0] || "", title: row[1] || "", fileId: row[2] || "",
    chapterLabel: row[3] || "", status: row[4] || "active",
    uploadedBy: row[5] || "", uploadedAt: row[6] || "", releaseAt: row[7] || ""
  };
}
function rowToQReport_(row) {
  return {
    id: row[0] || "", uid: row[1] || "", fileId: row[2] || "",
    questionSnapshot: row[3] || "", reason: row[4] || "",
    note: row[5] || "", reportedBy: row[6] || "",
    reportedAt: row[7] || "", status: row[8] || "open"
  };
}
function rowToWeeklyAttempt_(row) {
  let answers = [];
  try { answers = JSON.parse(row[2] || "[]"); } catch (e) {}
  const total = Number(row[3] || 0);
  const correct = Number(row[4] || 0);
  return {
    weeklyId: row[1] || "", answers, total, correct,
    pct: total ? Math.round((correct / total) * 100) : 0,
    skipped: Number(row[5] || 0),
    startedAt: Number(row[6] || 0),
    submittedAt: Number(row[7] || 0),
    durationSec: Number(row[8] || 0),
    synced: true
  };
}
function rowToSubjSubmission_(row) {
  return {
    id: row[0] || "", username: row[1] || "", kind: row[2] || "qotd",
    questionId: row[3] || "", questionText: row[4] || "",
    questionMarks: Number(row[5] || 0), chapterId: row[6] || "",
    solveSec: Number(row[7] || 0),
    startedAt: Number(row[8] || 0), submittedAt: Number(row[9] || 0),
    pdfFileId: row[10] || "", pdfUrl: row[11] || "",
    status: row[12] || "pending",
    score: row[13] === "" ? null : Number(row[13]),
    feedback: row[14] || "",
    gradedBy: row[15] || "", gradedAt: row[16] || ""
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   LOGGING
   ═══════════════════════════════════════════════════════════════════════ */

function logAction_(admin, action, target, details) {
  try {
    getLogsSheet_().appendRow([
      new Date().toISOString(), admin || "admin",
      action || "", target || "", details || ""
    ]);
    _invalidateSheet_(LOGS_SHEET);
  } catch (err) { console.error("logAction_ failed:", err); }
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN AUTH + PERMISSIONS
   ═══════════════════════════════════════════════════════════════════════ */

function checkAdmin_(p) {
  const sheet = getAdminsSheet_();
  if (p.adminUser && p.adminPass) {
    const found = findAdminRow_(sheet, p.adminUser);
    if (!found) return null;
    const verify = verifyPassword_(p.adminPass, found.row[1]);
    if (!verify.ok) return null;
    if (verify.upgradedHash) {
      sheet.getRange(found.rowIndex, 2).setValue(verify.upgradedHash);
      _invalidateSheet_(ADMINS_SHEET);
    }
    return found.row[0];
  }
  if (!p.adminToken) return null;
  const found = findAdminByToken_(sheet, p.adminToken);
  return found ? found.row[0] : null;
}

function getAdminRecord_(username) {
  if (!username) return null;
  const found = findAdminRow_(getAdminsSheet_(), username);
  if (!found) return null;
  const role = String(found.row[6] || "").trim().toLowerCase() || ADMIN_ROLE_ADMIN;
  return { rowIndex: found.rowIndex, row: found.row, role };
}

function getAdminPermissions_(username) {
  const rec = getAdminRecord_(username);
  if (!rec) return new Set();
  if (rec.role === ADMIN_ROLE_OWNER) return new Set(Object.keys(FEATURES));

  const data = _cachedSheetData_(ADMIN_PERMS_SHEET, getAdminPermsSheet_).data;
  const target = String(username).toLowerCase().trim();
  const granted = new Set();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === target) {
      const enabled = data[i][2] === true || data[i][2] === "true" || data[i][2] === 1;
      if (enabled) granted.add(String(data[i][1]));
    }
  }
  return granted;
}

function checkAdminCan_(p, feature) {
  const actor = checkAdmin_(p);
  if (!actor) return { ok: false, error: "Admin auth failed." };
  const rec = getAdminRecord_(actor);
  if (!rec) return { ok: false, error: "Admin auth failed." };
  if (rec.role === ADMIN_ROLE_OWNER) return { ok: true, actor, role: rec.role };
  const perms = getAdminPermissions_(actor);
  if (!perms.has(feature)) {
    return { ok: false, error: "You don't have permission for this action (" + feature + ").", actor };
  }
  return { ok: true, actor, role: rec.role };
}

function userIsAlsoAdmin_(username) {
  if (!username) return false;
  return !!findAdminRow_(getAdminsSheet_(), username);
}

/* ═══════════════════════════════════════════════════════════════════════
   SETUP + FORMATTING
   ═══════════════════════════════════════════════════════════════════════ */

let SKIP_CREATION_FORMATTING = false;

function setup() {
  SKIP_CREATION_FORMATTING = true;
  try {
    getUsersSheet_();
    getPaymentsSheet_();
    getSettingsSheet_();
    getLogsSheet_();
    getAdminsSheet_();
    getProgressSheet_();
    getPushTokensSheet_();
    getWeeklySetsSheet_();
    getWeeklyAttemptsSheet_();
    getQReportsSheet_();
    getSubjSubmissionsSheet_();
    getAdminPermsSheet_();
    getProgressImportsSheet_();
    getProgressBackupsSheet_();
  } finally {
    SKIP_CREATION_FORMATTING = false;
  }
  initDefaultSettings_();
  ensurePushTriggers_();
  fixSheetFormatting();
  sortSheetsAlphabetically_();
  Logger.log("✅ Setup complete. " + getSpreadsheet_().getUrl());
  return "Setup complete.";
}

function initDefaultSettings_() {
  const sheet = getSettingsSheet_();
  const data = sheet.getDataRange().getValues();
  const have = new Set();
  for (let i = 1; i < data.length; i++) if (data[i][0]) have.add(String(data[i][0]));
  const defaults = [
    ["qrCodeUrl", ""],
    ["contactPhone", "9863200285"],
    ["paymentAmount", "100"],
    ["paymentInstructions", "Scan the QR code and submit your transaction ID for verification."],
    ["trialHours", "24"],
    ["appName", "Abhyas"]
  ];
  const toAdd = defaults.filter(([k]) => !have.has(k));
  if (!toAdd.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, 2).setValues(toAdd);
  _invalidateSheet_(SETTINGS_SHEET);
}

function sortSheetsAlphabetically_() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();
  if (sheets.length < 2) return;
  const names = sheets.map(s => s.getName())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  names.forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    sh.activate();
    ss.moveActiveSheet(i + 1);
  });
  SpreadsheetApp.flush();
}

function applyTableFormat_(sheet, headers, headerColor, bandTheme, maxWidthPx) {
  const numCols = headers.length;
  const maxRows = Math.max(1, sheet.getMaxRows() - 1);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, numCols)
    .setFontWeight("bold")
    .setBackground(headerColor)
    .setFontColor("white");

  const fullRange = sheet.getRange(1, 1, maxRows + 1, numCols);
  if (maxRows >= 1) applyBandingOrFallback_(sheet, fullRange, headerColor, bandTheme);
  fullRange.setBorder(true, true, true, true, true, true, "#d0d0d0", SpreadsheetApp.BorderStyle.SOLID);
  autoResizeCapped_(sheet, 1, numCols, maxWidthPx || 300);
}

function applyBandingOrFallback_(sheet, fullRange, headerColor, bandTheme) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      sheet.getBandings().forEach(b => {
        const r = b.getRange();
        const overlaps = r.getSheet().getSheetId() === sheet.getSheetId() &&
          r.getRow() <= fullRange.getLastRow() && r.getLastRow() >= fullRange.getRow() &&
          r.getColumn() <= fullRange.getLastColumn() && r.getLastColumn() >= fullRange.getColumn();
        if (overlaps) b.remove();
      });
      SpreadsheetApp.flush();
      const banding = fullRange.applyRowBanding(bandTheme, true, false);
      banding.setHeaderRowColor(headerColor);
      if (fullRange.getNumRows() > 1) {
        sheet.getRange(fullRange.getRow() + 1, fullRange.getColumn(),
                       fullRange.getNumRows() - 1, fullRange.getNumColumns())
          .setBackground(null);
      }
      return;
    } catch (err) {
      if (attempt === 2) console.log("Using manual banding for '" + sheet.getName() + "'.");
      else Utilities.sleep(600);
    }
  }
  applyManualBanding_(sheet, fullRange, bandTheme);
}

function bandThemeStripeColor_(bandTheme) {
  const name = (function () {
    for (const k in SpreadsheetApp.BandingTheme) {
      if (SpreadsheetApp.BandingTheme[k] === bandTheme) return k;
    }
    return "BLUE";
  })();
  const map = {
    BLUE: "#e8f0fe", GREEN: "#e6f4ea", YELLOW: "#fef7e0", PURPLE: "#f3e8fd",
    RED: "#fce8e6", ORANGE: "#fef0e0", CYAN: "#e0f7fa", PINK: "#fce4ec",
    GREY: "#f1f3f4", TEAL: "#e0f2f1"
  };
  return map[name] || "#f3f3f3";
}

function applyManualBanding_(sheet, fullRange, bandTheme) {
  const startRow = fullRange.getRow();
  const numCols = fullRange.getNumColumns();
  const dataRows = fullRange.getNumRows() - 1;
  if (dataRows < 1) return;
  const stripe = bandThemeStripeColor_(bandTheme);
  const base = "#ffffff";
  const colors = [];
  for (let r = 0; r < dataRows; r++) colors.push(new Array(numCols).fill(r % 2 === 0 ? base : stripe));
  sheet.getRange(startRow + 1, fullRange.getColumn(), dataRows, numCols).setBackgrounds(colors);
}

function autoResizeCapped_(sheet, colStart, colCount, maxWidthPx) {
  sheet.autoResizeColumns(colStart, colCount);
  const maxRows = Math.max(1, sheet.getMaxRows() - 1);
  for (let c = colStart; c < colStart + colCount; c++) {
    if (sheet.getColumnWidth(c) > maxWidthPx) {
      sheet.setColumnWidth(c, maxWidthPx);
      sheet.getRange(2, c, maxRows, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    }
  }
}

function fixSheetFormatting() {
  const ss = getSpreadsheet_();
  const map = [
    [USERS_SHEET, USER_HEADERS, "#4285f4", SpreadsheetApp.BandingTheme.BLUE, 300],
    [PAYMENTS_SHEET, PAYMENT_HEADERS, "#34a853", SpreadsheetApp.BandingTheme.GREEN, 300],
    [SETTINGS_SHEET, SETTINGS_HEADERS, "#fbbc04", SpreadsheetApp.BandingTheme.YELLOW, 400],
    [LOGS_SHEET, LOG_HEADERS, "#9c27b0", SpreadsheetApp.BandingTheme.PURPLE, 320],
    [ADMINS_SHEET, ADMIN_HEADERS, "#ea4335", SpreadsheetApp.BandingTheme.RED, 300],
    [PROGRESS_SHEET, PROGRESS_HEADERS, "#0f9d58", SpreadsheetApp.BandingTheme.GREEN, 300],
    [PUSHTOKENS_SHEET, PUSHTOKENS_HEADERS, "#e67c00", SpreadsheetApp.BandingTheme.ORANGE, 300],
    [WEEKLYSETS_SHEET, WEEKLYSET_HEADERS, "#00acc1", SpreadsheetApp.BandingTheme.CYAN, 320],
    [WEEKLYATTEMPTS_SHEET, WEEKLYATTEMPT_HEADERS, "#00897b", SpreadsheetApp.BandingTheme.TEAL, 300],
    [QREPORTS_SHEET, QREPORT_HEADERS, "#d81b60", SpreadsheetApp.BandingTheme.PINK, 340],
    [SUBJ_SUBMISSIONS_SHEET, SUBJ_SUBMISSION_HEADERS, "#0891b2", SpreadsheetApp.BandingTheme.CYAN, 400],
    [ADMIN_PERMS_SHEET, ADMIN_PERM_HEADERS, "#7c3aed", SpreadsheetApp.BandingTheme.PURPLE, 320],
    [PROGRESS_IMPORTS_SHEET, PROGRESS_IMPORT_HEADERS, "#5e35b1", SpreadsheetApp.BandingTheme.PURPLE, 320],
    [PROGRESS_BACKUPS_SHEET, PROGRESS_BACKUP_HEADERS, "#455a64", SpreadsheetApp.BandingTheme.GREY, 320]
  ];
  map.forEach(([name, headers, color, theme, width]) => {
    const sh = ss.getSheetByName(name);
    if (sh) applyTableFormat_(sh, headers, color, theme, width);
  });
  sortSheetsAlphabetically_();
  console.log("✅ Formatting applied to all sheets.");
  return "Formatting fixed.";
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH — LOGIN / SIGNUP / SESSION
   ═══════════════════════════════════════════════════════════════════════ */

function handleLogin(p) {
  const username = String(p.username || "").trim();
  const password = p.password || "";
  if (!username || !password) return { success: false, error: "Enter username and password." };

  // Admin world first.
  const adminSheet = getAdminsSheet_();
  const adminFound = findAdminRow_(adminSheet, username);
  if (adminFound) {
    const lock = checkLoginRateLimit_('admin', username);
    if (lock.locked) return { success: false, error: `Too many failed attempts. Try again in ${lock.minutesLeft} minute(s).` };

    const verify = verifyPassword_(password, adminFound.row[1]);
    if (!verify.ok) {
      recordLoginFailure_('admin', username);
      return { success: false, error: "Invalid username or password." };
    }
    clearLoginLock_('admin', username);
    if (verify.upgradedHash) {
      adminSheet.getRange(adminFound.rowIndex, 2).setValue(verify.upgradedHash);
      _invalidateSheet_(ADMINS_SHEET);
    }
    const adminToken = issueAdminToken_(adminSheet, adminFound.rowIndex);

    // Dual-role: also try the same password against the user row.
    let userSide = null;
    try {
      const userSheet = getUsersSheet_();
      const userFound = findUserRow_(userSheet, username);
      if (userFound) {
        const uv = verifyPassword_(password, userFound.row[1]);
        if (uv.ok) {
          if (uv.upgradedHash) {
            userSheet.getRange(userFound.rowIndex, 2).setValue(uv.upgradedHash);
            _invalidateSheet_(USERS_SHEET);
          }
          const userToken = issueUserToken_(userSheet, userFound.rowIndex);
          const built = buildLoginResult_(userSheet, userFound);
          if (built && built.success) userSide = { user: built.user, token: userToken, access: built };
        }
      }
    } catch (e) { console.error("handleLogin: dual-role lookup failed:", e); }

    return {
      success: true,
      isAdmin: true,
      adminToken,
      adminCapable: true,
      user: userSide ? userSide.user : undefined,
      token: userSide ? userSide.token : undefined,
      permanentAccess: userSide ? userSide.access.permanentAccess : undefined,
      accessType: userSide ? userSide.access.accessType : undefined,
      accessExpiresAt: userSide ? userSide.access.accessExpiresAt : undefined,
      isTrial: userSide ? userSide.access.isTrial : undefined,
      needsPayment: userSide ? userSide.access.needsPayment : undefined,
      settings: userSide ? userSide.access.settings : undefined,
      message: userSide ? "Welcome back — opening your dashboard." : "Welcome to Admin World"
    };
  }

  // User world.
  const userSheet = getUsersSheet_();
  const found = findUserRow_(userSheet, username);
  if (!found) {
    recordLoginFailure_('user', username);
    return { success: false, error: "Invalid username or password." };
  }
  const lock = checkLoginRateLimit_('user', username);
  if (lock.locked) return { success: false, error: `Too many failed attempts. Try again in ${lock.minutesLeft} minute(s).` };

  const verify = verifyPassword_(password, found.row[1]);
  if (!verify.ok) {
    recordLoginFailure_('user', username);
    return { success: false, error: "Invalid username or password." };
  }
  clearLoginLock_('user', username);
  if (verify.upgradedHash) {
    userSheet.getRange(found.rowIndex, 2).setValue(verify.upgradedHash);
    _invalidateSheet_(USERS_SHEET);
  }

  const result = buildLoginResult_(userSheet, found);
  if (result.success) result.adminCapable = userIsAlsoAdmin_(username);
  return result;
}

function buildLoginResult_(sheet, found) {
  const row = found.row;
  const sessionToken = issueUserToken_(sheet, found.rowIndex);

  let status = row[7];
  const trialExpiresAt = row[11] ? new Date(row[11]) : null;
  const now = new Date();

  if (status === "trial" && trialExpiresAt && now > trialExpiresAt) {
    status = "expired";
    sheet.getRange(found.rowIndex, 8).setValue("expired");
    _invalidateSheet_(USERS_SHEET);
  }

  const user = rowToUser_(row);
  user.status = status;
  status = checkYearlyExpiry_(sheet, found, user, status);
  user.status = status;

  if (user.permanentAccess || status === "active") {
    return {
      success: true, user, token: sessionToken,
      permanentAccess: true,
      accessType: user.accessType || "permanent",
      accessExpiresAt: user.accessExpiresAt || "",
      message: user.accessType === "yearly" ? "Welcome back! Yearly access active." : "Welcome back! Permanent access active."
    };
  }
  if (status === "trial") {
    const hoursLeft = Math.max(0, Math.ceil((trialExpiresAt - now) / (1000 * 60 * 60)));
    return { success: true, user, token: sessionToken, isTrial: true, hoursLeft,
             trialExpiresAt: user.trialExpiresAt,
             message: "You got 1-day free trial. Pay to get long-term access." };
  }
  if (status === "expired" || status === "payment_pending") {
    const settings = getSettings();
    return { success: true, user, token: sessionToken, needsPayment: true,
             settings: settings.success ? settings.settings : {},
             message: "Your trial has expired. Please complete payment to continue." };
  }
  if (status === "rejected") return { success: false, error: "Account rejected. Contact admin." };
  return { success: true, user, token: sessionToken };
}

function checkYearlyExpiry_(sheet, found, user, status) {
  if (user.accessType === "yearly" && user.accessExpiresAt) {
    const expiresAt = new Date(user.accessExpiresAt);
    if (!isNaN(expiresAt) && new Date() > expiresAt) {
      sheet.getRange(found.rowIndex, 8, 1, 1).setValue("expired");
      sheet.getRange(found.rowIndex, 14, 1, 3).setValues([["false", "", ""]]);
      _invalidateSheet_(USERS_SHEET);
      user.permanentAccess = false;
      user.accessType = "";
      user.accessExpiresAt = "";
      return "expired";
    }
  }
  return status;
}

function handleGoogleLogin(p) {
  const idToken = String(p.idToken || "").trim();
  if (!idToken) return { success: false, error: "Missing Google ID token." };
  if (!checkRateLimit_("googlelogin", 30, 60000, "GoogleLogin Rate Limited")) {
    return { success: false, error: "Too many sign-in attempts, please try again in a minute." };
  }

  let payload;
  try {
    const resp = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return { success: false, error: "Google sign-in could not be verified. Please try again." };
    payload = JSON.parse(resp.getContentText());
  } catch (err) {
    return { success: false, error: "Google sign-in verification failed: " + (err.message || err) };
  }

  if (!payload.aud || payload.aud !== GOOGLE_CLIENT_ID) return { success: false, error: "This Google sign-in was not issued for this app." };
  if (payload.email_verified !== "true" && payload.email_verified !== true) return { success: false, error: "Your Google email is not verified." };
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return { success: false, error: "Google did not return an email address." };
  const name = sanitizeSheetField_(String(payload.name || email.split("@")[0]));

  return withLock_(() => {
    const sheet = getUsersSheet_();
    let found = findUserByField_(sheet, 3, email);

    if (!found) {
      let base = email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 24) || "user";
      let candidate = base;
      let n = 1;
      while (findUserRow_(sheet, candidate)) { candidate = base + n; n++; }

      const now = new Date();
      const trialHours = Number(getSettingValue_("trialHours", TRIAL_HOURS)) || TRIAL_HOURS;
      const trialExpiresAt = new Date(now.getTime() + trialHours * 60 * 60 * 1000);
      const salt = makeSalt_();
      const lockoutProof = Utilities.getUuid() + Utilities.getUuid();

      sheet.appendRow([
        candidate,
        salt + ":" + hashPassSalted_(lockoutProof, salt),
        name,
        sanitizeSheetField_(email),
        "",
        sanitizeSheetField_(email),
        "email",
        "trial",
        now.toISOString(), now.toISOString(),
        "user",
        trialExpiresAt.toISOString(),
        "none",
        "false"
      ]);
      _invalidateSheet_(USERS_SHEET);
      const newRowIndex = sheet.getLastRow();
      found = { rowIndex: newRowIndex, row: sheet.getRange(newRowIndex, 1, 1, USER_HEADERS.length).getValues()[0] };
      logAction_("system", "Google Signup", candidate, "email=" + email);
    }

    const result = buildLoginResult_(sheet, found);
    if (result.success) result.adminCapable = userIsAlsoAdmin_(result.user.username);
    return result;
  });
}

function handleSignup(p) {
  if (!checkSignupRateLimit_()) return { success: false, error: "Too many signups right now, please try again in a minute." };

  const username = String(p.username || "").trim();
  const password = p.password || "";
  const name = sanitizeSheetField_(String(p.name || "").trim());
  const email = sanitizeSheetField_(String(p.email || "").trim());
  const mobile = String(p.mobile || "").trim();
  const contact = sanitizeSheetField_(email || mobile);
  const contactType = email ? "email" : (mobile ? "phone" : "other");

  if (!username || !password || !name || !email || !mobile) return { success: false, error: "All fields required." };
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return { success: false, error: "Username must be 3-30 characters: letters, numbers, dots, dashes, underscores only." };
  if (password.length < 6) return { success: false, error: "Password must be at least 6 characters." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.replace(/^'/, ''))) return { success: false, error: "Invalid email address." };
  if (!/^(98|97|96|99)\d{8}$/.test(mobile)) return { success: false, error: "Invalid Nepali mobile number. Use 10 digits starting with 98/97/96/99." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    if (findUserRow_(sheet, username)) return { success: false, error: "Username already taken." };
    if (findUserByField_(sheet, 3, email)) return { success: false, error: "An account with this email already exists. Please log in instead." };
    if (findUserByField_(sheet, 4, mobile)) return { success: false, error: "An account with this mobile number already exists. Please log in instead." };

    const now = new Date();
    const trialHours = Number(getSettingValue_("trialHours", TRIAL_HOURS)) || TRIAL_HOURS;
    const trialExpiresAt = new Date(now.getTime() + trialHours * 60 * 60 * 1000);
    const salt = makeSalt_();

    sheet.appendRow([
      username,
      salt + ":" + hashPassSalted_(password, salt),
      name, email, mobile, contact, contactType,
      "trial", now.toISOString(), now.toISOString(),
      "user", trialExpiresAt.toISOString(),
      "none", "false"
    ]);
    _invalidateSheet_(USERS_SHEET);
    const newRowIndex = sheet.getLastRow();
    const sessionToken = issueUserToken_(sheet, newRowIndex);

    return {
      success: true, isTrial: true, token: sessionToken,
      trialExpiresAt: trialExpiresAt.toISOString(),
      message: "Account created! You got 1-day free trial. Pay to get long-term access."
    };
  });
}

function checkSession(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };

  const sheet = getUsersSheet_();
  const found = findUserRow_(sheet, username);
  if (!found) return { success: false, error: "User not found." };
  if (!verifyUserToken_(found, p.token)) return { success: false, error: "Session expired. Please log in again.", sessionInvalid: true };

  const adminCapable = userIsAlsoAdmin_(username);

  const row = found.row;
  let status = row[7];
  const trialExpiresAt = row[11] ? new Date(row[11]) : null;
  const now = new Date();
  const permanentAccess = row[13] === "true" || row[13] === true;

  if (status === "trial" && trialExpiresAt && now > trialExpiresAt) {
    status = "expired";
    sheet.getRange(found.rowIndex, 8).setValue("expired");
    _invalidateSheet_(USERS_SHEET);
  }

  const user = rowToUser_(row);
  user.status = status;
  status = checkYearlyExpiry_(sheet, found, user, status);
  user.status = status;

  if (user.permanentAccess || status === "active") {
    return { success: true, user, token: p.token, permanentAccess: true,
             accessType: user.accessType || "permanent",
             accessExpiresAt: user.accessExpiresAt || "", adminCapable };
  }
  if (status === "trial") {
    const hoursLeft = Math.max(0, Math.ceil((trialExpiresAt - now) / (1000 * 60 * 60)));
    return { success: true, user, token: p.token, isTrial: true, hoursLeft, adminCapable };
  }
  if (status === "expired" || status === "payment_pending") {
    const settings = getSettings();
    return { success: true, user, token: p.token, needsPayment: true,
             settings: settings.success ? settings.settings : {}, adminCapable };
  }
  return { success: true, user, token: p.token, adminCapable };
}

function updateOwnMobile(p) {
  const username = String(p.username || "").trim();
  const mobile = String(p.mobile || "").trim();
  if (!username || !p.token) return { success: false, error: "Not logged in." };
  if (!/^(98|97|96|99)\d{8}$/.test(mobile)) return { success: false, error: "Invalid Nepali mobile number." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const found = findUserRow_(sheet, username);
    if (!found) return { success: false, error: "Account not found." };
    if (!verifyUserToken_(found, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };
    sheet.getRange(found.rowIndex, 5).setValue(mobile);
    _invalidateSheet_(USERS_SHEET);
    return { success: true, message: "Mobile number saved." };
  });
}

/* ── PASSWORD RESET ── */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 5 * 60 * 1000;

function requestPasswordReset(p) {
  const identifier = String(p.identifier || p.username || p.email || "").trim();
  if (!identifier) return { success: false, error: "Enter your username or email." };
  const generic = { success: true, message: "If that account exists, a reset link has been sent to its email address." };

  const sheet = getUsersSheet_();
  let found = findUserRow_(sheet, identifier);
  if (!found) found = findUserByField_(sheet, 3, identifier);
  if (!found) return generic;

  const username = found.row[0];
  const email = found.row[3];
  if (!email) return generic;

  const props = PropertiesService.getScriptProperties();
  const cdKey = "pwreset_cd_" + username.toLowerCase();
  const last = Number(props.getProperty(cdKey) || 0);
  if (Date.now() - last < RESET_REQUEST_COOLDOWN_MS) return generic;

  const token = Utilities.getUuid();
  props.setProperty("pwreset_" + token, JSON.stringify({ username, expiresAt: Date.now() + RESET_TOKEN_TTL_MS }));
  props.setProperty(cdKey, String(Date.now()));

  try {
    MailApp.sendEmail({
      to: email,
      subject: "Reset your Abhyas password",
      body: `Hi ${found.row[2] || username},\n\nSomeone (hopefully you) requested a password reset for your Abhyas account (${username}).\n\nOpen the Abhyas app and paste this reset code when prompted:\n\n${token}\n\nThis code expires in 1 hour. If you didn't request this, you can safely ignore this email.\n`
    });
  } catch (err) { console.error("requestPasswordReset: MailApp send failed:", err); }
  return generic;
}

function resetPassword(p) {
  const token = String(p.token || "").trim();
  const newPassword = p.newPassword || "";
  if (!token) return { success: false, error: "Reset code required." };
  if (!newPassword || newPassword.length < 6) return { success: false, error: "New password must be at least 6 characters." };

  const props = PropertiesService.getScriptProperties();
  const key = "pwreset_" + token;
  const raw = props.getProperty(key);
  if (!raw) return { success: false, error: "This reset code is invalid or has already been used." };

  let state;
  try { state = JSON.parse(raw); } catch (e) { props.deleteProperty(key); return { success: false, error: "Invalid reset code." }; }
  props.deleteProperty(key);
  if (!state.expiresAt || Date.now() > state.expiresAt) return { success: false, error: "This reset code has expired — request a new one." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const found = findUserRow_(sheet, state.username);
    if (!found) return { success: false, error: "Account not found." };
    const salt = makeSalt_();
    sheet.getRange(found.rowIndex, 2).setValue(salt + ":" + hashPassSalted_(newPassword, salt));
    sheet.getRange(found.rowIndex, 17, 1, 2).setValues([["", ""]]);
    _invalidateSheet_(USERS_SHEET);
    clearLoginLock_("user", state.username);
    logAction_("system", "Password Reset", state.username, "Self-service reset via emailed code");
    return { success: true, username: state.username, message: "Password reset — please log in with your new password." };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   DUAL-ROLE SWITCH
   ═══════════════════════════════════════════════════════════════════════ */

function checkAdminCapable(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const found = findUserRow_(getUsersSheet_(), username);
  if (!found) return { success: false, error: "User not found." };
  if (!verifyUserToken_(found, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };
  return { success: true, adminCapable: userIsAlsoAdmin_(username) };
}

function adminSwitchFromUser(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };

  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) {
    return { success: false, error: "Session expired.", sessionInvalid: true };
  }

  // v1.07 — rate limit + lock. Prevents a hostile loop from spamming
  // the Admins sheet with fresh admin-token writes.
  if (!checkRateLimit_("adminswitch_" + username.toLowerCase(), 10, 60000)) {
    return { success: false, error: "Too many switches — try again in a minute." };
  }

  const adminFound = findAdminRow_(getAdminsSheet_(), username);
  if (!adminFound) return { success: false, error: "This account does not have admin access." };

  return withLock_(() => {
    const adminSheet = getAdminsSheet_();
    const adminToken = issueAdminToken_(adminSheet, adminFound.rowIndex);
    _invalidateSheet_(ADMINS_SHEET);
    logAction_(adminFound.row[0], "Switch to Admin (from user session)", username, "");
    return {
      success: true, isAdmin: true, adminToken,
      username: adminFound.row[0],
      expiresInMs: ADMIN_TOKEN_TTL_MS
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN LOGIN + ACCOUNT MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════ */

function adminLogin(p) {
  const username = String(p.username || "").trim();
  const password = p.password || "";
  if (!username || !password) return { success: false, error: "Enter admin username and password." };

  const sheet = getAdminsSheet_();
  const found = findAdminRow_(sheet, username);
  if (!found) return { success: false, error: "Invalid admin credentials." };

  const lock = checkLoginRateLimit_('admin', username);
  if (lock.locked) return { success: false, error: `Too many failed attempts. Try again in ${lock.minutesLeft} minute(s).` };

  const verify = verifyPassword_(password, found.row[1]);
  if (!verify.ok) {
    recordLoginFailure_('admin', username);
    return { success: false, error: "Invalid admin credentials." };
  }
  clearLoginLock_('admin', username);
  if (verify.upgradedHash) {
    sheet.getRange(found.rowIndex, 2).setValue(verify.upgradedHash);
    _invalidateSheet_(ADMINS_SHEET);
  }

  const token = issueAdminToken_(sheet, found.rowIndex);
  logAction_(found.row[0], "Admin Login", "", "");
  const stillOnSeed = username.toLowerCase() === ADMIN_SEED_USERNAME.toLowerCase() && password === ADMIN_SEED_PASSWORD;

  return {
    success: true, isAdmin: true, adminToken: token,
    mustChangePassword: stillOnSeed,
    user: { username: found.row[0], name: "Administrator", role: "admin" },
    message: "Welcome to Admin World"
  };
}

function adminChangePassword(p) {
  const actor = checkAdmin_(p);
  if (!actor) return { success: false, error: "Admin auth failed." };
  const currentPassword = p.currentPassword || "";
  const newPassword = p.newPassword || "";
  if (!newPassword || newPassword.length < 6) return { success: false, error: "New password must be at least 6 characters." };

  return withLock_(() => {
    const sheet = getAdminsSheet_();
    const found = findAdminRow_(sheet, actor);
    if (!found) return { success: false, error: "Admin account not found." };
    const verify = verifyPassword_(currentPassword, found.row[1]);
    if (!verify.ok) return { success: false, error: "Current password is incorrect." };
    const salt = makeSalt_();
    sheet.getRange(found.rowIndex, 2).setValue(salt + ":" + hashPassSalted_(newPassword, salt));
    _invalidateSheet_(ADMINS_SHEET);
    logAction_(actor, "Change Admin Password", actor, "");
    return { success: true, message: "Password changed." };
  });
}

function adminCreateAdmin(p) {
  const chk = checkAdminCan_(p, "admins_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  if (chk.role !== ADMIN_ROLE_OWNER) return { success: false, error: "Only the main admin can create admin accounts." };
  const actor = chk.actor;

  const username = String(p.username || "").trim();
  const password = p.password || "";
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return { success: false, error: "Username must be 3-30 characters: letters, numbers, dots, dashes, underscores only." };
  if (!password || password.length < 6) return { success: false, error: "Password must be at least 6 characters." };

  return withLock_(() => {
    const sheet = getAdminsSheet_();
    if (findAdminRow_(sheet, username)) return { success: false, error: "That admin username already exists." };
    const salt = makeSalt_();
    sheet.appendRow([username, salt + ":" + hashPassSalted_(password, salt), new Date().toISOString(), actor, "", "", ADMIN_ROLE_ADMIN]);
    _invalidateSheet_(ADMINS_SHEET);

    if (p.permissions) applyAdminPermissions_(username, p.permissions, actor);
    logAction_(actor, "Create Admin", username, "");
    return { success: true, message: "Admin account created." };
  });
}

function adminDeleteAdmin(p) {
  const chk = checkAdminCan_(p, "admins_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  if (chk.role !== ADMIN_ROLE_OWNER) return { success: false, error: "Only the main admin can delete admin accounts." };
  const actor = chk.actor;

  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  if (username.toLowerCase() === actor.toLowerCase()) return { success: false, error: "You can't delete the admin account you're currently logged in as." };

  return withLock_(() => {
    const sheet = getAdminsSheet_();
    if (sheet.getLastRow() - 1 <= 1) return { success: false, error: "Can't delete the last remaining admin account." };
    const found = findAdminRow_(sheet, username);
    if (!found) return { success: false, error: "Admin not found." };
    const targetRec = getAdminRecord_(username);
    if (targetRec && targetRec.role === ADMIN_ROLE_OWNER) return { success: false, error: "The main admin account cannot be deleted." };
    sheet.deleteRow(found.rowIndex);
    _invalidateSheet_(ADMINS_SHEET);
    purgeAdminPermissions_(username);
    logAction_(actor, "Delete Admin", username, "");
    return { success: true, message: "Admin account deleted." };
  });
}

function adminListAdmins(p) {
  const actor = checkAdmin_(p);
  if (!actor) return { success: false, error: "Admin auth failed." };
  const myRec = getAdminRecord_(actor);
  const isOwner = myRec && myRec.role === ADMIN_ROLE_OWNER;

  const data = _cachedSheetData_(ADMINS_SHEET, getAdminsSheet_).data;
  const admins = [];
  for (let i = 1; i < data.length; i++) {
    const uname = String(data[i][0] || "");
    const role = String(data[i][6] || "").trim().toLowerCase() || ADMIN_ROLE_ADMIN;
    if (!isOwner && uname.toLowerCase() !== actor.toLowerCase()) continue;
    admins.push({
      username: uname,
      createdAt: data[i][2],
      createdBy: data[i][3],
      role,
      permissions: role === ADMIN_ROLE_OWNER ? Object.keys(FEATURES) : [...getAdminPermissions_(uname)]
    });
  }
  return { success: true, admins, allFeatures: Object.keys(FEATURES), features: FEATURES, isOwner };
}

function adminListAdminPermissions(p) {
  const chk = checkAdminCan_(p, "admins_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  if (chk.role !== ADMIN_ROLE_OWNER) return { success: false, error: "Only the main admin can view permissions." };

  const target = String(p.username || "").trim();
  if (!target) return { success: false, error: "username required." };
  const rec = getAdminRecord_(target);
  if (!rec) return { success: false, error: "Admin not found." };

  const granted = getAdminPermissions_(target);
  const features = {};
  Object.keys(FEATURES).forEach(k => { features[k] = granted.has(k); });
  return { success: true, username: target, role: rec.role, features, allFeatures: Object.keys(FEATURES), featureLabels: FEATURES };
}

function adminSetAdminPermissions(p) {
  const chk = checkAdminCan_(p, "admins_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  if (chk.role !== ADMIN_ROLE_OWNER) return { success: false, error: "Only the main admin can change permissions." };
  const actor = chk.actor;

  const target = String(p.username || "").trim();
  if (!target) return { success: false, error: "username required." };
  const rec = getAdminRecord_(target);
  if (!rec) return { success: false, error: "Admin not found." };
  if (rec.role === ADMIN_ROLE_OWNER) return { success: false, error: "The owner's permissions cannot be changed." };

  let features;
  try { features = JSON.parse(p.features || "{}"); } catch (e) { return { success: false, error: "features must be a JSON object." }; }

  return withLock_(() => {
    applyAdminPermissions_(target, features, actor);
    logAction_(actor, "Set Admin Permissions", target,
      "Granted: " + Object.keys(features).filter(k => features[k]).join(", "));
    return { success: true, username: target };
  });
}

function adminPromoteOwner(p) {
  const chk = checkAdminCan_(p, "admins_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  if (chk.role !== ADMIN_ROLE_OWNER) return { success: false, error: "Only the main admin can promote admins." };
  const actor = chk.actor;
  const target = String(p.username || "").trim();
  if (!target) return { success: false, error: "username required." };

  return withLock_(() => {
    const sheet = getAdminsSheet_();
    const found = findAdminRow_(sheet, target);
    if (!found) return { success: false, error: "Admin not found." };
    sheet.getRange(found.rowIndex, 7).setValue(ADMIN_ROLE_OWNER);
    _invalidateSheet_(ADMINS_SHEET);
    logAction_(actor, "Promote to Owner", target, "");
    return { success: true, username: target };
  });
}

function applyAdminPermissions_(username, features, actor) {
  let parsed = features;
  if (typeof features === "string") {
    try { parsed = JSON.parse(features); } catch (e) { return; }
  }
  if (!parsed || typeof parsed !== "object") return;

  const sheet = getAdminPermsSheet_();
  const data = sheet.getDataRange().getValues();
  const targetLc = String(username).toLowerCase().trim();

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).toLowerCase().trim() === targetLc) sheet.deleteRow(i + 1);
  }
  _invalidateSheet_(ADMIN_PERMS_SHEET);

  const rows = [];
  const now = new Date().toISOString();
  Object.keys(FEATURES).forEach(key => {
    if (parsed[key] === true) rows.push([username, key, true, now, actor]);
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ADMIN_PERM_HEADERS.length).setValues(rows);
}

function purgeAdminPermissions_(username) {
  const sheet = getAdminPermsSheet_();
  const data = sheet.getDataRange().getValues();
  const targetLc = String(username).toLowerCase().trim();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).toLowerCase().trim() === targetLc) sheet.deleteRow(i + 1);
  }
  _invalidateSheet_(ADMIN_PERMS_SHEET);
}

/* ═══════════════════════════════════════════════════════════════════════
   PROGRESS SYNC
   ═══════════════════════════════════════════════════════════════════════ */

function saveProgress(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const dataStr = String(p.data || "");
  if (!dataStr) return { success: false, error: "No data provided." };
  if (dataStr.length > 45000) return { success: false, error: "Progress data too large to sync." };
  try { JSON.parse(dataStr); } catch (e) { return { success: false, error: "Malformed progress data." }; }

  return withLock_(() => {
    const sheet = getProgressSheet_();
    const found = findProgressRow_(sheet, username);
    const now = new Date().toISOString();
    if (found) sheet.getRange(found.rowIndex, 2, 1, 2).setValues([[dataStr, now]]);
    else sheet.appendRow([username, dataStr, now]);
    _invalidateSheet_(PROGRESS_SHEET);
    return { success: true, updatedAt: now };
  });
}

function getProgress(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const found = findProgressRow_(getProgressSheet_(), username);
  if (!found) return { success: true, data: null };
  return { success: true, data: found.row[1], updatedAt: found.row[2] };
}

/* ═══════════════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════════════ */

function getFcmAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const clientEmail = props.getProperty("FCM_CLIENT_EMAIL");
  const privateKey = props.getProperty("FCM_PRIVATE_KEY");
  if (!clientEmail || !privateKey) throw new Error("Push notifications not configured: missing FCM_CLIENT_EMAIL or FCM_PRIVATE_KEY.");

  const now = Math.floor(Date.now() / 1000);
  const b64url = obj => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  const header = b64url({ alg: "RS256", typ: "JWT" });
  const claim = b64url({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now
  });
  const unsigned = header + "." + claim;
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, privateKey)
  ).replace(/=+$/, "");
  const jwt = unsigned + "." + signature;

  const resp = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt },
    muteHttpExceptions: true
  });
  const body = JSON.parse(resp.getContentText());
  if (!body.access_token) throw new Error("Could not get FCM access token: " + (body.error_description || resp.getContentText()));
  return body.access_token;
}

function _fcmSendToToken(accessToken, projectId, token, title, body) {
  const resp = UrlFetchApp.fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + accessToken },
    payload: JSON.stringify({ message: { token, notification: { title, body }, webpush: { fcm_options: { link: "/" } } } }),
    muteHttpExceptions: true
  });
  const result = JSON.parse(resp.getContentText() || "{}");
  if (resp.getResponseCode() >= 400) {
    const unregistered = result.error && result.error.details &&
      result.error.details.some(d => d.errorCode === "UNREGISTERED");
    return { success: false, unregistered: !!unregistered, error: (result.error && result.error.message) || resp.getContentText() };
  }
  return { success: true };
}

function sendPushNotification_(username, title, body) {
  const found = findPushTokenRow_(getPushTokensSheet_(), username);
  if (!found || !found.row[1]) return { success: false, error: "No push token on file." };

  const projectId = PropertiesService.getScriptProperties().getProperty("FCM_PROJECT_ID");
  if (!projectId) return { success: false, error: "Push notifications not configured: missing FCM_PROJECT_ID." };

  let accessToken;
  try { accessToken = getFcmAccessToken_(); } catch (err) { return { success: false, error: err.message }; }

  const result = _fcmSendToToken(accessToken, projectId, found.row[1], title, body);
  if (!result.success) {
    if (result.unregistered) {
      getPushTokensSheet_().deleteRow(found.rowIndex);
      _invalidateSheet_(PUSHTOKENS_SHEET);
    }
    return { success: false, error: result.error };
  }
  return { success: true };
}

function broadcastPushToAll_(title, body) {
  const data = _cachedSheetData_(PUSHTOKENS_SHEET, getPushTokensSheet_).data;
  if (data.length <= 1) return { success: true, sent: 0, failed: 0 };

  const projectId = PropertiesService.getScriptProperties().getProperty("FCM_PROJECT_ID");
  if (!projectId) return { success: false, error: "Push notifications not configured: missing FCM_PROJECT_ID." };

  let accessToken;
  try { accessToken = getFcmAccessToken_(); } catch (err) { return { success: false, error: err.message }; }

  let sent = 0, failed = 0;
  const deadRows = [];
  for (let i = 1; i < data.length; i++) {
    const token = data[i][1];
    if (!token) continue;
    const result = _fcmSendToToken(accessToken, projectId, token, title, body);
    if (result.success) sent++;
    else { failed++; if (result.unregistered) deadRows.push(i + 1); }
  }
  deadRows.sort((a, b) => b - a).forEach(r => getPushTokensSheet_().deleteRow(r));
  if (deadRows.length) _invalidateSheet_(PUSHTOKENS_SHEET);
  return { success: true, sent, failed };
}

function savePushToken(p) {
  const username = String(p.username || "").trim();
  const token = String(p.fcmToken || "").trim();
  if (!username || !token) return { success: false, error: "Username and fcmToken required." };

  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  return withLock_(() => {
    const sheet = getPushTokensSheet_();
    const found = findPushTokenRow_(sheet, username);
    const now = new Date().toISOString();
    if (found) sheet.getRange(found.rowIndex, 2, 1, 2).setValues([[token, now]]);
    else sheet.appendRow([username, token, now]);
    _invalidateSheet_(PUSHTOKENS_SHEET);
    return { success: true };
  });
}

function ensurePushTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(t => t.getHandlerFunction() === "checkTrialExpiryWarnings")) {
    ScriptApp.newTrigger("checkTrialExpiryWarnings").timeBased().everyMinutes(30).create();
  }
  if (!triggers.some(t => t.getHandlerFunction() === "checkWeeklySetUnlocks_")) {
    ScriptApp.newTrigger("checkWeeklySetUnlocks_").timeBased().everyMinutes(15).create();
  }
}

function checkTrialExpiryWarnings() {
  const data = _cachedSheetData_(USERS_SHEET, getUsersSheet_).data;
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  let sent = 0;

  for (let i = 1; i < data.length; i++) {
    const status = data[i][7];
    const username = data[i][0];
    const trialExpiresAt = data[i][11] ? new Date(data[i][11]).getTime() : null;
    const warnKey = "trialwarned_" + String(username).toLowerCase();

    const inWindow = status === "trial" && trialExpiresAt &&
      (trialExpiresAt - now) > 0 && (trialExpiresAt - now) <= TRIAL_WARNING_WINDOW_MS;
    if (!inWindow) {
      if (props.getProperty(warnKey)) props.deleteProperty(warnKey);
      continue;
    }
    if (props.getProperty(warnKey)) continue;
    try {
      const result = sendPushNotification_(username, "Your trial is ending soon",
        "Your Abhyas trial expires in under 2 hours. Complete payment to keep your access.");
      if (result.success) { props.setProperty(warnKey, "1"); sent++; }
    } catch (err) { console.error("checkTrialExpiryWarnings failed for " + username + ":", err); }
  }
  if (sent) console.log("Sent " + sent + " trial-expiry warning(s).");
  return "Checked. Sent " + sent + " warning(s).";
}

function checkWeeklySetUnlocks_() {
  const data = _cachedSheetData_(WEEKLYSETS_SHEET, getWeeklySetsSheet_).data;
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  let notified = 0;

  for (let i = 1; i < data.length; i++) {
    const s = rowToWeeklySet_(data[i]);
    if (s.status !== "active") continue;
    const releaseTime = new Date(s.releaseAt).getTime();
    if (isNaN(releaseTime) || now < releaseTime) continue;

    const notifyKey = "wsnotified_" + s.id;
    if (props.getProperty(notifyKey)) continue;

    try {
      const result = broadcastPushToAll_("New weekly set unlocked! 🎉",
        s.title + (s.chapterLabel ? " — " + s.chapterLabel : "") + " is now available to solve.");
      if (result.success) {
        props.setProperty(notifyKey, "1");
        notified++;
        logAction_("system", "Weekly Set Unlock Notification", s.title, `Sent to ${result.sent}, failed ${result.failed}`);
      }
    } catch (err) { console.error("checkWeeklySetUnlocks_ failed for " + s.id + ":", err); }
  }
  if (notified) console.log("Sent unlock notifications for " + notified + " weekly set(s).");
  return "Checked. Notified for " + notified + " newly-unlocked set(s).";
}

/* ═══════════════════════════════════════════════════════════════════════
   PAYMENTS
   ═══════════════════════════════════════════════════════════════════════ */

function submitPayment(p) {
  const username = String(p.username || "").trim();
  const name = sanitizeSheetField_(String(p.name || "").trim());
  const email = sanitizeSheetField_(String(p.email || "").trim());
  const mobile = String(p.mobile || "").trim();
  const txId = sanitizeSheetField_(String(p.txId || "").trim());
  const remarks = sanitizeSheetField_(String(p.remarks || "").trim());
  const screenshotData = p.screenshot || "";

  if (!username) return { success: false, error: "Username required." };
  if (!txId) return { success: false, error: "Transaction ID required." };

  const userSheet = getUsersSheet_();
  const userFound = findUserRow_(userSheet, username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  if (!checkRateLimit_("submitpayment_" + username.toLowerCase(), 10, 60 * 60 * 1000)) {
    return { success: false, error: "Too many payment submissions — please wait a few minutes and try again." };
  }

  const currentStatus = userFound.row[7];
  if (currentStatus !== "expired" && currentStatus !== "payment_pending" && currentStatus !== "trial") {
    return { success: false, error: "Payment not required at this time." };
  }

  userSheet.getRange(userFound.rowIndex, 8).setValue("payment_pending");
  userSheet.getRange(userFound.rowIndex, 13).setValue("pending");
  _invalidateSheet_(USERS_SHEET);

  const sheet = getPaymentsSheet_();
  const now = new Date().toISOString();
  let screenshotUrl = "";

  if (screenshotData && screenshotData.startsWith("data:image")) {
    try {
      const base64Data = screenshotData.split(",")[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png", username + "_payment.png");
      const folder = getOrCreateFolder_("PaymentScreenshots");
      const file = folder.createFile(blob);
      screenshotUrl = file.getDownloadUrl();
    } catch (e) { console.log("Screenshot upload failed: " + e.message); }
  } else if (screenshotData && screenshotData.startsWith("http")) {
    screenshotUrl = screenshotData;
  }

  return withLock_(() => {
    const data = sheet.getDataRange().getValues();
    let existingRow = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === username.toLowerCase()) { existingRow = i + 1; break; }
    }
    if (existingRow) {
      const cur = data[existingRow - 1];
      const updates = [
        [2, name || cur[1]],
        [3, email || cur[2]],
        [4, mobile || cur[3]],
        [5, txId],
        [6, remarks || cur[5]],
        [7, "pending"],
        [8, ""],
        [9, screenshotUrl || cur[8]],
        [10, now]
      ];
      updates.forEach(([col, val]) => sheet.getRange(existingRow, col).setValue(val));
    } else {
      sheet.appendRow([username, name, email, mobile, txId, remarks, "pending", "", screenshotUrl, now, ""]);
    }
    _invalidateSheet_(PAYMENTS_SHEET);
    return { success: true, message: "Payment submitted successfully. Waiting for admin verification." };
  });
}

function getPaymentStatus(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };

  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const data = _cachedSheetData_(PAYMENTS_SHEET, getPaymentsSheet_).data;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === username.toLowerCase()) {
      return {
        success: true,
        payment: {
          username: data[i][0], name: data[i][1], email: data[i][2],
          mobile: String(data[i][3] || ""), txId: data[i][4], remarks: data[i][5],
          status: data[i][6], rejectionReason: data[i][7], screenshotUrl: data[i][8],
          submittedAt: data[i][9], reviewedAt: data[i][10]
        }
      };
    }
  }
  return { success: false, error: "No payment submission found." };
}

/* ═══════════════════════════════════════════════════════════════════════
   SETTINGS + GETFILE
   ═══════════════════════════════════════════════════════════════════════ */

function getSettings() {
  const data = _cachedSheetData_(SETTINGS_SHEET, getSettingsSheet_).data;
  const settings = {};
  for (let i = 1; i < data.length; i++) if (data[i][0]) settings[String(data[i][0])] = data[i][1];
  return { success: true, settings };
}

function getSettingValue_(key, fallback) {
  const settings = getSettings().settings || {};
  const v = settings[key];
  return (v === undefined || v === null || v === "") ? fallback : v;
}

function handleGetFile(p) {
  const fileId = String(p.fileId || "").trim();
  if (!fileId) return { success: false, error: "Missing fileId parameter." };
  if (!checkGetFileRateLimit_()) return { success: false, error: "Server is busy, please try again in a moment.", rateLimited: true };

  let file;
  try { file = DriveApp.getFileById(fileId); }
  catch (err) {
    return { success: false, error: "Could not open Drive file '" + fileId + "'. Check the fileId and make sure the file hasn't been deleted. (" + (err.message || err) + ")" };
  }
  let text;
  try { text = file.getBlob().getDataAsString("UTF-8"); }
  catch (err) { return { success: false, error: "Could not read file contents: " + (err.message || err) }; }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (err) { return { success: false, error: "File '" + file.getName() + "' is not valid JSON (" + (err.message || err) + ")." }; }
  return { success: true, result: parsed };
}

function adminDownloadScreenshot(p) {
  const chk = checkAdminCan_(p, "screenshots");
  if (!chk.ok) return { success: false, error: chk.error };

  let fileId = String(p.fileId || "").trim();
  if (!fileId && p.url) {
    const m = String(p.url).match(/[?&]id=([^&]+)/);
    if (m) fileId = decodeURIComponent(m[1]);
  }
  if (!fileId) return { success: false, error: "Missing fileId or url parameter." };

  let file;
  try { file = DriveApp.getFileById(fileId); }
  catch (err) { return { success: false, error: "Could not open screenshot. (" + (err.message || err) + ")" }; }
  let blob;
  try { blob = file.getBlob(); }
  catch (err) { return { success: false, error: "Could not read screenshot contents: " + (err.message || err) }; }

  return { success: true, base64: Utilities.base64Encode(blob.getBytes()),
           mimeType: blob.getContentType() || "image/png",
           filename: file.getName() || "payment_screenshot.png" };
}

/* ═══════════════════════════════════════════════════════════════════════
   WEEKLY SETS
   ═══════════════════════════════════════════════════════════════════════ */

function adminUploadWeeklySetFile(p) {
  const chk = checkAdminCan_(p, "weeklysets_manage");
  if (!chk.ok) return { success: false, error: chk.error };

  const fileData = String(p.fileData || "");
  const filename = String(p.filename || "weeklyset.json").trim();
  if (!fileData) return { success: false, error: "No file data provided." };
  if (fileData.length > 5 * 1024 * 1024) return { success: false, error: "File too large — question-bank JSON should be well under 4MB." };

  let jsonText;
  try {
    jsonText = fileData.startsWith("data:")
      ? Utilities.newBlob(Utilities.base64Decode(fileData.split(",")[1])).getDataAsString("UTF-8")
      : fileData;
    JSON.parse(jsonText);
  } catch (e) { return { success: false, error: "That file isn't valid JSON — check the format." }; }

  try {
    const blob = Utilities.newBlob(jsonText, "application/json", filename);
    const folder = getOrCreateFolder_("WeeklySets");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    logAction_(chk.actor, "Upload Weekly Set File", filename, "fileId: " + file.getId());
    return { success: true, fileId: file.getId(), filename: file.getName() };
  } catch (e) { return { success: false, error: "Drive upload failed: " + (e.message || e) }; }
}

function adminCreateWeeklySet(p) {
  const chk = checkAdminCan_(p, "weeklysets_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const title = sanitizeSheetField_(String(p.title || "").trim());
  const fileId = String(p.fileId || "").trim();
  const chapterLabel = sanitizeSheetField_(String(p.chapterLabel || "").trim());
  const releaseAtRaw = String(p.releaseAt || "").trim();

  if (!title) return { success: false, error: "Title required." };
  if (!fileId) return { success: false, error: "Drive fileId required." };
  const releaseAt = new Date(releaseAtRaw);
  if (!releaseAtRaw || isNaN(releaseAt)) return { success: false, error: "A valid release date/time is required." };

  return withLock_(() => {
    const sheet = getWeeklySetsSheet_();
    const existing = sheet.getDataRange().getValues();
    let duplicateOf = null;
    for (let i = 1; i < existing.length; i++) {
      if (String(existing[i][2]).trim() === fileId) { duplicateOf = existing[i][1]; break; }
    }

    const id = Utilities.getUuid();
    const now = new Date().toISOString();
    sheet.appendRow([id, title, fileId, chapterLabel, "active", actor, now, releaseAt.toISOString()]);
    _invalidateSheet_(WEEKLYSETS_SHEET);
    logAction_(actor, "Create Weekly Set", title, "Releases: " + releaseAt.toISOString() + (duplicateOf ? " — WARNING: fileId already used by \"" + duplicateOf + "\"" : ""));
    return {
      success: true, id, title, releaseAt: releaseAt.toISOString(),
      duplicateWarning: duplicateOf ? `This fileId is already used by weekly set "${duplicateOf}" — double check this wasn't a mistake.` : null
    };
  });
}

function adminUpdateWeeklySet(p) {
  const chk = checkAdminCan_(p, "weeklysets_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const id = String(p.id || "").trim();
  if (!id) return { success: false, error: "id required." };

  return withLock_(() => {
    const sheet = getWeeklySetsSheet_();
    const found = findWeeklySetRow_(sheet, id);
    if (!found) return { success: false, error: "Weekly set not found." };

    const changes = [];
    const updates = [];
    if (p.title !== undefined) { updates.push([2, String(p.title).trim()]); changes.push("title"); }
    if (p.fileId !== undefined) { updates.push([3, String(p.fileId).trim()]); changes.push("fileId"); }
    if (p.chapterLabel !== undefined) { updates.push([4, String(p.chapterLabel).trim()]); changes.push("chapterLabel"); }
    if (p.status !== undefined && ["active","archived"].includes(p.status)) { updates.push([5, p.status]); changes.push("status→" + p.status); }
    if (p.releaseAt !== undefined) {
      const d = new Date(p.releaseAt);
      if (isNaN(d)) return { success: false, error: "Invalid release date/time." };
      updates.push([8, d.toISOString()]);
      changes.push("releaseAt→" + d.toISOString());
    }
    updates.forEach(([col, val]) => sheet.getRange(found.rowIndex, col).setValue(val));
    _invalidateSheet_(WEEKLYSETS_SHEET);
    logAction_(actor, "Update Weekly Set", id, changes.join(", "));
    return { success: true, id };
  });
}

function adminDeleteWeeklySet(p) {
  const chk = checkAdminCan_(p, "weeklysets_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const id = String(p.id || "").trim();
  if (!id) return { success: false, error: "id required." };

  return withLock_(() => {
    const sheet = getWeeklySetsSheet_();
    const found = findWeeklySetRow_(sheet, id);
    if (!found) return { success: false, error: "Weekly set not found." };
    sheet.deleteRow(found.rowIndex);
    _invalidateSheet_(WEEKLYSETS_SHEET);
    PropertiesService.getScriptProperties().deleteProperty("wsnotified_" + id);
    logAction_(actor, "Delete Weekly Set", id, "");
    return { success: true, deleted: id };
  });
}

function adminListWeeklySets(p) {
  const chk = checkAdminCan_(p, "weeklysets_view");
  if (!chk.ok) return { success: false, error: chk.error };
  const data = _cachedSheetData_(WEEKLYSETS_SHEET, getWeeklySetsSheet_).data;
  const totalCount = Math.max(0, data.length - 1);
  const limit = Math.min(totalCount, MAX_LIST_WEEKLYSETS);
  const sets = [];
  for (let i = 1; i <= limit; i++) sets.push(rowToWeeklySet_(data[i]));
  sets.sort((a, b) => new Date(a.releaseAt) - new Date(b.releaseAt));
  return { success: true, sets, totalCount, truncated: totalCount > MAX_LIST_WEEKLYSETS };
}

function listWeeklySets(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const data = _cachedSheetData_(WEEKLYSETS_SHEET, getWeeklySetsSheet_).data;
  const now = Date.now();
  const sets = [];
  for (let i = 1; i < data.length; i++) {
    const s = rowToWeeklySet_(data[i]);
    const releaseTime = new Date(s.releaseAt).getTime();
    const released = !isNaN(releaseTime) && now >= releaseTime;
    if (s.status !== "active" && !(s.status === "archived" && released)) continue;
    sets.push({
      id: s.id, title: s.title, chapterLabel: s.chapterLabel, releaseAt: s.releaseAt,
      released, fileId: released ? s.fileId : undefined
    });
  }
  sets.sort((a, b) => new Date(a.releaseAt) - new Date(b.releaseAt));
  return { success: true, sets };
}

/* ── WEEKLY ATTEMPTS ── */

function getWeeklyAttempt(p) {
  const username = String(p.username || "").trim();
  const weeklyId = String(p.weeklyId || "").trim();
  if (!username || !weeklyId) return { success: false, error: "Missing parameters." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const found = findWeeklyAttemptRow_(getWeeklyAttemptsSheet_(), username, weeklyId);
  return { success: true, attempt: found ? rowToWeeklyAttempt_(found.row) : null };
}

function getMyWeeklyAttempts(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const data = _cachedSheetData_(WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_).data;
  const target = username.toLowerCase().trim();
  const attempts = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === target) attempts.push(rowToWeeklyAttempt_(data[i]));
  }
  return { success: true, attempts };
}

function submitWeeklyAttempt(p) {
  const username = String(p.username || "").trim();
  const weeklyId = String(p.weeklyId || "").trim();
  if (!username || !weeklyId) return { success: false, error: "Missing parameters." };

  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const wsFound = findWeeklySetRow_(getWeeklySetsSheet_(), weeklyId);
  if (!wsFound) return { success: false, error: "Weekly set not found." };
  const ws = rowToWeeklySet_(wsFound.row);
  const releaseTime = new Date(ws.releaseAt).getTime();
  if (isNaN(releaseTime) || Date.now() < releaseTime) return { success: false, error: "This weekly set hasn't been released yet." };

  let answers;
  try { answers = JSON.parse(p.answers || "[]"); } catch (e) { return { success: false, error: "Malformed answers array." }; }
  if (!Array.isArray(answers) || !answers.length || answers.length > 500) return { success: false, error: "Invalid answers array." };

  const normalized = answers.map(a => {
    if (a === null || a === undefined) return null;
    const n = Number(a);
    return Number.isInteger(n) && n >= 0 && n < 10 ? n : null;
  });
  const total = normalized.length;
  const skipped = normalized.filter(a => a === null).length;

  return withLock_(() => {
    const sheet = getWeeklyAttemptsSheet_();
    const existing = findWeeklyAttemptRow_(sheet, username, weeklyId);
    if (existing) {
      return { success: false, alreadyAttempted: true,
               attempt: rowToWeeklyAttempt_(existing.row),
               error: "This weekly set has already been submitted." };
    }

    const correctClaimed = Math.max(0, Math.min(total, Number(p.correctCount) || 0));
    const durationSec = Math.max(0, Math.min(6 * 60 * 60, Number(p.durationSec) || 0));
    const startedAt = Number(p.startedAt) || Date.now();
    const submittedAt = Date.now();

    sheet.appendRow([
      username, weeklyId, JSON.stringify(normalized), total, correctClaimed,
      skipped, startedAt, submittedAt, durationSec
    ]);
    _invalidateSheet_(WEEKLYATTEMPTS_SHEET);
    logAction_("system", "Weekly Set Attempt", username, `${weeklyId} — ${correctClaimed}/${total} in ${durationSec}s`);
    return {
      success: true,
      attempt: {
        weeklyId, answers: normalized, total, correct: correctClaimed,
        pct: total ? Math.round((correctClaimed / total) * 100) : 0,
        skipped, startedAt, submittedAt, durationSec, synced: true
      }
    };
  });
}

function adminWeeklySetResults(p) {
  const chk = checkAdminCan_(p, "weeklysets_view");
  if (!chk.ok) return { success: false, error: chk.error };

  const weeklyId = String(p.weeklyId || "").trim();
  if (!weeklyId) return { success: false, error: "weeklyId required." };

  const wsFound = findWeeklySetRow_(getWeeklySetsSheet_(), weeklyId);
  if (!wsFound) return { success: false, error: "Weekly set not found." };
  const ws = rowToWeeklySet_(wsFound.row);

  let correctAnswers = null;
  try {
    const fileRes = handleGetFile({ fileId: ws.fileId });
    if (fileRes.success) {
      const raw = fileRes.result;
      const qs = Array.isArray(raw) ? raw : (raw?.questions || raw?.data || raw?.quiz || raw?.items || []);
      correctAnswers = qs.map(q => {
        let c = q.correct !== undefined ? q.correct
              : q.answer  !== undefined ? q.answer
              : q.ans     !== undefined ? q.ans
              : q.Answer  !== undefined ? q.Answer : undefined;
        if (typeof c === "string" && /^[a-eA-E]$/.test(c.trim())) c = "abcde".indexOf(c.trim().toLowerCase());
        return c;
      });
    }
  } catch (e) { console.error("adminWeeklySetResults: re-score fetch failed:", e); }

  const data = _cachedSheetData_(WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_).data;
  const attempts = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() !== weeklyId) continue;
    const at = rowToWeeklyAttempt_(data[i]);
    let pct, correct, wrong, skipped;
    if (correctAnswers && at.answers.length === correctAnswers.length) {
      correct = 0; wrong = 0; skipped = 0;
      at.answers.forEach((a, idx) => {
        const expected = correctAnswers[idx];
        if (a === null) { skipped++; return; }
        const ok = (typeof expected === "number" && a === expected) ||
                   (typeof expected === "string" && String(a) === String(expected));
        if (ok) correct++; else wrong++;
      });
      const denom = at.total || correctAnswers.length;
      pct = denom ? Math.round((correct / denom) * 100) : 0;
    } else {
      correct = at.correct;
      skipped = at.skipped;
      wrong = Math.max(0, at.total - correct - skipped);
      pct = at.total ? Math.round((correct / at.total) * 100) : 0;
    }
    attempts.push({
      username: String(data[i][0] || ""),
      pct, correct, wrong, skipped, total: at.total,
      durationSec: at.durationSec, submittedAt: at.submittedAt
    });
  }

  if (!attempts.length) {
    return { success: true, weeklyId, title: ws.title, attempts: 0, uniqueStudents: 0, rescored: !!correctAnswers };
  }

  const pcts = attempts.map(a => a.pct);
  const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const sorted = [...pcts].sort((a, b) => a - b);
  const variance = pcts.reduce((acc, v) => acc + (v - mean) ** 2, 0) / pcts.length;

  const buckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i*10}-${i*10+9}`, count: 0 }));
  pcts.forEach(v => { buckets[Math.min(9, Math.floor(v / 10))].count++; });

  return {
    success: true, weeklyId, title: ws.title,
    attempts: attempts.length, uniqueStudents: attempts.length,
    avgPct: Math.round(mean),
    minPct: sorted[0], maxPct: sorted[sorted.length - 1],
    stdDev: Math.round(Math.sqrt(variance)),
    distribution: buckets,
    recent: attempts.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 50),
    rescored: !!correctAnswers
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   SUBJECTIVE
   ═══════════════════════════════════════════════════════════════════════
   Questions live as Drive JSON files (client maps them via
   subjective-data.js). Backend responsibilities:
     • Accept a PDF submission, save privately, one per (username, qid)
     • Let students fetch their own list
     • Let admins list + grade
     • Let admins upload a topic JSON file
     • Commit client-parsed Smart Paste items into a target topic file
   ═══════════════════════════════════════════════════════════════════════ */

function submitSubjectiveAnswer(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };

  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const kind = String(p.kind || "qotd").trim();
  const questionId = String(p.questionId || "").trim();
  const questionText = sanitizeSheetField_(String(p.questionText || "").trim().slice(0, 3000));
  const questionMarks = Math.max(1, Math.min(100, Number(p.marks) || 10));
  const solveSec = Math.max(0, Math.min(6 * 60 * 60, Number(p.solveSec) || 0));
  const startedAt = Number(p.startedAt) || Date.now();
  const pdfData = String(p.pdfData || "");
  const chapterId = String(p.chapterId || "").trim().slice(0, 80);

  if (!questionId) return { success: false, error: "Missing questionId." };
  if (!pdfData.startsWith("data:")) return { success: false, error: "Missing PDF data." };
  if (pdfData.length > 12 * 1024 * 1024) return { success: false, error: "PDF too large — max ~8 MB." };

  return withLock_(() => {
    const sheet = getSubjSubmissionsSheet_();

    if (kind === "qotd") {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]).toLowerCase().trim() === username.toLowerCase() &&
            String(data[i][3]) === questionId) {
          return { success: false, alreadySubmitted: true, error: "You've already submitted this question." };
        }
      }
    }

    let pdfFileId = "", pdfUrl = "";
    try {
      const base64 = pdfData.split(",")[1];
      const bytes = Utilities.base64Decode(base64);
      const safeName = `${username}_${kind}_${Date.now()}.pdf`;
      const folder = getOrCreateFolder_("SubjectiveAnswers");
      const blob = Utilities.newBlob(bytes, "application/pdf", safeName);
      const file = folder.createFile(blob);
      pdfFileId = file.getId();
      pdfUrl = file.getUrl();
    } catch (e) { return { success: false, error: "Drive upload failed: " + (e.message || e) }; }

    const id = Utilities.getUuid();
    const now = Date.now();
    sheet.appendRow([
      id, username, kind, questionId, questionText, questionMarks,
      chapterId, solveSec, startedAt, now,
      pdfFileId, pdfUrl, "pending", "", "", "", ""
    ]);
    _invalidateSheet_(SUBJ_SUBMISSIONS_SHEET);
    logAction_("system", "Subjective Submission", username, `${kind} · ${questionMarks}M · file ${pdfFileId}`);
    return { success: true, submissionId: id, pdfUrl, message: "Submitted for grading." };
  });
}

function getMySubjectiveSubmissions(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const data = _cachedSheetData_(SUBJ_SUBMISSIONS_SHEET, getSubjSubmissionsSheet_).data;
  const target = username.toLowerCase().trim();
  const mine = [];
  for (let i = 1; i < data.length; i++) {
    const s = rowToSubjSubmission_(data[i]);
    if (s.username.toLowerCase() === target) {
      delete s.pdfFileId;
      mine.push(s);
    }
  }
  return { success: true, submissions: mine };
}

function adminListSubjectiveSubmissions(p) {
  const chk = checkAdminCan_(p, "subjective_view");
  if (!chk.ok) return { success: false, error: chk.error };

  const data = _cachedSheetData_(SUBJ_SUBMISSIONS_SHEET, getSubjSubmissionsSheet_).data;
  const totalCount = Math.max(0, data.length - 1);
  const statusFilter = String(p.status || "").trim();
  const chapterFilter = String(p.chapterId || "").trim();
  const limit = Math.min(totalCount, MAX_SUBJ_SUBMISSIONS);
  const out = [];
  const start = data.length - 1;
  const end = Math.max(1, data.length - limit);
  for (let i = start; i >= end; i--) {
    const s = rowToSubjSubmission_(data[i]);
    if (statusFilter && s.status !== statusFilter) continue;
    if (chapterFilter && s.chapterId !== chapterFilter) continue;
    out.push(s);
  }
  return { success: true, submissions: out, totalCount, truncated: totalCount > MAX_SUBJ_SUBMISSIONS };
}

function adminGradeSubjectiveSubmission(p) {
  const chk = checkAdminCan_(p, "subjective_grade");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const id = String(p.id || "").trim();
  const score = Number(p.score);
  const feedback = sanitizeSheetField_(String(p.feedback || "").trim().slice(0, 2000));
  if (!id) return { success: false, error: "id required." };
  if (!isFinite(score) || score < 0) return { success: false, error: "Valid score required." };

  return withLock_(() => {
    const sheet = getSubjSubmissionsSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        const maxMarks = Number(data[i][5]) || 100;
        const clamped = Math.min(score, maxMarks);
        sheet.getRange(i + 1, 13, 1, 5).setValues([["graded", clamped, feedback, actor, new Date().toISOString()]]);
        _invalidateSheet_(SUBJ_SUBMISSIONS_SHEET);
        logAction_(actor, "Grade Subjective", String(data[i][1]), `${id} → ${clamped}/${maxMarks}`);
        try {
          sendPushNotification_(String(data[i][1]), "Subjective answer graded",
            `You scored ${clamped}/${maxMarks}. Open the app to see feedback.`);
        } catch (e) {}
        return { success: true, id, score: clamped, maxMarks };
      }
    }
    return { success: false, error: "Submission not found." };
  });
}

function adminUploadSubjectiveFile(p) {
  const chk = checkAdminCan_(p, "subjective_import");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const fileData = String(p.fileData || "");
  const filename = String(p.filename || "subjective.json").trim();
  if (!fileData) return { success: false, error: "No file data provided." };
  if (fileData.length > 5 * 1024 * 1024) return { success: false, error: "File too large — should be well under 4MB." };

  let jsonText, parsed;
  try {
    jsonText = fileData.startsWith("data:")
      ? Utilities.newBlob(Utilities.base64Decode(fileData.split(",")[1])).getDataAsString("UTF-8")
      : fileData;
    parsed = JSON.parse(jsonText);
  } catch (e) { return { success: false, error: "That file isn't valid JSON — check the format." }; }

  const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.questions) ? parsed.questions : null);
  if (!arr || !arr.length) return { success: false, error: "No questions found — file must be an array or {questions:[...]}." };
  const badMarks = arr.filter(q => q && q.q && ![5,10].includes(Number(q.marks))).length;

  try {
    const blob = Utilities.newBlob(jsonText, "application/json", filename);
    const folder = getOrCreateFolder_("SubjectiveQuestions");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    logAction_(actor, "Upload Subjective File", filename, "fileId: " + file.getId());
    return {
      success: true, fileId: file.getId(), filename: file.getName(),
      questionCount: arr.length,
      warning: badMarks > 0 ? badMarks + " question(s) don't have marks of 5 or 10 — they'll display as 10 marks." : null
    };
  } catch (e) { return { success: false, error: "Drive upload failed: " + (e.message || e) }; }
}

/* Append client-parsed items into a topic's Drive JSON file.
   Dedupes by normalized question text so re-pasting can't duplicate. */
function adminCommitSubjectiveImport(p) {
  const chk = checkAdminCan_(p, "subjective_import");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const fileId = String(p.fileId || "").trim();
  if (!fileId) return { success: false, error: "fileId required." };

  const sectionName = String(p.section || "").trim();

  let items;
  try { items = JSON.parse(p.items || "[]"); }
  catch (e) { return { success: false, error: "items must be a JSON array." }; }
  if (!Array.isArray(items) || !items.length) return { success: false, error: "No items to insert." };
  if (items.length > 500) return { success: false, error: "Limit is 500 items per commit." };

  return withLock_(() => {
    let file;
    try { file = DriveApp.getFileById(fileId); }
    catch (e) { return { success: false, error: "Could not open target Drive file: " + (e.message || e) }; }

    let existing;
    try { existing = JSON.parse(file.getBlob().getDataAsString("UTF-8")); }
    catch (e) { return { success: false, error: "Target file isn't valid JSON." }; }

    let baseArr;
    let wrapper = null;
    let targetSectionLabel = "UNCLASSIFIED (Smart Paste)";

    if (Array.isArray(existing)) {
      baseArr = existing.slice();
    } else if (existing && Array.isArray(existing.sections)) {
      const sections = existing.sections.map(s => ({
        section: String(s.section || "General"),
        questions: Array.isArray(s.questions) ? s.questions.slice() : []
      }));
      const wanted = sectionName || "UNCLASSIFIED (Smart Paste)";
      targetSectionLabel = wanted;
      let target = sections.find(s => s.section === wanted);
      if (!target) {
        target = { section: wanted, questions: [] };
        sections.push(target);
      }
      baseArr = target.questions;
      wrapper = Object.assign({}, existing);
      wrapper.sections = sections;
    } else if (existing && Array.isArray(existing.questions)) {
      baseArr = existing.questions.slice();
      wrapper = Object.assign({}, existing);
    } else {
      return { success: false, error: "Unsupported file shape." };
    }

    const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
    const seen = new Set();
    baseArr.forEach(q => { if (q && q.q) seen.add(norm(q.q)); });

    let inserted = 0, skipped = 0;
    items.forEach(it => {
      const text = String(it.question || it.q || "").trim();
      if (!text) { skipped++; return; }
      const key = norm(text);
      if (seen.has(key)) { skipped++; return; }
      seen.add(key);

      const marksRaw = Number(it.marks) || 10;
      const marks = (marksRaw === 5 || marksRaw === 10) ? marksRaw : 10;

      baseArr.push({ type: "subjective", chapter: targetSectionLabel, q: text, marks });
      inserted++;
    });

    if (!inserted) {
      return { success: true, fileId, inserted: 0, skipped,
               message: "All items were duplicates." };
    }

    const newContent = wrapper
      ? JSON.stringify(wrapper, null, 2)
      : JSON.stringify(baseArr, null, 2);

    try { file.setContent(newContent); }
    catch (e) { return { success: false, error: "Could not write to file: " + (e.message || e) }; }

    logAction_(actor, "Commit Subjective Import", file.getName(),
      `${inserted} into "${targetSectionLabel}", ${skipped} skipped`);
    return { success: true, fileId, filename: file.getName(), inserted, skipped, section: targetSectionLabel };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   QUESTION REPORTS
   ═══════════════════════════════════════════════════════════════════════ */

function reportQuestion(p) {
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };
  const userFound = findUserRow_(getUsersSheet_(), username);
  if (!userFound) return { success: false, error: "User not found." };
  if (!verifyUserToken_(userFound, p.token)) return { success: false, error: "Session expired.", sessionInvalid: true };

  const uid = String(p.uid || "").trim();
  const reason = String(p.reason || "").trim();
  const note = sanitizeSheetField_(String(p.note || "").trim().slice(0, 500));
  const snapshot = String(p.questionSnapshot || "").trim().slice(0, 1000);
  if (!uid) return { success: false, error: "Missing question reference." };
  if (!["wrong_answer", "unclear", "typo", "other"].includes(reason)) return { success: false, error: "Invalid report reason." };

  const m = uid.match(/^(.+)_(\d+)$/);
  const fileId = m ? m[1] : uid;

  return withLock_(() => {
    const sheet = getQReportsSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === uid && String(data[i][6]) === username && String(data[i][8]) === "open") {
        return { success: true, message: "You've already reported this question — it's in the queue." };
      }
    }
    sheet.appendRow([Utilities.getUuid(), uid, fileId, snapshot, reason, note, username, new Date().toISOString(), "open"]);
    _invalidateSheet_(QREPORTS_SHEET);
    return { success: true, message: "Thanks — this has been sent for review." };
  });
}

function adminListQuestionReports(p) {
  const chk = checkAdminCan_(p, "qreports_view");
  if (!chk.ok) return { success: false, error: chk.error };
  const data = _cachedSheetData_(QREPORTS_SHEET, getQReportsSheet_).data;
  const totalCount = Math.max(0, data.length - 1);
  const limit = Math.min(totalCount, MAX_LIST_QREPORTS);
  const reports = [];
  for (let i = 1; i <= limit; i++) reports.push(rowToQReport_(data[i]));
  reports.sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return new Date(b.reportedAt) - new Date(a.reportedAt);
  });
  return { success: true, reports, totalCount, truncated: totalCount > MAX_LIST_QREPORTS };
}

function adminUpdateQuestionReportStatus(p) {
  const chk = checkAdminCan_(p, "qreports_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const id = String(p.id || "").trim();
  const status = String(p.status || "").trim();
  if (!id) return { success: false, error: "id required." };
  if (!["open", "resolved", "dismissed"].includes(status)) return { success: false, error: "Status must be open, resolved, or dismissed." };

  return withLock_(() => {
    const sheet = getQReportsSheet_();
    const found = findQReportRow_(sheet, id);
    if (!found) return { success: false, error: "Report not found." };
    sheet.getRange(found.rowIndex, 9).setValue(status);
    _invalidateSheet_(QREPORTS_SHEET);
    logAction_(actor, "Update Question Report", id, "Status: " + status);
    return { success: true, id, status };
  });
}

function adminDeleteQuestionReport(p) {
  const chk = checkAdminCan_(p, "qreports_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const id = String(p.id || "").trim();
  if (!id) return { success: false, error: "id required." };

  return withLock_(() => {
    const sheet = getQReportsSheet_();
    const found = findQReportRow_(sheet, id);
    if (!found) return { success: false, error: "Report not found." };
    sheet.deleteRow(found.rowIndex);
    _invalidateSheet_(QREPORTS_SHEET);
    logAction_(actor, "Delete Question Report", id, "");
    return { success: true, deleted: id };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — USERS
   ═══════════════════════════════════════════════════════════════════════ */

function adminListUsers(p) {
  const chk = checkAdminCan_(p, "users_view");
  if (!chk.ok) return { success: false, error: chk.error };
  const data = _cachedSheetData_(USERS_SHEET, getUsersSheet_).data;
  const totalCount = Math.max(0, data.length - 1);
  const limit = Math.min(totalCount, MAX_LIST_USERS);
  const users = [];
  for (let i = 1; i <= limit; i++) users.push(rowToUser_(data[i]));
  return { success: true, users, totalCount, truncated: totalCount > MAX_LIST_USERS };
}

function adminUpdateUser(p) {
  const chk = checkAdminCan_(p, "users_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const username = String(p.username || "").trim();
  if (!username) return { success: false, error: "Username required." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const found = findUserRow_(sheet, username);
    if (!found) return { success: false, error: "User not found." };

    const changes = [];
    if (p.name !== undefined) { sheet.getRange(found.rowIndex, 3).setValue(sanitizeSheetField_(p.name)); changes.push("name"); }
    if (p.email !== undefined) {
      const email = String(p.email).trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "Invalid email address." };
      sheet.getRange(found.rowIndex, 4).setValue(sanitizeSheetField_(email));
      changes.push("email");
    }
    if (p.mobile !== undefined) {
      const mobile = String(p.mobile).trim();
      if (mobile && !/^(98|97|96|99)\d{8}$/.test(mobile)) return { success: false, error: "Invalid Nepali mobile number." };
      sheet.getRange(found.rowIndex, 5).setValue(mobile);
      changes.push("mobile");
    }
    if (p.status !== undefined && p.status !== "") { sheet.getRange(found.rowIndex, 8).setValue(p.status); changes.push("status→" + p.status); }
    if (p.permanentAccess !== undefined) {
      const val = (p.permanentAccess === true || p.permanentAccess === "true") ? "true" : "false";
      sheet.getRange(found.rowIndex, 14).setValue(val);
      changes.push("permanentAccess→" + val);
    }
    if (p.password) {
      if (String(p.password).length < 6) return { success: false, error: "Password must be at least 6 characters." };
      const salt = makeSalt_();
      sheet.getRange(found.rowIndex, 2).setValue(salt + ":" + hashPassSalted_(p.password, salt));
      changes.push("password reset");
    }
    _invalidateSheet_(USERS_SHEET);
    logAction_(actor, "Update User", username, changes.join(", "));
    return { success: true, username };
  });
}

function adminGrantAccess(p) {
  const chk = checkAdminCan_(p, "users_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const username = String(p.username || "").trim();
  const duration = String(p.duration || "").trim();
  if (!username) return { success: false, error: "Username required." };
  if (!["permanent", "year"].includes(duration)) return { success: false, error: "Duration must be 'permanent' or 'year'." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const found = findUserRow_(sheet, username);
    if (!found) return { success: false, error: "User not found." };

    let expiresAtIso = "";
    if (duration === "year") {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);
      expiresAtIso = expiresAt.toISOString();
    }
    sheet.getRange(found.rowIndex, 8, 1, 3).setValues([["active", new Date().toISOString(), "verified"]]);
    sheet.getRange(found.rowIndex, 14, 1, 3).setValues([["true", duration === "year" ? "yearly" : "permanent", expiresAtIso]]);
    _invalidateSheet_(USERS_SHEET);
    logAction_(actor, "Grant Access", username, "Duration: " + duration);
    return { success: true, username, duration, accessExpiresAt: expiresAtIso };
  });
}

function adminGrantAccessBatch(p) {
  const chk = checkAdminCan_(p, "users_bulk");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  let usernames;
  try { usernames = JSON.parse(p.usernames || "[]"); } catch (e) { return { success: false, error: "usernames must be a JSON array." }; }
  if (!Array.isArray(usernames) || !usernames.length) return { success: false, error: "No usernames provided." };

  const duration = String(p.duration || "").trim();
  if (!["permanent", "year"].includes(duration)) return { success: false, error: "Duration must be 'permanent' or 'year'." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const data = sheet.getDataRange().getValues();
    const rowByUser = {};
    for (let i = 1; i < data.length; i++) rowByUser[String(data[i][0]).toLowerCase().trim()] = i + 1;

    let expiresAtIso = "";
    if (duration === "year") {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);
      expiresAtIso = expiresAt.toISOString();
    }
    const nowIso = new Date().toISOString();
    const results = [];
    let anyChanged = false;

    usernames.forEach(raw => {
      const u = String(raw || "").trim();
      const rowIndex = rowByUser[u.toLowerCase()];
      if (!rowIndex) { results.push({ username: u, success: false, error: "User not found." }); return; }
      const row = data[rowIndex - 1];
      row[7] = "active"; row[9] = nowIso; row[12] = "verified"; row[13] = "true";
      row[14] = duration === "year" ? "yearly" : "permanent"; row[15] = expiresAtIso;
      anyChanged = true;
      results.push({ username: u, success: true });
    });

    if (anyChanged) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
      _invalidateSheet_(USERS_SHEET);
    }
    logAction_(actor, "Bulk Grant Access", usernames.join(", "),
      "Duration: " + duration + " — " + results.filter(r => r.success).length + "/" + usernames.length + " succeeded");
    return { success: true, duration, accessExpiresAt: expiresAtIso, results };
  });
}

function adminDeleteUser(p) {
  const chk = checkAdminCan_(p, "users_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const username = String(p.username || "").trim();

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const found = findUserRow_(sheet, username);
    if (!found) return { success: false, error: "User not found." };
    sheet.deleteRow(found.rowIndex);
    _invalidateSheet_(USERS_SHEET);
    purgeUserAuxiliaryRows_(username);
    logAction_(actor, "Delete User", username, "Purged Progress/PushTokens/Payments/Backups/WeeklyAttempts/Subjective");
    return { success: true, deleted: username };
  });
}

function adminDeleteUsersBatch(p) {
  const chk = checkAdminCan_(p, "users_bulk");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  let usernames;
  try { usernames = JSON.parse(p.usernames || "[]"); } catch (e) { return { success: false, error: "usernames must be a JSON array." }; }
  if (!Array.isArray(usernames) || !usernames.length) return { success: false, error: "No usernames provided." };

  return withLock_(() => {
    const sheet = getUsersSheet_();
    const data = sheet.getDataRange().getValues();
    const rowByUser = {};
    for (let i = 1; i < data.length; i++) rowByUser[String(data[i][0]).toLowerCase().trim()] = i + 1;

    const results = [];
    const toDelete = [];
    usernames.forEach(raw => {
      const u = String(raw || "").trim();
      const rowIndex = rowByUser[u.toLowerCase()];
      if (!rowIndex) { results.push({ username: u, success: false, error: "User not found." }); return; }
      toDelete.push({ username: u, rowIndex });
    });

    toDelete.sort((a, b) => b.rowIndex - a.rowIndex);
    toDelete.forEach(({ username, rowIndex }) => {
      sheet.deleteRow(rowIndex);
      purgeUserAuxiliaryRows_(username);
      results.push({ username, success: true });
    });
    _invalidateSheet_(USERS_SHEET);
    logAction_(actor, "Bulk Delete User", usernames.join(", "),
      results.filter(r => r.success).length + "/" + usernames.length + " succeeded (auxiliary rows purged)");
    return { success: true, results };
  });
}

function purgeUserAuxiliaryRows_(username) {
  if (!username) return;
  const target = String(username).toLowerCase().trim();

  const map = [
    [PROGRESS_SHEET, getProgressSheet_, 0],
    [PUSHTOKENS_SHEET, getPushTokensSheet_, 0],
    [PAYMENTS_SHEET, getPaymentsSheet_, 0],
    [PROGRESS_BACKUPS_SHEET, getProgressBackupsSheet_, 2],
    [WEEKLYATTEMPTS_SHEET, getWeeklyAttemptsSheet_, 0],
    [SUBJ_SUBMISSIONS_SHEET, getSubjSubmissionsSheet_, 1]
  ];

  map.forEach(([name, getter, colIdx]) => {
    try {
      const sheet = getter();
      const data = sheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][colIdx]).toLowerCase().trim() === target) sheet.deleteRow(i + 1);
      }
      _invalidateSheet_(name);
    } catch (e) { console.error(`purgeUserAuxiliaryRows_: ${name} failed:`, e); }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — PAYMENTS
   ═══════════════════════════════════════════════════════════════════════ */

function adminListPayments(p) {
  const chk = checkAdminCan_(p, "payments_view");
  if (!chk.ok) return { success: false, error: chk.error };
  const data = _cachedSheetData_(PAYMENTS_SHEET, getPaymentsSheet_).data;
  const totalCount = Math.max(0, data.length - 1);

  const txIdOwners = {};
  for (let i = 1; i < data.length; i++) {
    const txId = String(data[i][4] || "").trim().toLowerCase();
    const username = String(data[i][0] || "");
    if (!txId) continue;
    if (!txIdOwners[txId]) txIdOwners[txId] = new Set();
    txIdOwners[txId].add(username);
  }

  const limit = Math.min(totalCount, MAX_LIST_PAYMENTS);
  const payments = [];
  for (let i = 1; i <= limit; i++) {
    const txId = String(data[i][4] || "");
    const username = String(data[i][0] || "");
    const owners = txIdOwners[txId.trim().toLowerCase()];
    const shared = owners ? [...owners].filter(u => u !== username) : [];
    payments.push({
      username, name: data[i][1], email: data[i][2],
      mobile: String(data[i][3] || ""), txId, remarks: data[i][5],
      status: data[i][6], rejectionReason: data[i][7], screenshotUrl: data[i][8],
      submittedAt: data[i][9], reviewedAt: data[i][10],
      duplicateTxId: shared.length > 0, duplicateTxIdUsers: shared
    });
  }
  return { success: true, payments, totalCount, truncated: totalCount > MAX_LIST_PAYMENTS };
}

function adminReviewPayment(p) {
  const chk = checkAdminCan_(p, "payments_review");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const username = String(p.username || "").trim();
  const status = String(p.status || "").trim();
  const reason = sanitizeSheetField_(String(p.rejectionReason || "").trim());
  if (!username || !status) return { success: false, error: "Username and status required." };
  if (!["verified", "rejected", "pending"].includes(status)) return { success: false, error: "Status must be verified, rejected, or pending." };

  return withLock_(() => {
    const paySheet = getPaymentsSheet_();
    const data = paySheet.getDataRange().getValues();
    let paymentRow = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === username.toLowerCase()) { paymentRow = i + 1; break; }
    }
    if (!paymentRow) return { success: false, error: "Payment not found." };

    const nowIso = new Date().toISOString();
    paySheet.getRange(paymentRow, 7).setValue(status);
    if (reason && status === "rejected") paySheet.getRange(paymentRow, 8).setValue(reason);
    paySheet.getRange(paymentRow, 11).setValue(nowIso);
    _invalidateSheet_(PAYMENTS_SHEET);

    const userSheet = getUsersSheet_();
    const userFound = findUserRow_(userSheet, username);
    if (userFound) {
      if (status === "verified") {
        userSheet.getRange(userFound.rowIndex, 8).setValue("active");
        userSheet.getRange(userFound.rowIndex, 13).setValue("verified");
        userSheet.getRange(userFound.rowIndex, 14).setValue("true");
        userSheet.getRange(userFound.rowIndex, 10).setValue(nowIso);
        userSheet.getRange(userFound.rowIndex, 15).setValue("permanent");
        userSheet.getRange(userFound.rowIndex, 16).setValue("");
      } else if (status === "rejected") {
        userSheet.getRange(userFound.rowIndex, 8).setValue("expired");
        userSheet.getRange(userFound.rowIndex, 13).setValue("rejected");
        userSheet.getRange(userFound.rowIndex, 14).setValue("false");
      } else if (status === "pending") {
        // v1.07 — reverting a previously-reviewed payment to the queue.
        userSheet.getRange(userFound.rowIndex, 8).setValue("payment_pending");
        userSheet.getRange(userFound.rowIndex, 13).setValue("pending");
        userSheet.getRange(userFound.rowIndex, 14).setValue("false");
      }
      _invalidateSheet_(USERS_SHEET);
    }

    logAction_(actor, "Review Payment", username, "Status: " + status + (reason ? " (" + reason + ")" : ""));

    if (status === "verified" || status === "rejected") {
      try {
        sendPushNotification_(username,
          status === "verified" ? "Payment verified! 🎉" : "Payment rejected",
          status === "verified"
            ? "Your payment has been verified. You now have full access to Abhyas."
            : "Your payment was rejected" + (reason ? ": " + reason : ". Please check and resubmit."));
      } catch (err) {}
    }
    return { success: true, username, status };
  });
}

function adminReviewPaymentsBatch(p) {
  const chk = checkAdminCan_(p, "payments_bulk");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  let usernames;
  try { usernames = JSON.parse(p.usernames || "[]"); } catch (e) { return { success: false, error: "usernames must be a JSON array." }; }
  if (!Array.isArray(usernames) || !usernames.length) return { success: false, error: "No usernames provided." };

  const status = String(p.status || "").trim();
  const reason = sanitizeSheetField_(String(p.rejectionReason || "").trim());
  if (!["verified", "rejected", "pending"].includes(status)) return { success: false, error: "Status must be verified, rejected, or pending." };

  return withLock_(() => {
    const paySheet = getPaymentsSheet_();
    const payData = paySheet.getDataRange().getValues();
    const payRowByUser = {};
    for (let i = 1; i < payData.length; i++) payRowByUser[String(payData[i][0]).toLowerCase().trim()] = i + 1;

    const userSheet = getUsersSheet_();
    const userData = userSheet.getDataRange().getValues();
    const userRowByUser = {};
    for (let i = 1; i < userData.length; i++) userRowByUser[String(userData[i][0]).toLowerCase().trim()] = i + 1;

    const nowIso = new Date().toISOString();
    const results = [];
    let paymentsChanged = false, usersChanged = false;

    usernames.forEach(raw => {
      const u = String(raw || "").trim();
      const payRow = payRowByUser[u.toLowerCase()];
      if (!payRow) { results.push({ username: u, success: false, error: "Payment not found." }); return; }

      const pRow = payData[payRow - 1];
      pRow[6] = status;
      if (reason && status === "rejected") pRow[7] = reason;
      pRow[10] = nowIso;
      paymentsChanged = true;

      const userRow = userRowByUser[u.toLowerCase()];
      if (userRow) {
        const uRow = userData[userRow - 1];
        if (status === "verified") {
          uRow[7] = "active"; uRow[12] = "verified"; uRow[13] = "true";
          uRow[9] = nowIso; uRow[14] = "permanent"; uRow[15] = "";
        } else if (status === "rejected") {
          uRow[7] = "expired"; uRow[12] = "rejected"; uRow[13] = "false";
        } else if (status === "pending") {
          uRow[7] = "payment_pending"; uRow[12] = "pending"; uRow[13] = "false";
        }
        usersChanged = true;
      }
      results.push({ username: u, success: true });
    });

    if (paymentsChanged) {
      paySheet.getRange(1, 1, payData.length, payData[0].length).setValues(payData);
      _invalidateSheet_(PAYMENTS_SHEET);
    }
    if (usersChanged) {
      userSheet.getRange(1, 1, userData.length, userData[0].length).setValues(userData);
      _invalidateSheet_(USERS_SHEET);
    }

    const okCount = results.filter(r => r.success).length;
    logAction_(actor, "Bulk Review Payment", usernames.join(", "),
      "Status: " + status + (reason ? " (" + reason + ")" : "") + " — " + okCount + "/" + usernames.length + " succeeded");

    if (status === "verified" || status === "rejected") {
      results.filter(r => r.success).forEach(r => {
        try {
          sendPushNotification_(r.username,
            status === "verified" ? "Payment verified! 🎉" : "Payment rejected",
            status === "verified" ? "Your payment has been verified. You now have full access to Abhyas."
                                  : "Your payment was rejected" + (reason ? ": " + reason : ". Please check and resubmit."));
        } catch (err) {}
      });
    }
    return { success: true, status, results };
  });
}

function adminDeletePayment(p) {
  const chk = checkAdminCan_(p, "payments_review");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const username = String(p.username || "").trim();

  return withLock_(() => {
    const sheet = getPaymentsSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === username.toLowerCase()) {
        sheet.deleteRow(i + 1);
        _invalidateSheet_(PAYMENTS_SHEET);
        logAction_(actor, "Delete Payment", username, "");
        return { success: true, deleted: username };
      }
    }
    return { success: false, error: "Payment not found." };
  });
}

function adminRevokeScreenshotSharing(p) {
  const chk = checkAdminCan_(p, "maintenance");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const iter = DriveApp.getFoldersByName("PaymentScreenshots");
  if (!iter.hasNext()) return { success: true, processed: 0, revoked: 0, alreadyPrivate: 0, failed: 0, message: "No PaymentScreenshots folder yet." };
  const folder = iter.next();
  const files = folder.getFiles();
  let processed = 0, revoked = 0, alreadyPrivate = 0, failed = 0;
  while (files.hasNext()) {
    processed++;
    const f = files.next();
    try {
      if (f.getSharingAccess() === DriveApp.Access.PRIVATE) { alreadyPrivate++; continue; }
      f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      revoked++;
    } catch (e) { failed++; console.error("revoke sharing failed for " + f.getId(), e); }
  }
  logAction_(actor, "Revoke Screenshot Sharing", "",
    `Processed ${processed}, revoked ${revoked}, already-private ${alreadyPrivate}, failed ${failed}`);
  return { success: true, processed, revoked, alreadyPrivate, failed };
}

function adminExpiringTrials(p) {
  const chk = checkAdminCan_(p, "dashboard");
  if (!chk.ok) return { success: false, error: chk.error };
  const hours = Math.max(1, Math.min(168, Number(p.hours) || 24));
  const data = _cachedSheetData_(USERS_SHEET, getUsersSheet_).data;
  const now = Date.now();
  const cutoff = now + hours * 60 * 60 * 1000;
  const users = [];
  for (let i = 1; i < data.length; i++) {
    const u = rowToUser_(data[i]);
    if (u.status !== "trial" || !u.trialExpiresAt) continue;
    const t = new Date(u.trialExpiresAt).getTime();
    if (isNaN(t) || t <= now || t > cutoff) continue;
    users.push(u);
  }
  users.sort((a, b) => new Date(a.trialExpiresAt) - new Date(b.trialExpiresAt));
  return { success: true, hours, count: users.length, users };
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — STATS / LOGS / SETTINGS
   ═══════════════════════════════════════════════════════════════════════ */

function adminStats(p) {
  const chk = checkAdminCan_(p, "dashboard");
  if (!chk.ok) return { success: false, error: chk.error };

  const userData = _cachedSheetData_(USERS_SHEET, getUsersSheet_).data;
  const payData = _cachedSheetData_(PAYMENTS_SHEET, getPaymentsSheet_).data;

  let total = 0, trial = 0, active = 0, expired = 0, pendingPay = 0;
  for (let i = 1; i < userData.length; i++) {
    total++;
    const s = userData[i][7];
    if (s === "trial") trial++;
    else if (s === "active") active++;
    else if (s === "expired") expired++;
    else if (s === "payment_pending") pendingPay++;
  }
  let totalPay = 0, pending = 0, verified = 0, rejected = 0;
  for (let i = 1; i < payData.length; i++) {
    totalPay++;
    const s = payData[i][6];
    if (s === "pending") pending++;
    else if (s === "verified") verified++;
    else if (s === "rejected") rejected++;
  }
  return {
    success: true,
    stats: {
      users: { total, trial, active, expired, paymentPending: pendingPay },
      payments: { total: totalPay, pending, verified, rejected }
    }
  };
}

function adminListLogs(p) {
  const chk = checkAdminCan_(p, "logs_view");
  if (!chk.ok) return { success: false, error: chk.error };

  const sheet = getLogsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, logs: [] };
  const totalDataRows = lastRow - 1;
  const rowsToRead = Math.min(totalDataRows, LOGS_MAX_ROWS_READ);
  const startRow = lastRow - rowsToRead + 1;
  const data = sheet.getRange(startRow, 1, rowsToRead, LOG_HEADERS.length).getValues();
  const logs = data.map(row => ({ timestamp: row[0], admin: row[1], action: row[2], target: row[3], details: row[4] })).reverse();
  return { success: true, logs, totalCount: totalDataRows, truncated: totalDataRows > LOGS_MAX_ROWS_READ };
}

function adminUpdateSettings(p) {
  const chk = checkAdminCan_(p, "settings_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const key = String(p.key || "").trim();
  const value = (p.value !== undefined) ? p.value : "";
  if (!key) return { success: false, error: "Setting key required." };

  return withLock_(() => {
    const sheet = getSettingsSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        _invalidateSheet_(SETTINGS_SHEET);
        logAction_(actor, "Update Setting", key, "New value: " + value);
        return { success: true, key, value };
      }
    }
    sheet.appendRow([key, value]);
    _invalidateSheet_(SETTINGS_SHEET);
    logAction_(actor, "Update Setting", key, "New value: " + value);
    return { success: true, key, value };
  });
}

function adminUpdateSettingsBatch(p) {
  const chk = checkAdminCan_(p, "settings_manage");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const incoming = p.settings;
  if (!Array.isArray(incoming) || !incoming.length) return { success: false, error: "settings array required." };

  return withLock_(() => {
    const sheet = getSettingsSheet_();
    const data = sheet.getDataRange().getValues();
    const rowByKey = {};
    for (let i = 1; i < data.length; i++) if (data[i][0]) rowByKey[String(data[i][0])] = i + 1;

    const applied = [];
    const appendRows = [];
    incoming.forEach(s => {
      const key = String(s.key || "").trim();
      if (!key) return;
      const value = (s.value !== undefined) ? s.value : "";
      if (rowByKey[key]) sheet.getRange(rowByKey[key], 2).setValue(value);
      else appendRows.push([key, value]);
      applied.push(key);
    });
    if (appendRows.length) sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, 2).setValues(appendRows);
    _invalidateSheet_(SETTINGS_SHEET);
    logAction_(actor, "Update Settings (batch)", applied.join(", "), "");
    return { success: true, updated: applied };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — MOST MISSED QUESTIONS
   ═══════════════════════════════════════════════════════════════════════ */

function adminMostMissedQuestions(p) {
  const chk = checkAdminCan_(p, "dashboard");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const filters = {
    level: safeImportString_(p.level, 120),
    chapter: safeImportString_(p.chapter, 200),
    book: safeImportString_(p.book, 200),
    subtopic: safeImportString_(p.subtopic, 200),
    dateFrom: safeImportString_(p.dateFrom, 30),
    dateTo: safeImportString_(p.dateTo, 30),
    minAttempts: Math.max(1, Math.min(MAX_REPORT_MIN_ATTEMPTS, Number(p.minAttempts) || 3)),
    limit: Math.max(1, Math.min(MAX_REPORT_LIMIT, Number(p.limit) || 30))
  };

  const fromTime = parseReportDateFrom_(filters.dateFrom);
  const toTime = parseReportDateTo_(filters.dateTo);
  if (filters.dateFrom && fromTime === null) return { success: false, error: "dateFrom must use YYYY-MM-DD format." };
  if (filters.dateTo && toTime === null) return { success: false, error: "dateTo must use YYYY-MM-DD format." };
  if (fromTime !== null && toTime !== null && fromTime > toTime) return { success: false, error: "dateFrom cannot be later than dateTo." };

  const data = _cachedSheetData_(PROGRESS_SHEET, getProgressSheet_).data;
  const totalRows = Math.max(0, data.length - 1);
  const rowsToScan = Math.min(totalRows, MAX_MISSED_SCAN_ROWS);
  const tally = {};

  for (let i = 1; i <= rowsToScan; i++) {
    const username = String(data[i][0] || "").trim();
    const raw = data[i][1];
    if (!username || !raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { continue; }
    const sessions = (parsed && parsed.prog && Array.isArray(parsed.prog.sessions)) ? parsed.prog.sessions : [];
    for (const session of sessions) {
      if (!session || typeof session !== "object") continue;
      const sessionTime = normalizeReportTime_(session.at);
      if (sessionTime !== null && fromTime !== null && sessionTime < fromTime) continue;
      if (sessionTime !== null && toTime !== null && sessionTime > toTime) continue;
      const qres = Array.isArray(session.qres) ? session.qres : [];
      for (const qr of qres) {
        if (!qr || !qr.uid) continue;
        const metadata = reportMetadataForQuestion_(qr, session);
        if (!reportMetadataMatches_(metadata, filters)) continue;
        const uid = String(qr.uid);
        if (!tally[uid]) {
          tally[uid] = {
            uid, fileId: reportFileIdFromUid_(uid), index: reportIndexFromUid_(uid),
            level: metadata.level, chapter: metadata.chapter, book: metadata.book, subtopic: metadata.subtopic,
            wrong: 0, total: 0, students: {}, lastAttemptAt: null
          };
        }
        const record = tally[uid];
        record.total++;
        if (!qr.ok) record.wrong++;
        record.students[username] = true;
        const attemptTime = normalizeReportTime_(qr.at || session.at);
        if (attemptTime !== null && (record.lastAttemptAt === null || attemptTime > record.lastAttemptAt)) record.lastAttemptAt = attemptTime;
        if (!record.level && metadata.level) record.level = metadata.level;
        if (!record.chapter && metadata.chapter) record.chapter = metadata.chapter;
        if (!record.book && metadata.book) record.book = metadata.book;
        if (!record.subtopic && metadata.subtopic) record.subtopic = metadata.subtopic;
      }
    }
  }

  const results = Object.keys(tally).map(uid => {
    const r = tally[uid];
    const studentCount = Object.keys(r.students).length;
    return {
      uid: r.uid, fileId: r.fileId, index: r.index,
      level: r.level || "", chapter: r.chapter || "", book: r.book || "", subtopic: r.subtopic || "",
      wrong: r.wrong, total: r.total,
      wrongRate: r.total ? Math.round((r.wrong / r.total) * 100) : 0,
      accuracy: r.total ? Math.round(((r.total - r.wrong) / r.total) * 100) : 0,
      uniqueStudents: studentCount,
      lastAttemptAt: r.lastAttemptAt ? new Date(r.lastAttemptAt).toISOString() : ""
    };
  })
  .filter(r => r.total >= filters.minAttempts && r.fileId !== "local")
  .sort((a, b) => b.wrongRate - a.wrongRate || b.total - a.total || b.uniqueStudents - a.uniqueStudents)
  .slice(0, filters.limit);

  logAction_(actor, "View Filtered Question Report", "", JSON.stringify(filters).slice(0, 1000));
  return {
    success: true, results, filters, minAttempts: filters.minAttempts, limit: filters.limit,
    generatedAt: new Date().toISOString(),
    truncated: totalRows > MAX_MISSED_SCAN_ROWS,
    totalRowsScanned: rowsToScan, totalRowsAvailable: totalRows
  };
}

function reportMetadataForQuestion_(qr, session) {
  const meta = (qr && qr.meta && typeof qr.meta === "object") ? qr.meta : {};
  return {
    level: String(qr.level || meta.level || qr.lv || session.lv || "").trim(),
    chapter: String(qr.chapterKey || meta.chapterKey || session.chapterKey
      || qr.chapter || meta.chapter || qr.ch || session.ch || session.chapter || "").trim(),
    book: String(qr.book || meta.book || session.book || "").trim(),
    subtopic: String(qr.subtopic || meta.subtopic || qr.sub || session.sub || "").trim()
  };
}
function reportMetadataMatches_(m, f) {
  if (f.level && m.level.toLowerCase() !== f.level.toLowerCase()) return false;
  if (f.chapter && m.chapter.toLowerCase() !== f.chapter.toLowerCase()) return false;
  if (f.book && m.book.toLowerCase() !== f.book.toLowerCase()) return false;
  if (f.subtopic && m.subtopic.toLowerCase() !== f.subtopic.toLowerCase()) return false;
  return true;
}
function parseReportDateFrom_(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d.getTime();
}
function parseReportDateTo_(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T23:59:59.999Z");
  return isNaN(d.getTime()) ? null : d.getTime();
}
function normalizeReportTime_(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isFinite(value) ? value : null;
  const n = Number(value);
  if (!isNaN(n) && n > 0) return n;
  const p = new Date(String(value));
  return isNaN(p.getTime()) ? null : p.getTime();
}
function reportFileIdFromUid_(uid) {
  const s = String(uid || "");
  const m = s.match(/^(.+)_(\d+)$/);
  return m ? m[1] : s;
}
function reportIndexFromUid_(uid) {
  const s = String(uid || "");
  const m = s.match(/^(.+)_(\d+)$/);
  return m ? Number(m[2]) : null;
}

/* ═══════════════════════════════════════════════════════════════════════
   PROGRESS IMPORT
   ═══════════════════════════════════════════════════════════════════════ */

function safeImportString_(value, maxLength) {
  const s = String(value == null ? "" : value).trim();
  return (maxLength && s.length > maxLength) ? s.slice(0, maxLength) : s;
}
function normalizeImportMode_(mode) {
  const v = String(mode || "preview").trim().toLowerCase();
  return ["preview", "merge", "replace"].includes(v) ? v : "";
}
function normalizeImportRecords_(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.users)) return payload.users;
  if (payload.username && payload.data) return [{ username: payload.username, data: payload.data }];
  return [];
}
function parseImportData_(value) {
  if (value && typeof value === "object") return value;
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Progress data is empty.");
  if (raw.length > MAX_IMPORT_DATA_CHARS_PER_USER) throw new Error("Progress data exceeds the 45,000 character limit.");
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { throw new Error("Progress data is not valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Progress data must be a JSON object.");
  return parsed;
}
function validateProgressObject_(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { valid: false, error: "Progress data must be an object." };
  const allowed = { prog: 1, bk: 1, fl: 1, wr: 1, stk: 1, chapStats: 1, schemaVersion: 1, updatedAt: 1 };
  for (const key of Object.keys(data)) {
    if (!allowed[key]) return { valid: false, error: "Unsupported progress field: " + key };
  }
  for (const f of ["bk", "fl", "wr"]) {
    if (data[f] !== undefined && !Array.isArray(data[f])) return { valid: false, error: f + " must be an array." };
  }
  if (data.prog !== undefined) {
    if (!data.prog || typeof data.prog !== "object" || Array.isArray(data.prog)) return { valid: false, error: "prog must be an object." };
    if (data.prog.sessions !== undefined && !Array.isArray(data.prog.sessions)) return { valid: false, error: "prog.sessions must be an array." };
    for (const nf of ["total", "correct", "studySec"]) {
      const v = data.prog[nf];
      if (v !== undefined && (typeof v !== "number" || !isFinite(v))) return { valid: false, error: "prog." + nf + " must be numeric." };
    }
  }
  return { valid: true };
}
function serializeProgressObject_(data) {
  const json = JSON.stringify(data);
  if (json.length > MAX_IMPORT_DATA_CHARS_PER_USER) throw new Error("Merged progress exceeds the 45,000 character limit.");
  return json;
}
function cloneJson_(v) { return JSON.parse(JSON.stringify(v)); }
function itemUid_(item) { return (item && typeof item === "object") ? String(item.uid || item.id || "").trim() : ""; }

function mergeUniqueItemsByUid_(first, second) {
  const out = [];
  const seen = {};
  for (const list of [Array.isArray(first) ? first : [], Array.isArray(second) ? second : []]) {
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const uid = itemUid_(item);
      if (!uid) continue;
      if (!seen[uid]) { seen[uid] = true; out.push(cloneJson_(item)); }
      else {
        const idx = out.findIndex(r => itemUid_(r) === uid);
        if (idx !== -1) out[idx] = Object.assign({}, out[idx], cloneJson_(item));
      }
    }
  }
  return out;
}
function sessionIdentity_(s) {
  if (!s || typeof s !== "object") return "";
  if (s.id) return String(s.id);
  return [String(s.at || s.startedAt || ""), String(s.mode || ""), String(s.chapter || ""), String(s.total || 0)].join("|");
}
function mergeSessions_(first, second) {
  const out = [];
  const index = {};
  for (const list of [Array.isArray(first) ? first : [], Array.isArray(second) ? second : []]) {
    for (const session of list) {
      if (!session || typeof session !== "object") continue;
      const id = sessionIdentity_(session);
      if (!id) continue;
      if (index[id] === undefined) { index[id] = out.length; out.push(cloneJson_(session)); }
      else {
        const i = index[id];
        const existing = out[i];
        out[i] = Object.assign({}, existing, cloneJson_(session));
        if (existing.qres || session.qres) out[i].qres = mergeQuestionResults_(existing.qres, session.qres);
      }
    }
  }
  out.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  return out.slice(-500);
}
function questionResultIdentity_(r) {
  return (r && typeof r === "object") ? [String(r.uid || ""), String(r.at || ""), r.ok ? "1" : "0"].join("|") : "";
}
function mergeQuestionResults_(first, second) {
  const out = [];
  const seen = {};
  for (const list of [Array.isArray(first) ? first : [], Array.isArray(second) ? second : []]) {
    for (const item of list) {
      if (!item || typeof item !== "object" || !item.uid) continue;
      const id = questionResultIdentity_(item);
      if (!seen[id]) { seen[id] = true; out.push(cloneJson_(item)); }
    }
  }
  return out.slice(-10000);
}
function mergeProgressData_(existing, incoming) {
  existing = existing || {};
  incoming = incoming || {};
  const result = Object.assign({}, cloneJson_(existing), cloneJson_(incoming));
  const ep = existing.prog || {}, ip = incoming.prog || {};
  result.prog = Object.assign({}, cloneJson_(ep), cloneJson_(ip));
  result.prog.sessions = mergeSessions_(ep.sessions, ip.sessions);
  result.prog.total = result.prog.sessions.reduce((t, s) => t + Number(s.total || 0), 0);
  result.prog.correct = result.prog.sessions.reduce((t, s) => t + Number(s.correct || 0), 0);
  result.bk = mergeUniqueItemsByUid_(existing.bk, incoming.bk);
  result.fl = mergeUniqueItemsByUid_(existing.fl, incoming.fl);
  result.wr = mergeUniqueItemsByUid_(existing.wr, incoming.wr);
  result.schemaVersion = 2;
  result.updatedAt = new Date().toISOString();
  return result;
}
function getProgressRecordForImport_(sheet, username) {
  const found = findProgressRow_(sheet, username);
  if (!found || !found.row || !found.row[1]) return { found: false, rowIndex: null, data: null };
  try { return { found: true, rowIndex: found.rowIndex, data: parseImportData_(found.row[1]) }; }
  catch (e) { return { found: true, rowIndex: found.rowIndex, data: null, error: "Existing server progress is malformed." }; }
}
function backupProgressRecord_(importId, admin, username, data) {
  const json = serializeProgressObject_(data);
  getProgressBackupsSheet_().appendRow([Utilities.getUuid(), importId, username, json, new Date().toISOString(), admin || "admin"]);
  _invalidateSheet_(PROGRESS_BACKUPS_SHEET);
}
function createProgressImportLog_(admin, mode, recordCount) {
  const importId = Utilities.getUuid();
  getProgressImportsSheet_().appendRow([
    importId, admin || "admin", mode || "preview", "started",
    Number(recordCount) || 0, 0, 0, 0, new Date().toISOString(), "", ""
  ]);
  _invalidateSheet_(PROGRESS_IMPORTS_SHEET);
  return importId;
}
function updateProgressImportLog_(importId, status, accepted, skipped, errorCount, details) {
  const sheet = getProgressImportsSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(importId)) {
      sheet.getRange(i + 1, 4, 1, 8).setValues([[
        status || "", data[i][4] || 0, Number(accepted) || 0,
        Number(skipped) || 0, Number(errorCount) || 0,
        data[i][8] || "", new Date().toISOString(),
        String(details || "").slice(0, 30000)
      ]]);
      _invalidateSheet_(PROGRESS_IMPORTS_SHEET);
      return;
    }
  }
}

function adminImportProgress(p) {
  const chk = checkAdminCan_(p, "imports");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;

  const mode = normalizeImportMode_(p.mode);
  if (!mode) return { success: false, error: "mode must be preview, merge, or replace." };

  let rawPayload = (p.payload !== undefined && p.payload !== null) ? p.payload : p.data;
  if (typeof rawPayload === "string") {
    if (rawPayload.length > MAX_IMPORT_BODY_CHARS) return { success: false, error: "Import payload is too large." };
    try { rawPayload = JSON.parse(rawPayload); } catch (e) { return { success: false, error: "Import payload is not valid JSON." }; }
  }
  if (!rawPayload || typeof rawPayload !== "object") return { success: false, error: "Import payload must be a JSON object." };

  const records = normalizeImportRecords_(rawPayload);
  if (!records.length) return { success: false, error: "No import records found." };
  if (records.length > MAX_IMPORT_RECORDS) return { success: false, error: "Import is limited to " + MAX_IMPORT_RECORDS + " records." };

  const importId = createProgressImportLog_(actor, mode, records.length);
  const errors = [];
  const accepted = [];
  let skipped = 0;

  records.forEach((record, i) => {
    record = record || {};
    const username = safeImportString_(record.username, 120);
    if (!username) { skipped++; errors.push({ index: i, error: "username is required." }); return; }
    let data;
    try { data = parseImportData_(record.data !== undefined ? record.data : record.progress); }
    catch (e) { skipped++; errors.push({ index: i, username, error: e.message }); return; }
    const v = validateProgressObject_(data);
    if (!v.valid) { skipped++; errors.push({ index: i, username, error: v.error }); return; }
    accepted.push({ username, data });
  });

  if (mode === "preview") {
    updateProgressImportLog_(importId, "preview", accepted.length, skipped, errors.length, JSON.stringify(errors).slice(0, 30000));
    return { success: true, importId, mode, preview: true, recordsReceived: records.length, recordsAccepted: accepted.length, recordsSkipped: skipped, errors };
  }

  try {
    return withLock_(() => applyProgressImport_(importId, actor, mode, accepted, errors));
  } catch (e) {
    updateProgressImportLog_(importId, "failed", 0, skipped, errors.length + 1, e.message);
    return { success: false, importId, error: "Import failed: " + e.message };
  }
}

function applyProgressImport_(importId, actor, mode, accepted, initialErrors) {
  const progressSheet = getProgressSheet_();
  const userSheet = getUsersSheet_();
  let acceptedCount = 0;
  let skippedCount = initialErrors.length;
  const errors = initialErrors.slice();

  accepted.forEach(item => {
    const username = item.username;
    const incoming = item.data;
    if (!findUserRow_(userSheet, username)) {
      skippedCount++;
      errors.push({ username, error: "User account does not exist." });
      return;
    }
    const current = getProgressRecordForImport_(progressSheet, username);
    if (current.error) { skippedCount++; errors.push({ username, error: current.error }); return; }

    let finalData = incoming;
    if (mode === "merge" && current.found && current.data) finalData = mergeProgressData_(current.data, incoming);
    else if (mode === "replace" && current.found && current.data) backupProgressRecord_(importId, actor, username, current.data);

    try {
      const json = serializeProgressObject_(finalData);
      const now = new Date().toISOString();
      if (current.found) progressSheet.getRange(current.rowIndex, 2, 1, 2).setValues([[json, now]]);
      else progressSheet.appendRow([username, json, now]);
      acceptedCount++;
    } catch (e) { skippedCount++; errors.push({ username, error: e.message }); }
  });
  _invalidateSheet_(PROGRESS_SHEET);

  const status = errors.length ? "completed_with_errors" : "completed";
  updateProgressImportLog_(importId, status, acceptedCount, skippedCount, errors.length, JSON.stringify(errors).slice(0, 30000));
  logAction_(actor, "Import Progress Data", importId, "Mode: " + mode + "; accepted: " + acceptedCount + "; skipped: " + skippedCount);
  return { success: true, importId, mode, preview: false, recordsAccepted: acceptedCount, recordsSkipped: skippedCount, errors };
}

function adminImportStatus(p) {
  const chk = checkAdminCan_(p, "imports");
  if (!chk.ok) return { success: false, error: chk.error };
  const importId = safeImportString_(p.importId, 100);
  if (!importId) return { success: false, error: "importId is required." };

  const data = _cachedSheetData_(PROGRESS_IMPORTS_SHEET, getProgressImportsSheet_).data;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === importId) {
      let errors = [];
      if (data[i][10]) { try { errors = JSON.parse(data[i][10]); } catch (e) { errors = [{ error: String(data[i][10]) }]; } }
      return {
        success: true,
        import: {
          importId: data[i][0], admin: data[i][1], mode: data[i][2], status: data[i][3],
          recordsReceived: Number(data[i][4] || 0), recordsAccepted: Number(data[i][5] || 0),
          recordsSkipped: Number(data[i][6] || 0), errorCount: Number(data[i][7] || 0),
          createdAt: data[i][8], completedAt: data[i][9], errors
        }
      };
    }
  }
  return { success: false, error: "Import not found." };
}

/* ═══════════════════════════════════════════════════════════════════════
   MAINTENANCE
   ═══════════════════════════════════════════════════════════════════════ */

function adminClearProgressBackups(p) {
  const chk = checkAdminCan_(p, "maintenance");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  return withLock_(() => {
    const sheet = getProgressBackupsSheet_();
    const lastRow = sheet.getLastRow();
    const deleted = Math.max(0, lastRow - 1);
    if (deleted > 0) sheet.deleteRows(2, deleted);
    _invalidateSheet_(PROGRESS_BACKUPS_SHEET);
    logAction_(actor, "Clear Progress Backups", "", "Deleted " + deleted + " backup row(s)");
    return { success: true, deleted };
  });
}

function adminPruneOldBackups(p) {
  const chk = checkAdminCan_(p, "maintenance");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const days = Math.max(1, Math.min(3650, Number(p.daysToKeep) || 30));

  return withLock_(() => {
    const sheet = getProgressBackupsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, deleted: 0, daysToKeep: days };
    const data = sheet.getRange(2, 1, lastRow - 1, PROGRESS_BACKUP_HEADERS.length).getValues();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = [];
    data.forEach((row, i) => {
      const t = new Date(row[4]).getTime();
      if (!isNaN(t) && t < cutoff) rows.push(i + 2);
    });
    rows.sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
    _invalidateSheet_(PROGRESS_BACKUPS_SHEET);
    logAction_(actor, "Prune Progress Backups", "", "Kept last " + days + "d, deleted " + rows.length + " row(s)");
    return { success: true, deleted: rows.length, daysToKeep: days };
  });
}

function adminTrimLogs(p) {
  const chk = checkAdminCan_(p, "maintenance");
  if (!chk.ok) return { success: false, error: chk.error };
  const actor = chk.actor;
  const keepLast = Math.max(100, Math.min(100000, Number(p.keepLast) || 5000));

  return withLock_(() => {
    const sheet = getLogsSheet_();
    const lastRow = sheet.getLastRow();
    const totalDataRows = Math.max(0, lastRow - 1);
    const toDelete = Math.max(0, totalDataRows - keepLast);
    if (toDelete > 0) sheet.deleteRows(2, toDelete);
    _invalidateSheet_(LOGS_SHEET);
    logAction_(actor, "Trim Logs", "", "Kept " + keepLast + ", deleted " + toDelete + " row(s)");
    return { success: true, deleted: toDelete, kept: keepLast };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════ */

function getOrCreateFolder_(name) {
  const iter = DriveApp.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : DriveApp.createFolder(name);
}

/* ═══════════════════════════════════════════════════════════════════════
   DEBUG / DIAGNOSTICS
   ═══════════════════════════════════════════════════════════════════════ */

function diagnose() {
  const ss = getSpreadsheet_();
  console.log("═══ DIAGNOSTIC ═══");
  console.log("URL:", ss.getUrl());
  console.log("Sheets:", ss.getSheets().map(s => s.getName()).join(", "));
  console.log("Version:", APP_VERSION);
  console.log("Users rows:", getUsersSheet_().getLastRow());
  console.log("Admins rows:", getAdminsSheet_().getLastRow());
  console.log("AdminPermissions rows:", getAdminPermsSheet_().getLastRow());
  console.log("Payments rows:", getPaymentsSheet_().getLastRow());
  console.log("Logs rows:", getLogsSheet_().getLastRow());
  console.log("WeeklyAttempts rows:", getWeeklyAttemptsSheet_().getLastRow());
  console.log("SubjectiveSubmissions rows:", getSubjSubmissionsSheet_().getLastRow());
  const settings = getSettings().settings || {};
  ["paymentAmount", "contactPhone", "trialHours"].forEach(k =>
    console.log("  " + k + ": " + typeof settings[k] + " = " + settings[k]));
  return "Diagnostic complete. Check logs.";
}

function testFileAccess(fileId) {
  const result = handleGetFile({ fileId });
  if (result.success) {
    const count = Array.isArray(result.result) ? result.result.length : Object.keys(result.result || {}).length;
    console.log("✅ File '" + fileId + "' readable, " + count + " top-level items.");
  } else {
    console.log("❌ File '" + fileId + "' failed: " + result.error);
  }
  return result;
}

const ALLOW_RESET_ALL = false;

function resetAll() {
  if (!ALLOW_RESET_ALL) {
    const msg = "🚫 resetAll() refused: ALLOW_RESET_ALL is false. Flip it to true (temporarily) if you really mean to wipe production data.";
    console.error(msg);
    return msg;
  }
  const ss = getSpreadsheet_();
  const keep = [USERS_SHEET, PAYMENTS_SHEET, SETTINGS_SHEET, ADMINS_SHEET];
  ss.getSheets().forEach(sheet => { if (!keep.includes(sheet.getName())) ss.deleteSheet(sheet); });
  keep.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  });
  initDefaultSettings_();
  console.log("All data reset.");
  return "All data has been reset.";
}

function resetAdminPasswordToSeed() {
  const sheet = getAdminsSheet_();
  const found = findAdminRow_(sheet, ADMIN_SEED_USERNAME);
  const salt = makeSalt_();
  const hash = salt + ":" + hashPassSalted_(ADMIN_SEED_PASSWORD, salt);

  if (found) {
    sheet.getRange(found.rowIndex, 2).setValue(hash);
    sheet.getRange(found.rowIndex, 5, 1, 2).setValues([["", ""]]);
    sheet.getRange(found.rowIndex, 7).setValue(ADMIN_ROLE_OWNER);
    Logger.log("✅ Reset password for existing admin '" + ADMIN_SEED_USERNAME + "'.");
  } else {
    sheet.appendRow([ADMIN_SEED_USERNAME, hash, new Date().toISOString(), "system", "", "", ADMIN_ROLE_OWNER]);
    Logger.log("✅ Re-created admin account '" + ADMIN_SEED_USERNAME + "'.");
  }
  clearLoginLock_("admin", ADMIN_SEED_USERNAME);
  _invalidateSheet_(ADMINS_SHEET);
  Logger.log("   Login:  " + ADMIN_SEED_USERNAME + "  /  " + ADMIN_SEED_PASSWORD);
  Logger.log("   ⚠️  Change this password immediately via Settings → Change Password.");
  return "Admin password reset. Use " + ADMIN_SEED_USERNAME + " / " + ADMIN_SEED_PASSWORD + " — then change it immediately.";
}

function testAll() {
  console.log("═══ FULL SYSTEM TEST ═══");
  setup();
  console.log("✅ Setup complete");

  const signupResult = handleSignup({
    username: "testuser", password: "testpass", name: "Test User",
    email: "test@example.com", mobile: "9800000000"
  });
  console.log("Signup:", JSON.stringify(signupResult));

  const loginTrial = handleLogin({ username: "testuser", password: "testpass" });
  console.log("Login (trial):", JSON.stringify(loginTrial));

  const adminResult = adminLogin({ username: "admin", password: ADMIN_SEED_PASSWORD });
  console.log("Admin login:", JSON.stringify(adminResult));

  const listUsers = adminListUsers({ adminUser: "admin", adminPass: ADMIN_SEED_PASSWORD });
  console.log("Users count:", listUsers.users ? listUsers.users.length : 0);

  const sheet = getUsersSheet_();
  const found = findUserRow_(sheet, "testuser");
  const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
  sheet.getRange(found.rowIndex, 12).setValue(past.toISOString());
  _invalidateSheet_(USERS_SHEET);

  const loginExpired = handleLogin({ username: "testuser", password: "testpass" });
  console.log("Login (expired):", JSON.stringify(loginExpired));

  const payResult = submitPayment({
    username: "testuser", token: loginExpired.token,
    name: "Test User", email: "test@example.com", mobile: "9800000000",
    txId: "TXN123456", remarks: "Test payment"
  });
  console.log("Payment:", JSON.stringify(payResult));

  const verifyResult = adminReviewPayment({
    adminUser: "admin", adminPass: ADMIN_SEED_PASSWORD,
    username: "testuser", status: "verified"
  });
  console.log("Verify:", JSON.stringify(verifyResult));

  const loginActive = handleLogin({ username: "testuser", password: "testpass" });
  console.log("Login (active):", JSON.stringify(loginActive));

  const stats = adminStats({ adminUser: "admin", adminPass: ADMIN_SEED_PASSWORD });
  console.log("Stats:", JSON.stringify(stats));

  console.log("═══ ALL TESTS PASSED ═══");
  return "All tests passed.";
}
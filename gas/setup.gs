/* ═══════════════════════════════════════════════════════════════════════
   setup.gs — Run-once setup helpers for Abhyas V1  (v1.11)

   These functions are only invoked manually from the Apps Script
   editor (Run → setup). They are NOT reachable from any doGet/doPost
   endpoint. They still need SpreadsheetApp/DriveApp/ScriptApp, which
   is why they live in the project rather than client-side.

   To run: open the editor, choose setup from the function dropdown,
   click Run. Safe to re-run — every operation is idempotent.

   v1.11:
     • Users sheet gains an emailVerified column (auto-migrated).
     • No hard-coded admin password any more. On a brand-new install the
       owner password is random — run showInitialAdminPassword() once.
     • setup() flags any admin still using the OLD default password so they
       are forced (server-side) to change it at next login.
     • A daily trigger prunes stale Script Properties.
   ═══════════════════════════════════════════════════════════════════════ */

function setup() {
  SKIP_CREATION_FORMATTING = true;   // global from code.gs
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
    getWeeklyStartsSheet_();
    getQReportsSheet_();
    getSubjSubmissionsSheet_();
    getAdminPermsSheet_();
    getProgressImportsSheet_();
    getProgressBackupsSheet_();
  } finally {
    SKIP_CREATION_FORMATTING = false;
  }
  initDefaultSettings_();
  flagLegacyDefaultAdminPasswords_();
  ensurePushTriggers_();
  fixSheetFormatting();
  sortSheetsAlphabetically_();
  _announceInitialAdminPassword_();
  Logger.log("✅ Setup complete. " + getSpreadsheet_().getUrl());
  return "Setup complete.";
}

/* Prints the one-time owner password created on a brand-new install, then
   deletes it from Script Properties so it only ever appears once. */
function showInitialAdminPassword() {
  const shown = _announceInitialAdminPassword_();
  if (!shown) {
    const msg = "No initial admin password is pending (it was already shown, or this isn't a fresh install). " +
                "If you're locked out, run resetAdminPasswordToSeed() from debug.gs.";
    Logger.log(msg);
    return msg;
  }
  return "Shown in the execution log.";
}

function _announceInitialAdminPassword_() {
  const props = PropertiesService.getScriptProperties();
  const pw = props.getProperty("INITIAL_ADMIN_PASSWORD");
  if (!pw) return false;
  Logger.log("════════════════════════════════════════════════");
  Logger.log("  Initial owner login (shown ONCE)");
  Logger.log("    username: " + ADMIN_SEED_USERNAME);
  Logger.log("    password: " + pw);
  Logger.log("  You will be forced to change it at first login.");
  Logger.log("════════════════════════════════════════════════");
  props.deleteProperty("INITIAL_ADMIN_PASSWORD");
  return true;
}

/* Any admin whose stored password is still the old published default
   ("ChangeMe123!") must change it before using admin features. */
function flagLegacyDefaultAdminPasswords_() {
  const data = getAdminsSheet_().getDataRange().getValues();
  let flagged = 0;
  for (let i = 1; i < data.length; i++) {
    const uname = String(data[i][0] || "");
    if (!uname) continue;
    if (verifyPassword_(LEGACY_DEFAULT_ADMIN_PASSWORD, data[i][1]).ok) {
      setAdminMustChange_(uname, true);
      flagged++;
      Logger.log("⚠️ Admin '" + uname + "' still uses the old default password — forced change enabled.");
    }
  }
  return flagged;
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

function ensurePushTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(t => t.getHandlerFunction() === "checkTrialExpiryWarnings")) {
    ScriptApp.newTrigger("checkTrialExpiryWarnings").timeBased().everyMinutes(30).create();
  }
  if (!triggers.some(t => t.getHandlerFunction() === "checkWeeklySetUnlocks_")) {
    ScriptApp.newTrigger("checkWeeklySetUnlocks_").timeBased().everyMinutes(15).create();
  }
  /* v1.15: nightly copy of the spreadsheet. */
  if (!triggers.some(t => t.getHandlerFunction() === "backupSpreadsheet")) {
    ScriptApp.newTrigger("backupSpreadsheet").timeBased().everyDays(1).atHour(2).create();
  }
  /* v1.11: daily housekeeping for Script Properties. */
  if (!triggers.some(t => t.getHandlerFunction() === "cleanupExpiredProperties")) {
    ScriptApp.newTrigger("cleanupExpiredProperties").timeBased().everyDays(1).atHour(3).create();
  }
}

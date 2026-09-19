/* ═══════════════════════════════════════════════════════════════════════
   debug.gs — Diagnostics + destructive helpers  (v1.11)

   ⚠️  DELETE THIS FILE BEFORE SHARING THE APPS SCRIPT PROJECT.
   ⚠️  resetAll() wipes every sheet except Users/Payments/Settings/Admins.
   ⚠️  resetAdminPasswordToSeed() sets a NEW RANDOM owner password.
   ⚠️  testAll() resets the owner password and creates/deletes "testuser".

   Run any of these manually from the editor's function dropdown.
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
  console.log("Security: REQUIRE_POST_FOR_CREDENTIALS =", REQUIRE_POST_FOR_CREDENTIALS,
              "| GETFILE_REQUIRES_AUTH =", GETFILE_REQUIRES_AUTH,
              "| ENFORCE_ACCESS_ON_CONTENT =", ENFORCE_ACCESS_ON_CONTENT,
              "| ALLOW_PASSWORD_PER_REQUEST_AUTH =", ALLOW_PASSWORD_PER_REQUEST_AUTH);
  console.log("Advanced Drive Service enabled:", (typeof Drive !== "undefined"));
  console.log("Owner must change password:", adminMustChangePassword_(ADMIN_SEED_USERNAME));
  console.log("Script Properties count:", Object.keys(PropertiesService.getScriptProperties().getProperties()).length);
  const settings = getSettingsAll_();
  ["paymentAmount", "contactPhone", "trialHours"].forEach(k =>
    console.log("  " + k + ": " + typeof settings[k] + " = " + settings[k]));
  return "Diagnostic complete. Check logs.";
}

function testFileAccess(fileId) {
  const result = readJsonFileById_(fileId);
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

/* Sets a fresh RANDOM password on the main admin (creating the account if it
   is missing), clears its sessions and lockout, and forces a change at next
   login. Returns the new password (also written to the execution log). */
function _resetAdminPasswordRandom_() {
  const sheet = getAdminsSheet_();
  const found = findAdminRow_(sheet, ADMIN_SEED_USERNAME);
  const pw = generateStrongPassword_();
  const salt = makeSalt_();
  const hash = salt + ":" + hashPassSalted_(pw, salt);

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
  setAdminMustChange_(ADMIN_SEED_USERNAME, true);
  _invalidateSheet_(ADMINS_SHEET);
  return pw;
}

function resetAdminPasswordToSeed() {
  const pw = _resetAdminPasswordRandom_();
  Logger.log("   Login:  " + ADMIN_SEED_USERNAME + "  /  " + pw);
  Logger.log("   ⚠️  You will be forced to change this password at first login.");
  return "Admin password reset. Use " + ADMIN_SEED_USERNAME + " / " + pw + " — you'll be asked to change it.";
}

function testAll() {
  console.log("═══ FULL SYSTEM TEST ═══");
  setup();
  console.log("✅ Setup complete");

  /* Admin auth is token-based now (per-request password auth is disabled). */
  const adminPw = _resetAdminPasswordRandom_();
  const adminResult = adminLogin({ username: ADMIN_SEED_USERNAME, password: adminPw });
  console.log("Admin login:", JSON.stringify({ success: adminResult.success, mustChangePassword: adminResult.mustChangePassword }));
  if (!adminResult.success) throw new Error("Admin login failed: " + adminResult.error);
  setAdminMustChange_(ADMIN_SEED_USERNAME, false);   // test only — re-enabled at the end
  const adm = { adminToken: adminResult.adminToken };

  /* Clean up a leftover test user from a previous run. */
  adminDeleteUser(Object.assign({ username: "testuser" }, adm));

  const signupResult = handleSignup({
    username: "testuser", password: "testpass", name: "Test User",
    email: "test@example.com", mobile: "9800000000"
  });
  console.log("Signup:", JSON.stringify(signupResult));

  const reserved = handleSignup({
    username: "admin", password: "testpass", name: "Evil", email: "evil@example.com", mobile: "9811111111"
  });
  console.log("Signup as 'admin' (must FAIL):", JSON.stringify(reserved));
  if (reserved.success) throw new Error("SECURITY REGRESSION: signup as 'admin' succeeded.");

  const loginTrial = handleLogin({ username: "testuser", password: "testpass" });
  console.log("Login (trial):", JSON.stringify(loginTrial));

  const switchAttempt = adminSwitchFromUser({ username: "testuser", token: loginTrial.token });
  console.log("Admin switch as plain user (must FAIL):", JSON.stringify(switchAttempt));
  if (switchAttempt.success) throw new Error("SECURITY REGRESSION: plain user switched to admin.");

  const listUsers = adminListUsers(adm);
  console.log("Users count:", listUsers.users ? listUsers.users.length : 0);

  const sheet = getUsersSheet_();
  const found = findUserRow_(sheet, "testuser");
  const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
  sheet.getRange(found.rowIndex, 12).setValue(past.toISOString());
  _invalidateSheet_(USERS_SHEET);

  const loginExpired = handleLogin({ username: "testuser", password: "testpass" });
  console.log("Login (expired):", JSON.stringify(loginExpired));

  const gated = listWeeklySets({ username: "testuser", token: loginExpired.token });
  console.log("listWeeklySets while expired (must be blocked):", JSON.stringify(gated));
  if (gated.success) throw new Error("SECURITY REGRESSION: expired user reached paid content.");

  const payResult = submitPayment({
    username: "testuser", token: loginExpired.token,
    name: "Test User", email: "test@example.com", mobile: "9800000000",
    txId: "TXN123456", remarks: "Test payment"
  });
  console.log("Payment:", JSON.stringify(payResult));

  const verifyResult = adminReviewPayment(Object.assign({ username: "testuser", status: "verified" }, adm));
  console.log("Verify:", JSON.stringify(verifyResult));

  const loginActive = handleLogin({ username: "testuser", password: "testpass" });
  console.log("Login (active):", JSON.stringify(loginActive));

  const stats = adminStats(adm);
  console.log("Stats:", JSON.stringify(stats));

  adminDeleteUser(Object.assign({ username: "testuser" }, adm));
  setAdminMustChange_(ADMIN_SEED_USERNAME, true);

  console.log("═══ ALL TESTS PASSED ═══");
  console.log("⚠️ The owner password is now: " + adminPw + "  (you'll be forced to change it at next login)");
  return "All tests passed. Owner password reset to: " + adminPw;
}

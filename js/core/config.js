/* ═══════════════════════════════════════════════════════════════════════
   CONFIG.JS — backend endpoints + routing.
   Migration status: Supabase is primary. Google Apps Script still serves
   Drive-only actions (objective question files, chapter data, verify email).
   ═══════════════════════════════════════════════════════════════════════ */
const ABHYAS_CONFIG = Object.freeze({
  // Supabase Edge Function (primary backend)
  SUPABASE_URL: "https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api",

  // Google Apps Script (kept for Drive-only actions)
  GAS_URL: "https://script.google.com/macros/s/AKfycbyZLZxf6VKNiMfhY6memPTKj-dGW7jxyX1c-9GI0OPG8TqazSZi_P-7Y-8DlpT0ZlrjHg/exec",

  GOOGLE_CLIENT_ID: "242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com",

  // Actions still served by Google Apps Script (case-insensitive)
  DRIVE_ACTIONS: [
    "getfile",
    "getfiles",
    "getcontentkey",
    "gethardquestions",
    "resendverification",
    "verifyemail",
  ],
});
window.ABHYAS_CONFIG = ABHYAS_CONFIG;

// Returns 'gas' or 'supabase' for a given action name.
function abhyasEndpointFor(action) {
  const a = String(action || "").toLowerCase();
  return ABHYAS_CONFIG.DRIVE_ACTIONS.indexOf(a) !== -1 ? "gas" : "supabase";
}
window.abhyasEndpointFor = abhyasEndpointFor;

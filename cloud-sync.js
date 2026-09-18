/* ═══════════════════════════════════════════════════════════════════════
   CLOUD-SYNC.JS — Personal Google Drive backup (optional, per-user)

   Loaded by user.html AFTER app.js/objective.js/subjective.js. Adds a
   "Personal Drive Backup" feature to the Progress view: a snapshot of
   the user's progress/bookmarks/flags/wrong-bank saved to their OWN
   Google Drive — independent of the Abhyas server.

   Scope: https://www.googleapis.com/auth/drive.appdata
     Only touches the app's hidden "appDataFolder" in the user's Drive.
     Cannot see, list, or modify any of the user's real files.

   Exposes on window:
     CLOUD_BACKUP_VERSION  — current schema version (bump on shape change)
     _cloudBackupMigrations — registry of migration steps
     _cloudMigrate(backup)  — schema check + migration chain (pure fn)
     CLOUD                  — the module itself
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════════════ */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_LIST_URL   = 'https://www.googleapis.com/drive/v3/files';
const BACKUP_FILENAME  = 'abhyas-progress-backup.json';
const MAX_BACKUP_BYTES = 4 * 1024 * 1024;   // Drive hard limit is 5 MB for this API; stay under

/* Bump this only when the backup shape changes in a way that needs a
   migration to restore cleanly. */
const CLOUD_BACKUP_VERSION = 1;

/* Registered migration steps: { [fromVersion]: (data) => data }
   Each function upgrades the payload from its key version to the next.
   Empty for now — no historical versions exist. */
const _cloudBackupMigrations = {};

/* ── Persistence keys ── */
const LS_CLOUD = 'abhyas_cloud';   // { fid, email, savedAt }
const LS_PROFILE = 'abhyas_profile';

/* ── In-memory session state ── */
let _tokenClient = null;    // GSI OAuth2 token client
let _accessToken = null;    // Short-lived access token
let _tokenExpiresAt = 0;    // ms epoch
let _userEmail = null;      // best-effort, from a Drive `about` call
let _fileId = null;         // Drive file id of the app's backup file
let _ready = null;          // Promise that resolves once GSI is loaded

/* ═══════════════════════════════════════════════════════════════════════
   SCHEMA MIGRATION
   ═══════════════════════════════════════════════════════════════════════ */

/* Pure. Takes whatever JSON was read from Drive and returns either
   { ok: true, data } with the payload at CLOUD_BACKUP_VERSION, or
   { ok: false, error } with a human-readable reason. Never mutates
   its input — the migration chain works on shallow copies. */
function _cloudMigrate(backup) {
  if (!backup || typeof backup !== 'object') {
    return { ok: false, error: 'Backup is not a JSON object.' };
  }
  const v = Number(backup.v);
  if (!v || v < 1) {
    return { ok: false, error: 'Backup is missing a version number.' };
  }
  if (v > CLOUD_BACKUP_VERSION) {
    return { ok: false, error: `Backup was written by a newer version of Abhyas (v${v} vs v${CLOUD_BACKUP_VERSION}) — this app cannot read it.` };
  }
  let cur = backup;
  let stepFrom = v;
  while (stepFrom < CLOUD_BACKUP_VERSION) {
    const step = _cloudBackupMigrations[stepFrom];
    if (typeof step !== 'function') {
      return { ok: false, error: `No migration path from backup version ${stepFrom} to ${CLOUD_BACKUP_VERSION}.` };
    }
    try {
      cur = step(cur);
    } catch (e) {
      return { ok: false, error: `Migration ${stepFrom} → ${stepFrom + 1} failed: ${e.message || e}` };
    }
    stepFrom++;
  }
  return { ok: true, data: cur };
}

/* ═══════════════════════════════════════════════════════════════════════
   GIS LOADING
   ═══════════════════════════════════════════════════════════════════════ */

/* GSI is loaded async/defer from user.html. Poll for window.google.accounts.oauth2
   with a hard cap — if the CDN is blocked or we're offline, don't loop
   forever. */
function _waitForGsi(maxMs = 20000) {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      if (Date.now() - start > maxMs) return reject(new Error('Google Identity Services didn\'t load.'));
      setTimeout(tick, 200);
    };
    tick();
  });
}

/* The client id must be the same one used by the backend's Google Sign-In
   (GOOGLE_CLIENT_ID in code.gs) — but this is a DIFFERENT OAuth flow: it
   requests a Drive scope, not just an id token. */
function _googleClientId() {
  if (typeof window.GOOGLE_CLIENT_ID === 'string' && window.GOOGLE_CLIENT_ID &&
      !window.GOOGLE_CLIENT_ID.startsWith('REPLACE_WITH_')) {
    return window.GOOGLE_CLIENT_ID;
  }
  // Fallback constant — same value as index.html and code.gs.
  return '242226857075-hpkbjoqhlem95fu6vkf712e8ijs33sng.apps.googleusercontent.com';
}

/* ═══════════════════════════════════════════════════════════════════════
   MODULE
   ═══════════════════════════════════════════════════════════════════════ */

const CLOUD = {
  /* ── init ──
     Idempotent. Creates the GSI token client and pulls any persisted
     "signed in" flag from localStorage. Callers can await this before
     invoking signIn/backup/restore. */
  async init() {
    if (_ready) return _ready;
    _ready = (async () => {
      // Restore persisted state (fileId + email) so the UI can render
      // "Signed in as X" without a fresh OAuth round trip on page load.
      try {
        const saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}');
        if (saved && typeof saved === 'object') {
          if (saved.fid) _fileId = String(saved.fid);
          if (saved.email) _userEmail = String(saved.email);
        }
      } catch (e) { /* ignore */ }

      // Set up the token client — but only once we actually need it.
      // Creating it lazily on first signIn() call avoids polling GSI on
      // every page load, which the UI block in user.html relies on.
      return this;
    })();
    return _ready;
  },

  /* ── status ──
     Read-only. Reports whether a valid (non-expired) access token
     exists. The UI (CLOUD_UI in user.html) calls this synchronously on
     every Progress view render — it must never block. */
  status() {
    const signedIn = !!(_accessToken && Date.now() < _tokenExpiresAt);
    return {
      signedIn,
      email: signedIn ? _userEmail : null,
      hasBackup: !!_fileId
    };
  },

  /* ── signIn ──
     Opens the Google consent popup (or redirect, depending on browser
     heuristics). Resolves with { success, email?, error? }. */
  async signIn() {
    try {
      await _waitForGsi();
    } catch (e) {
      return { success: false, error: e.message };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, error: 'You need to be online to sign in to Google.' };
    }

    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: _googleClientId(),
        scope: DRIVE_SCOPE,
        // GSI calls this on every successful (or failed) auth. We wrap
        // it in a Promise so signIn() can be awaited.
        callback: _onTokenResponse,
        // Don't auto-redirect on failure — let the caller decide.
        ux_mode: 'popup'
      });
    }

    return new Promise((resolve) => {
      _pendingResolve = resolve;
      try {
        // prompt: '' — reuse an existing grant if possible (no extra
        // click). Falls back to consent if Google decides it's needed.
        _tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        _pendingResolve = null;
        resolve({ success: false, error: e.message || 'Could not start Google sign-in.' });
      }
    });
  },

  /* ── signOut ──
     Revokes the token on Google's side (best-effort) and clears local
     state. The backup file in the user's Drive is NOT deleted — that's
     their data. */
  async signOut() {
    if (_accessToken && window.google && window.google.accounts) {
      try {
        window.google.accounts.oauth2.revoke(_accessToken);
      } catch (e) { /* best-effort */ }
    }
    _accessToken = null;
    _tokenExpiresAt = 0;
    _userEmail = null;
    // Keep _fileId — if the user re-signs-in, we still know where to look.
    try {
      const saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}');
      saved.email = null;
      localStorage.setItem(LS_CLOUD, JSON.stringify(saved));
    } catch (e) { /* ignore */ }
    return { success: true };
  },

  /* ── backup ──
     Writes the current local snapshot to the user's Drive. Creates the
     file if it doesn't exist, updates it if it does. */
  async backup() {
    if (!this.status().signedIn) {
      return { success: false, error: 'Please sign in to Google first.' };
    }
    const payload = this._buildPayload();
    const json = JSON.stringify(payload);
    if (json.length > MAX_BACKUP_BYTES) {
      return { success: false, error: `Backup is ${Math.round(json.length / 1024)} KB — over the ${Math.round(MAX_BACKUP_BYTES / 1024)} KB limit. Try removing some bookmarks or clearing old sessions.` };
    }
    try {
      const file = await this._uploadOrUpdate(json);
      _fileId = file.id;
      const saved = { fid: _fileId, email: _userEmail, savedAt: Date.now() };
      try { localStorage.setItem(LS_CLOUD, JSON.stringify(saved)); } catch (e) { /* ignore */ }
      return { success: true, bytes: json.length, fileId: _fileId };
    } catch (e) {
      return { success: false, error: e.message || 'Backup failed.' };
    }
  },

  /* ── restore ──
     Fetches the user's backup from Drive and applies it to local state
     via _apply(). Merge rules match the server-side import: chapStats
     takes the higher attempted count per chapter; everything else
     overwrites. */
  async restore() {
    if (!this.status().signedIn) {
      return { success: false, error: 'Please sign in to Google first.' };
    }
    let raw;
    try {
      raw = await this._download();
    } catch (e) {
      return { success: false, error: e.message || 'Download failed.' };
    }
    if (!raw) {
      return { success: false, error: 'No backup found in your Drive yet.' };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { success: false, error: 'The backup file is corrupted — it isn\'t valid JSON.' };
    }
    const migrated = _cloudMigrate(parsed);
    if (!migrated.ok) {
      return { success: false, error: migrated.error };
    }
    this._apply(migrated.data);
    return { success: true, ts: migrated.data.ts || null };
  },

  /* ═══════════════════════════════════════════════════════════════════
     INTERNALS
     ═══════════════════════════════════════════════════════════════════ */

  /* ── _buildPayload ──
     Snapshot the local state into a versioned envelope. Deliberately
     does NOT include S.user itself (that's the server's business),
     and does NOT include cached question files (too big, and they're
     recoverable by re-caching). Just the user-generated data. */
  _buildPayload() {
    const S = window.S || {};
    return {
      v: CLOUD_BACKUP_VERSION,
      ts: Date.now(),
      app: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : null,
      prog: {
        total: S.prog?.total || 0,
        correct: S.prog?.correct || 0,
        sessions: Array.isArray(S.prog?.sessions) ? S.prog.sessions.slice(-500) : []
      },
      chapStats: S.chapStats || {},
      bk: Array.isArray(S.bk) ? S.bk.slice(-500) : [],
      fl: Array.isArray(S.fl) ? S.fl.slice(-500) : [],
      wr: Array.isArray(S.wr) ? S.wr.slice(-500) : [],
      stk: S.stk || { days: [], last: '' },
      tt: S.tt || { sessions: [], reminders: { enabled: false, leadMinutes: 5 } }
    };
  },

  /* ── _apply ──
     Merge a backup payload into local state. Pure-ish: only mutates the
     globals it must, and calls _save() so PSYNC knows to schedule a
     server sync afterwards. */
  _apply(data) {
    const S = window.S;
    if (!S) return;

    // ── prog ──
    if (data.prog && typeof data.prog === 'object') {
      const incoming = data.prog;
      if (!Array.isArray(incoming.sessions)) incoming.sessions = [];
      S.prog = {
        total: typeof incoming.total === 'number' ? incoming.total : 0,
        correct: typeof incoming.correct === 'number' ? incoming.correct : 0,
        sessions: incoming.sessions
      };
      if (typeof migrateSessionScopes === 'function') migrateSessionScopes();
      if (typeof _save === 'function') _save('abhyas_prog', S.prog);
    }

    // ── chapStats: per-chapter, keep the higher attempted count ──
    if (data.chapStats && typeof data.chapStats === 'object') {
      Object.entries(data.chapStats).forEach(([key, rec]) => {
        if (!rec || typeof rec !== 'object') return;
        const existing = S.chapStats[key];
        if (!existing || (rec.attempted || 0) > (existing.attempted || 0)) {
          S.chapStats[key] = JSON.parse(JSON.stringify(rec));
        }
      });
      if (typeof _save === 'function') _save('abhyas_chapstats', S.chapStats);
    }

    // ── Lists: overwrite (the Drive copy is the user's snapshot) ──
    if (Array.isArray(data.bk)) { S.bk = data.bk; if (typeof _save === 'function') _save('abhyas_bk', S.bk); }
    if (Array.isArray(data.fl)) { S.fl = data.fl; if (typeof _save === 'function') _save('abhyas_fl', S.fl); }
    if (Array.isArray(data.wr)) { S.wr = data.wr; if (typeof _save === 'function') _save('abhyas_wr', S.wr); }

    // ── Streak: default days array if absent ──
    if (data.stk && typeof data.stk === 'object') {
      S.stk = { days: Array.isArray(data.stk.days) ? data.stk.days : [], last: data.stk.last || '' };
      if (typeof _save === 'function') _save('abhyas_stk', S.stk);
    }

    // ── Timetable: default reminders if absent ──
    if (data.tt && typeof data.tt === 'object') {
      S.tt = {
        sessions: Array.isArray(data.tt.sessions) ? data.tt.sessions : [],
        reminders: data.tt.reminders && typeof data.tt.reminders === 'object'
          ? data.tt.reminders
          : { enabled: false, leadMinutes: 5 }
      };
      if (typeof _save === 'function') _save('abhyas_tt', S.tt);
    }

    // Re-render any views that were showing stale data before the restore.
    if (typeof HOME !== 'undefined' && HOME.render) HOME.render();
    if (typeof PROG !== 'undefined' && PROG.render) PROG.render();
  },

  /* ── _uploadOrUpdate ──
     If we already have a file id, PATCH it. Otherwise POST a new file
     into the app-specific folder. Uses multipart/related because we
     want to set both the file's metadata (name + parents) and its
     content in one round trip. */
  async _uploadOrUpdate(json) {
    const token = await this._requireToken();

    // Look up an existing backup by name if we don't already know the id.
    if (!_fileId) {
      _fileId = await this._findExistingFile(token);
    }

    const boundary = 'abhyas' + Math.random().toString(36).slice(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = _fileId
      ? {}   // PATCH: metadata not needed, name + parents stay as-is
      : { name: BACKUP_FILENAME, parents: ['appDataFolder'], mimeType: 'application/json' };

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      json +
      closeDelimiter;

    const url = _fileId
      ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(_fileId)}?uploadType=multipart&fields=id,name,modifiedTime`
      : `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,modifiedTime`;

    const method = _fileId ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return await res.json();
  },

  /* ── _findExistingFile ──
     List appDataFolder contents and find our backup file by name. */
  async _findExistingFile(token) {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name='${BACKUP_FILENAME.replace(/'/g, "\\'")}'`,
      fields: 'files(id,name)',
      pageSize: '1'
    });
    const res = await fetch(`${DRIVE_LIST_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = (data.files || [])[0];
    return first ? first.id : null;
  },

  /* ── _download ──
     Fetch the backup file's content. Returns the raw JSON string or
     null if there's no file to fetch. */
  async _download() {
    const token = await this._requireToken();
    if (!_fileId) {
      _fileId = await this._findExistingFile(token);
    }
    if (!_fileId) return null;
    const url = `${DRIVE_LIST_URL}/${encodeURIComponent(_fileId)}?alt=media`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) {
      // File was deleted externally — forget the id so the next backup
      // creates a fresh one.
      _fileId = null;
      return null;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive download failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return await res.text();
  },

  /* ── _requireToken ──
     Ensures we have a valid access token, prompting a silent refresh
     if it's close to expiry. Throws if the user needs to re-authenticate. */
  async _requireToken() {
    const now = Date.now();
    const REFRESH_MARGIN = 60 * 1000;   // 1 min before expiry
    if (_accessToken && now < _tokenExpiresAt - REFRESH_MARGIN) {
      return _accessToken;
    }
    // Token has expired or is about to. GSI can often silently refresh
    // (prompt: ''), but if the user previously consented and the browser
    // still has a session, it will succeed without a popup.
    await _waitForGsi();
    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: _googleClientId(),
        scope: DRIVE_SCOPE,
        callback: _onTokenResponse,
        ux_mode: 'popup'
      });
    }
    return await new Promise((resolve, reject) => {
      _pendingResolve = (r) => {
        if (r.success) resolve(_accessToken);
        else reject(new Error(r.error || 'Could not refresh Google access.'));
      };
      try {
        _tokenClient.requestAccessToken({ prompt: '' });
      } catch (e) {
        _pendingResolve = null;
        reject(e);
      }
    });
  },

  /* ═══════════════════════════════════════════════════════════════════
     EXPOSED FOR TESTING (test.html reaches in and calls these directly)
     ═══════════════════════════════════════════════════════════════════ */
  _cloudMigrate,
  _cloudBackupMigrations
};

/* ═══════════════════════════════════════════════════════════════════════
   GSI CALLBACK — single shared entry point for every token request
   ═══════════════════════════════════════════════════════════════════════ */
let _pendingResolve = null;

function _onTokenResponse(resp) {
  if (!resp) {
    if (_pendingResolve) { _pendingResolve({ success: false, error: 'Google returned no response.' }); _pendingResolve = null; }
    return;
  }
  if (resp.error) {
    if (_pendingResolve) { _pendingResolve({ success: false, error: resp.error_description || resp.error }); _pendingResolve = null; }
    return;
  }
  if (!resp.access_token) {
    if (_pendingResolve) { _pendingResolve({ success: false, error: 'Google didn\'t return an access token.' }); _pendingResolve = null; }
    return;
  }
  _accessToken = resp.access_token;
  // GSI gives expires_in in seconds. Convert to absolute ms and subtract
  // a small cushion so we refresh proactively.
  const ttlSec = Number(resp.expires_in) || 3600;
  _tokenExpiresAt = Date.now() + (ttlSec * 1000) - 30000;

  // Best-effort: try to learn the user's email so the UI can show
  // "Signed in as X". If the Drive `about` call fails, we just don't
  // have an email — the UI handles that.
  _fetchUserEmail().then(email => {
    if (email) {
      _userEmail = email;
      try {
        const saved = JSON.parse(localStorage.getItem(LS_CLOUD) || '{}');
        saved.email = email;
        if (_fileId) saved.fid = _fileId;
        localStorage.setItem(LS_CLOUD, JSON.stringify(saved));
      } catch (e) { /* ignore */ }
    }
    if (_pendingResolve) { _pendingResolve({ success: true, email: _userEmail }); _pendingResolve = null; }
  }).catch(() => {
    if (_pendingResolve) { _pendingResolve({ success: true, email: null }); _pendingResolve = null; }
  });
}

async function _fetchUserEmail() {
  if (!_accessToken) return null;
  try {
    const res = await fetch(`${DRIVE_LIST_URL}/about?fields=user(emailAddress)`, {
      headers: { Authorization: `Bearer ${_accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.emailAddress || null;
  } catch (e) {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   GLOBAL EXPOSURE
   ═══════════════════════════════════════════════════════════════════════ */
window.CLOUD = CLOUD;
window.CLOUD_BACKUP_VERSION = CLOUD_BACKUP_VERSION;
window._cloudMigrate = _cloudMigrate;
window._cloudBackupMigrations = _cloudBackupMigrations;

})();
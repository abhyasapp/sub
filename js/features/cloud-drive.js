window.CLOUD_UI = {
  _tokenClient: null,
  _accessToken: null,
  FILE_NAME: 'abhyas_backup.json',

  init() {
    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(() => this.init(), 1000);
      return;
    }
    this._tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: ABHYAS_CONFIG.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          if (typeof toast === 'function') toast('Google Drive connection failed.', 4000);
          return;
        }
        this._accessToken = tokenResponse.access_token;
        this.render();
        if (typeof toast === 'function') toast('Connected to Google Drive.');
      },
    });
    this.render();
  },

  signIn() {
    if (!this._tokenClient) return;
    this._tokenClient.requestAccessToken();
  },

  signOut() {
    this._accessToken = null;
    this.render();
    if (typeof toast === 'function') toast('Disconnected from Google Drive.');
  },

  async backup() {
    if (!this._accessToken) return this.signIn();
    if (!S.user) return;

    try {
      if (typeof toast === 'function') toast('Backing up to Drive…', 3000);
      const payload = {
        exportedAt: new Date().toISOString(),
        version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0'),
        prog: S.prog, chapStats: S.chapStats, cov: S.cov,
        bk: S.bk, fl: S.fl, wr: S.wr, stk: S.stk, tt: S.tt
      };
      
      const metadata = { name: this.FILE_NAME, parents: ['appDataFolder'] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${this.FILE_NAME}'`, {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      });
      const searchData = await searchRes.json();
      
      let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';
      
      if (searchData.files && searchData.files.length > 0) {
        const fileId = searchData.files[0].id;
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const res = await fetch(url, {
        method: method,
        headers: { Authorization: `Bearer ${this._accessToken}` },
        body: form
      });

      if (!res.ok) throw new Error('Upload failed');
      
      if (typeof toast === 'function') toast('✅ Backup saved to Google Drive.');
    } catch (e) {
      console.error(e);
      if (typeof toast === 'function') toast('❌ Drive backup failed.', 5000);
    }
  },

  async restore() {
    if (!this._accessToken) return this.signIn();
    if (!S.user) return;

    try {
      if (typeof toast === 'function') toast('Searching Drive…', 3000);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${this.FILE_NAME}'`, {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      });
      const searchData = await searchRes.json();
      if (!searchData.files || searchData.files.length === 0) {
        if (typeof toast === 'function') toast('No backup found in Drive.');
        return;
      }

      const fileId = searchData.files[0].id;
      const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${this._accessToken}` }
      });
      
      const data = await dlRes.json();
      
      // Use PSYNC to merge data safely
      if (typeof PSYNC !== 'undefined' && PSYNC.mergeIn) {
        const out = await PSYNC.mergeIn(data, 'before-restore');
        if (out.ok) {
          if (typeof toast === 'function') toast('✅ Restored from Drive.');
          if (typeof HOME !== 'undefined') HOME.render();
          if (typeof PROG !== 'undefined') PROG.render();
        } else {
          if (typeof toast === 'function') toast('Restore failed: ' + out.error);
        }
      }
    } catch (e) {
      console.error(e);
      if (typeof toast === 'function') toast('❌ Could not restore from Drive.', 5000);
    }
  },

  render() {
    const status = document.getElementById('cloud-status');
    const row = document.getElementById('cloud-btn-row');
    if (!status || !row) return;

    if (this._accessToken) {
      status.innerHTML = 'Connected to Google Drive as <b>your account</b>.';
      document.getElementById('cloud-signin-btn').style.display = 'none';
      document.getElementById('cloud-backup-btn').style.display = '';
      document.getElementById('cloud-restore-btn').style.display = '';
      document.getElementById('cloud-signout-btn').style.display = '';
    } else {
      status.textContent = 'Sign in with Google to turn this on.';
      document.getElementById('cloud-signin-btn').style.display = '';
      document.getElementById('cloud-backup-btn').style.display = 'none';
      document.getElementById('cloud-restore-btn').style.display = 'none';
      document.getElementById('cloud-signout-btn').style.display = 'none';
    }
  }
};

// Auto-initialize
setTimeout(() => window.CLOUD_UI.init(), 2000);
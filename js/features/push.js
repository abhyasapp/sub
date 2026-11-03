const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // REPLACE THESE
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
const VAPID_PUBLIC_KEY = 'YOUR_PUBLIC_VAPID_KEY';

/* Nothing is configured until the placeholder values above are replaced.
   Until then: do not load Firebase, and hide the Notifications card so the
   app never offers a button that can only fail. */
const PUSH_CONFIGURED =
  !Object.values(firebaseConfig).some(v => /^YOUR_/.test(String(v))) &&
  !/^YOUR_/.test(String(VAPID_PUBLIC_KEY));

window.PUSH = {
  _initialized: false,
  _token: null,
  configured: PUSH_CONFIGURED,

  _hideCard() {
    const btn = document.getElementById('push-enable-btn');
    const card = btn && btn.closest ? btn.closest('.card') : null;
    if (card) card.style.display = 'none';
  },

  init() {
    if (!PUSH_CONFIGURED) { this._hideCard(); return; }
    if (this._initialized) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[PUSH] Not supported by this browser.');
      return;
    }
    
    // Load Firebase scripts dynamically
    if (typeof firebase === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
      /* If the SDK cannot load (offline, blocked), say so quietly and hide the card
         instead of leaving a button that can never work. */
      s.onerror = () => { console.warn('[PUSH] Firebase could not be loaded; notifications unavailable.'); this._hideCard(); };
      s.onload = () => {
        const m = document.createElement('script');
        m.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js';
        m.onload = () => this._setupFirebase();
        m.onerror = s.onerror;
        document.head.appendChild(m);
      };
      document.head.appendChild(s);
    } else {
      this._setupFirebase();
    }
  },

  _setupFirebase() {
    try {
      if (typeof firebase === 'undefined' || !firebase.messaging) throw new Error('Firebase SDK missing');
      if (firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
      }
      this._messaging = firebase.messaging();
    } catch (e) {
      console.warn('[PUSH] Setup failed:', e && e.message);
      this._hideCard();
      return;
    }
    this._initialized = true;
    
    // Handle foreground messages
    this._messaging.onMessage((payload) => {
      if (typeof toast === 'function') {
        toast(payload.notification?.title + ': ' + payload.notification?.body, 6000);
      }
    });

    this.refreshButtonUI();
  },

  async enable() {
    if (!PUSH_CONFIGURED) {
      this._hideCard();
      if (typeof toast === 'function') toast('Push notifications are not configured yet.');
      return;
    }
    if (!this._initialized) {
      if (typeof toast === 'function') toast('Push notifications are not configured yet.');
      return;
    }
    if (typeof Notification === 'undefined') {
      if (typeof toast === 'function') toast('This browser does not support notifications. On iPhone, add Abhyas to your Home Screen first.', 5000);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Replace YOUR_PUBLIC_VAPID_KEY with the key from Firebase Console > Cloud Messaging
        const token = await this._messaging.getToken({ vapidKey: VAPID_PUBLIC_KEY });
        if (token) {
          this._token = token;
          await this._saveToken(token);
          if (typeof toast === 'function') toast('✅ Notifications enabled');
          this.refreshButtonUI();
        }
      } else {
        if (typeof toast === 'function') toast('Notifications blocked by browser.', 4000);
      }
    } catch (e) {
      console.error('[PUSH] Enable failed', e);
      if (typeof toast === 'function') toast('Could not enable notifications.', 4000);
    }
  },

  async disable() {
    if (!this._initialized) return;
    try {
      await this._messaging.deleteToken();
      this._token = null;
      if (typeof toast === 'function') toast('Notifications disabled.');
      this.refreshButtonUI();
    } catch (e) {}
  },

  async _saveToken(token) {
    if (typeof netFetch === 'undefined' || !S.user) return;
    const url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || APPS;
    try {
      await netFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'savepushtoken', username: S.user.username, token: S.user.token, fcmToken: token })
      });
    } catch(e) {}
  },

  async silentRefresh() {
    if (!this._initialized) return;
    try {
      // Need VAPID key here too
      const token = await this._messaging.getToken({ vapidKey: VAPID_PUBLIC_KEY });
      if (token && token !== this._token) {
        this._token = token;
        await this._saveToken(token);
      }
    } catch(e) {}
  },

  refreshButtonUI() {
    if (!PUSH_CONFIGURED) { this._hideCard(); return; }
    const btn = document.getElementById('push-enable-btn');
    if (!btn) return;
    const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'; // iOS Safari (non-PWA) has no Notification API
    if (granted && this._token) {
      btn.innerHTML = '<i class="ph ph-bell-slash"></i> Turn off notifications';
      btn.onclick = () => this.disable();
    } else {
      btn.innerHTML = '<i class="ph ph-bell"></i> Turn on notifications';
      btn.onclick = () => this.enable();
    }
  },

  subscribe() { return this.enable(); },
  unsubscribe() { return this.disable(); }
};

// Auto-initialize on load
setTimeout(() => window.PUSH.init(), 3000);
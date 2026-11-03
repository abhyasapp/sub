# Security

Please report vulnerabilities privately by e-mail to **abhyasbymku@gmail.com**
(the contact already listed on the privacy page). Do not open a public issue.

## What is public by design

The Supabase function URL, the Google Apps Script URL and the Google OAuth
client ID in `js/core/config.js` are public identifiers, not secrets. Real
protection comes from the **server side** (the Supabase Edge Function and the
Apps Script), which must:

- validate the session token on every action and expire/rotate it;
- authorise admin and payment actions per user, never trusting the client;
- rate-limit login and verification endpoints;
- keep paid content protected even though the content repo is served publicly.

Never commit a Supabase `service_role` key, private keys, or passwords.
`npm test` fails if it finds one.

## Server-side expectations (Supabase Edge Function)

The function should, and the current `index.ts` (v1.61) does:

- hash passwords with PBKDF2-SHA256 at >= 600,000 iterations (old hashes upgrade on login);
- rate-limit `login`, `adminlogin`, `signup` and `googlelogin` (table `rate_limits`);
- accept only hashed session tokens, and never return raw database error messages;
- restrict CORS to the app origins (`ALLOWED_ORIGINS`);
- refuse student reads of the `subjective` and `payments` buckets through `getfile`;
- validate upload paths as `<username>/<plain-file>.<ext>` and name files with a CSPRNG;
- on Google sign-in to an account whose e-mail was never verified, reset that account's password and
  sessions (stops pre-registration takeover).

Note: `getcontentkey` returns the content decryption key to trial accounts unless
`CONTENT_KEY_TRIAL=false` is set, so trial sign-up is the effective gate for "paid" content.

## Known hardening work

- The CSP still allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`
  (needed today by the `data-on-*` dispatcher in `js/core/actions.js`, which
  compiles handlers with `new Function`, and by inline scripts in the HTML).
- The session token is stored in `localStorage`, so XSS would expose it. Every
  `innerHTML` use must go through `esc()` (`js/core/text.js`).

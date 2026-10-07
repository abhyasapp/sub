# Real-browser checks

These run the app in headless Chromium. They are separate from `npm test` (which needs no packages) because they
download a browser build.

    npm i --no-save puppeteer-core @sparticuz/chromium axe-core
    node tests/browser/a11y.js      # accessibility audit of the main screens, light and dark
    node tests/browser/offline.js   # install the service worker, go offline, reload, check the app starts
    node tests/browser/sync-merge.js # a big missed-question bank meets a small cloud copy: nothing may be lost
    node tests/browser/loksewa.js    # Loksewa marking only on weekly / daily / hourly; the daily paper follows the scheme
    node tests/browser/corrections.js # report buttons in every section; corrections reach every saved copy
    node tests/browser/admin-reports.js # admin Reports screen and mark-scheme editor, with accessibility

Both exit with status 1 on a failure, so they can run in CI. Neither contacts the real backend.

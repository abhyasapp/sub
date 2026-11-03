# End-to-end checks (Playwright + axe-core)

Boots the real app over HTTP with the backend/CDN mocked, then verifies behaviour in headless Chromium.

    pip install playwright && playwright install chromium
    npm i --no-save axe-core
    python3 tools/e2e/walk.py light 390     # all 18 screens: JS errors, axe, horizontal overflow (also: dark 390, light 320, light 768, light 1280, dark 1280)
    python3 tools/e2e/flows.py              # welcome dialog, Quick-5 quiz, explanation, bookmark, results, saved progress
    python3 tools/e2e/flows2.py             # landing, register form, login, admin smoke, manifest, service worker + OFFLINE reload
    python3 tools/e2e/sprint.py             # 60-day sprint: plan on screen, session -> log, review/drill/mock, behind/compressed, counting, settings, reports, copy, sync payloads
    python3 tools/e2e/search.py             # question search button: Google fallback, Dual Search extension, ctrl-click, special characters

Last run (v1.58.0): 0 JS errors, 0 axe violations, 0 overflow on all 18 screens x 6 viewport/theme configs; flows 14/14, 19/19, search 11/11, sprint 70/70, exam 9/9, qbank 8/8, history 6/6, storage 9/9, sprint-accuracy 12/12, sprint-i18n 7/7, admin-perms 13/13, settings 36/36.
